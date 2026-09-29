"use client";

import type { MusicalKey } from "./musicKey";

// Client-side audio analysis for the Studio's key detection and auto-match.
// Everything runs on the decoded stem the audio engine already holds, so
// it works for every track in the library without re-processing uploads.
// Results are cached per stem: they only depend on the audio itself.

/** Analysis rate: plenty for key and rhythm, and a quarter of the work. */
const RATE = 11025;
/** Envelope block size — ~11.6 ms, the precision beat alignment gets. */
const BLOCK = 128;
const FFT_SIZE = 4096;
const FFT_HOP = 2048;

export type StemAnalysis = {
  key: MusicalKey;
  /** 0..1 — how clearly the best key beat the runner-up. */
  keyConfidence: number;
  /** Onset strength per block, for locating the beat. */
  onsets: Float32Array;
  /** Onsets of the low end only (below ~150 Hz) — where the kick drum is. */
  lowOnsets: Float32Array;
  /** Mean power per block. */
  energy: Float32Array;
  /** Blocks per second of `onsets`, `lowOnsets` and `energy`. */
  onsetRate: number;
  /** Seconds into the stem where it first gets going (a vocal's entry). */
  entry: number;
  /** RMS of the non-silent parts, linear. */
  loudness: number;
  /** Tempo estimated from the onsets — a fallback when no BPM is stored. */
  bpmEstimate: number | null;
  /**
   * Pitch-class profile over time: 12 values per frame, each frame summing
   * to 1 (all zero where it's silent). Says which parts of a song share
   * their notes — a chorus that comes back, say.
   */
  chroma: Float32Array;
  /** Frames per second of `chroma`. */
  chromaRate: number;
};

const cache = new Map<string, Promise<StemAnalysis>>();

export function analyzeStem(stemId: string, buffer: AudioBuffer): Promise<StemAnalysis> {
  const cached = cache.get(stemId);
  if (cached) return cached;
  const promise = runAnalysis(buffer);
  cache.set(stemId, promise);
  promise.catch(() => cache.delete(stemId));
  return promise;
}

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

async function runAnalysis(buffer: AudioBuffer): Promise<StemAnalysis> {
  const mono = await downmix(buffer);
  const { energy, onsets } = envelopes(mono);
  const lowOnsets = envelopes(lowPass(mono)).onsets;
  const { key, confidence, frames } = await detectKey(mono);
  const onsetRate = RATE / BLOCK;
  return {
    key,
    keyConfidence: confidence,
    onsets,
    lowOnsets,
    energy,
    onsetRate,
    entry: findEntry(energy) / onsetRate,
    loudness: activeLoudness(energy),
    bpmEstimate: estimateBpm(onsets, onsetRate),
    chroma: frames,
    chromaRate: RATE / FFT_HOP,
  };
}

/** Mono at RATE via an offline context, which resamples properly. */
async function downmix(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * RATE));
  const ctx = new OfflineAudioContext(1, length, RATE);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

// --- Envelopes ---------------------------------------------------------------

function envelopes(mono: Float32Array) {
  const blocks = Math.floor(mono.length / BLOCK);
  const energy = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    for (let i = b * BLOCK, end = i + BLOCK; i < end; i++) sum += mono[i] * mono[i];
    energy[b] = sum / BLOCK;
  }

  // Onset strength: the rise in log energy, half-wave rectified. Cheap, and
  // for drums (the beat stem) it lands squarely on the hits.
  const onsets = new Float32Array(blocks);
  let previous = Math.log10(energy[0] + 1e-9);
  for (let b = 1; b < blocks; b++) {
    const current = Math.log10(energy[b] + 1e-9);
    onsets[b] = Math.max(0, current - previous);
    previous = current;
  }
  return { energy, onsets };
}

/** Two one-pole low-passes at ~150 Hz: keeps the kick and bass, drops the rest. */
function lowPass(mono: Float32Array) {
  const a = 1 - Math.exp((-2 * Math.PI * 150) / RATE);
  const out = new Float32Array(mono.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < mono.length; i++) {
    y1 += a * (mono[i] - y1);
    y2 += a * (y1 - y2);
    out[i] = y2;
  }
  return out;
}

function percentile(values: Float32Array, p: number) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

