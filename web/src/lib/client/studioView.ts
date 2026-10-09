"use client";

import { create } from "zustand";
import type { StemKind } from "@/lib/stemKinds";

// How this person is looking at the Studio — zoom, which panels are open,
// the touch "select" mode, a short notice after an edit. None of it is
// part of the mix: not saved, not undone, not shared with collaborators.

export type InspectorTab = "mix" | "tempo" | "fx" | "match" | "edit";

/**
 * Who the Studio is laid out for: "easy" — someone who's never made music
 * (big cards, one per line, the AI up front) — or "pro", a producer with
 * every tool of a DAW. Remembered per browser; null until they've picked.
 */
export type StudioMode = "easy" | "pro";

/** A producer's main view: the timeline, or the mixing console. */
export type ProView = "arrange" | "mixer";

/** A tab of the stem library: one kind of stem, or whole songs (every line of one). */
export type LibraryTab = StemKind | "songs";

/** A tab of the AI producer. */
export type AiTab = "sync" | "timing" | "drop" | "harmony" | "style" | "ask";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 48;

const MODE_KEY = "remixt.studioMode";
const PRO_VIEW_KEY = "remixt.proView";

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
  /** Easy or producer — null until picked (or before it's been read from this browser, see `modeKnown`). */
  mode: StudioMode | null;
  /** Whether the remembered mode has been read yet (only after the page has mounted). */
  modeKnown: boolean;
  setMode: (mode: StudioMode) => void;
  /** Reads the mode this browser picked last time (localStorage only exists after mount). */
  readMode: () => void;
  proView: ProView;
  setProView: (view: ProView) => void;
  aiOpen: boolean;
  setAiOpen: (open: boolean) => void;
  /** A tab the AI producer was asked to show (it follows it when it changes). */
  aiTab: { id: number; tab: AiTab } | null;
  /** Opens the AI producer, on `tab` when given. */
  openAi: (tab?: AiTab) => void;
  /** Below desktop width, how far the AI producer's sheet is pulled up. */
  aiSheet: "mini" | "half" | "full";
  setAiSheet: (sheet: "mini" | "half" | "full") => void;
  /** Bumped to bring up the stem library from anywhere (the Studio shows it: a sheet on phones). */
  libraryAsk: number;
  /** The tab the library was last asked to open on, if any. */
  libraryTab: LibraryTab | null;
  showLibrary: (tab?: LibraryTab) => void;
  /** Bumped to open the transport's save form from elsewhere (the Easy studio's last step). */
  saveAsk: number;
  askSave: () => void;
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

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: remembered for this visit only.
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

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
  mode: null,
  modeKnown: false,
  setMode: (mode) => {
    remember(MODE_KEY, mode);
    set({ mode, modeKnown: true });
  },
  readMode: () => {
    const mode = recall(MODE_KEY);
    const view = recall(PRO_VIEW_KEY);
    set({
      mode: mode === "easy" || mode === "pro" ? mode : null,
      modeKnown: true,
      proView: view === "mixer" ? "mixer" : "arrange",
    });
  },
  proView: "arrange",
  setProView: (proView) => {
    remember(PRO_VIEW_KEY, proView);
    set({ proView });
  },
  aiOpen: false,
  setAiOpen: (aiOpen) => set({ aiOpen }),
  aiTab: null,
  openAi: (tab) => set({ aiOpen: true, ...(tab ? { aiTab: { id: Date.now(), tab } } : {}) }),
  aiSheet: "half",
  setAiSheet: (aiSheet) => set({ aiSheet }),
  libraryAsk: 0,
  libraryTab: null,
  showLibrary: (tab) => set((s) => ({ libraryAsk: s.libraryAsk + 1, libraryTab: tab ?? s.libraryTab })),
  saveAsk: 0,
  askSave: () => set((s) => ({ saveAsk: s.saveAsk + 1 })),
  aiQuestion: null,
  askAi: (text) => set({ aiOpen: true, aiTab: { id: Date.now(), tab: "ask" }, aiQuestion: { id: Date.now(), text } }),
  splitLaneId: null,
  setSplitLane: (splitLaneId) => set({ splitLaneId }),
  notice: null,
  notify: (text, tone = "info") => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice: { id: Date.now(), text, tone } });
    noticeTimer = setTimeout(() => set({ notice: null }), tone === "error" ? 4000 : 2200);
  },
}));
