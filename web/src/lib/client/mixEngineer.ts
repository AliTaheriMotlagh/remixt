import { DEFAULT_FX, beatLength, type DelayDivision, type LaneFx, type MasterFx } from "./studioStore";

// The mix engineer: every decision measured from the audio, not read off a
// preset. It listens to each lane at full rate (where the lows, the mud,
// the presence and the air are — the 11 kHz analysis can't hear them),
// works out what each line contributes to the mix through the lane's own
// effect chain (the same filters audioGraph.ts builds, worked out exactly),
// and decides:
//
//   - who owns the low end: one bass line; every other lane with real
//     energy under 120 Hz gets a low cut (two beats never both keep their bass);
//   - the vocal's low cut under its lowest note, its compressor, its highs
//     lifted only when it measures dull against its mids;
//   - where the backing covers the vocal's presence while it sings, the
//     backing's mids come down by as much as they cover it;
//   - where the whole mix piles up in the low mids (250–500 Hz), the lanes
//     putting the most there are cut;
//   - levels by role, from K-weighted loudness (what the ear hears);
//   - who sits where: the lead, the bass and the drums in the middle; second
//     vocals and other songs' melodies to either side;
//   - reverb and echo timed to the tempo, less on a vocal that never stops.
//
// And mastering by measurement: a stretch of the mix rendered, its
// loudness, peak and tone measured, then the master's shelves, glue and
// fader set to reach a loudness target without the limiter working hard,
// checked by rendering again.
//
// Everything here is pure (no audio engine), so it runs in tests; the
// Studio feeds it the decoded stems (laneTones.ts) and renders (MasterIt).

// --- Measuring ----------------------------------------------------------------------------

export type Band = { lo: number; hi: number; name: string; short: string };

/** The eight bands an engineer reads a mix by. */
export const BANDS: Band[] = [
  { lo: 20, hi: 60, name: "Sub", short: "Sub" },
  { lo: 60, hi: 120, name: "Bass", short: "Bass" },
  { lo: 120, hi: 250, name: "Low mids", short: "Low" },
  { lo: 250, hi: 500, name: "Mud", short: "Mud" },
  { lo: 500, hi: 2000, name: "Mids", short: "Mid" },
  { lo: 2000, hi: 4000, name: "Presence", short: "Pres" },
  { lo: 4000, hi: 8000, name: "Highs", short: "High" },
  { lo: 8000, hi: 16000, name: "Air", short: "Air" },
];
export const SUB = 0;
export const BASS = 1;
export const MUD = 3;
export const MIDS = 4;
export const PRESENCE = 5;
export const HIGHS = 6;
export const AIR = 7;

/** What a stem (or a mix) measures. */
export type Tone = {
  /** Mean power in each of BANDS while it sounds (linear, mean-square units: they add up across lanes). */
  bands: number[];
  /** Integrated loudness (BS.1770, gated), LUFS: its level while it sounds, as the ear weighs it. */
  lufs: number;
  /** Sample peak, dBFS. */
  peakDb: number;
  /** Peak against the RMS of its sounding parts, dB: high = spiky, dynamic. */
  crestDb: number;
  /** −1..1, left against right: 1 = mono. */
  correlation: number;
  /** Share of its length that sounds, 0..1. */
  active: number;
  seconds: number;
};

const FFT_SIZE = 4096;
/** Seconds between spectrum frames. */
const FRAME_EVERY = 0.5;

export const db = (power: number) => 10 * Math.log10(Math.max(power, 1e-12));
export const fromDb = (decibels: number) => 10 ** (decibels / 10);
const amp = (decibels: number) => 10 ** (decibels / 20);

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
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

type Coefficients = [b0: number, b1: number, b2: number, a1: number, a2: number];

