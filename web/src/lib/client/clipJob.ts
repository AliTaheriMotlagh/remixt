"use client";

// The social clip being made, if any. Kept outside the clip editor so the
// editor can be closed while the clip records (it records in real time):
// a chip on the clip button says how far it is, and opening the editor
// again shows the progress, or the finished video ready to share. Like
// exportJob.ts for audio exports.

import { create } from "zustand";
import type { ClipDesign } from "@/lib/clipDesign";
import { makeSocialClip, type ClipContent, type SocialClip } from "./socialClip";
import { keepScreenOn } from "./wakeLock";

export type ClipRange = { start: number; end: number };

type ClipJobState = {
  /** While it's being made: what it's doing and how far (0–1). */
  stage: { label: string; fraction: number } | null;
  /** The finished video. */
  result: { clip: SocialClip; url: string } | null;
  error: string | null;
  /** What's drawn while it records — the editor shows it in place of its preview. */
  canvas: HTMLCanvasElement | null;
  /** What it was made of, so the editor opens on the same part and look. */
  made: { design: ClipDesign; range: ClipRange } | null;
  start: (args: { audioContext: AudioContext; range: ClipRange; design: ClipDesign; content: ClipContent }) => Promise<void>;
  cancel: () => void;
  /** Forgets the finished clip (or the error), back to editing. */
  dismiss: () => void;
};

let controller: AbortController | null = null;

export const useClipJob = create<ClipJobState>((set, get) => ({
  stage: null,
  result: null,
  error: null,
  canvas: null,
  made: null,

  start: async ({ audioContext, range, design, content }) => {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    get().dismiss();
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full rounded-xl bg-black shadow-2xl ring-1 ring-white/10";
    set({ stage: { label: "Starting…", fraction: 0 }, error: null, canvas, made: { design, range } });
    keepScreenOn("social-clip", true);
    try {
      const clip = await makeSocialClip({
        audioContext,
        start: range.start,
        end: range.end,
        design,
        content,
        canvas,
        onProgress: (label, fraction) => {
          if (controller !== mine) return;
          const cur = get().stage;
          if (!cur || cur.label !== label || Math.abs(cur.fraction - fraction) >= 0.005) set({ stage: { label, fraction } });
        },
        signal: mine.signal,
      });
      if (controller !== mine) return;
      set({ stage: null, canvas: null, result: { clip, url: URL.createObjectURL(clip.blob) } });
    } catch (err) {
      if (controller !== mine) return;
      const cancelled = mine.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
      set({ stage: null, canvas: null, error: cancelled ? null : err instanceof Error ? err.message : "Couldn't make the clip" });
    } finally {
      if (controller === mine) {
        controller = null;
        keepScreenOn("social-clip", false);
      }
      void audioContext.close().catch(() => {});
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    keepScreenOn("social-clip", false);
    set({ stage: null, canvas: null });
  },

  dismiss: () => {
    const { result } = get();
    if (result) URL.revokeObjectURL(result.url);
    set({ result: null, error: null });
  },
}));
