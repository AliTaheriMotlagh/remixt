"use client";

import { create } from "zustand";
import { nudgeLine, parseLyrics, retimeLine, serializeLyrics, type LyricLine, type SingStyle } from "@/lib/lyrics";

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
  /** Found in the lyrics library, brought in from a page or a file, written here, or by the AI. */
  source: "library" | "web" | "file" | "own" | "ai";
  updatedAt: number;
  /**
   * Found lyrics are timed to the original recording; once they've been
   * lined up with this beat (or kept as they are) the hint stays gone.
   */
  aligned?: boolean;
  /**
   * The song in the mix these are the words of (see mixSongs.songKey), so
   * they're put away when that song leaves the mix and opened again when it
   * comes back. Unset for words written here, which go with any beat.
   */
  song?: string;
  /** The mix's songs when found lyrics were picked for none of them in particular: they go with that mix. */
  mix?: string[];
};

const SHEETS_KEY = "remixt.lyrics.sheets";
const ACTIVE_KEY = "remixt.lyrics.active";
const PREFS_KEY = "remixt.lyrics.prefs";
const MAX_SHEETS = 60;
const MAX_UNDO = 30;

/** A take to draw over the song: being recorded (`level` read every frame) or recorded (`peaks`). */
export type TimelineTake = { start: number; level: () => number } | { start: number; peaks: number[]; duration: number };

/** What the lyrics half of the booth shows: the open sheet, its editor, choosing a sheet, or the AI. */
export type LyricsView = "sheet" | "edit" | "pick" | "ai";