/** First block where the stem is clearly sounding, ignoring stem bleed. */
function findEntry(energy: Float32Array) {
  const threshold = percentile(energy, 0.95) * 0.04; // ~-14 dB below loud parts
  // Require a few loud blocks in a row so a stray click isn't the "entry".
  let run = 0;
  for (let b = 0; b < energy.length; b++) {
    run = energy[b] > threshold ? run + 1 : 0;
    if (run >= 4) return b - 3;
  }
  return 0;
}

function activeLoudness(energy: Float32Array) {
  const floor = percentile(energy, 0.95) * 0.01; // -20 dB: counts as silence
  let sum = 0;
  let count = 0;
  for (const e of energy) {
    if (e > floor) {
      sum += e;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

// --- Rhythm ------------------------------------------------------------------

function onsetAt(onsets: Float32Array, index: number) {
  // A little spread either side tolerates timing jitter between hits.
  const i = Math.round(index);
  return (onsets[i] ?? 0) + 0.5 * ((onsets[i - 1] ?? 0) + (onsets[i + 1] ?? 0));
}

/**
 * Where the beat falls within one period: tries every offset in [0, period)
 * and keeps the one whose grid collects the most onset energy.
 * Returns seconds from the start of the stem.
 */
export function beatPhase(analysis: StemAnalysis, periodSeconds: number) {
  const { onsets, onsetRate } = analysis;
  const period = periodSeconds * onsetRate;
  if (!(period > 1)) return 0;
  let best = -1;
  let bestPhase = 0;
  for (let phase = 0; phase < period; phase++) {
    let score = 0;
    for (let t = phase; t < onsets.length; t += period) score += onsetAt(onsets, t);
    if (score > best) {
      best = score;
      bestPhase = phase;
    }
  }
  return bestPhase / onsetRate;
}

/**
 * Every beat of the stem, in seconds, following the hits the music really
 * has rather than an ideal grid — so a live recording's drift, or a BPM
 * that's a fraction off, doesn't pull things apart over a whole song.
 * Dynamic programming over the onset envelope (Ellis, 2007): each beat is
 * worth its onset strength, and each gap costs more the further it strays
 * from one period. `tightness` sets how strongly the spacing is held; the
 * beat keeps its tempo straight through silences either way.
 */
export function trackBeats(analysis: StemAnalysis, bpm: number, tightness = 100): Float64Array {
  const { onsets, onsetRate } = analysis;
  const period = (60 / bpm) * onsetRate;
  const n = onsets.length;
  if (!(period > 4) || n < period * 4) return new Float64Array(0);

  let sum = 0;
  let sumSq = 0;
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    local[i] = onsetAt(onsets, i);
    sum += local[i];
    sumSq += local[i] * local[i];
  }
  const std = Math.sqrt(Math.max(1e-12, sumSq / n - (sum / n) ** 2));
  for (let i = 0; i < n; i++) local[i] /= std;

  const minGap = Math.max(1, Math.round(period / 2));
  const maxGap = Math.round(period * 2);
  const penalty = new Float64Array(maxGap + 1);
  for (let gap = minGap; gap <= maxGap; gap++) penalty[gap] = tightness * Math.log(gap / period) ** 2;

  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let best = -Infinity;
    let from = -1;
    for (let gap = minGap; gap <= maxGap && gap <= t; gap++) {
      const candidate = score[t - gap] - penalty[gap];
      if (candidate > best) {
        best = candidate;
        from = t - gap;
      }
    }
    // Starting fresh beats a predecessor that's only a burden.
    if (from >= 0 && best > 0) {
      score[t] = local[t] + best;
      back[t] = from;
    } else {
      score[t] = local[t];
    }
  }

  let last = n - 1;
  for (let t = Math.max(0, n - Math.ceil(period)); t < n; t++) if (score[t] > score[last]) last = t;
  const found: number[] = [];
  for (let t = last; t >= 0; t = back[t]) found.push(t / onsetRate);
  found.reverse();

  // Each beat lands on a whole block, so on its own it wobbles by tens of
  // milliseconds. Averaging it with its neighbours (for a symmetric
  // window, the same as a local straight-line fit) evens that out and
  // still follows a tempo that drifts over the song.
  const beats = found.map((_, i) => {
    const k = Math.min(4, i, found.length - 1 - i);
    let s = 0;
    for (let j = i - k; j <= i + k; j++) s += found[j];
    return s / (2 * k + 1);
  });

  // Carry the grid on to both ends of the stem at the same tempo, so every
  // moment of it has a beat position.
  const step = 60 / bpm;
  const duration = n / onsetRate;
  while (beats.length && beats[0] - step >= 0) beats.unshift(beats[0] - step);
  while (beats.length && beats[beats.length - 1] + step <= duration) beats.push(beats[beats.length - 1] + step);
  return Float64Array.from(beats);
}

export type Phrase = { start: number; end: number };

/**
 * The stretches where a vocal is actually singing, in seconds — the gaps
 * between them are breaths, rests and instrumental breaks. Hysteresis
 * (loud to start, quieter to stop) keeps a phrase from breaking up on
 * every soft syllable, and the floor sits above the faint bleed of the
 * original song that a separated vocal carries between lines.
 */
export function findPhrases(analysis: StemAnalysis): Phrase[] {
  const { energy, onsetRate } = analysis;
  const n = energy.length;
  const smooth = new Float32Array(n);
  const radius = 3;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      s += energy[j];
      count++;
    }
    smooth[i] = s / count;
  }

  const loud = percentile(smooth, 0.95);
  if (!(loud > 0)) return [];
  const on = loud * 0.02; // -17 dB
  const off = loud * 0.006; // -22 dB
  const raw: [number, number][] = [];
  let startedAt = -1;
  for (let i = 0; i < n; i++) {
    if (startedAt < 0 && smooth[i] > on) startedAt = i;
    else if (startedAt >= 0 && smooth[i] < off) {
      raw.push([startedAt, i]);
      startedAt = -1;
    }
  }
  if (startedAt >= 0) raw.push([startedAt, n]);

  // Breaths shorter than this stay inside the phrase.
  const minGap = 0.3 * onsetRate;
  const merged: [number, number][] = [];
  for (const segment of raw) {
    const previous = merged[merged.length - 1];
    if (previous && segment[0] - previous[1] < minGap) previous[1] = segment[1];
    else merged.push([...segment]);
  }

  const minLength = 0.12 * onsetRate;
  return merged
    .filter(([a, b]) => b - a >= minLength)
    .map(([a, b]) => ({ start: a / onsetRate, end: b / onsetRate }));
}

