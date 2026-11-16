"use client";

import { useEffect } from "react";
import { parseLyrics, serializeLyrics, splitSongTitle } from "@/lib/lyrics";
import { activeSheet, useLyrics, type LyricSheet } from "./lyricsStore";
import { isTakeLane } from "./lyricsSources";
import { songKey } from "./mixSongs";
import { useStudioStore, type StudioLane } from "./studioStore";
import { anchorAt, clipKeys, placeAnchor, vocalShape, type LineAnchor } from "./vocalTime";

// The words stay on the singing. Each timed line is tied to the moment of
// the vocal it's sung on (lane, clip, seconds into the stem); when the
// vocals are moved, trimmed, split, stretched, sped up, cut up by AI Match
// or redone by an AI idea — or any of that is undone — every line goes to
// wherever its moment plays now. Lines with no vocal near them stay put.

/** Which vocal a sheet's words are of, best first: the song it was found for, a take for words written here. */
function rankFor(sheet: LyricSheet): (lane: StudioLane) => number {
  const own = sheet.source === "own" || sheet.source === "ai";
  return (lane) => {
    const take = isTakeLane(lane);
    if (own) return take ? 0 : 1;
    if (sheet.song) {
      const { song, artist } = splitSongTitle(lane.trackTitle);
      if (!take && songKey(song, artist) === sheet.song) return 0;
      return take ? 2 : 1;
    }
    return take ? 1 : 0;
  };
}

/** Moved by less than this, a line is left alone (times are kept to hundredths). */
const STILL = 0.004;

/** Starts following the vocals; returns the stop. */
export function startLyricsFollow(): () => void {
  // Anchors of each version of the sheet the follower wrote, so the next
  // edit starts from the exact moments, not from times rounded to 0.01 s
  // (a clip dragged for a second would otherwise drift its words).
  let anchors = new Map<string, (LineAnchor | null)[]>();
  let sheetId: string | null = null;

  return useStudioStore.subscribe((state, previous) => {
    if (state.lanes === previous.lanes) return;
    const shape = vocalShape(state.lanes);
    if (shape === vocalShape(previous.lanes)) return;
    const lyrics = useLyrics.getState();
    const sheet = activeSheet(lyrics);
    if (!sheet) return;
    if (sheet.id !== sheetId) {
      anchors = new Map();
      sheetId = sheet.id;
    }
    const rank = rankFor(sheet);
    const known = clipKeys(previous.lanes);
    const next = new Map<string, (LineAnchor | null)[]>();

    const carry = (text: string): string => {
      const lines = parseLyrics(text);
      if (!lines.some((l) => l.time !== null)) return text;
      const from = anchors.get(text) ?? lines.map((l) => (l.time === null ? null : anchorAt(previous.lanes, l.time, rank)));
      // A line whose clip is gone keeps its anchor, so undoing the delete brings it back onto the singing.
      const to = from.map((a) => (a ? (placeAnchor(state.lanes, a, known) ?? a) : null));
      let moved = false;
      const out = lines.map((line, i) => {
        const a = to[i];
        if (!a || line.time === null || Math.abs(a.time - line.time) < STILL) return line;
        moved = true;
        return { ...line, time: Math.max(0, Math.round(a.time * 100) / 100) };
      });
      const result = moved ? serializeLyrics(out) : text;
      next.set(result, to);
      return result;
    };

    const text = carry(sheet.text);
    const past = lyrics.past.map(carry);
    const future = lyrics.future.map(carry);
    anchors = next;
    const changed = text !== sheet.text || past.some((t, i) => t !== lyrics.past[i]) || future.some((t, i) => t !== lyrics.future[i]);
    if (changed) lyrics.follow(text, past, future);
  });
}

/** Keeps the open lyrics on the vocals while the Studio is open. */
export function useLyricsFollowVocals() {
  useEffect(() => startLyricsFollow(), []);
}