/** Runs a normalised biquad over `x`. */
function biquadRun(x: Float32Array, [b0, b1, b2, a1, a2]: Coefficients) {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** The BS.1770 K-weighting filters (a high shelf, then the RLB high-pass), for any sample rate. */
function kFilters(rate: number): [Coefficients, Coefficients] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf: Coefficients = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const highpass: Coefficients = [1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return [shelf, highpass];
}

/** Integrated loudness (BS.1770-4: 400 ms blocks, 75% overlap, −70 LUFS and −10 LU gates). */
export function loudnessOf(channels: Float32Array[], rate: number) {
  const [shelf, highpass] = kFilters(rate);
  const weighted = channels.map((c) => biquadRun(biquadRun(c, shelf), highpass));
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  const frames = channels[0]?.length ?? 0;
  // Sums per 100 ms, so each 400 ms block is four of them.
  const quarters: number[] = [];
  for (let s = 0; s + hop <= frames; s += hop) {
    let p = 0;
    for (const c of weighted) {
      let sum = 0;
      for (let i = s; i < s + hop; i++) sum += c[i] * c[i];
      p += sum;
    }
    quarters.push(p);
  }
  const blocks: number[] = [];
  for (let q = 0; q + 4 <= quarters.length; q++) blocks.push((quarters[q] + quarters[q + 1] + quarters[q + 2] + quarters[q + 3]) / block);
  const lufs = (p: number) => -0.691 + db(p);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const absolute = blocks.filter((p) => lufs(p) > -70);
  if (!absolute.length) return -70;
  const relative = lufs(mean(absolute)) - 10;
  const gated = absolute.filter((p) => lufs(p) > relative);
  return lufs(mean(gated));
}

/**
 * Measures audio: its loudness, peak, crest, stereo correlation, and its
 * power in each band over the frames where it sounds (silence between a
 * vocal's lines doesn't count against it). Pure.
 */
export function measureChannels(channels: Float32Array[], rate: number): Tone {
  const frames = channels[0]?.length ?? 0;
  const left = channels[0] ?? new Float32Array(0);
  const right = channels[1] ?? left;
  let peak = 0;
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < frames; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
    lr += left[i] * right[i];
    ll += left[i] * left[i];
    rr += right[i] * right[i];
  }

  // Spectrum frames, every half second, of the mono sum.
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  const windowPower = window.reduce((s, w) => s + w * w, 0);
  const binBand = Int8Array.from({ length: FFT_SIZE / 2 }, (_, k) => BANDS.findIndex((b) => (k * rate) / FFT_SIZE >= b.lo && (k * rate) / FFT_SIZE < b.hi));
  const step = Math.max(FFT_SIZE, Math.round(FRAME_EVERY * rate));
  const spectra: { power: number; bands: Float64Array }[] = [];
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const k = 1 / channels.length;
  for (let s = 0; s + FFT_SIZE <= frames; s += step) {
    let power = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      let v = 0;
      for (const c of channels) v += c[s + i];
      v *= k;
      power += v * v;
      re[i] = v * window[i];
      im[i] = 0;
    }
    fft(re, im);
    const bands = new Float64Array(BANDS.length);
    // One-sided, windowed: scaled so the bands add up to the frame's mean-square power.
    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const b = binBand[bin];
      if (b >= 0) bands[b] += (2 * (re[bin] * re[bin] + im[bin] * im[bin])) / (FFT_SIZE * windowPower);
    }
    spectra.push({ power: power / FFT_SIZE, bands });
  }
  // Sounding: within 30 dB of its loud frames (the 95th percentile), and above −60 dBFS.
  const sorted = spectra.map((f) => f.power).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const floor = Math.max(1e-6, loud * 1e-3);
  const sounding = spectra.filter((f) => f.power > floor);
  const bands = BANDS.map((_, b) => sounding.reduce((s, f) => s + f.bands[b], 0) / Math.max(1, sounding.length));
  const rms = Math.sqrt(sounding.reduce((s, f) => s + f.power, 0) / Math.max(1, sounding.length));

  return {
    bands,
    lufs: loudnessOf(channels, rate),
    peakDb: 20 * Math.log10(Math.max(peak, 1e-6)),
    crestDb: rms > 0 ? 20 * Math.log10(peak / rms) : 0,
    correlation: ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1,
    active: spectra.length ? sounding.length / spectra.length : 0,
    seconds: frames / rate,
  };
}

/** Each band's share of the total, in dB (0 = all of it): the shape of the sound, whatever its level. */
export function bandShares(bands: number[]) {
  const total = bands.reduce((a, b) => a + b, 0);
  return bands.map((p) => db(p / Math.max(total, 1e-20)));
}

// --- What a lane's effects do to it ---------------------------------------------------------

/** The rate filter responses are worked out at — the curves barely move with it below 16 kHz. */
const RESPONSE_RATE = 48000;

/** |H|² of a biquad at `hz`. */
function biquadPower(b: [number, number, number], a: [number, number, number], hz: number) {
  const w = (2 * Math.PI * hz) / RESPONSE_RATE;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nr = b[0] + b[1] * cos1 + b[2] * cos2;
  const ni = -(b[1] * sin1 + b[2] * sin2);
  const dr = a[0] + a[1] * cos1 + a[2] * cos2;
  const di = -(a[1] * sin1 + a[2] * sin2);
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}

/** Web Audio's BiquadFilterNode, as its spec defines it (the RBJ cookbook). */
function filterPower(type: "highpass" | "lowpass" | "lowshelf" | "highshelf" | "peaking", f0: number, gainDb: number, q: number, hz: number) {
  const w0 = (2 * Math.PI * Math.min(f0, RESPONSE_RATE / 2 - 1)) / RESPONSE_RATE;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = 10 ** (gainDb / 40);
  switch (type) {
    case "highpass":
    case "lowpass": {
      // Q is in dB for these two.
      const alpha = sin / (2 * 10 ** (q / 20));
      const b = type === "lowpass" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
      return biquadPower(b as [number, number, number], [1 + alpha, -2 * cos, 1 - alpha], hz);
    }
    case "peaking": {
      const alpha = sin / (2 * q);
      return biquadPower([1 + alpha * A, -2 * cos, 1 - alpha * A], [1 + alpha / A, -2 * cos, 1 - alpha / A], hz);
    }
    case "lowshelf":
    case "highshelf": {
      // Shelf slope 1.
      const alpha = (sin / 2) * Math.SQRT2;
      const s = 2 * Math.sqrt(A) * alpha;
      return type === "lowshelf"
        ? biquadPower([A * (A + 1 - (A - 1) * cos + s), 2 * A * (A - 1 - (A + 1) * cos), A * (A + 1 - (A - 1) * cos - s)], [A + 1 + (A - 1) * cos + s, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - s], hz)
        : biquadPower([A * (A + 1 + (A - 1) * cos + s), -2 * A * (A - 1 + (A + 1) * cos), A * (A + 1 + (A - 1) * cos - s)], [A + 1 - (A - 1) * cos + s, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - s], hz);
    }
  }
}

