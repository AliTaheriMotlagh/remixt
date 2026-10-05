// The DJ simulator's arithmetic, with no Web Audio in sight: crossfader
// curves, tempo and beat-phase differences between decks, effective keys,
// EQ-swap detection. Everything takes plain DeckState / DjSnapshot data.

import { keyFit, transposeKey, type KeyFit, type MusicalKey } from "../musicKey";
import { KILL_DB, otherDeck, type Curve, type DeckId, type DeckState, type DjSnapshot, type MixState, type TrackInfo } from "./djTypes";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapHalf = (v: number) => v - Math.floor(v + 0.5); // → [-0.5, 0.5)

/** How much a deck is heard through the crossfader (A is the left side). */
export function xfadeGains(x: number, curve: Curve): Record<DeckId, number> {
  const p = clamp((x + 1) / 2, 0, 1);
  switch (curve) {
    case "linear":
      return { A: 1 - p, B: p };
    case "cut":
      // Both full until the very edges, like a scratch fader.
      return { A: clamp((1 - p) * 12, 0, 1), B: clamp(p * 12, 0, 1) };
    default:
      return { A: Math.cos((p * Math.PI) / 2), B: Math.sin((p * Math.PI) / 2) };
  }
}

/** Loudness a deck contributes to the master: channel fader times crossfader. */
export function onAirGain(deck: DeckState, id: DeckId, mix: MixState) {
  return deck.volume * xfadeGains(mix.crossfader, mix.curve)[id];
}

export function stemsAlive(deck: DeckState) {
  return (Object.keys(deck.stems) as (keyof DeckState["stems"])[]).filter((s) => !deck.stems[s]);
}

/** Is this deck actually making sound that the crowd hears? */
export function isAudible(deck: DeckState, id: DeckId, mix: MixState) {
  return !!deck.track && deck.playing && onAirGain(deck, id, mix) >= 0.18 && stemsAlive(deck).length > 0 && !(deck.kill.low && deck.kill.mid && deck.kill.high);
}

export function effBpm(deck: DeckState) {
  return deck.track ? deck.track.bpm * deck.rate : 0;
}

export function beatSeconds(track: TrackInfo) {
  return 60 / track.bpm;
}

/** Beats since the first beat of the track (source time). */
export function beatsAt(deck: DeckState) {
  return deck.track ? (deck.position - deck.track.firstBeat) / beatSeconds(deck.track) : 0;
}

/** 1, 2 or 0.5: how many of b's beats make one of a's, so 70 and 140 BPM count as a match. */
export function tempoEquivalence(bpmA: number, bpmB: number) {
  if (bpmA <= 0 || bpmB <= 0) return 1;
  return Math.pow(2, clamp(Math.round(Math.log2(bpmB / bpmA)), -1, 1));
}

/** Deck A's tempo minus deck B's (BPM), counting half/double time as equal. Positive: A is faster. */
export function tempoDiffBpm(a: DeckState, b: DeckState) {
  const ea = effBpm(a);
  const eb = effBpm(b);
  if (ea <= 0 || eb <= 0) return 0;
  return ea - eb / tempoEquivalence(ea, eb);
}

export type PhaseOffset = {
  /** B's beat position minus A's, in beats of A, wrapped to ±0.5. Positive: B is ahead (its beats land early). */
  beats: number;
  ms: number;
};

export function phaseOffset(a: DeckState, b: DeckState): PhaseOffset {
  const ea = effBpm(a);
  const eb = effBpm(b);
  if (!a.track || !b.track || ea <= 0 || eb <= 0) return { beats: 0, ms: 0 };
  const g = tempoEquivalence(ea, eb);
  const beats = wrapHalf(beatsAt(b) / g - beatsAt(a));
  return { beats, ms: beats * (60 / ea) * 1000 };
}

/**
 * Source-seconds to move `deck` so that its beats land with `other`'s.
 * Used by SYNC and by the scenario setup.
 */
export function alignShiftSeconds(deck: DeckState, other: DeckState, deckId: DeckId) {
  const offset = deckId === "B" ? phaseOffset(other, deck) : phaseOffset(deck, other);
  // `offset.ms` is B relative to A; if `deck` is A it's behind by that much.
  const realMs = deckId === "B" ? -offset.ms : offset.ms;
  return (realMs / 1000) * deck.rate;
}

/** The pitch change a tempo fader causes, in semitones (vinyl-style playback: no key lock). */
export function pitchShiftSemitones(rate: number) {
  return 12 * Math.log2(rate);
}

