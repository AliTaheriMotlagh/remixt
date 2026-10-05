// Frequency-coloured waveforms, worked out once per track: for every stem,
// how much low (kick, bass), mid (voice, keys) and high (hats, air) energy
// there is in each slice of time. The deck waveforms colour by band like
// club software does, and leave out a stem's share when it's killed. Also
// the track's loudness, for auto gain. The maths is pure (tested); only
// `trackBands` touches AudioBuffers.

/** Waveform slices per second of track. */
export const BAND_RATE = 100;

export type Bands = { low: Float32Array; mid: Float32Array; high: Float32Array };

/** Sample rate the bands are measured at: plenty for a "high" band above 2.5 kHz. */
const WORK_RATE = 11025;

/** Mono at about WORK_RATE by averaging (a box filter: crude, but fine for drawing). */
export function decimateMono(left: Float32Array, right: Float32Array, sampleRate: number) {
  const factor = Math.max(1, Math.round(sampleRate / WORK_RATE));
  const n = Math.floor(left.length / factor);
  const out = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++, j++) s += left[j] + right[j];
    out[i] = s / (2 * factor);
  }
  return { mono: out, rate: sampleRate / factor };
}

/** Biquad coefficients (RBJ cookbook), Butterworth Q. */
function biquad(type: "lowpass" | "highpass", freq: number, rate: number) {
  const w = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b1 = type === "lowpass" ? 1 - cos : -(1 + cos);
  const b0 = b1 / (type === "lowpass" ? 2 : -2);
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/**
 * Peak amplitude per slice in three bands (below ~200 Hz, 200 Hz–2.5 kHz,
 * above 2.5 kHz) of a mono signal, plus the slice RMS (for loudness).
 */
export function computeBands(mono: Float32Array, rate: number, slices: number): Bands & { rms: Float32Array } {
  const low = new Float32Array(slices);
  const mid = new Float32Array(slices);
  const high = new Float32Array(slices);
  const rms = new Float32Array(slices);
  const lp = biquad("lowpass", 200, rate);
  const hp = biquad("highpass", 2500, rate);
  let l1 = 0, l2 = 0, ly1 = 0, ly2 = 0;
  let h1 = 0, h2 = 0, hy1 = 0, hy2 = 0;
  const per = mono.length / slices;
  for (let s = 0; s < slices; s++) {
    const from = Math.floor(s * per);
    const to = Math.min(mono.length, Math.floor((s + 1) * per));
    let pl = 0, pm = 0, ph = 0, sq = 0;
    for (let i = from; i < to; i++) {
      const x = mono[i];
      const yl = lp.b0 * x + lp.b1 * l1 + lp.b2 * l2 - lp.a1 * ly1 - lp.a2 * ly2;
      l2 = l1; l1 = x; ly2 = ly1; ly1 = yl;
      const yh = hp.b0 * x + hp.b1 * h1 + hp.b2 * h2 - hp.a1 * hy1 - hp.a2 * hy2;
      h2 = h1; h1 = x; hy2 = hy1; hy1 = yh;
      const ym = x - yl - yh;
      const al = Math.abs(yl), am = Math.abs(ym), ah = Math.abs(yh);
      if (al > pl) pl = al;
      if (am > pm) pm = am;
      if (ah > ph) ph = ah;
      sq += x * x;
    }
    low[s] = pl;
    mid[s] = pm;
    high[s] = ph;
    rms[s] = to > from ? Math.sqrt(sq / (to - from)) : 0;
  }
  return { low, mid, high, rms };
}

/**
 * Loudness of the loud parts, in dBFS, from per-slice RMS of the stems
 * (summed as if uncorrelated): the mean power of slices within 20 dB of
 * the loudest stretch, so intros and silence don't drag it down.
 */
export function loudnessDb(rmsPerStem: Float32Array[]) {
  if (rmsPerStem.length === 0) return -Infinity;
  const n = Math.min(...rmsPerStem.map((r) => r.length));
  const power = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const r of rmsPerStem) p += r[i] * r[i];
    power[i] = p;
    if (p > max) max = p;
  }
  if (max <= 0) return -Infinity;
  const gate = max / 100;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (power[i] >= gate) {
      sum += power[i];
      count++;
    }
  }
  return 10 * Math.log10(sum / Math.max(1, count));
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Bands for each stem of a track, and its loudness. Yields between stems so the page stays responsive. */
export async function trackBands<K extends string>(stems: Partial<Record<K, AudioBuffer>>, duration: number) {
  const slices = Math.max(1, Math.ceil(duration * BAND_RATE));
  const bands = {} as Partial<Record<K, Bands>>;
  const rms: Float32Array[] = [];
  for (const [k, buf] of Object.entries(stems) as [K, AudioBuffer | undefined][]) {
    if (!buf) continue;
    const left = buf.getChannelData(0);
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
    const { mono, rate } = decimateMono(left, right, buf.sampleRate);
    // Slices cover the whole track; a shorter stem just ends early.
    const own = Math.min(slices, Math.max(1, Math.round((mono.length / rate) * BAND_RATE)));
    const b = computeBands(mono, rate, own);
    const pad = (a: Float32Array) => {
      if (a.length === slices) return a;
      const out = new Float32Array(slices);
      out.set(a.subarray(0, slices));
      return out;
    };
    bands[k] = { low: pad(b.low), mid: pad(b.mid), high: pad(b.high) };
    rms.push(pad(b.rms));
    await yieldToUi();
  }
  return { bands, loudnessDb: loudnessDb(rms) };
}
