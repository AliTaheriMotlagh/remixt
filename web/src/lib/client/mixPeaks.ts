"use client";

import { clipSpan, clipsOf, getAudibleLaneIds, type StudioLane } from "./studioStore";

/**
 * An approximate waveform of the whole mix, from each lane's stored peaks
 * (no audio needs to load): every audible lane's level at each point of
 * the timeline — through its offset, tempo and clips — summed, then
 * scaled to 0..1. Good enough to see the song's shape and scrub it.
 */
export function mixPeaks(lanes: StudioLane[], duration: number, points = 400): number[] {
  if (!(duration > 0) || lanes.length === 0) return [];
  const audible = getAudibleLaneIds(lanes);
  const out = new Array<number>(points).fill(0);
  for (const lane of lanes) {
    if (!audible.has(lane.laneId) || !lane.peaks.length || !(lane.originalDuration > 0)) continue;
    const perSecond = lane.peaks.length / lane.originalDuration;
    for (const clip of clipsOf(lane)) {
      const start = lane.offsetSeconds + clip.at / lane.tempoRatio;
      const length = clipSpan(clip) / lane.tempoRatio;
      const first = Math.max(0, Math.floor((start / duration) * points));
      const last = Math.min(points - 1, Math.ceil(((start + length) / duration) * points));
      for (let i = first; i <= last; i++) {
        const t = (i / points) * duration;
        if (t < start || t > start + length) continue;
        // Timeline → the stem's own seconds.
        const source = clip.from + (t - start) * lane.tempoRatio * (clip.stretch ?? 1);
        const peak = lane.peaks[Math.min(lane.peaks.length - 1, Math.floor(source * perSecond))] ?? 0;
        out[i] += peak * lane.volume;
      }
    }
  }
  const top = Math.max(...out) || 1;
  return out.map((v) => Math.round((v / top) * 1000) / 1000);
}
