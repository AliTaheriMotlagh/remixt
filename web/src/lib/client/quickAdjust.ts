"use client";

import { leadOf } from "./aiIdeas";
import { startNewStep } from "./studioHistory";
import { beatLength, useStudioStore, type AutoPoint, type LaneFx, type LanePatch } from "./studioStore";

// The AI producer's Fine-tune row: the few adjustments that fix most of
// what's left after an idea, in plain words — the vocal a little early or
// late, louder or softer, higher or lower; the whole song faster or slower;
// more or less space. Each press is one undo step.

const store = () => useStudioStore.getState();

/** A lane and the vocal layers (doubles, octaves) that follow it. */
function withLayers(laneId: string) {
  return store().lanes.filter((l) => l.laneId === laneId || leadOf(l.laneId) === laneId);
}

/** Moves a lane (and its layers) earlier (negative) or later by a number of beats. */
export function nudge(laneId: string, beats: number) {
  startNewStep();
  store().moveLanes(
    withLayers(laneId).map((l) => l.laneId),
    beats * beatLength(store().projectBpm)
  );
}

/** A lane (and its layers with it) louder or softer, in dB. */
export function gain(laneId: string, db: number) {
  if (!store().lanes.some((l) => l.laneId === laneId)) return;
  startNewStep();
  const patches: Record<string, LanePatch> = {};
  for (const l of withLayers(laneId)) patches[l.laneId] = { volume: Math.round(Math.min(1.5, Math.max(0, l.volume * 10 ** (db / 20))) * 100) / 100 };
  store().applyLanePatches(patches);
}

/** A lane (and its layers, keeping their intervals) higher or lower, in semitones. */
export function transpose(laneId: string, semitones: number) {
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane) return;
  const next = Math.max(-12, Math.min(12, lane.pitchSemitones + semitones));
  const shift = next - lane.pitchSemitones;
  if (!shift) return;
  startNewStep();
  const patches: Record<string, LanePatch> = {};
  for (const l of withLayers(laneId)) patches[l.laneId] = { pitchSemitones: Math.max(-24, Math.min(24, l.pitchSemitones + shift)) };
  store().applyLanePatches(patches);
}

/**
 * The whole song faster (k > 1) or slower, everything together — speeds,
 * starts and automation all scaled, so the arrangement keeps its shape.
 */
export function changeSpeed(k: number) {
  const change = speedChange(k);
  if (!change) return;
  startNewStep();
  store().applyLanePatches(change.patches, change.projectBpm);
}

/** What changeSpeed changes, without changing it (null when a lane would go past 0.5–2× speed). */
export function speedChange(k: number): { patches: Record<string, LanePatch>; projectBpm: number } | null {
  const { lanes, projectBpm } = store();
  const patches: Record<string, LanePatch> = {};
  for (const lane of lanes) {
    const ratio = lane.tempoRatio * k;
    if (ratio < 0.5 || ratio > 2) return null;
    const automation = Object.fromEntries(
      Object.entries(lane.automation).map(([param, points]) => [param, (points as AutoPoint[] | undefined)?.map((p) => ({ ...p, t: p.t / k }))])
    );
    patches[lane.laneId] = { tempoRatio: ratio, offsetSeconds: lane.offsetSeconds / k, automation };
  }
  return { patches, projectBpm: Math.round(projectBpm * k * 10) / 10 };
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
