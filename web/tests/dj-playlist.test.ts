import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSet, setSeconds, setText, shapeAt } from "../src/lib/client/dj/djPlaylist";
import { keyFit, type MusicalKey } from "../src/lib/client/musicKey";
import type { BrowserEntry } from "../src/lib/client/dj/djLibrary";

const A = (tonic: number): MusicalKey => ({ tonic, mode: "minor" });
let n = 0;
const song = (bpm: number | null, key: MusicalKey | null, artist = `a${n}`): BrowserEntry => ({
  id: `s${++n}`, source: "library", title: `Song ${n}`, artist, genre: "", bpm, key, duration: 200, layout: "two", analyzed: true,
});

// A library: 20 songs from 90 to 128 BPM, keys walking round the wheel.
const lib = Array.from({ length: 20 }, (_, i) => song(90 + i * 2, A((i * 7) % 12)));

test("the shapes: warm-up climbs, journey comes back down, steady holds", () => {
  assert.ok(shapeAt("warmup", 0) < shapeAt("warmup", 1));
  assert.ok(shapeAt("journey", 0.65) > shapeAt("journey", 1));
  assert.equal(shapeAt("steady", 0.1), shapeAt("steady", 0.9));
});

test("a warm-up starts slow and ends faster, with no song twice", () => {
  const set = buildSet(lib, { shape: "warmup", count: 8 });
  assert.equal(set.length, 8);
  assert.equal(new Set(set.map((s) => s.entry.id)).size, 8);
  assert.ok(set[0].entry.bpm! < set[7].entry.bpm!, `${set[0].entry.bpm} → ${set[7].entry.bpm}`);
});

test("each step mixes: tempo within reach and keys that don't clash, when the library allows", () => {
  const set = buildSet(lib, { shape: "steady", count: 6 });
  for (let i = 1; i < set.length; i++) {
    const a = set[i - 1].entry, b = set[i].entry;
    assert.ok(Math.abs(set[i].tempoStep) <= 0.12, `step ${i}: ${set[i].tempoStep}`);
    assert.notEqual(keyFit(a.key!, b.key!), "clash");
    assert.ok(set[i].why.length > 0);
  }
});

test("starts with the song asked for, and a length in minutes sets how many", () => {
  const start = lib[10];
  const set = buildSet(lib, { shape: "peak", minutes: 20, startId: start.id });
  assert.equal(set[0].entry.id, start.id);
  assert.ok(setSeconds(set) >= 20 * 60 - 200 && set.length <= 8, `${set.length} songs, ${setSeconds(set)} s`);
});

test("songs with no tempo yet still fill a set when they're needed; empty library, empty set", () => {
  const few = [song(null, null), song(120, A(0)), song(null, null)];
  assert.equal(buildSet(few, { shape: "journey", count: 3 }).length, 3);
  assert.deepEqual(buildSet([], { shape: "warmup" }), []);
});

test("as text, numbered with tempo and key", () => {
  const set = buildSet(lib.slice(0, 3), { shape: "steady", count: 2 });
  assert.match(setText("Friday", set), /^Friday\n1\. Song \d+ — a\d+ \(\d+ BPM, \d+A\)/);
});

test("tempos stored at half or a quarter of the feel still chain without big jumps", () => {
  const odd = [song(86, null), song(172, null), song(44, null), song(91, null), song(185, null), song(94, null)];
  const set = buildSet(odd, { shape: "steady", count: 6 });
  for (const s of set.slice(1)) assert.ok(Math.abs(s.tempoStep) < 0.12, `${s.entry.bpm}: ${s.tempoStep}`);
});