/** A lane's tone-shaping filters' power gain at `hz` (as createLaneChain sets them: high-pass, low-pass, 220 Hz shelf, 350 Hz and 1.4 kHz bells, 5.2 kHz shelf). */
export function fxPower(fx: Pick<LaneFx, "highpass" | "lowpass" | "eqLow" | "eqMid" | "eqHigh"> & { eqLowMid?: number }, hz: number) {
  let p = 1;
  if (fx.highpass > 20) p *= filterPower("highpass", fx.highpass, 0, 1, hz);
  if (fx.lowpass < 20000) p *= filterPower("lowpass", fx.lowpass, 0, 1, hz);
  if (fx.eqLow) p *= filterPower("lowshelf", 220, fx.eqLow, 0, hz);
  if (fx.eqLowMid) p *= filterPower("peaking", 350, fx.eqLowMid, 1, hz);
  if (fx.eqMid) p *= filterPower("peaking", 1400, fx.eqMid, 0.9, hz);
  if (fx.eqHigh) p *= filterPower("highshelf", 5200, fx.eqHigh, 0, hz);
  return p;
}

/** Points per band its response is averaged over (log-spaced). */
const BAND_POINTS = 6;

/** A lane's filters' mean power gain over each band. */
export function bandGains(fx: Pick<LaneFx, "highpass" | "lowpass" | "eqLow" | "eqMid" | "eqHigh"> & { eqLowMid?: number }) {
  return BANDS.map((band) => {
    let sum = 0;
    for (let i = 0; i < BAND_POINTS; i++) sum += fxPower(fx, band.lo * (band.hi / band.lo) ** ((i + 0.5) / BAND_POINTS));
    return sum / BAND_POINTS;
  });
}

/** The ear's weighting of each band (K-weighting's power gain at the band's middle) — how loud a band reads. */
const K_WEIGHT = (() => {
  const [shelf, highpass] = kFilters(RESPONSE_RATE);
  const power = ([b0, b1, b2, a1, a2]: Coefficients, hz: number) => biquadPower([b0, b1, b2], [1, a1, a2], hz);
  return BANDS.map((b) => {
    const hz = Math.sqrt(b.lo * b.hi);
    return power(shelf, hz) * power(highpass, hz);
  });
})();

/** How much louder (dB, as the ear weighs it) a sound with `bands` plays through filters with `gains`. */
export function loudnessChange(bands: number[], gains: number[]) {
  let before = 0;
  let after = 0;
  bands.forEach((p, b) => {
    before += p * K_WEIGHT[b];
    after += p * K_WEIGHT[b] * gains[b];
  });
  return before > 0 ? db(after / before) : 0;
}

/** The filters' response in dB at `points` log-spaced frequencies from 20 Hz to 20 kHz — for drawing the EQ curve. */
export function eqCurve(fx: Pick<LaneFx, "highpass" | "lowpass" | "eqLow" | "eqMid" | "eqHigh"> & { eqLowMid?: number }, points = 48) {
  return Array.from({ length: points }, (_, i) => {
    const hz = 20 * 1000 ** (i / (points - 1));
    return { hz, db: db(fxPower(fx, hz)) };
  });
}

// --- The engineer's decisions ----------------------------------------------------------------

export type MixRole = "lead" | "vocal" | "bass" | "drums" | "beat" | "melody";

/** A lane as the engineer sees it. */
export type EngineerLane = {
  laneId: string;
  kind: "vocals" | "beat" | "drums" | "bass" | "other";
  title: string;
  volume: number;
  muted: boolean;
  fx: LaneFx;
  tone: Tone | undefined;
  /** Lanes of one recording share this (a song's beat and its own drums, bass and melody). */
  song: string;
  /** A layer that follows its lead vocal (a double, an octave): kept as it is. */
  layer: boolean;
  /** For a vocal: the frequency of its lowest sung notes, Hz, when its melody was followed. */
  lowestNoteHz?: number;
  /** For a vocal: share of its span that's singing, 0..1. */
  density?: number;
};

