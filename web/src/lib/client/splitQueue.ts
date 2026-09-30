"use client";

import { useSyncExternalStore } from "react";
import { previewPlayer } from "./previewPlayer";
import { encodeMp3Bytes } from "./mp3";
import { fetchInSlices } from "./stemFetch";
import { useStudioStore } from "./studioStore";
import { keepScreenOn } from "./wakeLock";
import {
  isConstrainedDevice,
  splitSong,
  splitter,
  splitTrackPayload,
  upload,
  uploadStems,
  type UploadStage,
  type UploadTarget,
} from "./splitter";

// The browser side of the split queue (see lib/splitQueue.ts on the
// server). A phone sends its song to the queue; a computer whose owner has
// switched on "Help split" takes songs off the queue one at a time, splits
// each in this tab the same way as its own uploads, and uploads the stems
// for the person who queued it — for XP, like a miner earning its keep.

export type QueuedJob = {
  id: string;
  title: string;
  status: "uploading" | "queued" | "working" | "done" | "failed";
  progress: number;
  stage: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  position: number | null;
  helper_name: string | null;
};

export type QueueStats = { waiting: number; working: number; helped: number };

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? fallback);
  return data as T;
}

/** Your queued songs, and how busy the queue is. */
export async function fetchQueue(): Promise<{ jobs: QueuedJob[]; stats: QueueStats }> {
  return json(await fetch("/api/split-jobs"), "Couldn't load the split queue");
}

/** Worth shrinking before sending: lossless (WAV, FLAC, ALAC) or otherwise very high bitrate. */
const SHRINK_ABOVE_KBPS = 400;
/** Small files go up quickly anyway. */
const SHRINK_MIN_BYTES = 8 * 1024 * 1024;
/** Longer songs would need more memory to re-encode than a phone gives a page. */
const SHRINK_MAX_SECONDS = 7 * 60;

/** A song's length from its header, without decoding it (null if the browser can't tell). */
function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/**
 * A lossless file is 5–10× the size it needs to be for splitting, and a
 * phone's upload is usually the slowest link there is — so a big, high-
 * bitrate song is re-encoded here as a 256 kbps MP3 (far above what the
 * splitter can tell apart) before it's sent. Anything that goes wrong
 * just sends the original.
 */
async function shrinkForQueue(file: File, onStage: (stage: UploadStage) => void): Promise<File> {
  if (file.size < SHRINK_MIN_BYTES) return file;
  const duration = await audioDuration(file);
  if (!duration || duration > SHRINK_MAX_SECONDS) return file;
  if ((file.size * 8) / duration / 1000 < SHRINK_ABOVE_KBPS) return file;
  onStage({ stage: "compressing" });
  try {
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const bytes = await encodeMp3Bytes(buffer, { bitrate: 256 });
    if (bytes.length > file.size * 0.8) return file;
    return new File([bytes as BlobPart], `${file.name.replace(/\.[^/.]+$/, "")}.mp3`, { type: "audio/mpeg" });
  } catch {
    return file;
  }
}

/** Sends a song from this device to the queue, for a helper's computer to split. */
export async function queueFile(original: File, tags: string[], onStage: (stage: UploadStage) => void) {
  const file = await shrinkForQueue(original, onStage);
  onStage({ stage: "queueing", progress: 0 });
  const created = await json<{ id: string; upload: UploadTarget }>(
    await fetch("/api/split-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(/\.[^/.]+$/, "").slice(0, 200) || "Untitled",
        filename: file.name,
        size: file.size,
        tags,
        // The upload form doesn't start without the box ticked.
        rightsConfirmed: true,
      }),
    }),
    "Couldn't add the song to the queue"
  );
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await upload(created.upload, bytes, (sent) => onStage({ stage: "queueing", progress: sent / bytes.length }));
    await json(await fetch(`/api/split-jobs/${created.id}/queued`, { method: "POST" }), "Couldn't queue the song");
  } catch (err) {
    void fetch(`/api/split-jobs/${created.id}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
  return created.id;
}

/** Queues the song behind a link; the server fetches it straight into the queue. */
export async function queueLink(link: string, tags: string[], onStage: (stage: UploadStage) => void) {
  onStage({ stage: "fetching-link" });
  return json<{ id: string; title: string }>(
    await fetch("/api/split-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link, tags, rightsConfirmed: true }),
    }),
    "Couldn't queue that link"
  );
}

export async function cancelQueued(id: string) {
  const res = await fetch(`/api/split-jobs/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await json(res, "Couldn't take the song out of the queue");
}

/** Puts a song that couldn't be split back in the queue. */
export async function retryQueued(id: string) {
  await json(await fetch(`/api/split-jobs/${id}/retry`, { method: "POST" }), "Couldn't retry the song");
}

// --- Helping: splitting other people's songs ------------------------------------------

const ENABLED_KEY = "remixt-split-helper";
const SESSION_KEY = "remixt-split-session";
/** How often an idle helper looks for work. */
const POLL_MS = 5_000;
/** How often a busy helper checks in (the server hands a job on after 3 quiet minutes). */
const HEARTBEAT_MS = 15_000;
/** Splitter crashes in a row before helping switches itself off. */
const MAX_CRASHES = 2;

/**
 * This tab's name to the queue. Kept for the tab's life (sessionStorage
 * survives a reload), so a tab that reloads mid-song gets it straight back
 * instead of leaving it stuck until the server gives up on it. A duplicated
 * tab starts with a copy of the original's sessionStorage, so a new tab
 * first asks the others whether its name is taken, and picks a new one if so.
 */
function tabSession(): Promise<string> {
  sessionName ??= (async () => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(SESSION_KEY);
    } catch {
      // Storage blocked — a name for this page load only.
    }
    const renew = () => {
      id = crypto.randomUUID();
      try {
        sessionStorage.setItem(SESSION_KEY, id);
      } catch {
        // As above.
      }
    };
    if (!id) renew();
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(SESSION_KEY);
      const me = crypto.randomUUID();
      let taken = false;
      // Kept open for the tab's life, to answer tabs duplicated from this one.
      channel.onmessage = (event: MessageEvent<{ type: string; session: string; from: string }>) => {
        const message = event.data;
        if (message?.session !== id || message.from === me) return;
        if (message.type === "probe") channel.postMessage({ type: "taken", session: id, from: me });
        else if (message.type === "taken") taken = true;
      };
      channel.postMessage({ type: "probe", session: id, from: me });
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (taken) renew();
    }
    return id!;
  })();
  return sessionName;
}
let sessionName: Promise<string> | null = null;

