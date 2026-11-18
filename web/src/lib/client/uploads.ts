"use client";

import { attachJobCover, attachTrackCover } from "./songCovers";
import { useSyncExternalStore } from "react";
import { queueFile, queueLink, splitHelper, type QueueResume } from "./splitQueue";
import {
  fetchSongFromLink,
  foundBySearch,
  isConstrainedDevice,
  TransientError,
  uploadSong,
  type SplitterState,
  type UploadStage,
} from "./splitter";
import { NetworkError, UploadCancelled } from "./directUpload";
import { guardLeaving } from "./leaveGuard";
import { forgetUpload, keepUpload, keptUploads, markUpload } from "./uploadStore";
import { keepScreenOn } from "./wakeLock";

// The songs this browser is adding to the library — split here, or sent to
// the split queue from a phone — kept outside any page, so they carry on
// while the user goes anywhere else on the site. Any number can be added
// at once; they're split one at a time (the model can only do one), but the
// next song starts splitting while the last one's stems upload. Songs for
// the queue are only sent, so several go up at once.
//
// Each song goes through these phases:
//
//   waiting ─▶ working ─▶ done
//      ▲          │
//      │          ├─▶ (connection dropped) ─▶ retrying by itself, a few times
//      │          ├─▶ failed ──(Try again)──▶ waiting
//      │          └─▶ (Cancel) ─▶ gone
//      └─ (reload, crash, tab closed) — kept on disk, picked up next visit
//
// "working" covers checking whether the song is already in the library,
// fetching a link's song, splitting, uploading the stems and saving; its
// `stage` says which (see describeStage).

export type UploadMode = "split" | "queue";

export type UploadItem = {
  id: string;
  /** The file's name, or the link until the song behind it has a name. */
  name: string;
  mode: UploadMode;
  status: "waiting" | "working" | "done" | "failed";
  stage: UploadStage | null;
  error: string | null;
  /** Something worth saying about it: picked up after a reload, already in the library… */
  note: string | null;
  finishedAt: number | null;
  /** The track it became (or was already), once done — split here; a queued song has none yet. */
  trackId: string | null;
  /** About how long the stage it's on has left, from how fast it's been going (null: can't tell yet). */
  secondsLeft: number | null;
};

type Source = { kind: "file"; file: File } | { kind: "link"; url: string };
type Entry = UploadItem & {
  source: Source;
  tags: string[];
  /** Made a private track (see StoredUpload.keepPrivate). */
  keepPrivate: boolean;
  /** Stops it, when it's working. */
  controller: AbortController | null;
  /** Tries that failed for the connection's sake, in a row. */
  transientFailures: number;
  /** Timing the stage it's on, for `secondsLeft`. */
  clock: { stage: string | null; fraction: number; at: number; rate: number } | null;
};

/** Set while a song is being split on a phone, so a reload mid-split can be explained. */
const IN_FLIGHT_KEY = "remixt-upload-in-flight";

function rememberInFlight(name: string | null) {
  try {
    if (name) sessionStorage.setItem(IN_FLIGHT_KEY, name);
    else sessionStorage.removeItem(IN_FLIGHT_KEY);
  } catch {
    // Storage blocked — only the explanation is lost.
  }
}

/**
 * Where a song on its way to the queue has got to (see QueueResume), kept
 * beside the song itself — in localStorage rather than with the file in
 * IndexedDB, where every change would write the whole file out again.
 */
const resumeKey = (id: string) => `remixt.upload.resume.${id}`;

function readResume(id: string): QueueResume | null {
  try {
    const kept = JSON.parse(localStorage.getItem(resumeKey(id)) ?? "null") as QueueResume | null;
    return kept && typeof kept.jobId === "string" ? kept : null;
  } catch {
    return null;
  }
}

/** How much of a song the relay has saved so far. */
function savedBytes(id: string): number {
  return readResume(id)?.relay?.sent.reduce((sum, [, bytes]) => sum + bytes, 0) ?? 0;
}

