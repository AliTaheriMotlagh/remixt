// What the mixer, the co-pilot and the missions all want to know about the
// two decks at once, worked out once per snapshot.

import { camelotCode, type KeyFit } from "../musicKey";
import { bassClash, isAudible, keyRelation, onAirGain, phaseOffset, tempoDiffBpm, type KeyRelation } from "./djMath";
import type { DeckId, DjSnapshot } from "./djTypes";

export type Derived = {
  bothLoaded: boolean;
  bothPlaying: boolean;
  bothAudible: boolean;
  audible: Record<DeckId, boolean>;
  /** Deck A's tempo minus deck B's (BPM). */
  tempoDiff: number;
  /** B's beat position relative to A's, in ms (positive: B is ahead). */
  phaseMs: number;
  phaseBeats: number;
  key: KeyRelation | null;
  keyFit: KeyFit | null;
  bassClash: boolean;
  /** The deck you'd adjust: the quieter one (usually the one you're cueing). */
  adjust: DeckId;
};

export function derive(snap: DjSnapshot): Derived {
  const { A, B } = snap.decks;
  const audible = { A: isAudible(A, "A", snap.mix), B: isAudible(B, "B", snap.mix) };
  const bothLoaded = !!A.track && !!B.track;
  const phase = bothLoaded ? phaseOffset(A, B) : { ms: 0, beats: 0 };
  const key = bothLoaded ? keyRelation(A, B, camelotCode) : null;
  return {
    bothLoaded,
    bothPlaying: bothLoaded && A.playing && B.playing,
    bothAudible: audible.A && audible.B,
    audible,
    tempoDiff: bothLoaded ? tempoDiffBpm(A, B) : 0,
    phaseMs: phase.ms,
    phaseBeats: phase.beats,
    key,
    keyFit: key?.fit ?? null,
    bassClash: bassClash(snap),
    adjust: onAirGain(A, "A", snap.mix) < onAirGain(B, "B", snap.mix) ? "A" : "B",
  };
}
