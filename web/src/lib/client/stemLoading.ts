"use client";

import { create } from "zustand";

// Stems on their way into the Studio — downloading, then decoding — so a
// lane just added shows what it's waiting on instead of sitting silent.
// Kept apart from the studio store: progress ticks many times a second and
// only the few views that show it should redraw.

export type StemLoad = { phase: "download" | "decode"; /** 0–1, or null while the size isn't known. */ progress: number | null };

type State = {
  stems: Record<string, StemLoad>;
  set: (stemId: string, load: StemLoad | null) => void;
};

export const useStemLoading = create<State>((set) => ({
  stems: {},
  set: (stemId, load) =>
    set((s) => {
      const was = s.stems[stemId];
      if (!load) {
        if (!was) return s;
        const rest = { ...s.stems };
        delete rest[stemId];
        return { stems: rest };
      }
      // Whole percents only: no redraw for every slice of a slice.
      const progress = load.progress === null ? null : Math.floor(load.progress * 100) / 100;
      if (was && was.phase === load.phase && was.progress === progress) return s;
      return { stems: { ...s.stems, [stemId]: { phase: load.phase, progress } } };
    }),
}));

export function setStemLoad(stemId: string, load: StemLoad | null) {
  useStemLoading.getState().set(stemId, load);
}

/** What a stem is waiting on, for a label: "Downloading 42%", "Decoding…". */
export function stemLoadLabel(load: StemLoad) {
  if (load.phase === "decode") return "Preparing audio…";
  return load.progress === null ? "Downloading…" : `Downloading ${Math.round(load.progress * 100)}%`;
}