export type EngineerInput = {
  lanes: EngineerLane[];
  bpm: number;
  /** The lead vocal and the main beat, when the session picked them. */
  leadId?: string | null;
  beatId?: string | null;
  /**
   * "full": the engineer's whole sound — tone, dynamics, space and levels.
   * "on-style": a style's sound kept (its colour, its space), with the
   * engineer's corrections on top: low end, mud, masking, levels, placement.
   */
  mode: "full" | "on-style";
};

export type LaneDecision = {
  laneId: string;
  title: string;
  role: MixRole;
  volume: number;
  fx: LaneFx;
  /** The lane's bands as heard in the mix, before and after (dB, mean-square power at its level). */
  before: number[];
  after: number[];
  /** Why, in plain words. */
  reasons: string[];
};

export type Masking = {
  band: number;
  /** The vocal's level against everything behind it in that band, dB (positive = the vocal is on top). */
  before: number;
  after: number;
};

export type EngineerPlan = {
  lanes: LaneDecision[];
  /** The lane whose bass the mix keeps. */
  lowOwner: string | null;
  /** The mix's shape (each band's share, dB) before and after. */
  mix: { before: number[]; after: number[] };
  masking: Masking[];
  /** The low-mid pile-up (Mud's share of the mix, dB), and where it should be under. */
  mud: { before: number; after: number; limit: number };
  lines: string[];
};

/** A lead vocal while it sings sits this far under the backing, as the ear weighs them (LUFS of each, gated). */
export const VOCAL_OFFSET_DB = -1;
/** A second vocal (a feature, a harmony that isn't a layer) under the lead. */
const SECOND_VOCAL_DB = -3;
/** Another song's drums, bass or melody on their own, under the main backing. */
const OTHER_PARTS_DB = -2;
/** Lane faders top out here. */
const MAX_VOLUME = 1.5;
/** Mud's share of a finished mix rarely goes above this (dB of the whole). */
export const MUD_LIMIT = -11;
/** Real energy under 120 Hz: sub and bass this close to the lane's loudest band. */
const LOW_ENERGY_DB = -15;
/** Where the vocal's presence needs to clear the backing (dB, the vocal over everything behind it). */
const PRESENCE_CLEAR_DB = 1;

const round = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function roleOf(lane: EngineerLane, leadId: string | null): MixRole {
  if (lane.kind === "vocals") return lane.laneId === leadId ? "lead" : "vocal";
  if (lane.kind === "bass") return "bass";
  if (lane.kind === "drums") return "drums";
  if (lane.kind === "other") return "melody";
  return "beat";
}

/** Power of a lane in each band as it plays: its stem through its filters, at its fader. */
function heard(lane: { tone: Tone | undefined; fx: LaneFx; volume: number; muted: boolean }) {
  if (!lane.tone || lane.muted) return BANDS.map(() => 0);
  const gains = bandGains(lane.fx);
  return lane.tone.bands.map((p, b) => p * gains[b] * lane.volume * lane.volume);
}

const sum = (rows: number[][]) => BANDS.map((_, b) => rows.reduce((s, r) => s + r[b], 0));

/** The vocal over everything else, band by band (dB), in the bands a voice is understood by. */
function maskingOf(vocal: number[], backing: number[]) {
  return [MIDS, PRESENCE, HIGHS].map((band) => ({ band, level: db(vocal[band]) - db(backing[band]) }));
}

function delayFor(bpm: number): DelayDivision {
  return bpm >= 130 ? "1/4" : bpm >= 95 ? "1/8." : "1/8";
}

/** A reverb length that rings out on the beat: the nearest whole or dotted count of beats. */
function decayOn(seconds: number, bpm: number) {
  const beat = beatLength(bpm);
  const counts = [1, 1.5, 2, 3, 4, 6];
  const best = counts.reduce((a, b) => (Math.abs(Math.log((b * beat) / seconds)) < Math.abs(Math.log((a * beat) / seconds)) ? b : a));
  return round(clamp(best * beat, 0.6, 4), 0.01);
}

/**
 * The engineer's mix: decisions for every lane from what each measures.
 * Lanes without a measurement, muted lanes and vocal layers are left as
 * they are. Pure.
 */
