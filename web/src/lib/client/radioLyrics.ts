"use client";

import { useCallback, useEffect, useState } from "react";
import { parseLyrics, type LyricLine, type LyricsResult } from "@/lib/lyrics";
import { bestTimed } from "@/lib/lyricsFit";
import type { RadioKind } from "@/lib/radioPick";
import { choiceLrc, linesOfChoice, placeWords, timeWords, voiceOf, type WordsChoice } from "./itemWords";
import { cacheGet, cachePut } from "./localCache";
import { searchLyrics } from "./lyricsSources";
import { wordsOf, type MixSong } from "./mixSongs";
import { playPayload } from "./radioDeck";
import { radioMixKey } from "./radioCache";
import { laneFromApi } from "./remixLanes";
import type { StudioLane } from "./studioStore";

// The words of the vocal on air, timed to the station's clock. A listener
// has none of the Studio's lyric sheets (they live in the maker's browser),
// so — in this order:
//   1. the listener's own choice for this song (kept on this device),
//   2. the choice its owner set for everyone (api/lyrics/choice),
//   3. found by themselves: the vocal's song by its title, the lyrics
//      library's timed copies ranked by how they fit the singing (where it
//      starts and stops, how many phrases — read from the vocal's waveform,
//      no download), the first that's surely this recording, each line put
//      where its moment of the vocal plays in the song as heard. Nothing
//      sure: no words, rather than the wrong ones — "Wrong words?" fixes it.
// Only ever the vocal's words (mixSongs.wordsOf, vocalOnly): an instrumental
// shows none; a remix whose only voice is the maker's own take has words of
// their own, which only they can set.

export type RadioWords =
  | { status: "loading" }
  | { status: "instrumental" }
  | { status: "own" }
  | { status: "none"; song: string }
  | { status: "hidden"; from: "mine" | "everyone" }
  | { status: "ready"; lines: LyricLine[]; song: string; from: "auto" | "mine" | "everyone"; note?: string };

type Item = { kind: RadioKind; id: string; duration: number };

const MISS_MS = 24 * 3600 * 1000;
const WORDS_VERSION = 3;

// ——— the listener's own choices (small; kept in this browser) ———

const MINE_KEY = "remixt.radio.words";
const MINE_MAX = 60;
type Mine = Record<string, WordsChoice & { at: number }>;

function readMine(): Mine {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) ?? "{}") as Mine;
  } catch {
    return {};
  }
}

function writeMine(item: Item, choice: WordsChoice | null) {
  try {
    const all = readMine();
    const key = `${item.kind}:${item.id}`;
    if (choice) all[key] = { ...choice, at: Date.now() };
    else delete all[key];
    const kept = Object.fromEntries(
      Object.entries(all)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, MINE_MAX)
    );
    localStorage.setItem(MINE_KEY, JSON.stringify(kept));
  } catch {
    // Private mode or full storage: nothing kept.
  }
}

function fromChoice(choice: WordsChoice, from: "mine" | "everyone"): RadioWords {
  if (choice.noWords) return { status: "hidden", from };
  const lines = linesOfChoice(choice);
  return lines.length ? { status: "ready", lines, song: choice.song, from } : { status: "none", song: choice.song };
}

// ——— what the song is made of ———

export type WordsContext = { lanes: StudioLane[]; sung: MixSong[]; ownWords: boolean };

async function contextOf(slug: string, item: Item): Promise<{ ctx: WordsContext; key: string }> {
  const payload = await playPayload(slug, item.kind, item.id);
  const lanes = payload.lanes.map(laneFromApi).filter((l) => !l.muted);
  const { songs, ownWords } = wordsOf(lanes, { takesHaveOwnWords: true, vocalOnly: true });
  const key = `radio-lyrics:${WORDS_VERSION}:${await radioMixKey(item.kind, payload, item.duration)}`;
  return { ctx: { lanes, sung: songs.slice(0, 2), ownWords }, key };
}

/** A search result as words for this song as heard: timed ones placed through its vocal; words only, timed from where it sings. */
export function choiceFromResult(result: Pick<LyricsResult, "title" | "synced" | "plain">, ctx: WordsContext): WordsChoice | null {
  const lane = ctx.sung[0]?.lane ?? ctx.lanes.find((l) => l.kind === "vocals");
  if (!lane) return null;
  let lines: LyricLine[] | null = null;
  if (result.synced) lines = placeWords(ctx.lanes, lane.stemId, parseLyrics(result.synced));
  if (!lines?.length && (result.plain || result.synced)) lines = timeWords(parseLyrics(result.plain ?? result.synced ?? ""), lane);
  return lines?.length ? { lrc: choiceLrc(lines), shift: 0, noWords: false, song: result.title } : null;
}