function autocorrelation(onsets: Float32Array, lag: number) {
  let sum = 0;
  for (let i = 0; i + lag < onsets.length; i++) sum += onsets[i] * onsets[i + lag];
  return sum;
}

/** Peak position near `lag`, interpolated between blocks. */
function refinePeak(onsets: Float32Array, lag: number, radius: number) {
  let best = lag;
  let bestScore = -Infinity;
  for (let l = Math.max(1, lag - radius); l <= lag + radius; l++) {
    const score = autocorrelation(onsets, l);
    if (score > bestScore) {
      bestScore = score;
      best = l;
    }
  }
  const a = autocorrelation(onsets, best - 1);
  const c = autocorrelation(onsets, best + 1);
  const denominator = a - 2 * bestScore + c;
  return denominator !== 0 ? best + (0.5 * (a - c)) / denominator : best;
}

/** Autocorrelation tempo in 70–180 BPM. */
function estimateBpm(onsets: Float32Array, onsetRate: number): number | null {
  const minLag = Math.floor((60 / 180) * onsetRate);
  const maxLag = Math.ceil((60 / 70) * onsetRate);
  if (onsets.length < maxLag * 4) return null;
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const sum = autocorrelation(onsets, lag);
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return null;
  // One beat is only ~40 blocks long, so a one-block error is ~2.5% of
  // the tempo. Measuring the peak four beats out and dividing by four
  // gets four times the precision.
  const beats = onsets.length > bestLag * 12 ? 4 : 1;
  const refined = refinePeak(onsets, bestLag * beats, beats) / beats;
  return Math.round((60 * onsetRate * 10) / refined) / 10;
}

/** How much onset energy a strict grid at `bpm` collects, at its best phase. */
function gridScore(onsets: Float32Array, onsetRate: number, bpm: number) {
  const period = (60 / bpm) * onsetRate;
  let best = 0;
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0;
    let count = 0;
    for (let t = phase; t < onsets.length - 1; t += period) {
      const i = Math.floor(t);
      const f = t - i;
      sum += onsets[i] * (1 - f) + onsets[i + 1] * f;
      count++;
    }
    best = Math.max(best, sum / count);
  }
  return best;
}

/**
 * Sharpens a tempo reading to the hundredth: tries every tempo within 2%
 * and keeps the one whose grid lines up with the most hits across the
 * whole song. The stored reading is only good to a tenth or so, which over
 * a song adds up to beats of drift — and a stretch ratio that far off.
 * Returns the reading unchanged when nothing fits clearly better.
 */
