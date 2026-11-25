// The DJ's crate: events, how songs go together, suggestions, saved sets
// (lib/client/dj/djCrate.ts).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildEventSet, clock, energyOf, playedTempos, EVENTS, eventFit, friendlyKeys, fromSaved, outsideSong, playableEntries, savedSetAt, setCsv, suggest, summarize, toSaved, transition,
  type CrateSong,
} from "../src/lib/client/dj/djCrate.ts";
import { camelotCode, type MusicalKey } from "../src/lib/client/musicKey.ts";

const k = (tonic: number, mode: "major" | "minor" = "minor"): MusicalKey => ({ tonic, mode });
let n = 0;
const song = (bpm: number | null, key: MusicalKey | null, o: Partial<CrateSong> = {}): CrateSong => ({
  id: `lib:${++n}`, source: "library", title: `Song ${n}`, artist: "A", genre: "pop", bpm, key, duration: 200, layout: "four", analyzed: true, ...o,
});
const ev = (id: string) => EVENTS.find((e) => e.id === id)!;

describe("how two songs go together", () => {
  test("same key, same tempo: smooth", () => {
    const t = transition(song(124, k(9)), song(124, k(9)));
    assert.equal(t.level, "smooth");
    assert.equal(t.keyText, "Same key");
    assert.equal(t.score, 100);
  });

  test("half time counts as the same tempo", () => {
    assert.equal(transition(song(70, k(9)), song(140, k(9))).level, "smooth");
  });

  test("far tempos and a key clash: rough, with advice", () => {
    const t = transition(song(90, k(0, "major")), song(128, k(6, "major")));
    assert.equal(t.level, "rough");
    assert.match(t.tip, /far apart|clash/);
  });

  test("a key not measured is never called smooth", () => {
    const t = transition(song(124, null), song(124, null));
    assert.equal(t.level, "ok");
    assert.match(t.tip, /by ear/);
  });

  test("double time is drawn at the set's feel", () => {
    assert.deepEqual(playedTempos([song(92, null), song(185, null), song(94, null), song(null, null)]), [92, 92.5, 94, null]);
  });

  test("nothing known: unknown, not a guess", () => {
    const t = transition(song(null, null), song(null, null));
    assert.equal(t.score, null);
    assert.equal(t.level, "unknown");
  });

  test("tempo change has its sign", () => {
    const t = transition(song(120, k(9)), song(126, k(9)));
    assert.ok(t.tempo! > 0.04 && t.tempo! < 0.06);
  });
});

describe("events", () => {
  test("a club track suits a club night, a ballad doesn't", () => {
    assert.ok(eventFit(song(126, null, { genre: "house" }), ev("club")) > 0.9);
    assert.ok(eventFit(song(72, null, { genre: "ballad" }), ev("club")) < 0.6);
  });

  test("an event's set only takes songs that suit it, when there are enough", () => {
    const fast = Array.from({ length: 8 }, (_, i) => song(124 + (i % 3), k(i % 12), { genre: "house" }));
    const slow = Array.from({ length: 8 }, (_, i) => song(80 + i, k(i % 12), { genre: "acoustic" }));
    const set = buildEventSet([...fast, ...slow], ev("club"), { minutes: 30 });
    assert.ok(set.length >= 4);
    assert.ok(set.every((s) => s.bpm! >= 120), set.map((s) => s.bpm).join(","));
  });
});

describe("suggestions", () => {
  const a = song(124, k(9));
  const b = song(125, k(9));
  const near = song(124, k(4)); // a neighbour on the wheel of 9 minor? (Camelot 8A ↔ 9A)
  const bad = song(90, k(3, "major"));

  test("next: the best blend first, songs already in the set left out", () => {
    const out = suggest([a, b, near, bad], [a], 0, "next");
    assert.equal(out[0].song.id, b.id);
    assert.ok(!out.some((s) => s.song.id === a.id));
    assert.equal(out.at(-1)!.song.id, bad.id);
  });

  test("between: both blends count", () => {
    const out = suggest([a, b, near, bad], [a, b], 0, "between");
    assert.notEqual(out[0].song.id, bad.id);
    assert.match(out[0].why, /into/);
  });
});

