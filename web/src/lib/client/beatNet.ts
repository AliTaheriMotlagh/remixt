// Beat This! (CPJKU, ISMIR 2024) — a small neural network that hears where
// the beats and the downbeats ("the one" of each bar) are, far more surely
// than the onset-energy tracker in analysis.ts, above all on the downbeat.
// This is everything around the network, ported from the reference code
// (beat_this/preprocessing.py, inference.py, model/postprocessor.py): the
// log-mel spectrogram it listens to, cutting a song into the 30-second
// windows it was trained on and joining them again, and picking the beats
// out of what it says. Pure — no Web Audio — so a worker can run it and the
// tests can check it against the reference filterbank.

export const BEAT_NET = {
  /**
   * The "small" model: 2.1M parameters, ~10 MB, MIT licence — the export
   * committed to beat-this-rs, pinned to a commit. (The small0.onnx on the
   * Hugging Face "songbird-models" repo is a broken export: it stops
   * hearing beats a few seconds into every window.)
   */
  modelUrl:
    process.env.NEXT_PUBLIC_BEAT_MODEL_URL ||
    "https://raw.githubusercontent.com/danigb/beat-this-rs/089b509247e6fdcec666511c0dcf0d5f39c21e73/models/beat_this_small.onnx",
  modelBytes: 10_555_592,
  /** The network's input tensor. */
  inputName: "spectrogram",
  sampleRate: 22050,
  nFft: 1024,
  hop: 441,
  mels: 128,
  fMin: 30,
  fMax: 11000,
  /** Frames per second (sampleRate / hop). */
  fps: 50,
  /** Frames per window the network sees (30 s). */
  chunk: 1500,
  /** Frames at each edge of a window whose predictions are thrown away. */
  border: 6,
} as const;

const BINS = BEAT_NET.nFft / 2 + 1;

// --- Mel filterbank (torchaudio.functional.melscale_fbanks, slaney, no norm) ---

const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOG_STEP = Math.log(6.4) / 27;

function hzToMel(hz: number) {
  return hz >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP : hz / F_SP;
}

function melToHz(mel: number) {
  return mel >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOG_STEP * (mel - MIN_LOG_MEL)) : mel * F_SP;
}

let filterbank: Float32Array | null = null;

/** Triangular mel filters, row-major [frequency bin][mel band] — the same matrix torchaudio builds. */
export function melFilterbank(): Float32Array {
  if (filterbank) return filterbank;
  const { mels, fMin, fMax, sampleRate } = BEAT_NET;
  const nyquist = Math.floor(sampleRate / 2);
  const freqs = Array.from({ length: BINS }, (_, k) => (nyquist * k) / (BINS - 1));
  const mMin = hzToMel(fMin);
  const mMax = hzToMel(fMax);
  const points = Array.from({ length: mels + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (mels + 1)));
  const fb = new Float32Array(BINS * mels);
  for (let k = 0; k < BINS; k++) {
    for (let m = 0; m < mels; m++) {
      const down = (freqs[k] - points[m]) / (points[m + 1] - points[m]);
      const up = (points[m + 2] - freqs[k]) / (points[m + 2] - points[m + 1]);
      fb[k * mels + m] = Math.max(0, Math.min(down, up));
    }
  }
  filterbank = fb;
  return fb;
}

// --- FFT ---------------------------------------------------------------------

const N = BEAT_NET.nFft;
const LEVELS = Math.log2(N);
const reverse = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  let r = 0;
  for (let b = 0; b < LEVELS; b++) r = (r << 1) | ((i >> b) & 1);
  reverse[i] = r;
}
const cosTable = new Float64Array(N / 2);
const sinTable = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  cosTable[i] = Math.cos((2 * Math.PI * i) / N);
  sinTable[i] = Math.sin((2 * Math.PI * i) / N);
}