export type LyricsPrefs = {
  style: SingStyle;
  fontSize: number;
  barsPerLine: number;
  /** Moving a line's time moves the lines after it too, so the rest stays in sync. */
  ripple: boolean;
  /** How close up the waveform under the lyrics is (see LyricsTimeline's zoom). */
  zoom: number;
};
const DEFAULT_PREFS: LyricsPrefs = { style: "rap", fontSize: 18, barsPerLine: 1, ripple: true, zoom: 1 };

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
  /**
   * The vocal booth (record + lyrics) is open — one panel for both, so
   * the words are always a tap away from the take.
   */
  boothOpen: boolean;
  /** Which half of the booth is shown. */
  boothTab: "record" | "lyrics";
  setBoothOpen: (open: boolean) => void;
  /** Opens the booth on a tab. */
  openBooth: (tab: "record" | "lyrics") => void;
  /** What the lyrics tab shows (see LyricsView). */
  view: LyricsView;
  setView: (view: LyricsView) => void;
  /** The booth open on its lyrics, showing `view` — e.g. "Change" from the recorder opens the picker. */
  openLyrics: (view: LyricsView) => void;
  /**
   * Where the take is: a take keeps going (and a recorded one waits to be
   * kept) with the booth closed or on its lyrics, so the launcher shows it.
   */
  take: "idle" | "recording" | "review";
  setTake: (take: "idle" | "recording" | "review") => void;
  /** The take being recorded or reviewed, for views beside the recorder to draw (the Vocalist stage). */
  liveTake: TimelineTake | null;
  setLiveTake: (take: TimelineTake | null) => void;
  load: () => void;
  select: (id: string | null) => void;
  /** A new sheet, opened. */
  create: (sheet: Pick<LyricSheet, "title" | "artist" | "text" | "source" | "aligned" | "song" | "mix">) => string;
  /** The open sheet's title or artist (or whether it's lined up with the beat). */
  rename: (patch: Partial<Pick<LyricSheet, "title" | "artist" | "aligned">>) => void;
  /** The open sheet's text as typed (no undo step for every key). */
  setText: (text: string) => void;
  /** Marks where typing starts, so Undo can go back to before it. */
  checkpoint: () => void;
  /** The open sheet's lines, changed by a tool — one undo step. */
  setLines: (lines: LyricLine[]) => void;
  undo: () => void;
  /** Marks the open sheet as lined up with the beat (see LyricSheet.aligned). */
  markAligned: () => void;
  /** Deletes a sheet; the last one deleted can be brought back with restore(). */
  remove: (id: string) => void;
  /** The sheet last deleted, and whether it was the open one — for Undo. */
  removed: { sheet: LyricSheet; wasActive: boolean } | null;
  restore: () => void;
  setPrefs: (prefs: Partial<LyricsPrefs>) => void;
  /** The line whose timing is being edited (its row opens its controls), if any. */
  selectedLine: number | null;
  /**
   * Where it was picked — the stage (karaoke or waveform) or the list of
   * lines — so its controls open there, and only there.
   */
  selectedWhere: "stage" | "list";
  selectLine: (index: number | null, where?: "stage" | "list") => void;
  /** Line `index` sung at `time` — the lines after it follow when ripple is on. One undo step. */
  retime: (index: number, time: number) => void;
  /** Line `index` moved by `delta` seconds (see retime). */
  nudge: (index: number, delta: number) => void;
  /** Line `index` untimed. */
  untime: (index: number) => void;
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
    boothOpen: false,
    boothTab: "record",
    setBoothOpen: (boothOpen) => set({ boothOpen }),
    openBooth: (boothTab) => set({ boothOpen: true, boothTab }),
    view: "sheet",
    setView: (view) => set({ view }),
    openLyrics: (view) => set({ boothOpen: true, boothTab: "lyrics", view }),
    take: "idle",
    setTake: (take) => set({ take }),
    liveTake: null,
    setLiveTake: (liveTake) => set({ liveTake }),
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
      set({ activeId: sheet?.id ?? null, lines: sheet ? parseLyrics(sheet.text) : [], past: [], selectedLine: null });
    },
    create: (sheet) => {
      const id = `lyr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const full: LyricSheet = { ...sheet, title: sheet.title.slice(0, 200) || "Untitled", artist: sheet.artist.slice(0, 200), id, updatedAt: Date.now() };
      // Newest first; the oldest go once there are too many.
      const sheets = [full, ...get().sheets].slice(0, MAX_SHEETS);
      persist(sheets, id);
      set({ sheets, activeId: id, lines: parseLyrics(full.text), past: [], selectedLine: null });
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
    markAligned: () => {
      const { sheets, activeId } = get();
      if (!sheets.some((s) => s.id === activeId && !s.aligned)) return;
      const next = sheets.map((s) => (s.id === activeId ? { ...s, aligned: true } : s));
      persist(next, activeId);
      set({ sheets: next });
    },
    removed: null,
    remove: (id) => {
      const sheet = get().sheets.find((s) => s.id === id);
      if (!sheet) return;
      const wasActive = get().activeId === id;
      const sheets = get().sheets.filter((s) => s.id !== id);
      const activeId = wasActive ? null : get().activeId;
      persist(sheets, activeId);
      set({ sheets, activeId, removed: { sheet, wasActive }, ...(wasActive ? { lines: [], past: [] } : {}) });
    },
    restore: () => {
      const { removed, sheets, activeId } = get();
      if (!removed) return;
      // Back where it was in the list (newest first), and open again if it was.
      const next = [...sheets, removed.sheet].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SHEETS);
      const active = removed.wasActive ? removed.sheet.id : activeId;
      persist(next, active);
      set({
        sheets: next,
        activeId: active,
        removed: null,
        ...(removed.wasActive ? { lines: parseLyrics(removed.sheet.text), past: [] } : {}),
      });
    },
    setPrefs: (prefs) => {
      const next = { ...get().prefs, ...prefs };
      write(PREFS_KEY, next);
      set({ prefs: next });
    },
    selectedLine: null,
    selectedWhere: "list",
    selectLine: (index, where) =>
      set((s) => ({ selectedLine: index !== null && index >= 0 && index < s.lines.length ? index : null, selectedWhere: where ?? s.selectedWhere })),
    retime: (index, time) => {
      const { lines, prefs } = get();
      commit(serializeLyrics(retimeLine(lines, index, time, { ripple: prefs.ripple })), true);
    },
    nudge: (index, delta) => {
      const { lines, prefs } = get();
      commit(serializeLyrics(nudgeLine(lines, index, delta, { ripple: prefs.ripple })), true);
    },
    untime: (index) => {
      const { lines } = get();
      if (lines[index]?.time === null) return;
      commit(serializeLyrics(lines.map((l, i) => (i === index ? { ...l, time: null } : l))), true);
    },
  };
});

/** The open sheet, if any. */
export function activeSheet(state: Pick<LyricsState, "sheets" | "activeId">) {
  return state.sheets.find((s) => s.id === state.activeId) ?? null;
}
