"use client";

import { create } from "zustand";

// How this person is looking at the Studio — zoom, which panels are open,
// the touch "select" mode, a short notice after an edit. None of it is
// part of the mix: not saved, not undone, not shared with collaborators.

export type InspectorTab = "mix" | "tempo" | "fx" | "match" | "edit";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 48;

type ViewState = {
  /** 1 = the whole song fits the width. */
  zoom: number;
  setZoom: (zoom: number) => void;
  /** Phones and tablets: taps add clips to the selection instead of replacing it. */
  multiSelect: boolean;
  setMultiSelect: (on: boolean) => void;
  /** Lanes showing their automation row. */
  automationLanes: string[];
  toggleAutomation: (laneId: string) => void;
  inspectorTab: InspectorTab;
  /** Phones: the lane inspector sheet is up. Desktop: the docked inspector is expanded. */
  inspectorOpen: boolean;
  openInspector: (tab?: InspectorTab) => void;
  closeInspector: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  aiOpen: boolean;
  setAiOpen: (open: boolean) => void;
  /** Below desktop width, how far the AI producer's sheet is pulled up. */
  aiSheet: "mini" | "half" | "full";
  setAiSheet: (sheet: "mini" | "half" | "full") => void;
  /** Bumped to bring up the stem library from anywhere (the Studio shows it: a sheet on phones). */
  libraryAsk: number;
  showLibrary: () => void;
  /** A question waiting for the AI co-producer (opens it on its chat, filled in, unsent). */
  aiQuestion: { id: number; text: string } | null;
  askAi: (text: string) => void;
  /** The lane being split with Demucs (its dialog is open), if any. */
  splitLaneId: string | null;
  setSplitLane: (laneId: string | null) => void;
  notice: { id: number; text: string; tone: "info" | "error" } | null;
  notify: (text: string, tone?: "info" | "error") => void;
};

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const useStudioView = create<ViewState>((set) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  multiSelect: false,
  setMultiSelect: (multiSelect) => set({ multiSelect }),
  automationLanes: [],
  toggleAutomation: (laneId) =>
    set((s) => ({
      automationLanes: s.automationLanes.includes(laneId)
        ? s.automationLanes.filter((id) => id !== laneId)
        : [...s.automationLanes, laneId],
    })),
  inspectorTab: "mix",
  inspectorOpen: false,
  openInspector: (tab) => set((s) => ({ inspectorOpen: true, inspectorTab: tab ?? s.inspectorTab })),
  closeInspector: () => set({ inspectorOpen: false }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  aiOpen: false,
  setAiOpen: (aiOpen) => set({ aiOpen }),
  aiSheet: "half",
  setAiSheet: (aiSheet) => set({ aiSheet }),
  libraryAsk: 0,
  showLibrary: () => set((s) => ({ libraryAsk: s.libraryAsk + 1 })),
  aiQuestion: null,
  askAi: (text) => set({ aiOpen: true, aiQuestion: { id: Date.now(), text } }),
  splitLaneId: null,
  setSplitLane: (splitLaneId) => set({ splitLaneId }),
  notice: null,
  notify: (text, tone = "info") => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice: { id: Date.now(), text, tone } });
    noticeTimer = setTimeout(() => set({ notice: null }), tone === "error" ? 4000 : 2200);
  },
}));
