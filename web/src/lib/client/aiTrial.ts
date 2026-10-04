"use client";

import { create } from "zustand";
import { compatible, rebaseSession, recompileIdea, timingSignature, type Idea, type Session } from "./aiIdeas";
import { interceptHistory, recordStep, useStudioHistory, withoutRecording } from "./studioHistory";
import { useStudioStore, type StudioLane } from "./studioStore";

// Auditioning AI ideas the way a DAW auditions presets. The mix as it was
// before the first try is kept aside; every try starts again from it, so
// trying one idea and then another swaps them — it never piles the second
// on top of the first. A/B flips between the original and the idea; Keep
// makes it one undo step; Revert puts the original back. Ideas that touch
// different things (an arrangement, a mix, a filter build) can be on at
// once: each is worked out again on top of the ones before it, the
// arrangement first, so a filter opens where the vocal now comes in.
//
// None of the trying is recorded as undo steps. If the person edits the
// mix while an idea is on, the idea is kept (undo takes back their edit,
// then the idea); undo while trying just reverts.

type Mix = { lanes: StudioLane[]; duration: number; projectBpm: number };

export type Trial = {
  /** The mix before any idea was tried — every try starts from here. */
  baseline: Mix;
  /** The ideas on, in the order they were added. */
  ideas: Idea[];
  /** The mix with them on. */
  result: Mix;
  /** A/B: which one is in the mix right now. */
  showing: "idea" | "original";
};

export const useAiTrial = create<{ trial: Trial | null }>(() => ({ trial: null }));

let applying = false;

function currentMix(): Mix {
  const { lanes, duration, projectBpm } = useStudioStore.getState();
  return { lanes, duration, projectBpm };
}

/** Changes the mix as part of trying, not as an edit of the person's. */
function quietly(change: () => void) {
  applying = true;
  try {
    withoutRecording(change);
  } finally {
    applying = false;
  }
}

function setMix(mix: Mix) {
  quietly(() => useStudioStore.setState(mix));
}

/**
 * Arrangement and tempo first: the others are worked out on top of where
 * they put things. Ideas that swap the beat for its parts go last, so the
 * parts take on whatever the others did to the beat.
 */
function ordered(ideas: Idea[]) {
  const timing = (i: Idea) => i.aspects.includes("arrangement") || i.aspects.includes("tempo");
  const swaps = (i: Idea) => !!i.lanes;
  return [...ideas.filter(timing), ...ideas.filter((i) => !timing(i) && !swaps(i)), ...ideas.filter((i) => !timing(i) && swaps(i))];
}

/** Takes lanes out and puts new ones in, as an idea asks. */
function swapLanes(change: NonNullable<Idea["lanes"]>) {
  const { lanes } = useStudioStore.getState();
  const kept = lanes.filter((l) => !change.remove.includes(l.laneId));
  const added = change.add.filter((a) => !kept.some((l) => l.laneId === a.laneId));
  useStudioStore.setState({ lanes: [...kept, ...added] });
}

/** The baseline with `ideas` on; the ones that couldn't go on are left out. */
function build(session: Session, baseline: Mix, ideas: Idea[]): { result: Mix; on: Idea[] } {
  setMix(baseline);
  const on: Idea[] = [];
  const inSync = session.timing === timingSignature(baseline.lanes, baseline.projectBpm);
  for (const idea of ordered(ideas)) {
    const compiled = on.length === 0 && inSync ? idea : recompileIdea(idea, rebaseSession(session));
    if (!compiled) continue;
    quietly(() => {
      if (compiled.lanes) swapLanes(compiled.lanes);
      // Also works the duration out again for any lanes swapped in.
      useStudioStore.getState().applyLanePatches(compiled.patches, compiled.projectBpm);
    });
    on.push(idea);
  }
  return { result: currentMix(), on };
}

/**
 * Tries `idea` from the original mix — instead of whatever was on, or,
 * with `add`, on top of the ones on (only those it can't be combined with
 * go, and `replace`, the one it takes the place of). False if it couldn't
 * be applied to this mix.
 */
export function tryIdea(
  session: Session,
  idea: Idea,
  { add = false, replace }: { add?: boolean; replace?: string } = {}
): boolean {
  const { trial } = useAiTrial.getState();
  const baseline = trial?.baseline ?? currentMix();
  const ideas =
    add && trial ? [...trial.ideas.filter((i) => i.id !== idea.id && i.id !== replace && compatible(i, idea)), idea] : [idea];
  const { result, on } = build(session, baseline, ideas);
  if (!on.length) {
    setMix(baseline);
    useAiTrial.setState({ trial: null });
    return false;
  }
  useAiTrial.setState({ trial: { baseline, ideas: on, result, showing: "idea" } });
  return on.some((i) => i.id === idea.id);
}

/** Takes one idea off, keeping the rest on. */
export function removeFromTrial(session: Session, ideaId: string) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const rest = trial.ideas.filter((i) => i.id !== ideaId);
  if (!rest.length) return revertTrial();
  const { result, on } = build(session, trial.baseline, rest);
  useAiTrial.setState({ trial: { ...trial, ideas: on, result, showing: "idea" } });
}

/** A/B: the original or the idea in the mix (flips when not given). */
export function compare(showing?: Trial["showing"]) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const next = showing ?? (trial.showing === "idea" ? "original" : "idea");
  if (next === trial.showing) return;
  setMix(next === "idea" ? trial.result : trial.baseline);
  useAiTrial.setState({ trial: { ...trial, showing: next } });
}

/** Keeps what's being tried, as one undo step. */
export function keepTrial(): Idea[] {
  const { trial } = useAiTrial.getState();
  if (!trial) return [];
  if (trial.showing === "original") setMix(trial.result);
  recordStep(trial.baseline);
  useAiTrial.setState({ trial: null });
  return trial.ideas;
}

/** Puts the original mix back. */
export function revertTrial() {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  setMix(trial.baseline);
  useAiTrial.setState({ trial: null });
}

// Undo while trying means "not this": back to the original. Redo has
// nothing to redo until it's kept.
interceptHistory((action) => {
  if (!useAiTrial.getState().trial) return false;
  if (action === "undo") revertTrial();
  return true;
});

if (typeof window !== "undefined") {
  useStudioStore.subscribe((state, prev) => {
    const { trial } = useAiTrial.getState();
    if (!trial || applying) return;
    if (state.lanes === prev.lanes && state.projectBpm === prev.projectBpm) return;
    // The person edited the mix with the idea on: it's theirs now. (The
    // history has already recorded their edit; the idea goes in before it.)
    // A different project, or editing the original while comparing, lets it go.
    const { past } = useStudioHistory.getState();
    const justRecorded = past[past.length - 1]?.lanes === prev.lanes;
    if (trial.showing === "idea" && prev.lanes === trial.result.lanes && justRecorded) {
      recordStep(trial.baseline, { beforeLast: true });
    }
    useAiTrial.setState({ trial: null });
  });
}