function writeResume(id: string, state: QueueResume | null) {
  try {
    if (state) localStorage.setItem(resumeKey(id), JSON.stringify(state));
    else localStorage.removeItem(resumeKey(id));
  } catch {
    // Storage blocked or full: the next try just starts the song again.
  }
}

/** Unique across reloads, since entries are kept on disk. */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What a song can be: what browsers can decode and the split queue can store. */
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac", "webm", "opus", "mp4"];

export function isAudioFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

/** The same file picked twice (the same name, size and date), or the same link, is only added once. */
function keyOf(source: Source): string {
  return source.kind === "file" ? `file:${source.file.name}:${source.file.size}:${source.file.lastModified}` : `link:${source.url}`;
}

/**
 * The files dropped on the page — including everything inside a dropped
 * folder (and its folders), in name order, so an album keeps its track
 * order. Hidden files (.DS_Store and the like) are left out. Must be called
 * during the drop event itself: the browser forgets what was dropped once
 * it's over.
 */
export function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const entries = Array.from(data.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.some((entry) => entry.isDirectory)) return Promise.resolve(Array.from(data.files));

  const byName = (a: FileSystemEntry, b: FileSystemEntry) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const files: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    // A folder is read a batch at a time, until an empty one.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }
    for (const child of children.sort(byName)) await walk(child);
  };
  return (async () => {
    for (const entry of entries.sort(byName)) await walk(entry).catch(() => {});
    return files;
  })();
}

/** Why some of the files picked weren't added. */
export type AddResult = { added: number; notAudio: string[]; duplicates: string[] };

/**
 * Songs going up to the split queue at once: enough to keep the
 * connection busy between one song's requests, without splitting it so
 * thin that none finishes for ages.
 */
const QUEUE_SENDS_AT_ONCE = 3;

/** A song whose connection keeps dropping is tried this many times by itself before it's left for the user. */
const AUTO_RETRIES = 3;
/** Seconds before each of those tries. */
const RETRY_DELAYS = [5, 15, 40];

/**
 * A failure the connection (or a server hiccup) is to blame for, not the
 * song: worth trying again by itself.
 */
export function isTransient(err: unknown): boolean {
  if (err instanceof UploadCancelled) return false;
  if (err instanceof TransientError || err instanceof NetworkError) return true;
  if (err instanceof TypeError) return true; // fetch's "Failed to fetch" / "Load failed"
  const message = err instanceof Error ? err.message : "";
  return /check your connection|took too long|stalled|HTTP 5\d\d|network|Failed to fetch|Load failed/i.test(message);
}

function isCancel(err: unknown): boolean {
  return err instanceof UploadCancelled || (err instanceof Error && err.name === "AbortError");
}

