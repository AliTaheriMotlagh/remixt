"use client";

import { create } from "zustand";
import { useStudioStore } from "./studioStore";

// Undo/redo for the Studio: every edit to the mix — lanes and their
// settings, tempo, master level, loop — can be stepped back and forward.
// Playback state (playhead, playing) and view toggles (metronome, snap)
// aren't part of it.
//
// A slider drag or a clip drag changes the store dozens of times a
// second; edits closer together than GROUP_MS are one step, so a drag
// undoes in one go.

const GROUP_MS = 600;
const LIMIT = 100;

type Snapshot = Pick<
  ReturnType<typeof useStudioStore.getState>,
  | "lanes"
  | "duration"
  | "projectBpm"
  | "masterVolume"
  | "loopEnabled"
  | "loopStart"
  | "loopEnd"
  | "markers"
  | "crossfader"
  | "pads"
>;

function snapshot(state: Snapshot): Snapshot {
  const { lanes, duration, projectBpm, masterVolume, loopEnabled, loopStart, loopEnd, markers, crossfader, pads } =
    state;
  return { lanes, duration, projectBpm, masterVolume, loopEnabled, loopStart, loopEnd, markers, crossfader, pads };
}

function changed(a: Snapshot, b: Snapshot) {
  return (
    a.lanes !== b.lanes ||
    a.projectBpm !== b.projectBpm ||
    a.masterVolume !== b.masterVolume ||
    a.loopEnabled !== b.loopEnabled ||
    a.loopStart !== b.loopStart ||
    a.loopEnd !== b.loopEnd ||
    a.markers !== b.markers ||
    a.crossfader !== b.crossfader ||
    a.pads !== b.pads
  );
}

type History = { past: Snapshot[]; future: Snapshot[] };

export const useStudioHistory = create<History>(() => ({ past: [], future: [] }));

let restoring = false;
let lastEditAt = 0;

function restore(target: Snapshot) {
  restoring = true;
  try {
    useStudioStore.setState(target);
  } finally {
    restoring = false;
  }
  // The next edit after an undo/redo always starts a new step.
  lastEditAt = 0;
}

/** Gets the first say on undo/redo; true means it handled it (see aiTrial.ts). */
let intercept: ((action: "undo" | "redo") => boolean) | null = null;

export function interceptHistory(handler: typeof intercept) {
  intercept = handler;
}

export function undo() {
  if (intercept?.("undo")) return;
  const { past, future } = useStudioHistory.getState();
  const previous = past[past.length - 1];
  if (!previous) return;
  const current = snapshot(useStudioStore.getState());
  useStudioHistory.setState({ past: past.slice(0, -1), future: [...future, current] });
  restore(previous);
}

export function redo() {
  if (intercept?.("redo")) return;
  const { past, future } = useStudioHistory.getState();
  const next = future[future.length - 1];
  if (!next) return;
  const current = snapshot(useStudioStore.getState());
  useStudioHistory.setState({ past: [...past, current], future: future.slice(0, -1) });
  restore(next);
}

/**
 * Runs an automatic change (not the user's — e.g. a detected key) without
 * making it an undo step, and writes it into the saved steps too, so
 * undoing never takes it away again.
 */
export function withoutHistory(laneId: string, patch: Partial<Snapshot["lanes"][number]>, apply: () => void) {
  restoring = true;
  try {
    apply();
  } finally {
    restoring = false;
  }
  const withPatch = (snap: Snapshot) => ({
    ...snap,
    lanes: snap.lanes.map((lane) => (lane.laneId === laneId ? { ...lane, ...patch } : lane)),
  });
  const { past, future } = useStudioHistory.getState();
  useStudioHistory.setState({ past: past.map(withPatch), future: future.map(withPatch) });
}

/**
 * Applies a change that isn't this person's own edit — a collaborator's,
 * arriving over the network — without making it an undo step.
 */
export function withoutRecording(apply: () => void) {
  restoring = true;
  try {
    apply();
  } finally {
    restoring = false;
  }
}

/**
 * Records one undo step back to `before`, for a change that was made
 * without recording — an AI idea auditioned, then kept. With
 * `beforeLast`, it goes in before the step just recorded: the person
 * edited on top of the idea, so undo takes back their edit, then the idea.
 */
export function recordStep(before: Partial<Snapshot>, { beforeLast = false } = {}) {
  const { past } = useStudioHistory.getState();
  const last = past[past.length - 1];
  if (beforeLast && last) {
    useStudioHistory.setState({ past: [...past.slice(0, -1), { ...last, ...before }, last].slice(-LIMIT) });
    return;
  }
  const step = { ...snapshot(useStudioStore.getState()), ...before };
  useStudioHistory.setState({ past: [...past, step].slice(-LIMIT), future: [] });
  lastEditAt = 0;
}

/**
 * Makes the next edit a step of its own even if it comes hard on the heels
 * of the last one — a key press is one deliberate edit, not part of a drag.
 */
export function startNewStep() {
  lastEditAt = 0;
}

/** Forgets all history — when a different project is loaded. */
export function resetHistory() {
  useStudioHistory.setState({ past: [], future: [] });
  lastEditAt = 0;
}

if (typeof window !== "undefined") {
  useStudioStore.subscribe((state, prev) => {
    if (restoring || !changed(state, prev)) return;
    const now = Date.now();
    const grouped = now - lastEditAt < GROUP_MS;
    lastEditAt = now;
    const { past } = useStudioHistory.getState();
    // The first change of a step records what it changed from; the rest
    // of the drag folds into it.
    if (!grouped) {
      useStudioHistory.setState({ past: [...past, snapshot(prev)].slice(-LIMIT), future: [] });
    } else if (useStudioHistory.getState().future.length) {
      useStudioHistory.setState({ future: [] });
    }
  });
}
