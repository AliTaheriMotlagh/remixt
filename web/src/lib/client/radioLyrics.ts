"use client";

import { useEffect, useState } from "react";
import { isSung, type LyricLine } from "@/lib/lyrics";
import type { RadioKind } from "@/lib/radioPick";
import { cacheGet, cachePut } from "./localCache";
import { findTimedVersion } from "./lyricsSources";
import { mixSongsOf } from "./mixSongs";
import { playPayload } from "./radioDeck";
import { radioMixKey } from "./radioCache";
import { laneFromApi } from "./remixLanes";
import { linesInEveryPlay } from "./vocalTime";

// The words of the vocal on air, timed to the station's clock. A listener
// has none of the lyric sheets made in the Studio (they live in the maker's
// browser), so they're found the way the Studio finds them: the vocal's
// song by its title, its timed lyrics from the lyrics library, and — for a
// remix — each line put where that moment of the vocal plays in the mix
// (vocalTime.ts: clips moved, cut, repeated, stretched to the beat). Only
// the vocal's song: a remix over another song's beat sings the vocal's
// words. Nothing sung (an instrumental): no words.
//
// Found words are kept on the device (with the analysis, keyed by what the
// mix is made of), so the same song on air again shows them at once. A
// miss is kept for a day, then asked again.

export type RadioLyricsState =
  | { status: "loading" }
  | { status: "instrumental" }
  | { status: "none" }
  | { status: "ready"; lines: LyricLine[]; song: string };

/** Lyrics timed to a recording more than this far off its length (s) are of another version: not used. */
const SAME_RECORDING = 4;
const MISS_MS = 24 * 3600 * 1000;
const LYRICS_VERSION = 1;

type Kept = { at: number; state: RadioLyricsState };

type Item = { kind: RadioKind; id: string; duration: number };

async function find(slug: string, item: Item): Promise<RadioLyricsState> {
  const payload = await playPayload(slug, item.kind, item.id);
  const key = `radio-lyrics:${LYRICS_VERSION}:${await radioMixKey(item.kind, payload, item.duration)}`;
  const kept = await cacheGet<Kept>("analysis", key).catch(() => null);
  if (kept && (kept.state.status !== "none" || Date.now() - kept.at < MISS_MS)) return kept.state;

  const lanes = payload.lanes.map(laneFromApi);
  // The songs whose vocal is in the mix, by title (never a booth take). Up to two singers' songs.
  const sung = mixSongsOf(lanes)
    .filter((s) => s.vocal && !s.lane.muted)
    .slice(0, 2);
  let state: RadioLyricsState;
  if (sung.length === 0) state = { status: "instrumental" };
  else {
    const vocals: { lane: (typeof sung)[number]["lane"]; lines: { at: number; text: string }[] }[] = [];
    for (const s of sung) {
      const timed = await findTimedVersion(s.song, s.artist, s.lane.originalDuration || null);
      if (!timed) continue;
      if (timed.duration && s.lane.originalDuration && Math.abs(timed.duration - s.lane.originalDuration) > SAME_RECORDING) continue;
      // Every lane of this song's vocal (a remix may use it on several).
      for (const lane of lanes.filter((l) => l.kind === "vocals" && l.stemId === s.lane.stemId)) {
        vocals.push({ lane, lines: timed.lines.filter((l) => l.time !== null && isSung(l)).map((l) => ({ at: l.time!, text: l.text })) });
      }
    }
    const lines = vocals.length ? linesInEveryPlay(vocals).filter((l) => (l.time ?? 0) < item.duration) : [];
    state = lines.length ? { status: "ready", lines, song: sung.map((s) => s.song).join(" × ") } : { status: "none" };
  }
  const text = JSON.stringify(state);
  void cachePut("analysis", key, { at: Date.now(), state } satisfies Kept, text.length * 2);
  return state;
}

/** The words of the song on air (`item`), timed to its start. */
export function useRadioLyrics(slug: string, item: Item | null): RadioLyricsState {
  const [state, setState] = useState<{ id: string; value: RadioLyricsState } | null>(null);
  const id = item ? `${item.kind}:${item.id}:${item.duration}` : "";
  useEffect(() => {
    if (!item) return;
    let gone = false;
    find(slug, item)
      .then((value) => !gone && setState({ id, value }))
      .catch(() => !gone && setState({ id, value: { status: "none" } }));
    return () => {
      gone = true;
    };
    // `id` stands for the item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id]);
  if (!item) return { status: "none" };
  return state?.id === id ? state.value : { status: "loading" };
}