export function effectiveKey(deck: DeckState): { key: MusicalKey; cents: number } | null {
  if (!deck.track) return null;
  const s = pitchShiftSemitones(deck.rate);
  // A shift under three-quarters of a semitone is a detune, not a new key.
  const whole = Math.sign(s) * Math.floor(Math.abs(s) + 0.25);
  return { key: transposeKey(deck.track.key, whole), cents: Math.round((s - whole) * 100) };
}

export type KeyRelation = { fit: KeyFit; detuneCents: number; camelotA: string; camelotB: string };

export function keyRelation(a: DeckState, b: DeckState, camelot: (k: MusicalKey) => string): KeyRelation | null {
  const ka = effectiveKey(a);
  const kb = effectiveKey(b);
  if (!ka || !kb) return null;
  return { fit: keyFit(ka.key, kb.key), detuneCents: Math.abs(ka.cents - kb.cents), camelotA: camelot(ka.key), camelotB: camelot(kb.key) };
}

/** Bass level a deck is letting through, in dB: kill = silent. */
export function lowDb(deck: DeckState) {
  if (deck.kill.low) return KILL_DB;
  return deck.eq.low;
}

/** Does this deck have its bass (kick, bass line) going out, loud? */
export function bassOpen(deck: DeckState, id: DeckId, mix: MixState) {
  return isAudible(deck, id, mix) && lowDb(deck) > -9 && !(deck.stems.bass && deck.stems.drums);
}

/** Both decks' bass going out at once: the classic muddy clash. */
export function bassClash(snap: DjSnapshot) {
  return bassOpen(snap.decks.A, "A", snap.mix) && bassOpen(snap.decks.B, "B", snap.mix);
}

export type EqSample = { t: number; low: Record<DeckId, number> };

/**
 * An EQ swap: within `windowSec`, the outgoing deck's low EQ comes down by
 * at least `minMove` dB while the incoming deck's comes up by as much, and
 * the end state is "out is cut, in is open".
 */
export function detectEqSwap(
  history: EqSample[],
  now: number,
  out: DeckId,
  windowSec: number,
  minMove = 14
): boolean {
  const inn = otherDeck(out);
  const recent = history.filter((s) => s.t >= now - windowSec - 1e-6);
  if (recent.length < 2) return false;
  const last = recent[recent.length - 1];
  const outMax = Math.max(...recent.map((s) => s.low[out]));
  const inMin = Math.min(...recent.map((s) => s.low[inn]));
  return outMax - last.low[out] >= minMove && last.low[inn] - inMin >= minMove && last.low[out] <= -12 && last.low[inn] >= -6;
}

/** The section energy (0..1) at a position in a track. */
export function energyAt(track: TrackInfo, position: number) {
  const bar = Math.floor(position / ((60 / track.bpm) * 4));
  const section = track.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars) ?? track.sections[track.sections.length - 1];
  return section ? section.energy : 0.5;
}

/** The nearest beat boundary at or before `position`, snapped to a grid of `beats` beats. */
export function floorToGrid(track: TrackInfo, position: number, beats: number) {
  const step = beatSeconds(track) * beats;
  return Math.floor((position - track.firstBeat + 1e-6) / step) * step + track.firstBeat;
}

/** Tempo you'd need for `deck` to match `target` BPM, reading half/double, as a rate. */
export function rateToMatch(deckBpm: number, targetBpm: number) {
  const reading = [deckBpm, deckBpm * 2, deckBpm / 2].reduce((best, r) =>
    Math.abs(Math.log(targetBpm / r)) < Math.abs(Math.log(targetBpm / best)) ? r : best
  );
  return targetBpm / reading;
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Where to put deck B so that, with deck A where it is, B's beats land
 * `offsetMs` early (negative: late). `startPos` is B's nominal position
 * (e.g. a bar line); the result is within a beat of it.
 */
export function alignedPosition(a: DeckState, b: DeckState, startPos: number, offsetMs: number) {
  const probe: DeckState = { ...b, position: startPos };
  const current = phaseOffset(a, probe).ms;
  const ea = effBpm(a);
  const eb = effBpm(b);
  if (!a.track || !b.track || ea <= 0 || eb <= 0) return startPos;
  const g = tempoEquivalence(ea, eb);
  const deltaBeatsA = (offsetMs - current) / ((60 / ea) * 1000);
  return startPos + deltaBeatsA * g * beatSeconds(b.track);
}