export function engineerMix(input: EngineerInput): EngineerPlan {
  const { bpm, mode } = input;
  const all = input.lanes;
  const work = all.filter((l) => !l.layer && !l.muted && l.tone && l.tone.lufs > -60);
  const vocals = work.filter((l) => l.kind === "vocals");
  const backing = work.filter((l) => l.kind !== "vocals");
  const leadId =
    (input.leadId && vocals.some((v) => v.laneId === input.leadId) ? input.leadId : null) ??
    [...vocals].sort((a, b) => b.tone!.lufs + 20 * Math.log10(b.volume || 1e-3) - (a.tone!.lufs + 20 * Math.log10(a.volume || 1e-3)))[0]?.laneId ??
    null;
  const fx = new Map(work.map((l) => [l.laneId, { ...(mode === "full" ? DEFAULT_FX : l.fx) } as LaneFx]));
  // Fades and pans a person or a style put on stay unless the engineer has reason to move them.
  for (const l of work) {
    const f = fx.get(l.laneId)!;
    f.fadeIn = l.fx.fadeIn;
    f.fadeOut = l.fx.fadeOut;
    if (mode === "full") f.duck = 0;
  }
  const volume = new Map(work.map((l) => [l.laneId, l.volume]));
  const reasons = new Map<string, string[]>(work.map((l) => [l.laneId, []]));
  const say = (id: string, text: string) => reasons.get(id)?.push(text);
  const lines: string[] = [];
  const beforeRows = new Map(all.map((l) => [l.laneId, heard(l)]));

  // 1. The low end has one owner: a bass line, else the main beat, else drums.
  const loudest = (lanes: EngineerLane[]) => [...lanes].sort((a, b) => b.tone!.lufs + 20 * Math.log10(b.volume) - (a.tone!.lufs + 20 * Math.log10(a.volume)))[0];
  const owner =
    loudest(backing.filter((l) => l.kind === "bass")) ??
    backing.find((l) => l.laneId === input.beatId) ??
    loudest(backing.filter((l) => l.kind === "beat")) ??
    loudest(backing.filter((l) => l.kind === "drums")) ??
    null;
  const keepsLows = (l: EngineerLane) => !!owner && (l.laneId === owner.laneId || (l.song === owner.song && (l.kind === "drums" || l.kind === "beat")));
  for (const l of work) {
    const f = fx.get(l.laneId)!;
    const shares = bandShares(l.tone!.bands);
    const top = Math.max(...shares);
    const lowEnergy = Math.max(shares[SUB], shares[BASS]) - top > LOW_ENERGY_DB;
    let cut = 0;
    let why = "";
    if (l.kind === "vocals") {
      // Just under its lowest notes: a deep voice keeps its body, a high one loses the rumble.
      cut = clamp(round(0.6 * (l.lowestNoteHz ?? 160), 5), 70, 170);
      why = l.lowestNoteHz ? `low cut at ${cut} Hz, just under its lowest notes` : `low cut at ${cut} Hz (rumble and the old beat's bass bleeding through)`;
    } else if (keepsLows(l)) {
      cut = 30;
      why = l.laneId === owner!.laneId ? "keeps the low end — the one bass line in the mix (sub rumble under 30 Hz cleaned)" : "";
    } else if (lowEnergy) {
      cut = l.kind === "drums" ? 90 : l.kind === "other" ? 150 : 140;
      why = `low cut at ${cut} Hz: its bass would fight ${owner ? `“${owner.title}”` : "the beat"}'s`;
    }
    if (cut > f.highpass) {
      f.highpass = cut;
      if (why) say(l.laneId, why);
    } else if (why && l.laneId === owner?.laneId) say(l.laneId, why);
  }

  // 2. The vocals' own sound: dynamics, then tone measured against their mids.
  for (const v of vocals) {
    const f = fx.get(v.laneId)!;
    const shares = bandShares(v.tone!.bands);
    if (v.tone!.crestDb > 12 && !f.compress) {
      f.compress = true;
      say(v.laneId, `compressor on (its peaks stand ${Math.round(v.tone!.crestDb)} dB over its body — every word at one level)`);
    }
    if (mode === "full" || f.eqHigh === 0) {
      // A clear voice: highs ~10 dB under its mids. Dull (a separated vocal often is): lift; harsh: tame.
      const dullness = shares[HIGHS] - shares[MIDS];
      const lift = round(clamp((-10 - dullness) * 0.5, -2, 4), 0.5);
      if (Math.abs(lift) >= 1) {
        f.eqHigh = lift;
        say(v.laneId, lift > 0 ? `highs +${lift} dB — it measured dull (${Math.round(dullness)} dB under its mids)` : `highs ${lift} dB — it measured harsh`);
      }
    }
    if (mode === "full") {
      const dense = (v.density ?? 0.5) > 0.6;
      f.reverb = v.laneId === leadId ? (dense ? 0.1 : 0.15) : 0.18;
      f.reverbSize = decayOn(2 * beatLength(bpm), bpm);
      f.delay = v.laneId === leadId ? (dense ? 0.08 : 0.13) : 0.06;
      f.delayDivision = delayFor(bpm);
      f.delayFeedback = 0.28;
      say(v.laneId, `reverb ${Math.round(f.reverb * 100)}% ringing ${f.reverbSize}s and a ${f.delayDivision} echo — timed to ${Math.round(bpm)} BPM${dense ? ", kept light: it hardly stops" : ""}`);
    }
  }

  // 3. Placement: the lead, bass and drums in the middle; others either side.
  let side = 0;
  for (const l of work) {
    const f = fx.get(l.laneId)!;
    const role = roleOf(l, leadId);
    if (role === "lead" || role === "bass" || role === "drums" || l.laneId === owner?.laneId) {
      if (mode === "full") f.pan = 0;
      continue;
    }
    const otherSong = !owner || l.song !== owner.song;
    if (role === "vocal" || (role === "melody" && otherSong)) {
      const pan = (side++ % 2 ? -1 : 1) * (role === "vocal" ? 0.3 : 0.35);
      if (Math.abs(f.pan) < 0.05 || mode === "full") {
        f.pan = pan;
        say(l.laneId, `panned ${pan < 0 ? "left" : "right"} ${Math.round(Math.abs(pan) * 100)}% — out of the lead's way`);
      }
    }
  }

  // 4. Levels, by role, from loudness as the ear hears it (through the new filters).
  const lufsNow = (l: EngineerLane) => l.tone!.lufs + loudnessChange(l.tone!.bands, bandGains(fx.get(l.laneId)!));
  const groupLoudness = (lanes: EngineerLane[], level: (l: EngineerLane) => number) =>
    db(lanes.reduce((s, l) => s + fromDb(lufsNow(l)) * level(l) ** 2, 0));
  const songs = [...new Set(backing.map((l) => l.song))];
  const refSong = owner?.song ?? songs[0];
  let reference = 0;
  if (refSong !== undefined) {
    const group = backing.filter((l) => l.song === refSong);
    // The main backing keeps its own balance, its loudest line at 85%.
    const scale = 0.85 / Math.max(1e-3, ...group.map((l) => l.volume));
    for (const l of group) volume.set(l.laneId, l.volume * scale);
    reference = groupLoudness(group, (l) => volume.get(l.laneId)!);
    for (const song of songs) {
      if (song === refSong) continue;
      const other = backing.filter((l) => l.song === song);
      const own = groupLoudness(other, (l) => l.volume);
      const target = reference + (other.some((l) => l.kind === "beat") ? 0 : OTHER_PARTS_DB);
      for (const l of other) volume.set(l.laneId, l.volume * amp(target - own));
    }
  } else if (vocals.length) {
    // A cappella: the lead at a steady level.
    reference = -16 - VOCAL_OFFSET_DB;
  }
  for (const v of vocals) {
    const target = reference + VOCAL_OFFSET_DB + (v.laneId === leadId ? 0 : SECOND_VOCAL_DB);
    volume.set(v.laneId, amp(target - lufsNow(v)));
  }

  // 5. The vocal's presence: where the backing covers it, the backing's mids come down by as much.
  const lead = work.find((l) => l.laneId === leadId);
  const rowsNow = () => new Map(work.map((l) => [l.laneId, heard({ ...l, fx: fx.get(l.laneId)!, volume: volume.get(l.laneId)! })]));
  const maskingNow = () => {
    if (!lead) return [];
    const rows = rowsNow();
    return maskingOf(rows.get(lead.laneId)!, sum(backing.map((l) => rows.get(l.laneId)!)));
  };
  const maskingBefore = lead ? maskingOf(beforeRows.get(lead.laneId)!, sum(backing.map((l) => beforeRows.get(l.laneId)!))) : [];
  const covered = maskingNow().find((m) => m.band === PRESENCE || m.band === MIDS);
  const worst = Math.min(...maskingNow().filter((m) => m.band !== HIGHS).map((m) => m.level));
  if (lead && Number.isFinite(worst) && worst < PRESENCE_CLEAR_DB && covered) {
    const cut = round(clamp((PRESENCE_CLEAR_DB - worst) * 0.7, 1, 4), 0.5);
    for (const l of backing) {
      const shares = bandShares(heard({ ...l, fx: fx.get(l.laneId)!, volume: volume.get(l.laneId)! }));
      // The lanes with real mids — a bass line has none to give.
      if (l.kind === "bass" || shares[MIDS] < -14) continue;
      const f = fx.get(l.laneId)!;
      const next = Math.min(f.eqMid, -cut);
      if (next < f.eqMid) {
        f.eqMid = next;
        say(l.laneId, `mids ${next} dB around 1.4 kHz — it covered the vocal there by ${Math.round(PRESENCE_CLEAR_DB - worst)} dB`);
      }
    }
    // Still covered: the vocal's own presence lifted, as much as is missing (a little goes a long way).
    const left = Math.min(...maskingNow().filter((m) => m.band !== HIGHS).map((m) => m.level));
    const vf = fx.get(lead.laneId)!;
    if (left < PRESENCE_CLEAR_DB && (mode === "full" || vf.eqMid === 0)) {
      const lift = round(clamp(PRESENCE_CLEAR_DB - left, 1, 2.5), 0.5);
      vf.eqMid = Math.max(vf.eqMid, lift);
      say(lead.laneId, `presence +${lift} dB around 1.4 kHz — the backing still covered it there`);
    }
    // The beat dips under the voice too, as much as it covered it — gently on a vocal that hardly stops.
    if (mode === "full") {
      const dense = (lead.density ?? 0.5) > 0.6;
      const duck = round(clamp((PRESENCE_CLEAR_DB - worst) * 0.06 + (dense ? 0.08 : 0.15), 0.1, 0.4), 0.01);
      for (const l of backing) fx.get(l.laneId)!.duck = duck;
      lines.push(`The backing dips ${Math.round(duck * 100)}% while the vocal sings${dense ? " (gently: it hardly stops)" : ""}.`);
    }
  } else if (mode === "full" && lead) {
    for (const l of backing) fx.get(l.laneId)!.duck = (lead.density ?? 0.5) > 0.6 ? 0.1 : 0.15;
  }

  // 6. The low-mid pile-up: the lanes putting most into 250–500 Hz cut there with the 350 Hz bell,
  //    a step at a time, the vocals' levels kept (a cut makes a voice read quieter).
  const relevel = () => {
    for (const v of vocals) volume.set(v.laneId, amp(reference + VOCAL_OFFSET_DB + (v.laneId === leadId ? 0 : SECOND_VOCAL_DB) - lufsNow(v)));
  };
  relevel();
  const mudShare = () => bandShares(sum([...rowsNow().values()]))[MUD];
  const mudBefore = bandShares(sum(all.map((l) => beforeRows.get(l.laneId)!)))[MUD];
  const deepest = (l: EngineerLane) => (l.kind === "vocals" ? -6 : keepsLows(l) && l.kind !== "drums" ? -3 : -5);
  const cutHere = new Set<string>();
  for (let pass = 0; pass < 12 && mudShare() > MUD_LIMIT; pass++) {
    const rows = rowsNow();
    const target = [...work]
      .sort((a, b) => rows.get(b.laneId)![MUD] - rows.get(a.laneId)![MUD])
      .find((l) => fx.get(l.laneId)!.eqLowMid > deepest(l));
    if (!target) break;
    const f = fx.get(target.laneId)!;
    f.eqLowMid = Math.max(f.eqLowMid - 1.5, deepest(target));
    cutHere.add(target.laneId);
    relevel();
  }
  for (const id of cutHere) say(id, `low mids ${fx.get(id)!.eqLowMid} dB at 350 Hz — it put the most into the mix's 250–500 Hz pile-up`);

  // Everything to fit the faders, together.
  const top = Math.max(0, ...work.map((l) => volume.get(l.laneId)!));
  const fit = top > MAX_VOLUME ? MAX_VOLUME / top : 1;
  for (const l of work) volume.set(l.laneId, round(clamp(volume.get(l.laneId)! * fit, 0.02, MAX_VOLUME), 0.01));
  if (fit < 1) lines.push(`Everything ${Math.round(-20 * Math.log10(fit) * 10) / 10} dB down together to keep the vocal's level on the faders — the master brings it back.`);

  for (const v of vocals) {
    const role = v.laneId === leadId ? "the lead" : "a second voice";
    say(v.laneId, `level: ${role}, ${Math.abs(VOCAL_OFFSET_DB + (v.laneId === leadId ? 0 : SECOND_VOCAL_DB))} dB under the beat as the ear weighs them, while it sings`);
  }
  if (owner) say(owner.laneId, "level: the reference everything is balanced against");

  const after = rowsNow();
  const decisions: LaneDecision[] = work.map((l) => ({
    laneId: l.laneId,
    title: l.title,
    role: roleOf(l, leadId),
    volume: volume.get(l.laneId)!,
    fx: fx.get(l.laneId)!,
    before: beforeRows.get(l.laneId)!.map(db),
    after: after.get(l.laneId)!.map(db),
    reasons: reasons.get(l.laneId)!,
  }));
  const untouched = all.filter((l) => !work.includes(l)).map((l) => beforeRows.get(l.laneId)!);
  const mixAfter = sum([...after.values(), ...untouched]);
  const maskingAfter = maskingNow();
  const mudAfter = bandShares(mixAfter)[MUD];
  if (mudBefore > MUD_LIMIT || mudAfter < mudBefore - 0.5) lines.unshift(`Low-mid pile-up ${mudBefore.toFixed(1)} → ${mudAfter.toFixed(1)} dB of the mix (clear under ${MUD_LIMIT}).`);
  if (owner) lines.unshift(`One bass line: “${owner.title}” keeps the low end; every other line's lows are cut.`);
  return {
    lanes: decisions,
    lowOwner: owner?.laneId ?? null,
    mix: { before: bandShares(sum(all.map((l) => beforeRows.get(l.laneId)!))), after: bandShares(mixAfter) },
    masking: maskingBefore.map((m) => ({ band: m.band, before: m.level, after: maskingAfter.find((a) => a.band === m.band)?.level ?? m.level })),
    mud: { before: mudBefore, after: mudAfter, limit: MUD_LIMIT },
    lines,
  };
}

