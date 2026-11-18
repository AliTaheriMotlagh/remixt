"use client";

// The words a vocal sings, for building a new song from the mix
// (newSongIdea): its song's timed lyric sheet, read back to seconds of the
// vocal's own recording — so a section can be told a chorus (its lines come
// back) and shown with its first line. Only for a vocal still playing as
// recorded (no clips): once cut up, the sheet's times aren't the stem's.

import { isSung, parseLyrics, splitSongTitle } from "@/lib/lyrics";
import { useLyrics } from "./lyricsStore";
import { songKey } from "./mixSongs";
import type { StudioLane } from "./studioStore";

export type StemLine = { at: number; text: string };

/** The lines of `lane`'s song, at seconds into its stem; empty when there's no timed sheet for it. */
export function stemLyrics(lane: StudioLane): StemLine[] {
  if (lane.clips?.length) return [];
  const { song, artist } = splitSongTitle(lane.trackTitle);
  const key = songKey(song || lane.trackTitle, artist);
  const sheet = useLyrics.getState().sheets.find((s) => s.song === key);
  if (!sheet) return [];
  return parseLyrics(sheet.text)
    .filter((l): l is { time: number; text: string } => l.time !== null && isSung(l))
    .map((l) => ({ at: (l.time - lane.offsetSeconds) * lane.tempoRatio, text: l.text }))
    .filter((l) => l.at >= 0);
}

/** The same line however it's written: case, punctuation and spaces aside. */
export function lineKey(text: string) {
  return text.toLowerCase().replace(/[\p{P}\p{S}]/gu, "").replace(/\s+/g, " ").trim();
}
