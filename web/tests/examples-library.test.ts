// examplesLibrary: the Examples lab with real library songs — bar-aligned
// excerpts, sung bars, and ranking beats for a vocal by tempo and key.
//
//   node --import ./tests/support/register.mjs --test tests/examples-library.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  alignExcerpt,
  barLinesFromBeats,
  bpmLabel,
  constantBarLines,
  firstStrongPhrase,
  isLibraryId,
  libraryId,
  libraryRecipes,
  nearestInTempo,
  rankBeats,
  scoreBeatForVocal,
  sungBars,
  trackIdOf,
  type KnownSong,
} from "../src/lib/client/examplesLibrary.ts";
import { analyzePair } from "../src/lib/client/examplesMatch.ts";
import type { MusicalKey } from "../src/lib/client/musicKey.ts";

const Am: MusicalKey = { tonic: 9, mode: "minor" };
const C: MusicalKey = { tonic: 0, mode: "major" };
const Em: MusicalKey = { tonic: 4, mode: "minor" };
const Bm: MusicalKey = { tonic: 11, mode: "minor" };
const Fsharp: MusicalKey = { tonic: 6, mode: "major" };
const song = (id: string, bpm: number, key: MusicalKey, featured = false): KnownSong => ({ id, title: id, bpm, key, featured });

describe("ids and labels", () => {
  test("library ids round-trip and demo ids are left alone", () => {
    assert.equal(libraryId("t1"), "lib:t1");
    assert.equal(trackIdOf("lib:t1"), "t1");
    assert.equal(trackIdOf("golden-hour"), null);
    assert.ok(isLibraryId("lib:x") && !isLibraryId("midnight-static"));
  });

  test("tempo labels", () => {
    assert.equal(bpmLabel(124), "124");
    assert.equal(bpmLabel(123.98), "124");
    assert.equal(bpmLabel(121.53), "121.5");
  });
});

describe("bar lines", () => {
  test("every fourth tracked beat, from the downbeat's phase", () => {
    const times = Array.from({ length: 14 }, (_, i) => 0.3 + i * 0.5);
    assert.deepEqual(barLinesFromBeats(times, 6), [times[2], times[6], times[10]]);
    assert.deepEqual(barLinesFromBeats(times, 0), [times[0], times[4], times[8], times[12]]);
  });

  test("an even grid through the anchor, from the start of the song", () => {
    const lines = constantBarLines(5.25, 2, 12);
    assert.deepEqual(lines, [1.25, 3.25, 5.25, 7.25, 9.25, 11.25]);
  });
});

describe("excerpts", () => {
  const barSec = 2;
  const lines = constantBarLines(0.5, barSec, 60); // 0.5, 2.5, 4.5, …

  test("starts on the bar line the line is sung in", () => {
    const e = alignExcerpt({ barLines: lines, barSec, target: 9.3, duration: 60, bars: 8 });
    assert.equal(e.start, 8.5);
    assert.equal(e.end, 24.5);
  });

  test("a line a hair early still starts its own bar; a pickup starts the bar before", () => {
    assert.equal(alignExcerpt({ barLines: lines, barSec, target: 8.45, duration: 60, bars: 4 }).start, 8.5);
    assert.equal(alignExcerpt({ barLines: lines, barSec, target: 7.6, duration: 60, bars: 4 }).start, 6.5);
  });

  test("moves back a bar at a time rather than run off the end", () => {
    const e = alignExcerpt({ barLines: lines, barSec, target: 55, duration: 60, bars: 8 });
    assert.equal(e.start, 42.5);
    assert.ok(e.end <= 60);
  });

  test("a song shorter than the excerpt starts at its first bar and is clipped", () => {
    const e = alignExcerpt({ barLines: constantBarLines(0.2, 2, 9), barSec: 2, target: 5, duration: 9, bars: 8 });
    assert.equal(e.start, 0.2);
    assert.equal(e.end, 9);
  });

  test("the first strong phrase skips short ad-libs, else takes the longest", () => {
    const phrases = [
      { start: 3, end: 3.4 },
      { start: 10, end: 14 },
      { start: 20, end: 30 },
    ];
    assert.deepEqual(firstStrongPhrase(phrases, 2), { start: 10, end: 14 });
    assert.deepEqual(firstStrongPhrase([{ start: 1, end: 1.2 }, { start: 5, end: 5.5 }], 4), { start: 5, end: 5.5 });
    assert.equal(firstStrongPhrase([], 2), null);
  });

  test("sung bars need a quarter of the bar", () => {
    const bars = sungBars(
      [
        { start: 0.2, end: 3.9 },
        { start: 6.4, end: 6.5 },
        { start: 9, end: 12 },
      ],
      0,
      2,
      6
    );
    assert.deepEqual(bars, [true, true, false, false, true, true]);
  });
});

