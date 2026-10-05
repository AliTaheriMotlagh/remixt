"use client";

// Loads a demo song as a DJ track: its four stems plus fine peaks for the
// scrolling waveform and the overview.

import { DEMO_STEMS, demoSongMeta, peaksOf, releaseDemoSong, renderDemoSong, type DemoStem } from "../demoSongs";
import { trackInfoFromMeta } from "./djTrackInfo";
import type { TrackInfo } from "./djTypes";

export const PEAK_RATE = 30;

export type LoadedTrack = {
  info: TrackInfo;
  stems: Record<DemoStem, AudioBuffer>;
  /** Max |sample| per stem, PEAK_RATE bins per second. */
  peaks: Record<DemoStem, Float32Array>;
  /** The loudest of the stems at each bin, for the overview. */
  overview: Float32Array;
};

// A loaded track is ~85 MB of stems, so only the two most recent are kept ready
// (the decks hold on to what they've loaded).
const MAX_READY = 2;
const cache = new Map<string, Promise<LoadedTrack>>();

export function loadDjTrack(id: string): Promise<LoadedTrack> {
  const cached = cache.get(id);
  if (cached) {
    cache.delete(id);
    cache.set(id, cached);
    return cached;
  }
  const promise = (async () => {
    const meta = demoSongMeta(id);
    if (!meta) throw new Error(`Unknown track: ${id}`);
    const song = await renderDemoSong(id);
    const bins = Math.ceil(song.stems.drums.duration * PEAK_RATE);
    const peaks = {} as Record<DemoStem, Float32Array>;
    for (const s of DEMO_STEMS) peaks[s] = peaksOf(song.stems[s], bins);
    const overview = new Float32Array(400);
    for (let i = 0; i < 400; i++) overview[i] = song.peaks.mix[Math.min(799, Math.floor(i * 2))];
    // The DJ keeps the stems; the shared cache doesn't need to hold them too.
    releaseDemoSong(id);
    return { info: trackInfoFromMeta(meta), stems: song.stems, peaks, overview };
  })();
  cache.set(id, promise);
  promise.catch(() => cache.delete(id));
  while (cache.size > MAX_READY) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || oldest === id) break;
    cache.delete(oldest);
  }
  return promise;
}
