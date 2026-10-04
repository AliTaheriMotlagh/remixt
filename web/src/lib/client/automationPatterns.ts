import type { AutoPoint } from "./studioStore";

// Rhythmic automation, drawn for you: the moves beatmakers make by hand
// on a volume line, worked out from the tempo.
//
//   gate — the sound chopped on and off in a rhythm (a "trance gate")
//   pump — a dip on every beat that swells back up, the sidechain feel
//          of dance music, without needing a kick to trigger it
//
// Pure: they take and return point lists, so the lane menu and the AI
// producer share them and they can be tested without a browser.

/** Most points one automation line may hold (the save format allows this many). */
export const MAX_AUTOMATION_POINTS = 4000;

const EDGE = 0.004;

/** Whatever `points` had outside `start`..`end`, with `inside` in between, held level at the joins. */
export function spliceAutomation(points: AutoPoint[] | undefined, start: number, end: number, inside: AutoPoint[]): AutoPoint[] {
  const existing = points ?? [];
  const valueAt = (t: number) => {
    if (!existing.length) return 1;
    if (t <= existing[0].t) return existing[0].v;
    for (let i = 1; i < existing.length; i++) {
      const a = existing[i - 1];
      const b = existing[i];
      if (t <= b.t) return b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : b.v;
    }
    return existing[existing.length - 1].v;
  };
  const before = existing.filter((p) => p.t < start - EDGE);
  const after = existing.filter((p) => p.t > end + EDGE);
  const out = [
    ...before,
    ...(start > EDGE ? [{ t: Math.max(0, start - EDGE), v: valueAt(start) }] : []),
    ...inside,
    { t: end + EDGE, v: valueAt(end) },
    ...after,
  ];
  return out.slice(0, MAX_AUTOMATION_POINTS).map((p) => ({ t: Math.max(0, p.t), v: Math.min(1, Math.max(0, p.v)) }));
}

/**
 * On/off chopping from `start` to `end`: each `stepSeconds` the sound is on
 * for `duty` of the step, then down to `floor` (0 = silent).
 */
export function gatePattern(start: number, end: number, stepSeconds: number, { duty = 0.5, floor = 0 } = {}): AutoPoint[] {
  const points: AutoPoint[] = [];
  if (!(stepSeconds > 0.02) || !(end > start)) return points;
  const on = Math.min(0.95, Math.max(0.05, duty)) * stepSeconds;
  for (let t = start; t < end - EDGE && points.length < MAX_AUTOMATION_POINTS - 8; t += stepSeconds) {
    const off = Math.min(end, t + on);
    points.push({ t, v: 1 }, { t: off - EDGE, v: 1 }, { t: off, v: floor }, { t: Math.min(end, t + stepSeconds) - EDGE, v: floor });
  }
  return points;
}

/**
 * Sidechain-style pumping from `start` to `end`: on every beat the level
 * drops to `1 - depth` and swells back over `recover` of the beat.
 */
export function pumpPattern(start: number, end: number, beatSeconds: number, { depth = 0.6, recover = 0.6 } = {}): AutoPoint[] {
  const points: AutoPoint[] = [];
  if (!(beatSeconds > 0.05) || !(end > start)) return points;
  const low = 1 - Math.min(0.95, Math.max(0.05, depth));
  const back = Math.min(0.95, Math.max(0.2, recover)) * beatSeconds;
  for (let t = start; t < end - EDGE && points.length < MAX_AUTOMATION_POINTS - 8; t += beatSeconds) {
    // A quick dip and a curved-ish swell: halfway up after a third of the way.
    points.push({ t, v: low }, { t: t + back / 3, v: low + (1 - low) * 0.5 }, { t: Math.min(end, t + back), v: 1 });
  }
  return points;
}