// --- Mastering ------------------------------------------------------------------------------------

export type LoudnessTarget = { id: "streaming" | "loud"; label: string; lufs: number; hint: string };

export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  { id: "streaming", label: "Streaming", lufs: -14, hint: "−14 LUFS: Spotify, YouTube and Apple Music play it as loud as it is, with room to breathe" },
  { id: "loud", label: "Loud", lufs: -10, hint: "−10 LUFS: club, phones and social — punchy, but the limiter works harder" },
];

/** What a rendered stretch of the mix measures. */
export type MixMeasure = { lufs: number; peakDb: number; crestDb: number; shares: number[] };

export function measureMix(channels: Float32Array[], rate: number): MixMeasure {
  const tone = measureChannels(channels, rate);
  return { lufs: tone.lufs, peakDb: tone.peakDb, crestDb: tone.crestDb, shares: bandShares(tone.bands) };
}

/**
 * The tonal balance of finished modern mixes (each band's share, dB) —
 * roughly a pink slope with the low end on top. The master's shelves move
 * toward it, by half the difference and never far.
 */
export const REFERENCE_SHARES = [-9, -4.5, -6.5, -10, -9.5, -16, -20, -27];

/**
 * The master's settings for a target, from a measurement of the mix with
 * the master flat: tone toward the reference, glue by how spiky it is, and
 * the gain that should reach the target (checked by rendering again — see
 * masterToTarget). `loudest`: the measured stretch is the loudest of the
 * song, so it's aimed a dB over the target, for the whole song to land on it.
 */
