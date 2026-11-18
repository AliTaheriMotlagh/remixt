// The radio visualizer's bars (0–1 each), worked out in two ways. Pure, so
// they're tested and the drawing only has to draw.
//
// - From what's heard (an analyser's frequency data): log-spaced, so the
//   bass gets as much room as the treble — shown late by the sound's path
//   to the speaker (`delayed`), so the bars move with what's heard, not
//   ahead of it (Bluetooth headphones are 0.15–0.3 s behind).
// - From the song itself (its waveform, for browsers that can't listen in:
//   Safari, iPhones): its loudness a couple of seconds either side of where
//   the station is, the middle being now — exactly in time on every device.

/** `data` (frequency bins, 0–255) as `count` log-spaced bars. */
export function frequencyBars(data: ArrayLike<number>, count: number): Float32Array {
  const out = new Float32Array(count);
  const n = data.length;
  for (let i = 0; i < count; i++) {
    const lo = Math.floor(Math.pow(n * 0.7, i / count));
    const hi = Math.max(lo + 1, Math.floor(Math.pow(n * 0.7, (i + 1) / count)));
    let peak = 0;
    for (let b = lo; b < hi && b < n; b++) peak = Math.max(peak, data[b]);
    out[i] = peak / 255;
  }
  return out;
}

/** The newest frame at least `lagMs` old (frames: oldest first, `t` in ms); the oldest when none is that old yet. */
export function delayed<T>(frames: { t: number; v: T }[], now: number, lagMs: number): T | null {
  if (!frames.length) return null;
  const target = now - lagMs;
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].t <= target) return frames[i].v;
  return frames[0].v;
}

/** A loudness curve: `values[i]` at `start + i * step` seconds. */
export type Curve = { values: ArrayLike<number>; start: number; step: number };

function at(curve: Curve, t: number): number {
  const x = (t - curve.start) / curve.step;
  if (x < 0 || x > curve.values.length - 1) return 0;
  const i = Math.floor(x);
  const f = x - i;
  return (curve.values[i] ?? 0) * (1 - f) + (curve.values[i + 1] ?? curve.values[i] ?? 0) * f;
}

/**
 * The song's loudness from `seconds / 2` before `position` to as far after
 * it, as `count` bars — the middle bar is now. Bars further from now are
 * drawn a little lower, so the eye finds the middle.
 */
export function loudnessWindow(curve: Curve, position: number, count: number, seconds = 4): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const off = ((i + 0.5) / count - 0.5) * seconds;
    const near = 1 - Math.min(1, Math.abs(off) / (seconds / 2));
    out[i] = Math.max(0, Math.min(1, at(curve, position + off))) * (0.55 + 0.45 * near);
  }
  return out;
}
