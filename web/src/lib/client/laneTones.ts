"use client";

import { audioEngine } from "./audioEngine";
import { measureChannels, type Tone } from "./mixEngineer";
import type { StudioLane } from "./studioStore";

// Each lane's stem measured at full rate for the mix engineer (see
// mixEngineer.ts): its bands, loudness, peak and crest. A stem is the
// same audio whatever lane plays it, so it's measured once per visit,
// a lane at a time with a breath between, so the page stays responsive.

const MAX_KEPT = 48;
const kept = new Map<string, Promise<Tone | null>>();

/** A minute's measuring holds the page for ~50 ms on a phone: long stems are read in two-minute stretches either side of the middle. */
const MAX_SECONDS = 240;

function measure(buffer: AudioBuffer): Tone {
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c));
  if (buffer.duration <= MAX_SECONDS) return measureChannels(channels, rate);
  const length = Math.round(MAX_SECONDS * rate);
  const from = Math.round((buffer.length - length) / 2);
  return { ...measureChannels(channels.map((c) => c.subarray(from, from + length)), rate), seconds: buffer.duration };
}

const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

export function laneTone(lane: StudioLane): Promise<Tone | null> {
  let found = kept.get(lane.stemId);
  if (found) {
    // Most recently used last.
    kept.delete(lane.stemId);
    kept.set(lane.stemId, found);
    return found;
  }
  found = (async () => {
    await audioEngine.ensureLane(lane.laneId, lane.stemId);
    const buffer = await audioEngine.getRawBuffer(lane.laneId);
    if (!buffer) return null;
    await breathe();
    return measure(buffer);
  })().catch(() => null);
  kept.set(lane.stemId, found);
  while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
  // A failed measurement is tried again next time.
  void found.then((tone) => {
    if (!tone && kept.get(lane.stemId) === found) kept.delete(lane.stemId);
  });
  return found;
}

/** Every lane's tone, by stem id (lanes that couldn't be measured are left out). */
export async function laneTones(lanes: StudioLane[]): Promise<Map<string, Tone>> {
  const tones = new Map<string, Tone>();
  for (const lane of lanes) {
    if (tones.has(lane.stemId)) continue;
    const tone = await laneTone(lane);
    if (tone) tones.set(lane.stemId, tone);
    await breathe();
  }
  return tones;
}
