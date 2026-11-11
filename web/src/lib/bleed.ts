// Beat bleed detection for the vocal recorder: while a take is sung we
// sample the mic's envelope and the mix's envelope side by side, and the
// correlation between them says how much of the beat is leaking into the
// microphone (loud speakers instead of headphones). Voice and beat are
// independent signals, so a quiet, well-sealed mic correlates with the mix
// at about zero; bleed tracks it almost one to one. Everything here is
// pure (no DOM, no audio), so the recorder and the tests share it.

/** Pearson correlation of two equally long envelope windows, 0 when either is flat or they're too short. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let num = 0;
  let devA = 0;
  let devB = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - meanA;
    const y = b[i] - meanB;
    num += x * y;
    devA += x * x;
    devB += y * y;
  }
  // A flat window (silence, or a steady hum) has nothing to correlate.
  if (devA <= 1e-10 || devB <= 1e-10) return 0;
  return num / Math.sqrt(devA * devB);
}

/**
 * High-frequency energy of a block of samples: the RMS of consecutive
 * sample differences, roughly a high-passed level. Drum transients carry
 * most of a beat's high frequencies and a voice carries little, so
 * correlating these levels beats correlating raw loudness — a singer
 * rapping right on the beat doesn't read as bleed.
 */
export function highFrequencyEnergy(samples: Float32Array | number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 1; i < samples.length; i += 2) {
    const d = samples[i] - samples[i - 1];
    sum += d * d;
    count++;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

/** Roughly how much of the beat is in the mic, 0..1, from two envelope windows. */
export function bleedScore(micEnvelope: number[], mixEnvelope: number[]): number {
  return Math.max(0, Math.min(1, correlation(micEnvelope, mixEnvelope)));
}

/**
 * Bleed with the delay found: the beat reaches the mic late — out of the
 * speakers (Bluetooth adds a lot), across the room and back in — so the
 * mic's envelope is compared with the mix's shifted by every delay up to
 * `maxLag` steps, and the best match wins. Both windows must be sampled in
 * step (the same block of audio for each value), newest last.
 */
export function bleedWithLag(micEnvelope: number[], mixEnvelope: number[], maxLag: number): { score: number; lag: number } {
  const n = Math.min(micEnvelope.length, mixEnvelope.length);
  let best = { score: 0, lag: 0 };
  // Needs a couple of seconds of overlap to mean anything.
  for (let lag = 0; lag <= maxLag && n - lag >= 16; lag++) {
    const mic = micEnvelope.slice(micEnvelope.length - n + lag);
    const mix = mixEnvelope.slice(mixEnvelope.length - n, mixEnvelope.length - lag);
    const score = bleedScore(mic, mix);
    if (score > best.score) best = { score, lag };
  }
  return best;
}

export type TakeCheck = {
  /** The loudest sample, 0..1. */
  peak: number;
  /** Seconds of samples at full scale: the singer was too close or too loud. */
  clippedSeconds: number;
  /** The take is so quiet it'll need lots of gain (and its noise with it). */
  quiet: boolean;
  /** The take hit full scale long enough to hear. */
  clipped: boolean;
};

/** What a take's levels say about it, for the review after recording. */
export function checkTake(samples: Float32Array | number[], sampleRate: number): TakeCheck {
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
    if (v >= 0.985) clipped++;
  }
  const clippedSeconds = clipped / sampleRate;
  // A handful of full-scale samples is inaudible; tens of milliseconds is a crackle.
  return { peak, clippedSeconds, clipped: clippedSeconds >= 0.01, quiet: peak < 0.08 };
}
