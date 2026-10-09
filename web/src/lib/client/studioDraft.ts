"use client";

import { useAiTrial } from "./aiTrial";
import { exportHistory, packHistory, unpackHistory, useStudioHistory, type History, type PackedHistory } from "./studioHistory";
import {
  DEFAULT_FX,
  PROJECT_DEFAULTS,
  useStudioStore,
  type ProjectSettings,
  type SourceRemix,
  type StudioLane,
} from "./studioStore";
import { projectToPayload } from "./remixLanes";
import { workDelete, workGet, workPut } from "./workStore";

// Keeps the Studio's unsaved work on this device, so a reload, a crash or
// a phone throwing the tab away in the background doesn't lose a mix —
// nor its undo history: after a reload, ⌘Z still steps back through the
// edits made before it, and a mix that was cleared can be brought back.
// Only edits count: a remix that was just opened (or just saved) isn't
// "unsaved work", so it never overwrites a draft that is.
//
// Kept in IndexedDB (see workStore), with the history packed small; where
// there's no IndexedDB, the mix alone goes in localStorage as before.

const KEY = "remixt:studio-draft:v1";
const WORK_KEY = "studio-draft";
const SAVE_DELAY_MS = 800;

export type StudioDraft = {
  savedAt: number;
  lanes: StudioLane[];
  project: ProjectSettings;
  sourceRemix: SourceRemix | null;
  challenge?: SourceRemix | null;
  /** The undo and redo steps behind it (drafts kept on the device only). */
  history?: History;
};

type StoredDraft = Omit<StudioDraft, "history"> & { history?: PackedHistory };

let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Whether a set of undo steps holds a mix worth bringing back. */
function hasWork(history: { past: { lanes: unknown[] }[] } | undefined) {
  return !!history?.past.some((step) => step.lanes.length > 0);
}

/** The draft of the mix as it is now. While an AI idea is only being tried, the mix before it — the idea isn't the person's yet. */
export function draftNow(): StudioDraft {
  const state = useStudioStore.getState();
  const trial = useAiTrial.getState().trial;
  const lanes = trial?.baseline.lanes ?? state.lanes;
  return {
    savedAt: Date.now(),
    lanes: lanes.map((lane) => ({ ...lane, solo: false })),
    project: { ...projectOf(state), ...(trial ? { projectBpm: trial.baseline.projectBpm } : {}) },
    sourceRemix: state.sourceRemix,
    challenge: state.challenge,
    history: exportHistory(),
  };
}

function write() {
  timer = null;
  if (!dirty) return;
  const draft = draftNow();
  // Nothing in the mix and nothing to undo back to: there's no work to keep.
  if (draft.lanes.length === 0 && !hasWork(draft.history)) {
    clearDraft();
    return;
  }
  const stored: StoredDraft = { ...draft, history: draft.history ? packHistory(draft.history) : undefined };
  void workPut(WORK_KEY, stored).then((kept) => {
    if (kept) {
      // The device's store has it: an older copy in localStorage would only offer the wrong mix back.
      removeLocal();
      return;
    }
    if (draft.lanes.length === 0) return;
    try {
      const { history: _history, ...mixOnly } = draft;
      void _history;
      localStorage.setItem(KEY, JSON.stringify(mixOnly));
    } catch {
      // Storage full or blocked (private mode) — autosave just doesn't happen.
    }
  });
}

export function projectOf(state: ReturnType<typeof useStudioStore.getState>): ProjectSettings {
  return projectToPayload(state);
}

/** A draft as saved, made safe: settings added since get their defaults. */
export function normaliseDraft(draft: StudioDraft): StudioDraft | null {
  if (!Array.isArray(draft.lanes)) return null;
  if (draft.lanes.length === 0 && !hasWork(draft.history)) return null;
  const lane = (l: StudioLane): StudioLane => ({
    ...l,
    fx: { ...DEFAULT_FX, ...l.fx },
    xfade: l.xfade ?? null,
    automation: l.automation ?? {},
  });
  return {
    ...draft,
    lanes: draft.lanes.map(lane),
    project: { ...PROJECT_DEFAULTS, ...draft.project },
    history: draft.history && {
      past: draft.history.past.map((step) => ({ ...step, lanes: step.lanes.map(lane) })),
      future: draft.history.future.map((step) => ({ ...step, lanes: step.lanes.map(lane) })),
    },
  };
}

/** The saved draft, if there's unsaved work on this device. */
export async function readDraft(): Promise<StudioDraft | null> {
  try {
    const stored = await workGet<StoredDraft>(WORK_KEY);
    if (stored) {
      const draft = normaliseDraft({ ...stored, history: stored.history ? unpackHistory(stored.history) : undefined });
      if (draft) return draft;
    }
  } catch {
    // Unreadable: try the older copy.
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normaliseDraft(JSON.parse(raw) as StudioDraft) : null;
  } catch {
    return null;
  }
}

/**
 * How many lanes the draft brings back: its own, or — for a mix that was
 * cleared — the mix as it was before (what undo brings back).
 */
export function draftLaneCount(draft: StudioDraft) {
  if (draft.lanes.length) return draft.lanes.length;
  const before = [...(draft.history?.past ?? [])].reverse().find((step) => step.lanes.length);
  return before?.lanes.length ?? 0;
}

function removeLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

export function clearDraft() {
  removeLocal();
  void workDelete(WORK_KEY);
}

/** The mix now matches something saved (or just opened): nothing to keep. */
export function markDraftClean({ discard = false } = {}) {
  dirty = false;
  if (timer) clearTimeout(timer);
  timer = null;
  if (discard) clearDraft();
}

/** A restored draft is still unsaved work. */
export function markDraftDirty() {
  dirty = true;
}

/**
 * Saves every undoable edit (the same things undo tracks) while the Studio
 * is open, with the undo history. Returns the function that stops it.
 */
export function startDraftAutosave(): () => void {
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, SAVE_DELAY_MS);
  };
  const stopHistory = useStudioHistory.subscribe((history, previous) => {
    if (history.past !== previous.past || history.future !== previous.future) {
      dirty = true;
      // Undo and redo change the steps too: the history kept follows them.
      later();
    }
  });
  const stopStore = useStudioStore.subscribe((state, previous) => {
    if (
      state.lanes === previous.lanes &&
      state.projectBpm === previous.projectBpm &&
      state.masterVolume === previous.masterVolume &&
      state.loopEnabled === previous.loopEnabled &&
      state.loopStart === previous.loopStart &&
      state.loopEnd === previous.loopEnd &&
      state.markers === previous.markers &&
      state.crossfader === previous.crossfader &&
      state.pads === previous.pads &&
      state.master === previous.master
    ) {
      return;
    }
    later();
  });
  // Also write on the way out: a debounced save might still be pending.
  const flushNow = () => {
    if (!timer) return;
    clearTimeout(timer);
    write();
  };
  const flush = () => document.visibilityState === "hidden" && flushNow();
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", flushNow);
  return () => {
    stopHistory();
    stopStore();
    document.removeEventListener("visibilitychange", flush);
    window.removeEventListener("pagehide", flushNow);
    if (timer) {
      clearTimeout(timer);
      write();
    }
  };
}
