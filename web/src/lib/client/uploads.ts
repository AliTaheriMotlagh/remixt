"use client";

import { useSyncExternalStore } from "react";
import { queueFile, queueLink, splitHelper } from "./splitQueue";
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
};

type Source = { kind: "file"; file: File } | { kind: "link"; url: string };
type Entry = UploadItem & {
  source: Source;
  tags: string[];
  /** Stops it, when it's working. */
  controller: AbortController | null;
  /** Tries that failed for the connection's sake, in a row. */
  transientFailures: number;
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

/** The same file picked twice (the same name, size and date) is only added once. */
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

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

class Uploads {
  private listeners = new Set<() => void>();
  private entries: Entry[] = [];
  private active: Record<UploadMode, number> = { split: 0, queue: 0 };
  private userId: string | null = null;
  private restored: string | null = null;
  /** Bumped whenever a song lands in the library (or the queue), so lists can refresh. */
  finishedCount = 0;
  items: UploadItem[] = [];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.items = this.entries.map((e) => ({
      id: e.id,
      name: e.name,
      mode: e.mode,
      status: e.status,
      stage: e.stage,
      error: e.error,
      note: e.note,
      finishedAt: e.finishedAt,
    }));
    const busy = (e: Entry) => e.status === "working" || e.status === "waiting";
    // Splitting a song here needs the page awake: a phone that locks
    // itself pauses the page and the split with it, and it would start over.
    // Sending songs to the queue doesn't: the screen may turn off, and the
    // upload carries on from where it was once it's back (see directUpload.ts).
    keepScreenOn("uploads", this.entries.some((e) => e.mode === "split" && busy(e)));
    // Closing or reloading the tab would throw away the work in progress
    // (the songs themselves are kept, and picked up again next visit).
    guardLeaving("uploads", this.entries.some(busy));
    for (const listener of this.listeners) listener();
  }

  private update(id: string, patch: Partial<Entry>) {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.emit();
  }

  /**
   * Songs from this device. Anything that isn't audio is left out, and so
   * is a file already on its way (picked twice); the result says which.
   */
  addFiles(files: File[], { tags, mode }: { tags: string[]; mode: UploadMode }): AddResult {
    const result: AddResult = { added: 0, notAudio: [], duplicates: [] };
    const pending = new Set(
      this.entries
        .filter((e) => e.source.kind === "file" && e.status !== "done" && e.status !== "failed")
        .map((e) => fileKey((e.source as { file: File }).file))
    );
    for (const file of files) {
      if (!isAudioFile(file)) {
        result.notAudio.push(file.name);
      } else if (pending.has(fileKey(file))) {
        result.duplicates.push(file.name);
      } else {
        pending.add(fileKey(file));
        this.push({ kind: "file", file }, file.name, tags, mode);
        result.added++;
      }
    }
    this.pump();
    return result;
  }

  /** The songs behind some links (a link already on its way is left out). */
  addLinks(urls: string[], { tags, mode }: { tags: string[]; mode: UploadMode }): number {
    const pending = new Set(
      this.entries.filter((e) => e.source.kind === "link" && e.status !== "failed").map((e) => (e.source as { url: string }).url)
    );
    let added = 0;
    for (const url of urls) {
      if (pending.has(url)) continue;
      pending.add(url);
      this.push({ kind: "link", url }, url, tags, mode);
      added++;
    }
    this.pump();
    return added;
  }

  private push(source: Source, name: string, tags: string[], mode: UploadMode, id = newId(), keep = true) {
    const entry: Entry = {
      id,
      name,
      mode,
      status: "waiting",
      stage: null,
      error: null,
      note: null,
      finishedAt: null,
      source,
      tags: [...tags],
      controller: null,
      transientFailures: 0,
    };
    this.entries = [...this.entries, entry];
    this.emit();
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
    const known = new Set(this.entries.map((e) => e.id));
    for (const k of kept) {
      if (known.has(k.id)) continue;
      const source: Source =
        k.source.kind === "file"
          ? {
              kind: "file",
              file: new File([k.source.file], k.source.fileName, { lastModified: k.source.lastModified }),
            }
          : k.source;
      const entry = this.push(source, k.name, k.tags, k.mode, k.id, false);
      if (k.status === "failed") {
        this.update(entry.id, { status: "failed", error: k.error, finishedAt: k.addedAt });
      } else if (crashed && crashed === k.name) {
        const error = "Stopped when the page restarted (see above) — try again when you're ready.";
        this.update(entry.id, { status: "failed", error, finishedAt: Date.now() });
        void markUpload(entry.id, { status: "failed", error });
      } else {
        this.update(entry.id, { note: "Picked up again after the page reloaded" });
      }
    }
    this.pump();
  }

  /** Tries a failed song again. */
  retry(id: string) {
    const entry = this.entries.find((e) => e.id === id);
    if (entry?.status !== "failed") return;
    this.update(id, { status: "waiting", stage: null, error: null, note: null, finishedAt: null, transientFailures: 0 });
    void markUpload(id, { status: "waiting", error: null });
    this.pump();
  }

  /** Tries every failed song again, in the order they were added. */
  retryFailed() {
    for (const e of this.entries) if (e.status === "failed") this.retry(e.id);
  }

  /** Stops a song that's being added and forgets it. A track half-made for it is dropped. */
  cancel(id: string) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.controller?.abort();
    this.forget(id);
  }

  /** Forgets every song that hasn't started yet. */
  removeWaiting() {
    for (const e of this.entries) if (e.status === "waiting") this.forget(e.id);
  }

  /** Forgets a song that's finished, failed or not started yet (a working one is cancelled). */
  remove(id: string) {
    this.cancel(id);
  }

  clearFinished() {
    this.entries = this.entries.filter((e) => e.status !== "done");
    this.emit();
  }

  private forget(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id);
    void forgetUpload(id);
    this.emit();
  }

  /**
   * Starts waiting songs, in order, while there's room. Songs split here:
   * two at a time on a computer (one splitting while the other's stems
   * upload), one on a phone, where memory is tight. Songs for the queue
   * are only sent, so a few at once on any device.
   */
  private pump() {
    const limits: Record<UploadMode, number> = {
      split: isConstrainedDevice() ? 1 : 2,
      queue: QUEUE_SENDS_AT_ONCE,
    };
    for (;;) {
      const next = this.entries.find((e) => e.status === "waiting" && this.active[e.mode] < limits[e.mode]);
      if (!next) return;
      const { mode } = next;
      this.active[mode]++;
      const controller = new AbortController();
      this.update(next.id, { status: "working", stage: null, controller });
      void this.run(next.id, controller.signal).finally(() => {
        this.active[mode]--;
        this.pump();
      });
    }
  }

  /** One song, start to finish, trying again by itself while the connection is to blame. */
  private async run(id: string, signal: AbortSignal) {
    for (;;) {
      const entry = this.entries.find((e) => e.id === id);
      if (!entry || signal.aborted) return;
      try {
        await this.attempt(entry, signal);
        return;
      } catch (err) {
        if (signal.aborted || isCancel(err)) return;
        const current = this.entries.find((e) => e.id === id);
        if (!current) return;
        const message = err instanceof Error ? err.message : "Upload failed";
        if (isTransient(err) && current.transientFailures < AUTO_RETRIES) {
          const wait = RETRY_DELAYS[current.transientFailures] ?? 30;
          this.update(id, { transientFailures: current.transientFailures + 1 });
          try {
            await countdown(wait, signal, (left) =>
              this.update(id, { stage: { stage: "retrying", reason: message, inSeconds: left } })
            );
          } catch {
            return;
          }
          continue;
        }
        this.update(id, { status: "failed", stage: null, error: message, controller: null, finishedAt: Date.now() });
        void markUpload(id, { status: "failed", error: message, name: current.name });
        return;
      }
    }
  }

  private async attempt(entry: Entry, signal: AbortSignal) {
    const { id, source, tags, mode } = entry;
    let name = entry.name;
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
          await queueFile(source.file, tags, report, signal);
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
        const { existing } = await uploadSong(file, report, { tags, signal });
        if (existing) {
          note = existing.mine
            ? `Already in your library as “${existing.title}” — nothing to split`
            : `Already in the library as “${existing.title}” (added by ${existing.artist_name}) — find it in the Library`;
        }
      }
      signal.throwIfAborted();
      this.finishedCount++;
      this.update(id, { status: "done", stage: null, name, note, controller: null, finishedAt: Date.now() });
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
