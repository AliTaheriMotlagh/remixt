"use client";

import { useStudioHistory } from "./studioHistory";
import {
  DEFAULT_FX,
  PROJECT_DEFAULTS,
  useStudioStore,
  type ProjectSettings,
  type SourceRemix,
  type StudioLane,
} from "./studioStore";
import { projectToPayload } from "./remixLanes";

// Keeps the Studio's unsaved work in this browser, so a reload, a crash or
// a phone throwing the tab away in the background doesn't lose a mix.
// Only edits count: a remix that was just opened (or just saved) isn't
// "unsaved work", so it never overwrites a draft that is.

const KEY = "remixt:studio-draft:v1";
const SAVE_DELAY_MS = 800;

export type StudioDraft = {
  savedAt: number;
  lanes: StudioLane[];
  project: ProjectSettings;
  sourceRemix: SourceRemix | null;
  challenge?: SourceRemix | null;
};

let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function write() {
  timer = null;
  if (!dirty) return;
  const state = useStudioStore.getState();
  if (state.lanes.length === 0) {
    clearDraft();
    return;
  }
  const draft: StudioDraft = {
    savedAt: Date.now(),
    lanes: state.lanes.map((lane) => ({ ...lane, solo: false })),
    project: projectOf(state),
    sourceRemix: state.sourceRemix,
    challenge: state.challenge,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked (private mode) — autosave just doesn't happen.
  }
}

export function projectOf(state: ReturnType<typeof useStudioStore.getState>): ProjectSettings {
  return projectToPayload(state);
}

/** The saved draft, if there's unsaved work in this browser. */
export function readDraft(): StudioDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StudioDraft;
    if (!Array.isArray(draft.lanes) || draft.lanes.length === 0) return null;
    // Drafts saved before a setting existed get its default.
    return {
      ...draft,
      lanes: draft.lanes.map((lane) => ({
        ...lane,
        fx: { ...DEFAULT_FX, ...lane.fx },
        xfade: lane.xfade ?? null,
        automation: lane.automation ?? {},
      })),
      project: { ...PROJECT_DEFAULTS, ...draft.project },
    };
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
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
 * is open. Returns the function that stops it.
 */
export function startDraftAutosave(): () => void {
  const stopHistory = useStudioHistory.subscribe((history, previous) => {
    if (history.past.length !== previous.past.length || history.future.length !== previous.future.length) {
      dirty = true;
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
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, SAVE_DELAY_MS);
  });
  // Also write on the way out: a debounced save might still be pending.
  const flush = () => {
    if (document.visibilityState === "hidden" && timer) {
      clearTimeout(timer);
      write();
    }
  };
  document.addEventListener("visibilitychange", flush);
  return () => {
    stopHistory();
    stopStore();
    document.removeEventListener("visibilitychange", flush);
    if (timer) {
      clearTimeout(timer);
      write();
    }
  };
}
