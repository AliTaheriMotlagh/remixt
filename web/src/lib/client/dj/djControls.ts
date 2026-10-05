// The arithmetic behind the "real gear" controls: quantize, hot cues, loop
// halve/double, beat jumps, fader and tempo-fader curves, auto gain, the
// key-lock drift correction and the meters' peak hold. Pure, so it's tested
// without audio and shared by the engine and the UI.

import { beatSeconds, clamp } from "./djMath";
import { HOT_CUE_COUNT, TRIM_DB, type FaderCurve, type LoopState, type TrackInfo } from "./djTypes";

// ------------------------------------------------------------ beat grid

/** Beats from the grid's anchor to `pos` (fractional; negative before the first beat). */
export function beatIndex(track: TrackInfo, pos: number) {
  return (pos - track.firstBeat) / beatSeconds(track);
}

/** The grid line nearest `pos`. */
export function nearestBeat(track: TrackInfo, pos: number) {
  return track.firstBeat + Math.round(beatIndex(track, pos)) * beatSeconds(track);
}

/** Where `pos` sits between its beats, 0…1. */
export function beatFraction(track: TrackInfo, pos: number) {
  const b = beatIndex(track, pos);
  return b - Math.floor(b + 1e-9);
}

/** `pos`, snapped to the nearest beat when quantize is on. */
export function quantizePos(track: TrackInfo, pos: number, quantize: boolean) {
  return quantize ? clamp(nearestBeat(track, pos), 0, Math.max(0, track.duration - 0.05)) : pos;
}

/**
 * Where a quantized jump lands: at `target` plus however far the playhead
 * already is into its current beat, so the music carries on in time (this
 * is what quantized hot cues and jumps do on CDJs and in Rekordbox/Serato).
 * Without quantize, the jump lands exactly on `target`.
 */
export function quantizedJump(track: TrackInfo, from: number, target: number, quantize: boolean) {
  if (!quantize) return target;
  const snapped = nearestBeat(track, target);
  return snapped + beatFraction(track, from) * beatSeconds(track);
}

/** Bar number (1-based) and beat in the bar (1–4) at a position, for the deck display. */
export function barBeat(track: TrackInfo, pos: number) {
  const b = Math.floor(beatIndex(track, pos) + 1e-6);
  const bar = Math.floor(b / 4);
  return { bar: bar + 1, beat: b - bar * 4 + 1 };
}

// ------------------------------------------------------------- hot cues

export const HOT_CUE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
export const HOT_CUE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export const emptyHotCues = (): (number | null)[] => Array<number | null>(HOT_CUE_COUNT).fill(null);

/** What pressing hot cue pad `index` does: set it if empty, else jump to it. */
export function hotCueAction(cues: (number | null)[], index: number): "set" | "jump" | "none" {
  if (index < 0 || index >= HOT_CUE_COUNT) return "none";
  return cues[index] === null || cues[index] === undefined ? "set" : "jump";
}

/** A new list with pad `index` set to `pos` (or cleared, with null). */
export function withHotCue(cues: (number | null)[], index: number, pos: number | null) {
  const next = cues.slice(0, HOT_CUE_COUNT);
  while (next.length < HOT_CUE_COUNT) next.push(null);
  if (index >= 0 && index < HOT_CUE_COUNT) next[index] = pos;
  return next;
}

// ---------------------------------------------------------------- loops

export const MIN_LOOP_BEATS = 1 / 32;
export const MAX_LOOP_BEATS = 64;

/**
 * Halve (factor 0.5) or double (2) a loop, keeping its start, like the
 * loop ½× / 2× buttons. A manual loop (no beat count) is measured in beats
 * first. Returns null when the result would be out of range.
 */
export function resizeLoop(track: TrackInfo, loop: LoopState, factor: number): LoopState | null {
  if (!loop.active && loop.end <= loop.start) return null;
  const beat = beatSeconds(track);
  const beats = loop.beats ?? (loop.end - loop.start) / beat;
  const next = beats * factor;
  if (next < MIN_LOOP_BEATS - 1e-9 || next > MAX_LOOP_BEATS + 1e-9) return null;
  const end = Math.min(track.duration, loop.start + next * beat);
  if (end - loop.start < 0.01) return null;
  return { active: loop.active, start: loop.start, end, beats: loop.beats === null ? null : next };
}

export const JUMP_SIZES = [1, 2, 4, 8, 16, 32] as const;
export const LOOP_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

export function loopLabel(beats: number) {
  if (beats >= 1) return String(beats);
  return `1/${Math.round(1 / beats)}`;
}

// --------------------------------------------------------------- faders

/** Channel fader position (0…1) to gain. */
export function faderGain(v: number, curve: FaderCurve) {
  const x = clamp(v, 0, 1);
  switch (curve) {
    case "linear":
      return x;
    case "steep":
      // Most of the level arrives in the first third of the travel.
      return 1 - Math.pow(1 - x, 3);
    default:
      return Math.pow(x, 1.6);
  }
}

