"use client";

// Loads a demo song as a DJ track: its four stems plus fine peaks for the
// stem waveform, frequency bands for the coloured waveform, and the
// overview. Library songs load through djLibraryTracks.ts into the same shape.

import { DEMO_STEMS, demoSongMeta, peaksOf, releaseDemoSong, renderDemoSong, type DemoStem } from "../demoSongs";
import { trackInfoFromMeta } from "./djTrackInfo";
import type { StemSlot, TrackInfo } from "./djTypes";
import { trackBands, type Bands } from "./djWaveform";

export const PEAK_RATE = 30;

export type LoadedTrack = {
  info: TrackInfo;
  /** The stems this track has: the four demo stems, or a library song's (four, or vocal + beat). */
  stems: Partial<Record<StemSlot, AudioBuffer>>;
  /** Max |sample| per stem, PEAK_RATE bins per second. */
  peaks: Partial<Record<StemSlot, Float32Array>>;
  /** The loudest of the stems at each bin, for the overview. */
  overview: Float32Array;
  /** Low/mid/high per stem, BAND_RATE slices per second (absent in tests). */
  bands?: Partial<Record<StemSlot, Bands>>;
  /** RMS of the loud parts, dBFS: what auto gain corrects. */
  loudnessDb?: number;
  /** For a library song, the stems' ids (so their decoded audio can be let go). */
  stemIds?: string[];
};

/** Overview strip from per-stem peaks: the loudest stem per bin, 400 bins. */
export function overviewOf(peaks: Partial<Record<StemSlot, Float32Array>>) {
  const out = new Float32Array(400);
  for (const p of Object.values(peaks)) {
    if (!p || p.length === 0) continue;
    for (let i = 0; i < 400; i++) {
      const from = Math.floor((i / 400) * p.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / 400) * p.length));
      let m = 0;
      for (let j = from; j < to && j < p.length; j++) if (p[j] > m) m = p[j];
      if (m > out[i]) out[i] = m;
    }
  }
  return out;
}

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
    const stems = song.stems;
    // The DJ keeps the stems; the shared cache doesn't need to hold them too.
    releaseDemoSong(id);
    const info = trackInfoFromMeta(meta);
    const { bands, loudnessDb } = await trackBands<StemSlot>(stems, info.duration);
    return { info, stems, peaks, overview, bands, loudnessDb };
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
