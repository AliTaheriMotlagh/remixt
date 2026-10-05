// The demo songs as DJ tracks (plain data: no audio).

import { DEMO_SONGS, type DemoSongMeta } from "../demoSongDefs";
import type { TrackInfo } from "./djTypes";

export function trackInfoFromMeta(meta: DemoSongMeta): TrackInfo {
  return {
    id: meta.id,
    title: meta.title,
    artist: meta.artist,
    genre: meta.genre,
    bpm: meta.bpm,
    key: meta.key,
    camelot: meta.camelot,
    duration: meta.durationSec,
    firstBeat: 0,
    bars: meta.bars,
    sections: meta.sections.map((s) => ({ name: s.name, startBar: s.startBar, bars: s.bars, energy: s.energy })),
    source: "demo",
    layout: "four",
  };
}

export const DJ_TRACKS: TrackInfo[] = DEMO_SONGS.map(trackInfoFromMeta);

export function djTrackInfo(id: string): TrackInfo | undefined {
  return DJ_TRACKS.find((t) => t.id === id);
}
