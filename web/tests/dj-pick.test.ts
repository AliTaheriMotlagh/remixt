// djLibrary.ts pickNext / openingPair: the decks and the Auto DJ choose the
// next song from the library by tempo and key, never one already played.
//
//   node --import ./tests/support/register.mjs --test tests/dj-pick.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openingPair, pickNext, type BrowserEntry } from "../src/lib/client/dj/djLibrary.ts";
import type { MusicalKey } from "../src/lib/client/musicKey.ts";

const key = (tonic: number, mode: "major" | "minor" = "minor") => ({ tonic, mode }) as unknown as MusicalKey;
const song = (id: string, bpm: number | null, k: MusicalKey | null = null): BrowserEntry => ({
  id: `lib:${id}`,
  source: "library",
  title: id,
  artist: "a",
  genre: "x",
  bpm,
  key: k,
  duration: 200,
  layout: "two",
  analyzed: bpm !== null,
});

describe("pickNext", () => {
  test("the closest tempo in a key that fits wins; half time counts", () => {
    const now = { id: "lib:now", bpm: 124, key: key(9) };
    const list = [song("far", 140, key(9)), song("half", 62.5, key(9)), song("near-clash", 123, key(3)), song("now", 124, key(9))];
    assert.equal(pickNext(list, now)?.title, "half");
  });

  test("played songs and the one on air are never picked; null when all are played", () => {
    const now = { id: "lib:a", bpm: 120, key: null };
    const list = [song("a", 120), song("b", 120), song("c", 150)];
    assert.equal(pickNext(list, now, new Set(["lib:b"]))?.title, "c");
    assert.equal(pickNext(list, now, new Set(["lib:b", "lib:c"])), null);
  });

  test("songs that don't fit only when nothing else is left", () => {
    const now = { bpm: 100, key: null };
    assert.equal(pickNext([song("fast", 150), song("ok", 103)], now)?.title, "ok");
    assert.equal(pickNext([song("fast", 150)], now)?.title, "fast");
  });

  test("an unknown tempo counts as maybe", () => {
    assert.equal(pickNext([song("unknown", null), song("far", 160)], { bpm: 100, key: null })?.title, "unknown");
  });
});

describe("openingPair", () => {
  test("the newest song with a tempo, then its best fit", () => {
    const pair = openingPair([song("new", 90), song("other", 128), song("fits", 91)]);
    assert.deepEqual(pair?.map((e) => e.title), ["new", "fits"]);
  });
  test("full songs before clips and takes", () => {
    const clip = { ...song("clip", 90), duration: 30 };
    assert.deepEqual(openingPair([clip, song("full", 120), song("full2", 121)])?.map((e) => e.title), ["full", "full2"]);
    assert.deepEqual(openingPair([clip, song("full", 120)])?.map((e) => e.title), ["clip", "full"]);
  });
  test("null with fewer than two songs", () => {
    assert.equal(openingPair([song("only", 90)]), null);
    assert.equal(openingPair([]), null);
  });
});

describe("a recorded set's track list", async () => {
  const { setClock, setListText, setCredits } = await import("../src/lib/client/dj/djSet.ts");
  test("times read as clock times, an hour and more too", () => {
    assert.equal(setClock(0), "0:00");
    assert.equal(setClock(245.7), "4:05");
    assert.equal(setClock(3729), "1:02:09");
  });
  test("one line per song, credits carry the times", () => {
    const tracks = [
      { at: 0, title: "First", artist: "A" },
      { at: 190, title: "Second", artist: "" },
    ];
    assert.equal(setListText(tracks), "0:00 First — A\n3:10 Second");
    assert.deepEqual(setCredits(tracks)[1], { role: "3:10", track: "Second", artist: "" });
  });
});