export function refineTempo(analysis: StemAnalysis, bpm: number): number {
  const { onsets, onsetRate } = analysis;
  if (onsets.length < onsetRate * 20) return bpm;
  const base = gridScore(onsets, onsetRate, bpm);
  let best = bpm;
  let bestScore = base;
  for (let r = -0.02; r <= 0.02; r += 0.0005) {
    const candidate = bpm * (1 + r);
    const score = gridScore(onsets, onsetRate, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore > base * 1.05 ? Math.round(best * 100) / 100 : bpm;
}

/**
 * Tempo of raw mono PCM, without Web Audio — the song splitter calls this
 * from a worker, where OfflineAudioContext doesn't exist everywhere.
 * Averaging down to the analysis rate is a crude resample, but onset
 * energy doesn't need a clean one.
 */
export function estimateTempo(mono: Float32Array, sampleRate: number): number | null {
  const factor = tempoDecimation(sampleRate);
  const decimated = new Float32Array(Math.floor(mono.length / factor));
  for (let i = 0; i < decimated.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    decimated[i] = sum / factor;
  }
  return estimateTempoDecimated(decimated, sampleRate / factor);
}

/** How many samples `estimateTempo` averages into one. */
export function tempoDecimation(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / RATE));
}

/**
 * `estimateTempo` for audio already averaged down by `tempoDecimation` —
 * lets the splitter build it as the song streams past, instead of keeping
 * a full-rate copy of the whole beat around just for this.
 */
export function estimateTempoDecimated(decimated: Float32Array, rate: number): number | null {
  const { onsets } = envelopes(decimated);
  return estimateBpm(onsets, rate / BLOCK);
}

// --- Key ---------------------------------------------------------------------

// Krumhansl–Kessler key profiles: how strongly each scale degree is felt
// in a major and a minor key, from listening experiments.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

async function detectKey(
  mono: Float32Array
): Promise<{ key: MusicalKey; confidence: number; frames: Float32Array }> {
  const { total: chroma, frames } = await chromagram(mono);

  const scores: { key: MusicalKey; score: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + tonic) % 12]);
    scores.push({ key: { tonic, mode: "major" }, score: correlation(rotated, MAJOR_PROFILE) });
    scores.push({ key: { tonic, mode: "minor" }, score: correlation(rotated, MINOR_PROFILE) });
  }
  scores.sort((a, b) => b.score - a.score);
  const confidence = Math.max(0, Math.min(1, (scores[0].score - scores[1].score) * 5));
  return { key: scores[0].key, confidence, frames };
}

function correlation(a: number[], b: number[]) {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  return denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
}

/** Pitch-class profile of every frame, and its sum over the whole stem. */
async function chromagram(mono: Float32Array): Promise<{ total: number[]; frames: Float32Array }> {
  // Which pitch class each FFT bin belongs to; bins outside ~A1–B6 (where
  // bass rumble and hi-hat noise live) are left out.
  const binClass = new Int8Array(FFT_SIZE / 2).fill(-1);
  for (let k = 1; k < FFT_SIZE / 2; k++) {
    const freq = (k * RATE) / FFT_SIZE;
    if (freq < 55 || freq > 2000) continue;
    const midi = 69 + 12 * Math.log2(freq / 440);
    binClass[k] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const window = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const total = new Array(12).fill(0);
  const frame = new Array(12).fill(0);
  const frameCount = Math.max(0, Math.floor((mono.length - FFT_SIZE) / FFT_HOP) + 1);
  const perFrame = new Float32Array(frameCount * 12);
  let frames = 0;

  for (let start = 0, index = 0; start + FFT_SIZE <= mono.length; start += FFT_HOP, index++) {
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const sample = mono[start + i];
      re[i] = sample * window[i];
      im[i] = 0;
      energy += sample * sample;
    }
    if (energy / FFT_SIZE < 1e-6) continue; // silence — says nothing about key

    fft(re, im);
    frame.fill(0);
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      const pc = binClass[k];
      if (pc >= 0) frame[pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    // Normalise each frame so loud sections don't outvote the rest.
    const sum = frame.reduce((s, v) => s + v, 0);
    if (sum > 0) {
      for (let pc = 0; pc < 12; pc++) {
        total[pc] += frame[pc] / sum;
        perFrame[index * 12 + pc] = frame[pc] / sum;
      }
    }

    if (++frames % 64 === 0) await yieldToUI();
  }
  return { total, frames: perFrame };
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}
