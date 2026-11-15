"use client";

import { useEffect, useMemo, useRef } from "react";
import { splitSongTitle } from "@/lib/lyrics";
import { matchScore, normalizePersian } from "@/lib/lyricsSearch";
import { autoFindLyrics } from "./lyricsSources";
import { activeSheet, useLyrics, type LyricSheet } from "./lyricsStore";
import { useStudioStore, type StudioLane } from "./studioStore";
import { useStudioView } from "./studioView";

// The songs playing in the mix, by name — what lyrics are looked up for —
// and the lyrics following them: found lyrics belong to the song they were
// found for, so when the mix's song changes, the lyrics change with it
// (to the ones kept for the new song, or the picker, looking it up).
// Lyrics the singer wrote (or wrote with the AI) are theirs to keep over
// any beat, and are never swapped.

/** A song playing in the mix, to look its lyrics up. */
export type MixSong = { key: string; song: string; artist: string; lane: StudioLane };

/** The same song whatever the script's quirks: Arabic letter forms, ZWNJ, case. */
export function songKey(song: string, artist: string) {
  return normalizePersian(`${artist} ${song}`).toLowerCase();
}

/** The songs in the mix by their titles — never a recorded take, never who uploaded it. */
export function mixSongsOf(lanes: StudioLane[]): MixSong[] {
  const out: MixSong[] = [];
  for (const lane of lanes) {
    if (lane.artistName === "You" || /^studio vocal|— take \d+/i.test(lane.trackTitle)) continue;
    const { song, artist } = splitSongTitle(lane.trackTitle);
    if (!song) continue;
    const key = songKey(song, artist);
    if (out.some((m) => m.key === key)) continue;
    out.push({ key, song, artist, lane });
  }
  return out.slice(0, 4);
}

export function useMixSongs(): MixSong[] {
  const lanes = useStudioStore((s) => s.lanes);
  return useMemo(() => mixSongsOf(lanes), [lanes]);
}

/** The mix song a found sheet called `title` by `artist` is the words of, if any. */
export function mixSongFor(title: string, artist: string, songs: MixSong[]): MixSong | null {
  let best: MixSong | null = null;
  let bestScore = 0.55;
  for (const m of songs) {
    const score = Math.max(matchScore(`${artist} ${title}`, m.song, m.artist), matchScore(`${m.artist} ${m.song}`, title, artist));
    if (score >= bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** Whether a sheet goes with a song in the mix (see LyricSheet.song); null for the singer's own words (and sheets from before sheets knew their song), which go with anything. */
export function sheetFitsMix(sheet: LyricSheet, songs: MixSong[]): boolean | null {
  if (sheet.source === "own" || sheet.source === "ai") return null;
  const keys = songs.map((m) => m.key);
  if (sheet.song) return keys.includes(sheet.song) || !!mixSongFor(sheet.title, sheet.artist, songs);
  // Found for no song in particular: it goes with the mix it was picked over.
  if (sheet.mix?.length) return sheet.mix.some((k) => keys.includes(k)) || !!mixSongFor(sheet.title, sheet.artist, songs);
  // Kept from before sheets knew their song: left as it is, open over any mix.
  return null;
}

/**
 * Keeps the open lyrics with the song in the mix. When the mix's songs
 * change: a found sheet for a song that's gone is put away, and the one
 * kept for the new song opened — or, with none kept, the picker opens on
 * the new song, looking it up. Nothing changes during a take.
 */
export function useLyricsFollowMix() {
  const songs = useMixSongs();
  const keys = songs.map((m) => m.key).join("\n");
  const before = useRef<string | null>(null);

  useEffect(() => {
    const was = before.current;
    before.current = keys;
    if (was === keys) return;
    const lyrics = useLyrics.getState();
    if (!lyrics.loaded) lyrics.load();
    const state = useLyrics.getState();
    if (state.take !== "idle") return;
    const sheet = activeSheet(state);
    const notify = useStudioView.getState().notify;
    if (!songs.length) {
      // The mix emptied (a new project): found lyrics go with the song that was in it.
      if (was && sheet && sheetFitsMix(sheet, mixSongsOfKeys(was)) === true) state.select(null);
      return;
    }
    if (sheet && sheetFitsMix(sheet, songs) !== false) return;
    // Sheets are newest first: the last one used for this song.
    const kept = state.sheets.find((s) => s.source !== "own" && s.source !== "ai" && s.song && songs.some((m) => m.key === s.song));
    if (kept) {
      state.select(kept.id);
      if (sheet) notify(`Lyrics switched to “${kept.title}” — the song in your mix`);
      return;
    }
    if (sheet) state.select(null);
    // None kept: found on their own — timed, and lined up with the beat or vocal they're the words of.
    void findForMix(songs, !!sheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `keys` stands for `songs`
  }, [keys]);
}

/** Songs already looked up this visit, so one the library doesn't have isn't searched for on every change. */
const tried = new Set<string>();

/**
 * The first song in the mix that the library has lyrics for, opened as a
 * sheet — timed where it can be. The picker opens on the song when none is
 * found (and the booth's lyrics were showing something to replace).
 */
async function findForMix(songs: MixSong[], replacing: boolean) {
  const lyrics = useLyrics.getState();
  if (lyrics.finding) return;
  const notify = useStudioView.getState().notify;
  for (const song of songs) {
    if (tried.has(song.key)) continue;
    tried.add(song.key);
    lyrics.setFinding({ song: song.song, step: "Searching the lyrics library…" });
    const found = await autoFindLyrics(song, (step) => useLyrics.getState().setFinding({ song: song.song, step })).catch(() => null);
    useLyrics.getState().setFinding(null);
    const now = useLyrics.getState();
    // Something else got opened meanwhile (picked by hand, a take started), or the song left the mix: theirs wins.
    if (now.activeId || now.take !== "idle" || !mixSongsOf(useStudioStore.getState().lanes).some((m) => m.key === song.key)) return;
    if (!found) continue;
    now.create({ title: found.title, artist: found.artist, text: found.text, source: "library", aligned: found.aligned, song: song.key });
    if (now.view === "pick") now.setView("sheet");
    notify(`${found.note} — “${found.title}”`);
    return;
  }
  if (replacing && songs.length) {
    const state = useLyrics.getState();
    state.setView("pick");
    notify(`No lyrics found for “${songs[0].song}” on their own — pick or paste them`);
  }
}

/** Stand-ins for the mix's songs from their keys alone (for a mix that's gone). */
function mixSongsOfKeys(keys: string): MixSong[] {
  return keys
    .split("\n")
    .filter(Boolean)
    .map((key) => ({ key, song: key, artist: "", lane: null as unknown as StudioLane }));
}