export type HelperState = {
  enabled: boolean;
  status: "off" | "waiting" | "paused" | "working" | "error";
  /** Why it's paused ("music is playing"), or what went wrong. */
  message: string | null;
  job: { id: string; title: string; forSomeoneElse: boolean; startedAt: number } | null;
  stage: UploadStage | null;
  stats: QueueStats | null;
  /** The last song finished, for a moment's "done" in the corner. */
  finished: { title: string; forSomeoneElse: boolean; at: number } | null;
};

type ClaimedJob = { id: string; title: string; filename: string; forSomeoneElse: boolean; sourceUrl: string };

class LostJob extends Error {}

function stageName(stage: UploadStage) {
  return stage.stage === "uploading" || stage.stage === "saving" ? "uploading" : stage.stage;
}

function stageProgress(stage: UploadStage) {
  return "progress" in stage ? stage.progress : 0;
}

class SplitHelper {
  private listeners = new Set<() => void>();
  private running = false;
  private wakeUp: (() => void) | null = null;
  /** Set by the page: the helper doesn't start songs where audio is played. */
  private pageReason: string | null = null;
  private crashes = 0;
  state: HelperState = {
    enabled: false,
    status: "off",
    message: null,
    job: null,
    stage: null,
    stats: null,
    finished: null,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<HelperState>) {
    this.state = { ...this.state, ...patch };
    // Only while a song is actually being split — waiting for one doesn't need the screen.
    keepScreenOn("split-helper", this.state.status === "working");
    for (const listener of this.listeners) listener();
  }

  /** Phones can't split, so they can't help either. */
  canHelp() {
    return typeof window !== "undefined" && !isConstrainedDevice();
  }

  /** Picks up where this browser left off: helping resumes on every page load until switched off. */
  restore() {
    if (!this.canHelp()) return;
    let saved = false;
    try {
      saved = localStorage.getItem(ENABLED_KEY) === "on";
    } catch {
      // Storage blocked — helping just doesn't survive a reload.
    }
    if (saved && !this.state.enabled) this.setEnabled(true);
  }

  setEnabled(on: boolean) {
    if (on && !this.canHelp()) return;
    try {
      if (on) localStorage.setItem(ENABLED_KEY, "on");
      else localStorage.removeItem(ENABLED_KEY);
    } catch {
      // Storage blocked — fine for this visit.
    }
    if (on) this.crashes = 0;
    this.set({ enabled: on, message: null, status: on ? "waiting" : this.state.job ? "working" : "off" });
    this.wake();
    if (on) {
      // Have the model loaded before the first song arrives, rather than
      // making its owner wait for it (not on a page playing music).
      if (!this.pageReason) void splitter.load().catch(() => {});
      void this.run();
    }
  }

  /** The page says why songs shouldn't start here (the Studio, a remix playing), or null. */
  setPageReason(reason: string | null) {
    this.pageReason = reason;
    this.wake();
  }

