"use client";

import { useSyncExternalStore } from "react";
import { previewPlayer } from "./previewPlayer";
import { fetchInSlices } from "./stemFetch";
import { useStudioStore } from "./studioStore";
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

/** Sends a song from this device to the queue, for a helper's computer to split. */
export async function queueFile(file: File, tags: string[], onStage: (stage: UploadStage) => void) {
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
  await fetch(`/api/split-jobs/${id}`, { method: "DELETE" });
}

// --- Helping: splitting other people's songs ------------------------------------------

const ENABLED_KEY = "remixt-split-helper";
/** How often an idle helper looks for work. */
const POLL_MS = 20_000;
/** How often a busy helper checks in (the server hands a job on after 3 quiet minutes). */
const HEARTBEAT_MS = 15_000;

export type HelperState = {
  enabled: boolean;
  status: "off" | "waiting" | "paused" | "working" | "error";
  /** Why it's paused, or what went wrong. */
  message: string | null;
  job: { id: string; title: string; forSomeoneElse: boolean } | null;
  stage: UploadStage | null;
  stats: QueueStats | null;
  /** The last song finished, for a moment's "done" in the corner. */
  finished: { title: string; forSomeoneElse: boolean; at: number } | null;
};

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
    this.set({ enabled: on, message: null, status: on ? "waiting" : this.state.job ? "working" : "off" });
    this.wake();
    if (on) void this.run();
  }

  /** The page says why songs shouldn't start here (the Studio, a remix playing), or null. */
  setPageReason(reason: string | null) {
    this.pageReason = reason;
    this.wake();
  }

  private wake() {
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
    if (useStudioStore.getState().isPlaying || previewPlayer.getState().playing) return "Paused while music plays";
    if (splitter.busy) return "Paused while your own song splits";
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
        let claim: { job: { id: string; title: string; filename: string; forSomeoneElse: boolean; sourceUrl: string } | null; stats: QueueStats };
        try {
          claim = await json(await fetch("/api/split-jobs/claim", { method: "POST" }), "Couldn't reach the queue");
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

  private async process(job: { id: string; title: string; filename: string; forSomeoneElse: boolean; sourceUrl: string }) {
    this.set({
      status: "working",
      message: null,
      job: { id: job.id, title: job.title, forSomeoneElse: job.forSomeoneElse },
      stage: { stage: "downloading", progress: 0 },
    });
    let lost = false;
    const checkIn = async () => {
      const stage = this.state.stage ?? { stage: "decoding" };
      const res = await fetch(`/api/split-jobs/${job.id}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: stageProgress(stage), stage: stageName(stage) }),
      }).catch(() => null);
      // Cancelled by its owner, or handed on after this tab went quiet.
      if (res?.status === 409) lost = true;
    };
    const heartbeat = setInterval(() => void checkIn(), HEARTBEAT_MS);
    // (Progress arrives from the splitter's worker, where throwing would
    // go nowhere — so losing the job is checked between steps instead.)
    const onStage = (stage: UploadStage) => this.set({ stage });
    const stillOurs = () => {
      if (lost) throw new LostJob();
    };

    try {
      const bytes = await fetchInSlices(job.sourceUrl, (loaded, total) =>
        onStage({ stage: "downloading", progress: loaded / Math.max(1, total) })
      );
      stillOurs();
      const file = new File([bytes], job.filename);
      const { result, duration } = await splitSong(file, onStage);
      await checkIn();
      stillOurs();

      onStage({ stage: "saving" });
      const track = await json<{ id: string; uploads: Record<string, UploadTarget> }>(
        await fetch(`/api/split-jobs/${job.id}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(splitTrackPayload(file, result, duration, [])),
        }),
        "Couldn't save the split"
      );
      await uploadStems(track.uploads, result, onStage);
      stillOurs();
      onStage({ stage: "saving" });
      await json(await fetch(`/api/split-jobs/${job.id}/complete`, { method: "POST" }), "Couldn't finish the split");

      const stats = this.state.stats;
      this.set({
        finished: { title: job.title, forSomeoneElse: job.forSomeoneElse, at: Date.now() },
        stats: stats && job.forSomeoneElse ? { ...stats, helped: stats.helped + 1 } : stats,
      });
    } catch (err) {
      if (!(err instanceof LostJob) && !lost) {
        const message = err instanceof Error ? err.message : "The split didn't finish";
        await fetch(`/api/split-jobs/${job.id}/fail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: message.slice(0, 300) }),
        }).catch(() => {});
        this.set({ message: `Couldn't split “${job.title}”: ${message}` });
        // The splitter itself broke (out of memory, no WebGPU/WASM): stop, don't loop on it.
        if (splitter.state.status === "error") this.setEnabled(false);
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
