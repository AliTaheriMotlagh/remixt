"use client";

import { create } from "zustand";
import { parseLyrics, serializeLyrics, type LyricLine, type SingStyle } from "@/lib/lyrics";

// The lyric sheets someone sings from in the Studio: found in the lyrics
// library, pasted in, or written with the AI. Kept in this browser (they're
// the singer's own notes, not part of the mix), so they're there for every
// session; one sheet is open at a time. Changes to the timing can be taken
// back a step at a time.

export type LyricSheet = {
  id: string;
  title: string;
  artist: string;
  /** The sheet as LRC text: timed lines stamped, the rest plain. */
  text: string;
  source: "library" | "own" | "ai";
  updatedAt: number;
};

const SHEETS_KEY = "remixt.lyrics.sheets";
const ACTIVE_KEY = "remixt.lyrics.active";
const PREFS_KEY = "remixt.lyrics.prefs";
const MAX_SHEETS = 60;
const MAX_UNDO = 30;

export type LyricsPrefs = { style: SingStyle; fontSize: number; barsPerLine: number };
const DEFAULT_PREFS: LyricsPrefs = { style: "rap", fontSize: 18, barsPerLine: 1 };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: kept for this visit only.
  }
}

type LyricsState = {
  loaded: boolean;
  sheets: LyricSheet[];
  activeId: string | null;
  /** The open sheet, read into lines. */
  lines: LyricLine[];
  /** Earlier versions of the open sheet's text, for Undo. */
  past: string[];
  prefs: LyricsPrefs;
  /** The Studio's lyrics panel is open (the recorder can open it). */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  load: () => void;
  select: (id: string | null) => void;
  /** A new sheet, opened. */
  create: (sheet: Pick<LyricSheet, "title" | "artist" | "text" | "source">) => string;
  /** The open sheet's title or artist. */
  rename: (patch: Partial<Pick<LyricSheet, "title" | "artist">>) => void;
  /** The open sheet's text as typed (no undo step for every key). */
  setText: (text: string) => void;
  /** Marks where typing starts, so Undo can go back to before it. */
  checkpoint: () => void;
  /** The open sheet's lines, changed by a tool — one undo step. */
  setLines: (lines: LyricLine[]) => void;
  undo: () => void;
  remove: (id: string) => void;
  setPrefs: (prefs: Partial<LyricsPrefs>) => void;
};

function persist(sheets: LyricSheet[], activeId: string | null) {
  write(SHEETS_KEY, sheets);
  write(ACTIVE_KEY, activeId);
}

export const useLyrics = create<LyricsState>((set, get) => {
  /** The open sheet with its text replaced, saved. */
  function commit(text: string, undoable: boolean) {
    const { sheets, activeId, past } = get();
    const current = sheets.find((s) => s.id === activeId);
    if (!current || current.text === text) return;
    const next = sheets.map((s) => (s.id === activeId ? { ...s, text, updatedAt: Date.now() } : s));
    persist(next, activeId);
    set({ sheets: next, lines: parseLyrics(text), past: undoable ? [...past, current.text].slice(-MAX_UNDO) : past });
  }

  return {
    loaded: false,
    sheets: [],
    activeId: null,
    lines: [],
    past: [],
    prefs: DEFAULT_PREFS,
    panelOpen: false,
    setPanelOpen: (panelOpen) => set({ panelOpen }),
    load: () => {
      if (get().loaded) return;
      const stored = read<LyricSheet[]>(SHEETS_KEY, []);
      const sheets = Array.isArray(stored) ? stored.filter((s) => s && typeof s.id === "string" && typeof s.text === "string") : [];
      const wanted = read<string | null>(ACTIVE_KEY, null);
      const active = sheets.find((s) => s.id === wanted) ?? null;
      set({
        loaded: true,
        sheets,
        activeId: active?.id ?? null,
        lines: active ? parseLyrics(active.text) : [],
        prefs: { ...DEFAULT_PREFS, ...read<Partial<LyricsPrefs>>(PREFS_KEY, {}) },
      });
    },
    select: (id) => {
      const sheet = get().sheets.find((s) => s.id === id) ?? null;
      write(ACTIVE_KEY, sheet?.id ?? null);
      set({ activeId: sheet?.id ?? null, lines: sheet ? parseLyrics(sheet.text) : [], past: [] });
    },
    create: (sheet) => {
      const id = `lyr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const full: LyricSheet = { ...sheet, title: sheet.title.slice(0, 200) || "Untitled", artist: sheet.artist.slice(0, 200), id, updatedAt: Date.now() };
      // Newest first; the oldest go once there are too many.
      const sheets = [full, ...get().sheets].slice(0, MAX_SHEETS);
      persist(sheets, id);
      set({ sheets, activeId: id, lines: parseLyrics(full.text), past: [] });
      return id;
    },
    rename: (patch) => {
      const { sheets, activeId } = get();
      const next = sheets.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s));
      persist(next, activeId);
      set({ sheets: next });
    },
    setText: (text) => commit(text, false),
    checkpoint: () => {
      const { past } = get();
      const current = activeSheet(get());
      if (current && past[past.length - 1] !== current.text) set({ past: [...past, current.text].slice(-MAX_UNDO) });
    },
    setLines: (lines) => commit(serializeLyrics(lines), true),
    undo: () => {
      const { past, sheets, activeId } = get();
      const previous = past[past.length - 1];
      if (previous === undefined) return;
      const next = sheets.map((s) => (s.id === activeId ? { ...s, text: previous, updatedAt: Date.now() } : s));
      persist(next, activeId);
      set({ sheets: next, lines: parseLyrics(previous), past: past.slice(0, -1) });
    },
    remove: (id) => {
      const sheets = get().sheets.filter((s) => s.id !== id);
      const activeId = get().activeId === id ? null : get().activeId;
      persist(sheets, activeId);
      set({ sheets, activeId, ...(activeId ? {} : { lines: [], past: [] }) });
    },
    setPrefs: (prefs) => {
      const next = { ...get().prefs, ...prefs };
      write(PREFS_KEY, next);
      set({ prefs: next });
    },
  };
});

/** The open sheet, if any. */
export function activeSheet(state: Pick<LyricsState, "sheets" | "activeId">) {
  return state.sheets.find((s) => s.id === state.activeId) ?? null;
}
