"use client";

import { useSyncExternalStore } from "react";
import { queueFile, queueLink, splitHelper } from "./splitQueue";
import {
  fetchSongFromLink,
  isConstrainedDevice,
  uploadSong,
  type SplitterState,
  type UploadStage,
} from "./splitter";
import { keepScreenOn } from "./wakeLock";

// The songs this browser is adding to the library — split here, or sent to
// the split queue from a phone — kept outside any page, so they carry on
// while the user goes anywhere else on the site. Any number can be added
// at once; they're split one at a time (the model can only do one), but the
// next song starts splitting while the last one's stems upload. Songs for
// the queue are only sent, so several go up at once.

export type UploadMode = "split" | "queue";

export type UploadItem = {
  id: string;
  /** The file's name, or the link until the song behind it has a name. */
  name: string;
  mode: UploadMode;
  status: "waiting" | "working" | "done" | "failed";
  stage: UploadStage | null;
  error: string | null;
  finishedAt: number | null;
};

type Source = { kind: "file"; file: File } | { kind: "link"; url: string };
type Entry = UploadItem & { source: Source; tags: string[] };

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

let nextId = 1;

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

class Uploads {
  private listeners = new Set<() => void>();
  private entries: Entry[] = [];
  private active: Record<UploadMode, number> = { split: 0, queue: 0 };
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
      finishedAt: e.finishedAt,
    }));
    const busy = this.entries.some((e) => e.status === "working" || e.status === "waiting");
    // Splitting a song here needs the page awake: a phone that locks
    // itself pauses the page and the split with it, and it would start over.
    // Sending songs to the queue doesn't: the screen may turn off, and the
    // upload carries on from where it was once it's back (see directUpload.ts).
    keepScreenOn(
      "uploads",
      this.entries.some((e) => e.mode === "split" && (e.status === "working" || e.status === "waiting"))
    );
    this.warnOnLeave(busy);
    for (const listener of this.listeners) listener();
  }

  private leaveWarning: ((e: BeforeUnloadEvent) => void) | null = null;

  /** Closing the tab (or reloading it) would lose songs still being added. */
  private warnOnLeave(on: boolean) {
    if (typeof window === "undefined" || on === !!this.leaveWarning) return;
    if (on) {
      this.leaveWarning = (e) => e.preventDefault();
      window.addEventListener("beforeunload", this.leaveWarning);
    } else {
      window.removeEventListener("beforeunload", this.leaveWarning!);
      this.leaveWarning = null;
    }
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

  private push(source: Source, name: string, tags: string[], mode: UploadMode) {
    this.entries = [
      ...this.entries,
      {
        id: String(nextId++),
        name,
        mode,
        status: "waiting",
        stage: null,
        error: null,
        finishedAt: null,
        source,
        tags: [...tags],
      },
    ];
    this.emit();
  }

  /** Tries a failed song again. */
  retry(id: string) {
    const entry = this.entries.find((e) => e.id === id);
    if (entry?.status !== "failed") return;
    this.update(id, { status: "waiting", stage: null, error: null, finishedAt: null });
    this.pump();
  }

  /** Tries every failed song again, in the order they were added. */
  retryFailed() {
    this.entries = this.entries.map((e) =>
      e.status === "failed" ? { ...e, status: "waiting", stage: null, error: null, finishedAt: null } : e
    );
    this.emit();
    this.pump();
  }

  /** Forgets every song that hasn't started yet. */
  removeWaiting() {
    this.entries = this.entries.filter((e) => e.status !== "waiting");
    this.emit();
  }

  /** Forgets a song that's finished, failed or not started yet. */
  remove(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id || e.status === "working");
    this.emit();
  }

  clearFinished() {
    this.entries = this.entries.filter((e) => e.status !== "done");
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
      this.update(next.id, { status: "working", stage: null });
      void this.run(next).finally(() => {
        this.active[mode]--;
        this.pump();
      });
    }
  }

  private async run(entry: Entry) {
    const { id, source, tags, mode } = entry;
    let name = entry.name;
    const report = (stage: UploadStage) => this.update(id, { stage, name });
    try {
      if (mode === "queue") {
        if (source.kind === "link") {
          const queued = await queueLink(source.url, tags, report);
          name = queued.title;
        } else {
          await queueFile(source.file, tags, report);
        }
        // A computer in this browser that helps split can take it at once.
        splitHelper.wake();
      } else {
        const file = source.kind === "file" ? source.file : await fetchSongFromLink(source.url, report);
        // A link's song has its real name now.
        name = file.name;
        if (isConstrainedDevice()) rememberInFlight(file.name);
        await uploadSong(file, report, { tags });
      }
      this.finishedCount++;
      this.update(id, { status: "done", stage: null, name, finishedAt: Date.now() });
    } catch (err) {
      this.update(id, {
        status: "failed",
        stage: null,
        name,
        error: err instanceof Error ? err.message : "Upload failed",
        finishedAt: Date.now(),
      });
    } finally {
      if (mode === "split" && isConstrainedDevice()) rememberInFlight(null);
    }
  }

  /**
   * If the page reloaded in the middle of a split on a phone, the browser
   * killed it — nearly always for using too much memory. Returns the
   * song's name once, so the Upload page can say so.
   */
  takeCrashNote(): string | null {
    try {
      const name = sessionStorage.getItem(IN_FLIGHT_KEY);
      if (name) sessionStorage.removeItem(IN_FLIGHT_KEY);
      return name;
    } catch {
      return null;
    }
  }
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