export function planMaster(measure: MixMeasure, target: LoudnessTarget, { loudest = true } = {}) {
  const lows = db(fromDb(measure.shares[SUB]) + fromDb(measure.shares[BASS]));
  const lowsRef = db(fromDb(REFERENCE_SHARES[SUB]) + fromDb(REFERENCE_SHARES[BASS]));
  const tops = db(fromDb(measure.shares[AIR]) + fromDb(measure.shares[HIGHS]));
  const topsRef = db(fromDb(REFERENCE_SHARES[AIR]) + fromDb(REFERENCE_SHARES[HIGHS]));
  const low = round(clamp((lowsRef - lows) * 0.5, -3, 3), 0.5);
  const high = round(clamp((topsRef - tops) * 0.5, -2, 3), 0.5);
  const glue = round(clamp((measure.crestDb - 10) * 0.05 + (target.id === "loud" ? 0.25 : 0.1), 0.15, 0.8), 0.05);
  const aim = target.lufs + (loudest ? 1 : 0);
  // Glue's make-up gain (7 dB at full) comes back as about half once it has compressed.
  const gain = round(clamp(aim - measure.lufs - glue * 3.5, MIN_GAIN, MAX_GAIN), 0.1);
  const notes: string[] = [];
  if (low) notes.push(`lows ${low > 0 ? "+" : ""}${low} dB (${lows < lowsRef ? "light" : "heavy"} against finished mixes)`);
  if (high) notes.push(`highs ${high > 0 ? "+" : ""}${high} dB (${tops < topsRef ? "dull" : "bright"} against finished mixes)`);
  notes.push(`glue ${Math.round(glue * 100)}% (its peaks ${measure.crestDb.toFixed(1)} dB over its body)`);
  return { master: { low, high, glue, gain } satisfies MasterFx, aim, notes };
}