  /** Stops waiting and looks at the queue now (e.g. the user just queued a song). */
  wake() {
    this.wakeUp?.();
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wakeUp = done;
    });
  }

  /** Why not to start a song right now, if there's a reason. */
  private pausedFor(): string | null {
    if (this.pageReason) return this.pageReason;
    // Splitting uses the whole GPU or every CPU core: it would stutter the audio.
    if (useStudioStore.getState().isPlaying || previewPlayer.getState().playing) return "music is playing";
    if (splitter.busy) return "your own song is splitting first";
    return null;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.state.enabled) {
        const reason = this.pausedFor();
        if (reason) {
          this.set({ status: "paused", message: reason });
          await this.wait(5_000);
          continue;
        }
        let claim: { job: ClaimedJob | null; stats: QueueStats };
        try {
          claim = await json(
            await fetch("/api/split-jobs/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session: await tabSession() }),
            }),
            "Couldn't reach the queue"
          );
        } catch {
          this.set({ status: "waiting", message: "Can't reach the queue — trying again shortly" });
          await this.wait(POLL_MS * 2);
          continue;
        }
        this.set({ stats: claim.stats });
        if (!claim.job) {
          this.set({ status: "waiting", message: null });
          await this.wait(POLL_MS);
          continue;
        }
        await this.process(claim.job);
      }
    } finally {
      this.running = false;
      if (!this.state.enabled) this.set({ status: "off", message: null });
    }
  }

  private async process(job: ClaimedJob) {
    this.set({
      status: "working",
      message: null,
      job: { id: job.id, title: job.title, forSomeoneElse: job.forSomeoneElse, startedAt: Date.now() },
      stage: { stage: "downloading", progress: 0 },
    });
    const session = await tabSession();
    const headers = { "x-split-session": session };
    // Aborted when the job stops being ours, which stops the split too.
    const lost = new AbortController();
    const checkIn = async () => {
      const stage = this.state.stage ?? { stage: "decoding" };
      const res = await fetch(`/api/split-jobs/${job.id}/heartbeat`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ progress: stageProgress(stage), stage: stageName(stage) }),
      }).catch(() => null);
      // Cancelled by its owner, or handed on after this tab went quiet.
      if (res?.status === 409) lost.abort(new LostJob());
    };
    const heartbeat = setInterval(() => void checkIn(), HEARTBEAT_MS);
    const onStage = (stage: UploadStage) => {
      if (!lost.signal.aborted) this.set({ stage });
    };
    const stillOurs = () => {
      if (lost.signal.aborted) throw new LostJob();
    };

    try {
      const bytes = await fetchInSlices(`${job.sourceUrl}?session=${encodeURIComponent(session)}`, (loaded, total) =>
        onStage({ stage: "downloading", progress: loaded / Math.max(1, total) })
      );
      stillOurs();
      const file = new File([bytes], job.filename);
      // The user's own uploads go first; this waits for them.
      const { result, duration } = await splitSong(file, onStage, { own: false, signal: lost.signal });
      await checkIn();
      stillOurs();

      onStage({ stage: "saving" });
      const track = await json<{ id: string; uploads: Record<string, UploadTarget> }>(
        await fetch(`/api/split-jobs/${job.id}/track`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(splitTrackPayload(file, result, duration, [])),
        }),
        "Couldn't save the split"
      );
      await uploadStems(track.uploads, result, onStage);
      stillOurs();
      onStage({ stage: "saving" });
      await json(
        await fetch(`/api/split-jobs/${job.id}/complete`, { method: "POST", headers }),
        "Couldn't finish the split"
      );

      this.crashes = 0;
      const stats = this.state.stats;
      this.set({
        finished: { title: job.title, forSomeoneElse: job.forSomeoneElse, at: Date.now() },
        stats: stats && job.forSomeoneElse ? { ...stats, helped: stats.helped + 1 } : stats,
      });
    } catch (err) {
      if (!lost.signal.aborted) {
        const message = err instanceof Error ? err.message : "The split didn't finish";
        await fetch(`/api/split-jobs/${job.id}/fail`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ error: message.slice(0, 300) }),
        }).catch(() => {});
        this.set({ message: `Couldn't split “${job.title}”: ${message}` });
        // The splitter itself broke (out of memory, say). It starts afresh
        // for the next song — but if it keeps breaking, stop rather than
        // crash on every song in the queue.
        if (splitter.state.status === "error" && ++this.crashes >= MAX_CRASHES) {
          this.setEnabled(false);
          this.set({ message: `Stopped helping: the splitter keeps crashing on this computer (${message})` });
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.set({ job: null, stage: null, status: this.state.enabled ? "waiting" : "off" });
    }
  }
}

export const splitHelper = new SplitHelper();

const serverSnapshot = splitHelper.state;
export function useSplitHelper(): HelperState {
  return useSyncExternalStore(splitHelper.subscribe, () => splitHelper.state, () => serverSnapshot);
}