async function autoWords(item: Item, ctx: WordsContext, key: string): Promise<RadioWords> {
  const kept = await cacheGet<{ at: number; state: RadioWords }>("analysis", key).catch(() => null);
  if (kept && (kept.state.status !== "none" || Date.now() - kept.at < MISS_MS)) return kept.state;
  let state: RadioWords;
  if (!ctx.sung.length) state = ctx.ownWords ? { status: "own" } : { status: "instrumental" };
  else {
    const all: LyricLine[] = [];
    const notes: string[] = [];
    for (const s of ctx.sung) {
      const params = new URLSearchParams({ track: s.song.slice(0, 200) });
      if (s.artist) params.set("artist", s.artist.slice(0, 200));
      if (s.lane.originalDuration) params.set("duration", String(Math.round(s.lane.originalDuration)));
      const { results } = await searchLyrics(params).catch(() => ({ results: [] as LyricsResult[] }));
      const pick = bestTimed(results, voiceOf(s.lane), s.lane.originalDuration);
      if (!pick?.result.synced) continue;
      all.push(...placeWords(ctx.lanes, s.lane.stemId, parseLyrics(pick.result.synced)));
      if (pick.fit) notes.push(pick.fit.why);
    }
    const lines = all.filter((l) => (l.time ?? 0) < item.duration).sort((a, b) => a.time! - b.time!);
    const song = ctx.sung.map((s) => s.song).join(" × ");
    state = lines.length ? { status: "ready", lines, song, from: "auto", note: notes.join("; ") || undefined } : { status: "none", song };
  }
  void cachePut("analysis", key, { at: Date.now(), state }, JSON.stringify(state).length * 2);
  return state;
}

async function sharedChoice(item: Item): Promise<{ choice: WordsChoice | null; canSet: boolean }> {
  try {
    const res = await fetch(`/api/lyrics/choice?kind=${item.kind}&id=${encodeURIComponent(item.id)}`, { cache: "no-store" });
    if (!res.ok) return { choice: null, canSet: false };
    const data = (await res.json()) as { choice: WordsChoice | null; canSet: boolean };
    return { choice: data.choice, canSet: !!data.canSet };
  } catch {
    return { choice: null, canSet: false };
  }
}

/**
 * The words of the song on air (`item`), timed to its start, and how to
 * put them right: `choose` a sheet (or no words; or null — back to the
 * words found by themselves) for this device, or — `canSet` — for everyone.
 */
export function useRadioWords(slug: string, item: Item | null) {
  const id = item ? `${item.kind}:${item.id}:${item.duration}` : "";
  const [state, setState] = useState<{ id: string; words: RadioWords; canSet: boolean; ctx: WordsContext | null; shared: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!item) return;
    let gone = false;
    (async () => {
      const mine = readMine()[`${item.kind}:${item.id}`];
      const [{ ctx, key }, shared] = await Promise.all([contextOf(slug, item), sharedChoice(item)]);
      const words = mine ? fromChoice(mine, "mine") : shared.choice ? fromChoice(shared.choice, "everyone") : await autoWords(item, ctx, key);
      if (!gone) setState({ id, words, canSet: shared.canSet, ctx, shared: !!shared.choice });
    })().catch(() => !gone && setState({ id, words: { status: "none", song: "" }, canSet: false, ctx: null, shared: false }));
    return () => {
      gone = true;
    };
    // `id` stands for the item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id, version]);

  const choose = useCallback(
    async (choice: WordsChoice | null, everyone = false) => {
      if (!item) return;
      if (!everyone) writeMine(item, choice);
      else {
        // For everyone: the listener's own choice gives way, so they see what they set.
        writeMine(item, null);
        const res = await fetch(
          choice ? "/api/lyrics/choice" : `/api/lyrics/choice?kind=${item.kind}&id=${encodeURIComponent(item.id)}`,
          choice
            ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: item.kind, id: item.id, ...choice }) }
            : { method: "DELETE" }
        );
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save the words");
      }
      setVersion((v) => v + 1);
    },
    // `id` stands for the item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  const current = state?.id === id ? state : null;
  const words: RadioWords = !item ? { status: "none", song: "" } : (current?.words ?? { status: "loading" });
  return {
    words,
    canSet: current?.canSet ?? false,
    /** What the song is made of (to search and place words): null while loading. */
    context: current?.ctx ?? null,
    /** The words shown are a choice (this listener's or everyone's), not the ones found by themselves. */
    chosen: words.status === "hidden" || (words.status === "ready" && words.from !== "auto"),
    /** Its owner set words for everyone. */
    hasShared: !!current?.shared,
    choose,
  };
}
