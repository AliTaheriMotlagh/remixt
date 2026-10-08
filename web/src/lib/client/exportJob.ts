"use client";

// The export in progress, if any — the mix or a single lane — shared by
// everything that can start one (the Export menu, a lane's inspector, its
// right-click menu) and shown by ExportSheet: progress, time left, cancel,
// then the finished file with its Save / Share button.

import { create } from "zustand";
import type { ExportInfo } from "./exportMeta";
import { exportLane, type ExportedFile } from "./mixdown";
import { downloadFile, prefersShareSheet } from "./saveFile";
import type { StudioLane } from "./studioStore";
import { keepScreenOn } from "./wakeLock";

export type ExportProgress = {
  stage: string;
  /** 0–1 across the whole export; null while it can't be told (loading stems). */
  fraction: number | null;
  /** When the measurable part began, for the time-left estimate. */
  measuredFrom: number | null;
};

type ExportJobState = {
  /** The remix's title, artist, link and cover, kept current by the transport — what lane exports are tagged with. */
  info: ExportInfo;
  setInfo: (info: ExportInfo) => void;
  /** What's being exported, e.g. "Whole mix" or "Vocals lane". */
  label: string | null;
  progress: ExportProgress | null;
  result: (ExportedFile & { coverUrl: string | null; autoSaved: boolean }) | null;
  error: string | null;
  /** Runs the last export again (after it failed). */
  retry: (() => void) | null;
  run: (label: string, task: (report: (stage: string, fraction?: number) => void, signal: AbortSignal) => Promise<ExportedFile>) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
};

let controller: AbortController | null = null;

/** Rendering is roughly 60% of the wait, encoding the rest (MP3; WAV is near instant). */
function overall(stage: string, fraction: number | undefined): number | null {
  if (fraction === undefined) return null;
  if (/^Rendering/.test(stage)) return fraction * 0.6;
  if (/^Encoding/.test(stage)) return 0.62 + fraction * 0.38;
  return null;
}

export const useExportJob = create<ExportJobState>((set, get) => ({
  info: { title: "Untitled remix", artist: "Remixt" },
  setInfo: (info) => set({ info }),
  label: null,
  progress: null,
  result: null,
  error: null,
  retry: null,

  run: async (label, task) => {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    const previous = get().result;
    if (previous?.coverUrl) URL.revokeObjectURL(previous.coverUrl);
    set({
      label,
      progress: { stage: "Preparing…", fraction: null, measuredFrom: null },
      result: null,
      error: null,
      retry: () => void get().run(label, task),
    });
    keepScreenOn("export-job", true);

    const report = (stage: string, fraction?: number) => {
      if (controller !== mine) return;
      const current = get().progress;
      const value = overall(stage, fraction);
      set({
        progress: {
          stage,
          // Never moves backwards between stages (tagging sits between render and encode).
          fraction: value ?? current?.fraction ?? null,
          measuredFrom: current?.measuredFrom ?? (value !== null ? performance.now() : null),
        },
      });
    };

    try {
      const result = await task(report, mine.signal);
      if (controller !== mine) return;
      const cover = result.tags.cover;
      const coverUrl = cover ? URL.createObjectURL(new Blob([cover.data as BlobPart], { type: cover.mime })) : null;
      // A computer downloads straight away; a phone waits for a tap on Save,
      // which is what lets it open the share sheet (see saveFile.ts).
      const autoSaved = !prefersShareSheet();
      if (autoSaved) downloadFile(result.file, result.file.name);
      set({ progress: null, result: { ...result, coverUrl, autoSaved } });
    } catch (err) {
      if (controller !== mine) return;
      const cancelled = mine.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
      set({ progress: null, label: cancelled ? null : label, error: cancelled ? null : err instanceof Error ? err.message : "Export failed" });
    } finally {
      if (controller === mine) {
        controller = null;
        keepScreenOn("export-job", false);
      }
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    keepScreenOn("export-job", false);
    set({ progress: null, label: null });
  },

  dismiss: () => {
    const { result } = get();
    if (result?.coverUrl) URL.revokeObjectURL(result.coverUrl);
    set({ label: null, result: null, error: null });
  },
}));

/** Seconds left, from how fast it's gone so far; null until there's enough to go on. */
export function secondsLeft(progress: ExportProgress, now: number): number | null {
  if (progress.fraction === null || progress.measuredFrom === null) return null;
  const elapsed = (now - progress.measuredFrom) / 1000;
  if (progress.fraction < 0.04 || elapsed < 0.8) return null;
  return Math.max(1, Math.round((elapsed * (1 - progress.fraction)) / progress.fraction));
}

/** Exports one lane on its own (an acapella, the drums), through the export sheet. */
export function startLaneExport(lane: StudioLane, label: string) {
  const job = useExportJob.getState();
  void job.run(label, (onProgress, signal) => exportLane(lane, job.info, { onProgress, signal }));
}
