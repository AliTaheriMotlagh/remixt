"use client";

import type { LaneChain } from "./audioGraph";
import { clipSpan, clipsOf, getAudibleLaneIds, type AutoPoint, type StudioLane } from "./studioStore";

// Things that change a lane's level or tone over time, worked out ahead
// and handed to the audio clock as one curve per parameter:
//
// - automation the user drew (volume, and a low-pass filter sweep), and
// - sidechain ducking: a lane with `fx.duck` dips while the vocals are
//   loud, so the beat makes room for the voice. Web Audio has no
//   sidechain input, so the vocals' loudness comes from their stored
//   waveform peaks instead of being measured live.

/** Curve points per second — smooth to the ear, cheap to schedule. */
const RATE = 40;

/** Automation value at timeline `t`: linear between points, held before the first and after the last. */
export function automationValue(points: AutoPoint[], t: number): number {
  if (points.length === 0) return 1;
  if (t <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (t <= b.t) {
      const a = points[i - 1];
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return a.v + (b.v - a.v) * f;
    }
  }
  return points[points.length - 1].v;
}

/** A 0..1 filter automation value as a cutoff: 20 Hz closed … 20 kHz open, even to the ear. */
export function filterFrequency(v: number) {
  return 20 * Math.pow(1000, Math.min(1, Math.max(0, v)));
}

/** How loud the vocals are at timeline `t`, 0..1, from their stored peaks. */
function vocalLevel(vocals: StudioLane[], t: number) {
  let level = 0;
  for (const lane of vocals) {
    if (!lane.peaks.length || !(lane.originalDuration > 0)) continue;
    const perSecond = lane.peaks.length / lane.originalDuration;
    for (const clip of clipsOf(lane)) {
      const start = lane.offsetSeconds + clip.at / lane.tempoRatio;
      const length = clipSpan(clip) / lane.tempoRatio;
      if (t < start || t > start + length) continue;
      const into = (t - start) * lane.tempoRatio * (clip.stretch ?? 1);
      const source = clip.reverse ? clip.to - into : clip.from + into;
      const peak = lane.peaks[Math.min(lane.peaks.length - 1, Math.max(0, Math.floor(source * perSecond)))] ?? 0;
      level = Math.max(level, peak * Math.min(1, lane.volume));
    }
  }
  return level;
}

/** The ducking gain at `t`: 1 with no vocal, down to about −9 dB (at full depth) under a loud one. */
function duckValue(depth: number, vocals: StudioLane[], t: number) {
  const level = vocalLevel(vocals, t);
  const amount = Math.min(1, Math.max(0, (level - 0.06) / 0.35));
  return 1 - depth * 0.65 * amount;
}

function curve(from: number, length: number, value: (t: number) => number) {
  const count = Math.max(2, Math.ceil(length * RATE) + 1);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = value(from + (i / (count - 1)) * length);
  return out;
}

function schedule(param: AudioParam, when: number, from: number, length: number, value: (t: number) => number) {
  param.cancelScheduledValues(0);
  if (length <= 0.05) {
    param.setValueAtTime(value(from), when);
    return;
  }
  param.setValueCurveAtTime(curve(from, length, value), when, length);
}

/**
 * Schedules a lane's automation and ducking from timeline position
 * `playhead`, which sounds at audio-clock time `when`, for `length` seconds.
 * `lanes` is the whole project (ducking listens to the vocal lanes).
 */
export function scheduleModulation({
  chain,
  lane,
  lanes,
  when,
  playhead,
  length,
}: {
  chain: LaneChain;
  lane: StudioLane;
  lanes: StudioLane[];
  when: number;
  playhead: number;
  length: number;
}) {
  const volume = lane.automation?.volume;
  if (volume?.length) schedule(chain.autoGain.gain, when, playhead, length, (t) => automationValue(volume, t));
  else {
    chain.autoGain.gain.cancelScheduledValues(0);
    chain.autoGain.gain.setValueAtTime(1, when);
  }

  const filter = lane.automation?.filter;
  if (filter?.length) {
    schedule(chain.autoFilter.frequency, when, playhead, length, (t) => filterFrequency(automationValue(filter, t)));
  } else {
    chain.autoFilter.frequency.cancelScheduledValues(0);
    chain.autoFilter.frequency.setValueAtTime(20000, when);
  }

  const depth = lane.fx.duck ?? 0;
  const audible = getAudibleLaneIds(lanes);
  const vocals = lanes.filter((l) => l.kind === "vocals" && l.laneId !== lane.laneId && audible.has(l.laneId));
  if (depth > 0 && vocals.length) schedule(chain.duckGain.gain, when, playhead, length, (t) => duckValue(depth, vocals, t));
  else {
    chain.duckGain.gain.cancelScheduledValues(0);
    chain.duckGain.gain.setValueAtTime(1, when);
  }
}