/** Tempo fader travel inside this fraction of the range snaps to 0 %: the centre detent. */
export const DETENT = 0.025;

/**
 * Tempo fader position (-1 top … +1 bottom, as on a CDJ: down is faster)
 * to a tempo change in %, with the centre click.
 */
export function faderToTempo(v: number, range: number) {
  const x = clamp(v, -1, 1);
  if (Math.abs(x) < DETENT) return 0;
  // Past the detent, the travel is rescaled so the ends still reach the range.
  const s = (Math.abs(x) - DETENT) / (1 - DETENT);
  return Math.sign(x) * s * range;
}

export function tempoToFader(pct: number, range: number) {
  if (range <= 0 || pct === 0) return 0;
  const s = clamp(Math.abs(pct) / range, 0, 1);
  return Math.sign(pct) * (DETENT + s * (1 - DETENT));
}

export function rangeLabel(range: number) {
  return range >= 100 ? "WIDE" : `±${range}%`;
}

// ------------------------------------------------------------ auto gain

/** The level auto gain aims every track at (RMS of the loud parts, dBFS). */
export const AUTO_GAIN_TARGET_DB = -16;

/** Auto gain for a track whose loud parts measure `loudnessDb`: up or down to the target, at most ±TRIM_DB. */
export function autoGainDb(loudnessDb: number | undefined | null) {
  if (loudnessDb === undefined || loudnessDb === null || !Number.isFinite(loudnessDb)) return 0;
  return Math.round(clamp(AUTO_GAIN_TARGET_DB - loudnessDb, -TRIM_DB, TRIM_DB) * 10) / 10;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);

// ------------------------------------------------------------- key lock

/**
 * Key-lock drift correction. The time-stretcher's output only follows the
 * deck's clock on average, so every block the engine compares where the
 * audio is with where the deck says it is and trims the stretch tempo a
 * little (at most ±2 %, which is inaudible) to close the gap over about
 * half a second. Returns the tempo multiplier, or null when the gap is so
 * big (a seek, a loop jump, a stall) that the stretcher should restart at
 * the right place instead.
 */
export function keyLockTrim(errorSec: number, resyncSec = 0.04): number | null {
  if (!Number.isFinite(errorSec) || Math.abs(errorSec) > resyncSec) return null;
  return 1 + clamp(errorSec / 0.5, -0.02, 0.02);
}

/** a − b for positions inside a loop that may have wrapped (the shorter way round). */
export function loopAwareDiff(a: number, b: number, loop: { active: boolean; start: number; end: number }) {
  const d = a - b;
  if (!loop.active) return d;
  const len = loop.end - loop.start;
  if (len <= 0.001) return d;
  if (a < loop.start - 0.05 || a > loop.end + 0.05 || b < loop.start - 0.05 || b > loop.end + 0.05) return d;
  const w = d - Math.round(d / len) * len;
  return w;
}

// ---------------------------------------------------------------- meters

export type MeterState = { level: number; hold: number; holdAge: number; clipAge: number };
export const newMeter = (): MeterState => ({ level: 0, hold: 0, holdAge: 0, clipAge: Infinity });

/** The clip LED lights at this sample peak (just under full scale). */
export const CLIP = 0.985;

/**
 * One frame of a VU meter: fast attack and an exponential fall (~300 ms),
 * a peak marker held for 1.5 s then falling, and a clip LED latched for
 * 1 s after any peak at full scale.
 */
export function stepMeter(m: MeterState, peak: number, dt: number): MeterState {
  const p = Math.max(0, peak);
  const level = p > m.level ? p : m.level * Math.exp(-dt / 0.3) + p * (1 - Math.exp(-dt / 0.3));
  let hold = m.hold;
  let holdAge = m.holdAge + dt;
  if (p >= hold) {
    hold = p;
    holdAge = 0;
  } else if (holdAge > 1.5) hold = Math.max(level, hold - dt * 0.6);
  const clipAge = p >= CLIP ? 0 : m.clipAge + dt;
  return { level, hold, holdAge, clipAge };
}

/** Linear peak to a 0…1 meter height on a dB scale (−48 dB … 0 dB). */
export function meterHeight(peak: number) {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return clamp((db + 48) / 48, 0, 1);
}

// ------------------------------------------------------------- display

/** m:ss.t */
export function fmtClock(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const tenth = Math.floor((rest - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}.${tenth}`;
}

/** The last stretch of a track, when the deck warns that it's about to run out. */
export const END_WARNING_SEC = 30;

export function nearEnd(track: TrackInfo | null, pos: number, looping: boolean) {
  return !!track && !looping && track.duration - pos <= END_WARNING_SEC && track.duration - pos > 0.05;
}
