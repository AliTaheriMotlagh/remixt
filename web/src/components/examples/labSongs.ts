import type { DemoSongMeta } from "@/lib/client/demoSongs";
import { alignExcerpt, firstStrongPhrase, libraryId, sungBars } from "@/lib/client/examplesLibrary";
import type { GridSong } from "@/lib/client/examplesMatch";
import type { LoadedTrack } from "./libraryTracks";

/** Longest excerpt the Match step plays from either song, in that song's bars. */
export const EXCERPT_BARS = 8;

/**
 * A song as the Match step sees it, whether synthesised or from the
 * library: tempo and key, plus the excerpt it loops and which of that
 * excerpt's bars are sung (from `chorusBar`).
 */
export type LabSong = GridSong & {
  id: string;
  artist: string;
  source: "demo" | "library";
  /** Seconds into the song where the excerpt starts, on a bar line. */
  excerptStart: number;
};

export function demoLabSong(meta: DemoSongMeta): LabSong {
  return { ...meta, source: "demo", excerptStart: meta.chorusBar * (240 / meta.bpm) };
}

/**
 * A library song: a vocal's excerpt starts on the bar line its first real
 * line is sung in (a pickup starts the bar before); a beat's on the first
 * bar it plays at full strength.
 */
export function libraryLabSong(track: LoadedTrack, role: "vocal" | "beat"): LabSong {
  const { song, barLines, barSec, duration, phrases } = track;
  const main = barLines[track.mainBar] ?? 0;
  const target = role === "vocal" ? (firstStrongPhrase(phrases, barSec)?.start ?? main) : main;
  const excerpt = alignExcerpt({ barLines, barSec, target, duration, bars: EXCERPT_BARS });
  return {
    id: libraryId(song.trackId),
    title: song.title,
    artist: song.artist,
    bpm: track.bpm,
    key: track.key,
    camelot: track.camelot,
    chorusBar: 0,
    vocalBars: sungBars(phrases, excerpt.start, barSec, EXCERPT_BARS),
    source: "library",
    excerptStart: excerpt.start,
  };
}