describe("the set", () => {
  test("summary: length, rough blends, songs not on Remixt", () => {
    const set = [song(124, k(9)), song(90, k(2, "major")), outsideSong({ title: "First dance", bpm: 72, minutes: 4 }, "x")];
    const s = summarize(set);
    assert.equal(s.songs, 3);
    assert.equal(s.seconds, 200 + 200 + 240);
    assert.equal(s.outside, 1);
    assert.ok(s.rough >= 1);
  });

  test("a song typed in by hand keeps only what's sensible", () => {
    const s = outsideSong({ title: "  Their song ", bpm: 999, minutes: 3.5 }, "1");
    assert.equal(s.title, "Their song");
    assert.equal(s.bpm, null);
    assert.equal(s.duration, 210);
    assert.ok(s.outside && s.id.startsWith("out:"));
  });

  test("saved and opened again: library songs by id, planned ones as they were, notes kept", () => {
    const lib = [song(120, k(1)), song(122, k(2))];
    const mine = { ...outsideSong({ title: "Request" }, "r"), note: "for the bride" };
    const saved = toSaved("Wedding", [lib[0], mine, lib[1]], ev("wedding"), 1);
    assert.equal(saved.shape, "journey");
    const back = fromSaved(saved, [lib[0]]);
    assert.equal(back.missing, 1);
    assert.deepEqual(back.set.map((s) => s.title), [lib[0].title, "Request"]);
    assert.equal(back.set[1].note, "for the bride");
  });

  test("CSV escapes commas and quotes", () => {
    const csv = setCsv([song(124, k(9), { title: 'Hello, "World"' })]);
    assert.match(csv.split("\n")[1], /"Hello, ""World"""/);
  });

  test("clock", () => {
    assert.equal(clock(65), "1:05");
    assert.equal(clock(3725), "1:02:05");
  });
});

describe("song facts", () => {
  test("energy follows the tempo's feel, nudged by genre", () => {
    assert.ok(energyOf(song(128, null, { genre: "house" }))! > energyOf(song(128, null, { genre: "acoustic" }))!);
    assert.ok(energyOf(song(64, null))! === energyOf(song(128, null))!);
    assert.equal(energyOf(song(null, null, { genre: "pop" })), null);
  });

  test("friendly keys: itself, relative, a step either way", () => {
    const key = k(9);
    const list = friendlyKeys(key);
    assert.equal(list[0], camelotCode(key));
    assert.equal(new Set(list).size, 4);
  });
});

describe("playing a saved set on the decks", () => {
  const a = song(120, k(1), { id: "lib:a" });
  const b = song(122, k(2), { id: "lib:b" });
  const demo = song(124, k(3), { id: "warehouse-lights", source: "demo" });

  test("keeps the set's order, skips songs not on Remixt and ones gone from the library", () => {
    const r = playableEntries({ ids: ["lib:b", "out:x", "warehouse-lights", "lib:gone", "lib:a"] }, [a, b, demo]);
    assert.deepEqual(r.entries.map((e) => e.id), ["lib:b", "warehouse-lights", "lib:a"]);
    assert.equal(r.skipped, 2);
  });

  test("a song listed twice plays once", () => {
    const r = playableEntries({ ids: ["lib:a", "lib:a"] }, [a]);
    assert.deepEqual(r.entries.map((e) => e.id), ["lib:a"]);
  });

  test("finds the set by when it was saved (as the address carries it)", () => {
    const list = [toSaved("One", [a], null, 111), toSaved("Two", [b], null, 222)];
    assert.equal(savedSetAt(list, "222")?.name, "Two");
    assert.equal(savedSetAt(list, 111)?.name, "One");
    assert.equal(savedSetAt(list, "333"), null);
    assert.equal(savedSetAt(list, "nope"), null);
    assert.equal(savedSetAt(list, null), null);
  });
});