/** The master's gain range (see MasterFx.gain). */
const MIN_GAIN = -12;
const MAX_GAIN = 18;
/** Under this crest (peak over RMS) the limiter is squashing the mix: louder is no cleaner from here. */
const SQUASHED_CREST = 7.5;

export type MasterResult = {
  master: MasterFx;
  before: MixMeasure;
  after: MixMeasure;
  target: LoudnessTarget;
  /** What the mastering did, in words. */
  notes: string[];
  /** The target couldn't be reached cleanly: this is the loudest it gets. */
  short: boolean;
};

/**
 * Masters to a target by measurement: the mix with the master flat, then
 * the planned settings, then the gain corrected by what that measured (a
 * render each, four at most). Stops pushing when the limiter would be
 * squashing it: louder than that isn't cleaner, it's worse.
 */
export async function masterToTarget(render: (master: MasterFx) => Promise<{ channels: Float32Array[]; rate: number }>, target: LoudnessTarget): Promise<MasterResult> {
  const flat = await render({ low: 0, high: 0, glue: 0 });
  const before = measureMix(flat.channels, flat.rate);
  const plan = planMaster(before, target);
  const master: MasterFx = { ...plan.master };
  let after = before;
  let short = false;
  for (let pass = 0; pass < 3; pass++) {
    const out = await render(master);
    after = measureMix(out.channels, out.rate);
    const off = plan.aim - after.lufs;
    if (Math.abs(off) < 0.5) break;
    if (off > 0 && after.crestDb < SQUASHED_CREST) {
      short = true;
      break;
    }
    const next = round(clamp((master.gain ?? 0) + off, MIN_GAIN, MAX_GAIN), 0.1);
    if (Math.abs(next - (master.gain ?? 0)) < 0.05) {
      short = off > 0.5;
      break;
    }
    master.gain = next;
  }
  const notes = [...plan.notes, `gain ${(master.gain ?? 0) > 0 ? "+" : ""}${(master.gain ?? 0).toFixed(1)} dB`];
  return { master, before, after, target, notes, short };
}
