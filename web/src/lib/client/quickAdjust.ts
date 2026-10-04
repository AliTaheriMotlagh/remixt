"use client";

import { startNewStep } from "./studioHistory";
import { beatLength, useStudioStore, type AutoPoint, type LaneFx, type LanePatch } from "./studioStore";

// The AI producer's Fine-tune row: the few adjustments that fix most of
// what's left after an idea, in plain words — the vocal a little early or
// late, louder or softer, higher or lower; the whole song faster or slower;
// more or less space. Each press is one undo step.

const store = () => useStudioStore.getState();

/** Moves a lane earlier (negative) or later by a number of beats. */
export function nudge(laneId: string, beats: number) {
  startNewStep();
  store().moveLanes([laneId], beats * beatLength(store().projectBpm));
}

/** A lane louder or softer, in dB. */
export function gain(laneId: string, db: number) {
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane) return;
  startNewStep();
  store().setVolume(laneId, Math.round(Math.min(1.5, Math.max(0, lane.volume * 10 ** (db / 20))) * 100) / 100);
}

/** A lane higher or lower, in semitones. */
export function transpose(laneId: string, semitones: number) {
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane) return;
  startNewStep();
  store().setPitchSemitones(laneId, Math.max(-12, Math.min(12, lane.pitchSemitones + semitones)));
}

/**
 * The whole song faster (k > 1) or slower, everything together — speeds,
 * starts and automation all scaled, so the arrangement keeps its shape.
 */
export function changeSpeed(k: number) {
  const { lanes, projectBpm } = store();
  const patches: Record<string, LanePatch> = {};
  for (const lane of lanes) {
    const ratio = lane.tempoRatio * k;
    if (ratio < 0.5 || ratio > 2) return;
    const automation = Object.fromEntries(
      Object.entries(lane.automation).map(([param, points]) => [param, (points as AutoPoint[] | undefined)?.map((p) => ({ ...p, t: p.t / k }))])
    );
    patches[lane.laneId] = { tempoRatio: ratio, offsetSeconds: lane.offsetSeconds / k, automation };
  }
  startNewStep();
  store().applyLanePatches(patches, Math.round(projectBpm * k * 10) / 10);
}

export type Space = "dry" | "room" | "hall";

const SPACES: Record<Space, Partial<LaneFx>> = {
  dry: { reverb: 0, delay: 0 },
  room: { reverb: 0.16, reverbSize: 1.6, delay: 0.08, delayDivision: "1/8", delayFeedback: 0.2 },
  hall: { reverb: 0.34, reverbSize: 3.4, delay: 0.2, delayDivision: "1/4.", delayFeedback: 0.4 },
};

/** How much room around a lane: none, a little, a lot. */
export function setSpace(laneId: string, space: Space) {
  startNewStep();
  store().setFx(laneId, SPACES[space]);
}

/** Which of the three spaces a lane is closest to. */
export function spaceOf(fx: LaneFx): Space {
  return fx.reverb < 0.06 ? "dry" : fx.reverb < 0.25 ? "room" : "hall";
}
