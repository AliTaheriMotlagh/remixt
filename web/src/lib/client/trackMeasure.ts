"use client";

// Measures a song for lib/trackAnalysis.ts from its beat: tempo, key, beat
// grid, loudness, busyness, energy and its shape over time. The beat
// carries the harmony and the drums more reliably than a voice. The split
// hands its beat over already at the analysis rate (see splitter.worker.ts);
// the decks and the planner have it decoded as an AudioBuffer.

import { ANALYSIS_RATE, analyzeMono, analyzeStem, beatPhase, refineTempo, type StemAnalysis } from "./analysis";
import { ANALYSIS_VERSION, CURVE_POINTS, energyScore, type TrackAnalysis } from "../trackAnalysis";

/** From a beat at ANALYSIS_RATE, mono (the splitter's). */
export async function measureBeatMono(mono: Float32Array, storedBpm: number | null, by: string): Promise<TrackAnalysis | null> {
  if (mono.length < ANALYSIS_RATE * 5) return null;
  return summarize(await analyzeMono(mono), mono.length / ANALYSIS_RATE, storedBpm, by);
}

/** From a decoded beat stem (cached per stem, as the Studio analyses it). */
export async function measureBeatBuffer(stemId: string, beat: AudioBuffer, storedBpm: number | null, by: string): Promise<TrackAnalysis | null> {
  if (beat.duration < 5) return null;
  return summarize(await analyzeStem(stemId, beat), beat.duration, storedBpm, by);
}

/** The numbers worth keeping from a full analysis. */
export function summarize(a: StemAnalysis, seconds: number, storedBpm: number | null, by: string): TrackAnalysis {
  let bpm: number | null = refineTempo(a, storedBpm ?? a.bpmEstimate ?? 120);
  if (!Number.isFinite(bpm) || bpm <= 0) bpm = null;
  else {
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    bpm = Math.round(bpm * 100) / 100;
  }
  const firstBeat = bpm ? (((beatPhase(a, 60 / bpm) % (60 / bpm)) + 60 / bpm) % (60 / bpm)) : null;
  const loudnessDb = a.loudness > 0 ? Math.max(-120, 20 * Math.log10(a.loudness)) : -120;
  const onsetsPerSecond = onsetRate(a.onsets, a.onsetRate);
  const { curve, intro, outro } = shape(a.energy, a.onsetRate, seconds);
  return {
    v: ANALYSIS_VERSION,
    bpm,
    key: `${a.key.tonic}:${a.key.mode}`,
    keyConfidence: Math.max(0, Math.min(1, a.keyConfidence)),
    firstBeat: firstBeat !== null && firstBeat <= seconds ? firstBeat : null,
    duration: seconds,
    loudnessDb,
    onsetsPerSecond,
    energy: energyScore({ loudnessDb, onsetsPerSecond, bpm }),
    introSeconds: intro,
    outroSeconds: outro,
    curve,
    by,
  };
}

/** Peaks in the onset strength that stand out (mean + one deviation), per second. */
function onsetRate(onsets: Float32Array, rate: number): number {
  if (onsets.length < 3 || rate <= 0) return 0;
  let sum = 0;
  let sq = 0;
  for (const x of onsets) {
    sum += x;
    sq += x * x;
  }
  const mean = sum / onsets.length;
  const line = mean + Math.sqrt(Math.max(0, sq / onsets.length - mean * mean));
  let peaks = 0;
  // At least ~70 ms between two (a 16th at 200 BPM), so one hit isn't counted twice.
  const gap = Math.max(1, Math.round(rate * 0.07));
  let last = -gap;
  for (let i = 1; i < onsets.length - 1; i++) {
    if (onsets[i] > line && onsets[i] >= onsets[i - 1] && onsets[i] >= onsets[i + 1] && i - last >= gap) {
      peaks++;
      last = i;
    }
  }
  return Math.min(100, peaks / (onsets.length / rate));
}

/** The energy envelope as CURVE_POINTS values (loudest = 1), and where it gets going and where it stops. */
function shape(energy: Float32Array, rate: number, seconds: number): { curve: number[]; intro: number; outro: number } {
  if (!energy.length || rate <= 0) return { curve: [], intro: 0, outro: 0 };
  const points = Math.min(CURVE_POINTS, energy.length);
  const per = energy.length / points;
  const raw: number[] = [];
  for (let p = 0; p < points; p++) {
    let s = 0;
    const from = Math.floor(p * per);
    const to = Math.max(from + 1, Math.floor((p + 1) * per));
    for (let i = from; i < to; i++) s += energy[i];
    // Power to amplitude, so a quiet passage still shows.
    raw.push(Math.sqrt(s / (to - from)));
  }
  const top = Math.max(...raw);
  const curve = raw.map((x) => (top > 0 ? x / top : 0));
  // Smoothed over ~1 s: where the beat is past a quarter of its loudest.
  const win = Math.max(1, Math.round(rate));
  const smooth = new Float32Array(energy.length);
  let acc = 0;
  for (let i = 0; i < energy.length; i++) {
    acc += Math.sqrt(energy[i]);
    if (i >= win) acc -= Math.sqrt(energy[i - win]);
    smooth[i] = acc / Math.min(i + 1, win);
  }
  const peak = Math.max(...smooth);
  const on = (i: number) => smooth[i] >= peak * 0.25;
  let first = 0;
  while (first < smooth.length && !on(first)) first++;
  let last = smooth.length - 1;
  while (last > 0 && !on(last)) last--;
  const intro = Math.min(seconds, Math.max(0, (first - win / 2) / rate));
  const outro = Math.min(seconds, Math.max(0, seconds - (last + 1) / rate));
  return { curve, intro, outro };
}