/** Resolves after `seconds`, or as soon as `signal` aborts (rejecting), reporting the countdown. */
function countdown(seconds: number, signal: AbortSignal, onTick: (left: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let left = seconds;
    onTick(left);
    const timer = setInterval(() => {
      left--;
      if (left <= 0) return done();
      onTick(left);
    }, 1000);
    const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
    const done = () => {
      // No point trying while the device says it's offline: wait for it.
      if (offline()) return;
      clearInterval(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const stop = () => {
      clearInterval(timer);
      window.removeEventListener("online", done);
      reject(new UploadCancelled());
    };
    window.addEventListener("online", done);
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** The status sets every entry is in exactly one of — counts and per-status walks without scanning the list. */
type Status = UploadItem["status"];

/** How much the newest speed reading counts against the ones before it (an exponential moving average). */
const RATE_WEIGHT = 0.3;
/** Readings closer together than this are too noisy to time with. */
const RATE_MIN_MS = 400;

/** The next frame (or a moment, when the page is hidden and frames don't come). */
function nextFrame(run: () => void) {
  if (typeof document !== "undefined" && !document.hidden && typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 50);
}

/** How far along a stage is, when it says. */
function fractionOf(stage: UploadStage | null): number | null {
  return stage && "progress" in stage && typeof stage.progress === "number" ? stage.progress : null;
}

/**
 * The songs being added, kept so that everything that happens to one song
 * costs the same however many there are:
 *
 *   - entries by id in a Map (in the order added, which is the list's order)
 *   - each status's ids in a Set — the counts, "try every failed one",
 *     "remove every waiting one" never scan the rest
 *   - the next song to start, per mode, is the first of an ordered Set
 *   - a file or link already on its way is found by its key, not by search
 *
 * Progress arrives many times a second per song; it only marks the song
 * changed. The list the page shows is rebuilt once a frame at most, and a
 * song that didn't change keeps the same object, so its row isn't drawn
 * again.
 */
class Uploads {
  private listeners = new Set<() => void>();
  private entries = new Map<string, Entry>();
  private byStatus: Record<Status, Set<string>> = { waiting: new Set(), working: new Set(), done: new Set(), failed: new Set() };
  /** Waiting songs per mode, oldest first: the next to start is the first. */
  private line: Record<UploadMode, Set<string>> = { split: new Set(), queue: new Set() };
  /** Songs on their way (not done or failed) by file key or link, to catch the same one added twice. */
  private onTheirWay = new Map<string, string>();
  /** Songs running now, per mode (each mode has its own limit, see pump). */
  private active: Record<UploadMode, number> = { split: 0, queue: 0 };
  private userId: string | null = null;
  private restored: string | null = null;
  /** Rows to rebuild at the next frame, and whether one is coming. */
  private changed = new Set<string>();
  private flushing = false;
  private views = new Map<string, UploadItem>();
  /** Bumped whenever a song lands in the library (or the queue), so lists can refresh. */
  finishedCount = 0;
  items: UploadItem[] = [];
  /** How many songs are in each status — kept as they change. */
  summary: Record<Status, number> = { waiting: 0, working: 0, done: 0, failed: 0 };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // --- Changes ---------------------------------------------------------------

  /** Marks a song changed; the list follows at the next frame. */
  private touch(id: string) {
    this.changed.add(id);
    if (this.flushing) return;
    this.flushing = true;
    nextFrame(() => this.flush());
  }

  private flush() {
    this.flushing = false;
    for (const id of this.changed) {
      const e = this.entries.get(id);
      if (!e) {
        this.views.delete(id);
        continue;
      }
      this.views.set(id, {
        id: e.id,
        name: e.name,
        mode: e.mode,
        status: e.status,
        stage: e.stage,
        error: e.error,
        note: e.note,
        finishedAt: e.finishedAt,
        trackId: e.trackId,
        secondsLeft: e.secondsLeft,
      });
    }
    this.changed.clear();
    // A new list (React needs one to see a change), but rows that didn't change keep their object.
    this.items = Array.from(this.entries.keys(), (id) => this.views.get(id)!);
    this.summary = {
      waiting: this.byStatus.waiting.size,
      working: this.byStatus.working.size,
      done: this.byStatus.done.size,
      failed: this.byStatus.failed.size,
    };
    for (const listener of this.listeners) listener();
  }

  /** What follows from how many songs are busy — checked on every status change, in constant time. */
  private sideEffects() {
    const busy = this.byStatus.waiting.size + this.byStatus.working.size;
    // Any song on its way keeps the screen on — split here or sent to the
    // queue. A phone whose screen turns off pauses the page, and the upload
    // with it: on a slow mobile connection that's most of the wait. The
    // screen follows the phone's own setting again the moment they're done.
    keepScreenOn("uploads", busy > 0);
    // Closing or reloading the tab would throw away the work in progress
    // (the songs themselves are kept, and picked up again next visit).
    guardLeaving("uploads", busy > 0);
  }

  /** Moves a song to `status`, keeping every index in step. The only place a status changes. */
  private setStatus(entry: Entry, status: Status) {
    const was = entry.status;
    if (was === status && this.byStatus[status].has(entry.id)) return;
    this.byStatus[was].delete(entry.id);
    this.byStatus[status].add(entry.id);
    entry.status = status;
    if (status === "waiting") this.line[entry.mode].add(entry.id);
    else this.line[entry.mode].delete(entry.id);
    const busy = status === "waiting" || status === "working";
    const key = keyOf(entry.source);
    if (busy) this.onTheirWay.set(key, entry.id);
    else if (this.onTheirWay.get(key) === entry.id) this.onTheirWay.delete(key);
    this.sideEffects();
    this.touch(entry.id);
  }

  private update(id: string, patch: Partial<Omit<Entry, "status">>) {
    const entry = this.entries.get(id);
    if (!entry) return;
    Object.assign(entry, patch);
    if ("stage" in patch) this.timeStage(entry);
    this.touch(id);
  }

  /** How long a stage that reports progress has left, from how fast it's been going. */
  private timeStage(entry: Entry) {
    const fraction = fractionOf(entry.stage);
    const kind = entry.stage?.stage ?? null;
    const now = Date.now();
    const clock = entry.clock;
    // A new stage, or progress going back (a part sent again): start timing afresh.
    if (fraction === null || !clock || clock.stage !== kind || fraction < clock.fraction) {
      entry.clock = fraction === null ? null : { stage: kind, fraction, at: now, rate: 0 };
      entry.secondsLeft = null;
      return;
    }
    const ms = now - clock.at;
    if (ms < RATE_MIN_MS) return;
    const rate = (fraction - clock.fraction) / ms;
    clock.rate = clock.rate ? clock.rate * (1 - RATE_WEIGHT) + rate * RATE_WEIGHT : rate;
    clock.fraction = fraction;
    clock.at = now;
    entry.secondsLeft = clock.rate > 0 && fraction < 1 ? Math.round((1 - fraction) / clock.rate / 1000) : null;
  }

  // --- Adding ----------------------------------------------------------------

  /**
   * Songs from this device. Anything that isn't audio is left out, and so
   * is a file already on its way (picked twice); the result says which.
   */
  addFiles(files: File[], { tags, mode }: { tags: string[]; mode: UploadMode }): AddResult {
    const result: AddResult = { added: 0, notAudio: [], duplicates: [] };
    for (const file of files) {
      if (!isAudioFile(file)) result.notAudio.push(file.name);
      else if (this.onTheirWay.has(keyOf({ kind: "file", file }))) result.duplicates.push(file.name);
      else {
        this.push({ kind: "file", file }, file.name, tags, mode);
        result.added++;
      }
    }
    this.pump();
    return result;
  }

  /**
   * One song from a link, for something waiting on it (the Studio, which
   * adds it to the mix when it's done): its upload's id — the one already
   * on its way, if the link is.
   */
  addLink(url: string, { tags, mode, keepPrivate = false }: { tags: string[]; mode: UploadMode; keepPrivate?: boolean }): string {
    const pending = this.onTheirWay.get(keyOf({ kind: "link", url }));
    if (pending) return pending;
    const entry = this.push({ kind: "link", url }, url, tags, mode, newId(), true, keepPrivate);
    this.pump();
    return entry.id;
  }

  /** The songs behind some links (a link already on its way is left out). */
  addLinks(urls: string[], { tags, mode }: { tags: string[]; mode: UploadMode }): number {
    let added = 0;
    for (const url of urls) {
      if (this.onTheirWay.has(keyOf({ kind: "link", url }))) continue;
      this.push({ kind: "link", url }, url, tags, mode);
      added++;
    }
    this.pump();
    return added;
  }

  private push(source: Source, name: string, tags: string[], mode: UploadMode, id = newId(), keep = true, keepPrivate = false) {
    const entry: Entry = {
      id,
      name,
      mode,
      // Filed under "waiting" by setStatus just below.
      status: "waiting",
      stage: null,
      error: null,
      note: null,
      finishedAt: null,
      trackId: null,
      secondsLeft: null,
      clock: null,
      source,
      tags: [...tags],
      keepPrivate,
      controller: null,
      transientFailures: 0,
    };
    this.entries.set(id, entry);
    this.setStatus(entry, "waiting");
    if (keep && this.userId) {
      void keepUpload({
        id,
        userId: this.userId,
        name,
        mode,
        tags: entry.tags,
        source:
          source.kind === "file"
            ? { kind: "file", file: source.file, fileName: source.file.name, lastModified: source.file.lastModified }
            : source,
        status: "waiting",
        error: null,
        addedAt: Date.now(),
        ...(keepPrivate ? { keepPrivate } : {}),
      });
    }
    return entry;
  }

  /**
   * Picks up the songs this account was adding when the page last went
   * away (a reload, a crash, the tab closed): they start again by
   * themselves. A song whose split the phone itself killed (out of memory)
   * isn't started again blindly — it's shown as failed, with why.
   */
  async restore(userId: string | null) {
    this.userId = userId;
    if (!userId || this.restored === userId) return;
    this.restored = userId;
    const crashed = this.takeCrashNote();
    const kept = await keptUploads(userId);
    for (const k of kept) {
      if (this.entries.has(k.id)) continue;
      const source: Source =
        k.source.kind === "file"
          ? { kind: "file", file: new File([k.source.file], k.source.fileName, { lastModified: k.source.lastModified }) }
          : k.source;
      const entry = this.push(source, k.name, k.tags, k.mode, k.id, false, !!k.keepPrivate);
      if (k.status === "failed") {
        this.fail(entry, k.error ?? "Upload failed", k.addedAt);
      } else if (crashed && crashed === k.name) {
        const error = "Stopped when the page restarted (see above) — try again when you're ready.";
        this.fail(entry, error, Date.now());
        void markUpload(entry.id, { status: "failed", error });
      } else {
        this.update(entry.id, { note: "Picked up again after the page reloaded" });
      }
    }
    this.pump();
  }

  // --- Acting on songs -------------------------------------------------------

  /** Tries a failed song again (at the back of the line). */
  retry(id: string) {
    const entry = this.entries.get(id);
    if (entry?.status !== "failed") return;
    Object.assign(entry, { stage: null, error: null, note: null, finishedAt: null, transientFailures: 0, secondsLeft: null, clock: null });
    this.setStatus(entry, "waiting");
    void markUpload(id, { status: "waiting", error: null });
    this.pump();
  }

  /** Tries every failed song again, in the order they failed. */
  retryFailed() {
    for (const id of [...this.byStatus.failed]) this.retry(id);
  }

  /** Stops a song that's being added and forgets it. A track half-made for it is dropped. */
  cancel(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.controller?.abort();
    this.forget(id);
  }

  /** Forgets every song that hasn't started yet. */
  removeWaiting() {
    for (const id of [...this.byStatus.waiting]) this.forget(id);
  }

  /** Forgets a song that's finished, failed or not started yet (a working one is cancelled). */
  remove(id: string) {
    this.cancel(id);
  }

  clearFinished() {
    for (const id of [...this.byStatus.done]) this.drop(id);
  }

  /** Out of the list (and every index), not off the disk. */
  private drop(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.byStatus[entry.status].delete(id);
    this.line[entry.mode].delete(id);
    const key = keyOf(entry.source);
    if (this.onTheirWay.get(key) === id) this.onTheirWay.delete(key);
    this.entries.delete(id);
    this.sideEffects();
    this.touch(id);
  }

  private forget(id: string) {
    this.drop(id);
    void forgetUpload(id);
    // A song given up on between tries leaves its half-sent job behind: that goes too.
    const left = readResume(id);
    if (left) {
      writeResume(id, null);
      void fetch(`/api/split-jobs/${left.jobId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  private fail(entry: Entry, error: string, at: number) {
    Object.assign(entry, { stage: null, error, controller: null, finishedAt: at, secondsLeft: null, clock: null });
    this.setStatus(entry, "failed");
  }

  /**
   * Starts waiting songs, oldest first, while there's room. Songs split
   * here: two at a time on a computer (one splitting while the other's
   * stems upload), one on a phone, where memory is tight. Songs for the
   * queue are only sent, so a few at once on any device. Each start is
   * the first of its mode's line: no searching.
   */
  private pump() {
    const phone = isConstrainedDevice();
    const limits: Record<UploadMode, number> = {
      split: phone ? 1 : 2,
      // A phone's upload is the slowest link there is: one song at a time
      // (its parts still go up side by side) gets the first one into the
      // queue soonest, instead of several crawling along together.
      queue: phone ? 1 : QUEUE_SENDS_AT_ONCE,
    };
    for (const mode of ["split", "queue"] as const) {
      while (this.active[mode] < limits[mode]) {
        const next = this.line[mode].values().next();
        if (next.done) break;
        const entry = this.entries.get(next.value);
        if (!entry) {
          this.line[mode].delete(next.value);
          continue;
        }
        this.start(entry, mode);
      }
    }
    // A link for the queue is one quick request (the server fetches the
    // song): on a phone it doesn't wait behind a song still going up.
    if (phone && this.active.queue < QUEUE_SENDS_AT_ONCE) {
      for (const id of this.line.queue) {
        if (this.active.queue >= QUEUE_SENDS_AT_ONCE) break;
        const entry = this.entries.get(id);
        if (entry?.source.kind === "link") this.start(entry, "queue");
      }
    }
  }

  private start(entry: Entry, mode: UploadMode) {
    this.active[mode]++;
    const controller = new AbortController();
    Object.assign(entry, { stage: null, controller });
    this.setStatus(entry, "working");
    void this.run(entry.id, controller.signal).finally(() => {
      this.active[mode]--;
      this.pump();
    });
  }

  /** One song, start to finish, trying again by itself while the connection is to blame. */
  private async run(id: string, signal: AbortSignal) {
    for (;;) {
      const entry = this.entries.get(id);
      if (!entry || signal.aborted) return;
      const savedBefore = savedBytes(id);
      try {
        await this.attempt(entry, signal);
        return;
      } catch (err) {
        if (signal.aborted) return;
        const current = this.entries.get(id);
        if (!current) return;
        // "Aborted" with nobody having cancelled is a time limit somewhere
        // inside: a failure like any other, tried again. (Taken for a
        // cancel, the song sat at "working" for ever.)
        const timedOut = isCancel(err);
        const message = timedOut ? "That took too long — check your connection" : err instanceof Error ? err.message : "Upload failed";
        // A try that got more of the song saved wasn't wasted (the next one
        // carries on from there): it isn't held against the song.
        const failures = savedBytes(id) > savedBefore ? 0 : current.transientFailures;
        if ((timedOut || isTransient(err)) && failures < AUTO_RETRIES) {
          const wait = RETRY_DELAYS[failures] ?? 30;
          this.update(id, { transientFailures: failures + 1 });
          try {
            await countdown(wait, signal, (left) => this.update(id, { stage: { stage: "retrying", reason: message, inSeconds: left } }));
          } catch {
            return;
          }
          continue;
        }
        this.fail(current, message, Date.now());
        void markUpload(id, { status: "failed", error: message, name: current.name });
        return;
      }
    }
  }

  private async attempt(entry: Entry, signal: AbortSignal) {
    const { id, source, tags, mode, keepPrivate } = entry;
    let name = entry.name;
    let trackId: string | null = null;
    const report = (stage: UploadStage) => {
      if (!signal.aborted) this.update(id, { stage, name });
    };
    let note: string | null = null;
    try {
      if (mode === "queue") {
        if (source.kind === "link") {
          const queued = await queueLink(source.url, tags, report);
          name = queued.title;
        } else {
          const jobId = await queueFile(source.file, tags, report, signal, {
            resume: readResume(id),
            onResume: (state) => writeResume(id, state),
          });
          // Its cover, from the original file (the queue may get a smaller copy without tags).
          void attachJobCover(jobId, source.file);
        }
        // A computer in this browser that helps split can take it at once.
        splitHelper.wake();
      } else {
        const file = source.kind === "file" ? source.file : await fetchSongFromLink(source.url, report, signal);
        // A link's song has its real name now.
        name = file.name;
        if (isConstrainedDevice()) rememberInFlight(file.name);
        if (foundBySearch.has(file)) {
          note = `Found by name as “${file.name.replace(/\.[^.]+$/, "")}” — check it's the song you meant`;
        }
        const { id: madeId, existing } = await uploadSong(file, report, { tags, signal, keepPrivate });
        trackId = madeId;
        if (!existing) void attachTrackCover(madeId, file);
        if (existing) {
          note = existing.mine
            ? `Already in your library as “${existing.title}” — nothing to split`
            : `Already in the library as “${existing.title}” (added by ${existing.artist_name}) — find it in the Library`;
        }
      }
      signal.throwIfAborted();
      this.finishedCount++;
      Object.assign(entry, { stage: null, name, note, trackId, controller: null, finishedAt: Date.now(), secondsLeft: null, clock: null });
      this.setStatus(entry, "done");
      void forgetUpload(id);
    } finally {
      if (mode === "split" && isConstrainedDevice()) rememberInFlight(null);
    }
  }

  /**
   * If the page reloaded in the middle of a split on a phone, the browser
   * killed it — nearly always for using too much memory. Returns the
   * song's name once, so it can be said so.
   */
  takeCrashNote(): string | null {
    if (this.crash !== undefined) return this.crash;
    try {
      this.crash = sessionStorage.getItem(IN_FLIGHT_KEY);
      if (this.crash) sessionStorage.removeItem(IN_FLIGHT_KEY);
    } catch {
      this.crash = null;
    }
    return this.crash;
  }
  /** Read once per page load (both the Upload page and restore ask). */
  private crash: string | null | undefined = undefined;
}

export const uploads = new Uploads();

const empty: UploadItem[] = [];
export function useUploads(): UploadItem[] {
  return useSyncExternalStore(uploads.subscribe, () => uploads.items, () => empty);
}

const noSummary: Uploads["summary"] = { waiting: 0, working: 0, done: 0, failed: 0 };
/** How many songs are waiting, working, done and failed — without counting the list. */
export function useUploadSummary(): Uploads["summary"] {
  return useSyncExternalStore(uploads.subscribe, () => uploads.summary, () => noSummary);
}

/** "about 2 min left", "about 40 s left" — rounded so it doesn't flicker; null when it can't tell. */
export function timeLeftText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 10) return "a few seconds left";
  if (seconds < 60) return `about ${Math.ceil(seconds / 10) * 10} s left`;
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`;
  return "over an hour left";
}

export function useUploadsFinished(): number {
  return useSyncExternalStore(uploads.subscribe, () => uploads.finishedCount, () => 0);
}

/** What a stage looks like to the user: a short label, and how far along it is (null: no idea). */
export function describeStage(
  stage: UploadStage | null,
  splitterState: SplitterState
): { label: string; progress: number | null } {
  switch (stage?.stage) {
    case "checking":
      return { label: "Checking whether it's already in the library", progress: null };
    case "retrying":
      return { label: `${stage.reason.replace(/\.$/, "")} — trying again in ${stage.inSeconds}s`, progress: null };
    case "fetching-link":
      return { label: "Getting the song from the link", progress: null };
    case "downloading":
      return { label: "Downloading the song", progress: stage.progress };
    case "waiting":
      return { label: "Waiting for the song before it to finish splitting", progress: null };
    case "decoding":
      return { label: "Reading the file", progress: null };
    case "loading-model":
      return splitterState.status === "downloading" && !splitterState.fromCache
        ? {
            label: "Downloading the song splitter (one time only)",
            progress: splitterState.loaded / Math.max(1, splitterState.total),
          }
        : { label: "Starting the song splitter", progress: null };
    case "splitting":
      return { label: "Separating vocals, drums, bass and the rest", progress: stage.progress };
    case "encoding":
      return { label: "Finishing the stems", progress: null };
    case "uploading":
      return { label: "Uploading the stems", progress: stage.progress };
    case "saving":
      return { label: "Saving to your library", progress: null };
    case "compressing":
      return { label: "Shrinking the file so it sends faster", progress: null };
    case "queueing":
      return { label: "Sending to the split queue", progress: stage.progress };
    default:
      return { label: "Starting", progress: null };
  }
}
