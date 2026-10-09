import { tempoFit } from "./matchFinder";
import { keyFit, type KeyFit, type MusicalKey } from "./musicKey";
import { effectiveKey, keyReference, type StudioLane } from "./studioStore";

// Is each line of the mix in step with the rest? Its speed against the
// project tempo (half and double time count as the same speed — a trap
// beat at 140 sits fine under a vocal at 70), and its key against the
// project key (the first beat's). Read straight from the lanes, for the
// Easy studio's cards and the AI producer's line-sync list. Pure.

/** A lane's tempo is in step when it's this close to the project's (about 1.2%). */
export const IN_STEP = 0.012;

export type LineStatus = {
  /** What it plays at now (its source tempo × its speed), if its tempo is known. */
  bpm: number | null;
  /** How far that is from the project tempo, as a ratio (1 = in step), half and double time allowed. */
  stretch: number | null;
  /** In step with the project tempo (true when its tempo isn't known: nothing to go by). */
  inStep: boolean;
  /** The key it sounds in now, after its pitch shift. */
  key: MusicalKey | null;
  /** How that sits with the project key (null when either isn't known, or it is the reference). */
  keyFit: KeyFit | null;
  /** Whether its key sits well (same notes, relative or a neighbour), or isn't known. */
  inKey: boolean;
};

/** What every line's key is weighed against. */
export type KeyRef = { key: MusicalKey | null; laneId: string | null; trackTitle?: string | null; pitch?: number };

/** The key everything is matched to: a beat's, else the melody's or bass's (see keyReference) — as the transport shows it. */
export function projectKey(lanes: StudioLane[]): KeyRef {
  const reference = keyReference(lanes);
  return { key: reference ? effectiveKey(reference) : null, laneId: reference?.laneId ?? null, trackTitle: reference?.trackTitle ?? null, pitch: reference?.pitchSemitones ?? 0 };
}

export function lineStatus(lane: StudioLane, projectBpm: number, reference: KeyRef): LineStatus {
  const bpm = lane.bpm ? lane.bpm * lane.tempoRatio : null;
  const fit = bpm ? tempoFit(projectBpm, bpm) : null;
  const stretch = fit ? fit.stretch : null;
  const key = effectiveKey(lane);
  // Drums carry no notes worth matching: their "key" says nothing. And the
  // lines of one recording are in tune with each other, whatever two key
  // readings of them say — as long as they're pitched the same.
  const sameRecording = !!reference.trackTitle && reference.trackTitle === lane.trackTitle && lane.pitchSemitones === (reference.pitch ?? 0);
  const fitOfKey = key && reference.key && reference.laneId !== lane.laneId && lane.kind !== "drums" && !sameRecording ? keyFit(key, reference.key) : null;
  return {
    bpm,
    stretch,
    inStep: stretch === null || Math.abs(Math.log(stretch)) < IN_STEP,
    key,
    keyFit: fitOfKey,
    inKey: !fitOfKey || fitOfKey === "same" || fitOfKey === "relative" || fitOfKey === "neighbour",
  };
}

/** Whether every line moves at one speed (and there are at least two to compare). */
export function allInStep(lanes: StudioLane[], projectBpm: number) {
  const reference = projectKey(lanes);
  return lanes.length > 1 && lanes.every((l) => lineStatus(l, projectBpm, reference).inStep);
}

/** "4% faster" / "same speed" — how far a line is from the project tempo, in words. */
export function stretchWords(stretch: number | null) {
  if (stretch === null) return "tempo unknown";
  const change = Math.abs(stretch - 1);
  if (change < IN_STEP) return "in step";
  return `${Math.round(change * 100)}% too ${stretch > 1 ? "slow" : "fast"}`;
}