describe("suggesting a beat", () => {
  test("same notes at nearly the same tempo first; a 28% stretch costs more than a one-semitone fix", () => {
    const ranked = rankBeats({ bpm: 100, key: Am }, [song("clash", 100, Fsharp), song("far", 128, Am), song("best", 101, C)]);
    assert.deepEqual(
      ranked.map((r) => r.id),
      ["best", "clash", "far"]
    );
    assert.equal(Math.abs(ranked[1].semitones), 1);
    assert.equal(ranked[0].fit, "relative");
    assert.equal(ranked[0].level, "great");
    assert.match(ranked[0].reasons[1], /relative/);
  });

  test("half and double time count as close", () => {
    const s = scoreBeatForVocal({ bpm: 70, key: Am }, song("trap", 141, Am));
    assert.equal(s.readingNote, "double-time");
    assert.ok(s.stretchPct < 1);
    assert.match(s.reasons[0], /double time/);
  });

  test("Camelot neighbours need no shift; a clash names the fix", () => {
    const n = scoreBeatForVocal({ bpm: 120, key: Am }, song("n", 120, Em));
    assert.equal(n.fit, "neighbour");
    assert.equal(n.semitones, 0);
    const c = scoreBeatForVocal({ bpm: 120, key: Am }, song("c", 120, Bm));
    assert.equal(c.fit, "far");
    assert.equal(c.semitones, 2);
    assert.match(c.reasons[1], /\+2/);
    assert.ok(c.score > n.score);
  });

  test("keeps at most `limit`", () => {
    assert.equal(rankBeats({ bpm: 90, key: C }, [song("a", 90, C), song("b", 91, C), song("c", 92, C), song("d", 93, C)], 3).length, 3);
  });

  test("tempo prefilter puts unknown tempos last and counts half time", () => {
    const out = nearestInTempo(90, [{ id: "x", bpm: null }, { id: "y", bpm: 125 }, { id: "z", bpm: 181 }], 3);
    assert.deepEqual(
      out.map((c) => c.id),
      ["z", "y", "x"]
    );
  });

  test("agrees with the Match step's pitch shift", () => {
    const vocal = { title: "v", bpm: 120, key: Am, camelot: "8A" };
    const beat = { title: "b", bpm: 120, key: Bm, camelot: "10A" };
    const a = analyzePair(vocal, beat, { vocalId: "v", beatId: "b", mode: "beat", semitones: "auto" });
    assert.equal(a.semitones, scoreBeatForVocal(vocal, song("b", 120, Bm)).semitones);
  });
});

describe("library recipes", () => {
  test("finds a same-key, a half-time and a pitch-fix pair", () => {
    const recipes = libraryRecipes([song("a", 100, Am), song("b", 102, C), song("c", 51, Fsharp), song("d", 99, Bm)]);
    const tags = recipes.map((r) => r.tag);
    assert.ok(tags.includes("Same notes"));
    assert.ok(tags.includes("Half-time"));
    assert.ok(tags.includes("Key fix"));
    for (const r of recipes) assert.notEqual(r.settings.vocalId, r.settings.beatId);
  });

  test("prefers featured songs", () => {
    const recipes = libraryRecipes([song("a", 100, Am), song("b", 100, C), song("f1", 110, Em, true), song("f2", 108, Em, true)]);
    const same = recipes.find((r) => r.tag === "Same notes")!;
    assert.deepEqual([same.vocal.id, same.beat.id].sort(), ["f1", "f2"]);
  });

  test("nothing from fewer than two songs", () => {
    assert.deepEqual(libraryRecipes([song("a", 100, Am)]), []);
  });
});