/** In-place radix-2 FFT of size nFft. */
function fft(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < N; i++) {
    const j = reverse[i];
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const wr = cosTable[k * step];
        const wi = -sinTable[k * step];
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

// --- Log-mel spectrogram -----------------------------------------------------

/**
 * log1p(1000 · mel(|STFT|)) of mono audio at 22050 Hz: Hann window of
 * 1024, hop 441 (50 frames a second), centred with reflect padding,
 * magnitudes scaled by 1/√1024 — torchaudio's MelSpectrogram as Beat This
 * configures it. Returns frames × 128, row-major.
 */
export function logMelSpectrogram(mono: Float32Array): { data: Float32Array; frames: number } {
  const { hop, mels } = BEAT_NET;
  const pad = N / 2;
  const length = mono.length;
  const frames = length > 0 ? 1 + Math.floor(length / hop) : 0;
  const data = new Float32Array(frames * mels);
  if (!frames) return { data, frames };
  const fb = melFilterbank();
  const window = new Float64Array(N);
  for (let i = 0; i < N; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  // Reflect padding mirrors without repeating the edge sample.
  const at = (i: number) => {
    if (length === 1) return mono[0];
    const period = 2 * (length - 1);
    let j = ((i % period) + period) % period;
    if (j >= length) j = period - j;
    return mono[j];
  };
  const scale = 1 / Math.sqrt(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const magnitude = new Float64Array(BINS);
  for (let f = 0; f < frames; f++) {
    const start = f * hop - pad;
    const inside = start >= 0 && start + N <= length;
    for (let i = 0; i < N; i++) {
      re[i] = (inside ? mono[start + i] : at(start + i)) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < BINS; k++) magnitude[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
    const row = f * mels;
    for (let k = 0; k < BINS; k++) {
      const m = magnitude[k];
      if (m === 0) continue;
      const fbRow = k * mels;
      for (let b = 0; b < mels; b++) data[row + b] += m * fb[fbRow + b];
    }
    for (let b = 0; b < mels; b++) data[row + b] = Math.log1p(1000 * data[row + b]);
  }
  return { data, frames };
}

// --- Windows -----------------------------------------------------------------

export type Window = {
  /** Frame of the song the window's first frame is (negative: zero padding before the song). */
  start: number;
  /** frames × 128, row-major, zero-padded at the song's edges. */
  data: Float32Array;
  frames: number;
};

/**
 * The song cut into the windows the network was trained on, overlapping
 * by the border it can't see well; the last one is moved back so it ends
 * with the song instead of being short. (split_piece, avoid_short_end.)
 */
export function splitPiece(spect: Float32Array, frames: number): Window[] {
  const { chunk, border, mels } = BEAT_NET;
  const starts: number[] = [];
  for (let s = -border; s < frames - border; s += chunk - 2 * border) starts.push(s);
  if (frames > chunk - 2 * border) starts[starts.length - 1] = frames - (chunk - border);
  return starts.map((start) => {
    const from = Math.max(start, 0);
    const to = Math.min(start + chunk, frames);
    const left = Math.max(0, -start);
    const right = Math.max(0, Math.min(border, start + chunk - frames));
    const length = left + (to - from) + right;
    const data = new Float32Array(length * mels);
    data.set(spect.subarray(from * mels, to * mels), left * mels);
    return { start, data, frames: length };
  });
}

/**
 * The windows' predictions joined into one per frame of the song, each
 * window's border dropped, and where windows overlap the earlier one wins
 * (aggregate_prediction, keep_first).
 */
export function aggregate(windows: Window[], predictions: Float32Array[], frames: number): Float32Array {
  const { border } = BEAT_NET;
  const out = new Float32Array(frames).fill(-1000);
  for (let w = windows.length - 1; w >= 0; w--) {
    const { start, frames: length } = windows[w];
    const p = predictions[w];
    for (let i = border; i < length - border; i++) {
      const at = start + i;
      if (at >= 0 && at < frames) out[at] = p[i];
    }
  }
  return out;
}

/** Local maxima within ±3 frames (±60 ms) with a logit above 0 (probability over ½). */
function peaks(logits: Float32Array): number[] {
  const found: number[] = [];
  for (let t = 0; t < logits.length; t++) {
    const v = logits[t];
    if (!(v > 0)) continue;
    let max = -Infinity;
    for (let j = Math.max(0, t - 3); j <= Math.min(logits.length - 1, t + 3); j++) max = Math.max(max, logits[j]);
    if (v === max) found.push(t);
  }
  return found;
}

/** Runs of peak frames at most `width` apart become their mean (deduplicate_peaks). */
function deduplicate(frames: number[], width = 1): number[] {
  const result: number[] = [];
  if (!frames.length) return result;
  let p = frames[0];
  let c = 1;
  for (let i = 1; i < frames.length; i++) {
    const p2 = frames[i];
    if (p2 - p <= width) {
      c++;
      p += (p2 - p) / c;
    } else {
      result.push(p);
      p = p2;
      c = 1;
    }
  }
  result.push(p);
  return result;
}

export type NeuralBeats = {
  /** Every beat, in seconds. */
  beats: number[];
  /** The downbeats (each also a beat), in seconds. */
  downbeats: number[];
};

/** The beats and downbeats out of the network's logits (postp_minimal). */
export function pickBeats(beatLogits: Float32Array, downbeatLogits: Float32Array): NeuralBeats {
  const { fps } = BEAT_NET;
  const beats = deduplicate(peaks(beatLogits)).map((f) => f / fps);
  let downbeats = deduplicate(peaks(downbeatLogits)).map((f) => f / fps);
  if (beats.length) {
    // Each downbeat onto its nearest beat.
    downbeats = downbeats.map((d) => {
      let best = beats[0];
      for (const b of beats) if (Math.abs(b - d) < Math.abs(best - d)) best = b;
      return best;
    });
    downbeats = [...new Set(downbeats)].sort((a, b) => a - b);
  }
  return { beats, downbeats };
}
