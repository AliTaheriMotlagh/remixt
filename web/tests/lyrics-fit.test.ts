// Lyrics search results ranked against the vocal they're for
// (lib/lyricsFit.ts): the sheet whose times and line count match the
// singing comes first, even when another copy's title matched better.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-fit.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { rankByVoice, voiceFit, voiceProfile } from "../src/lib/lyricsFit.ts";

/** A vocal: silence, then `count` phrases of 2.5 s with 1 s pauses from `from`. */
function vocal(from: number, count: number, length: number) {
  const step = 0.02;
  const values = new Float32Array(Math.round(length / step));
  for (let p = 0; p < count; p++) {
    const s = from + p * 3.5;
    for (let t = s; t < s + 2.5; t += step) values[Math.round(t / step)] = 0.8;
  }
  return { values, start: 0, step };
}

const lrc = (from: number, count: number, gap = 3.5) =>
  Array.from({ length: count }, (_, i) => {
    const t = from + i * gap;
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2).padStart(5, "0");
    return `[${String(m).padStart(2, "0")}:${s}]Line number ${i + 1} sung here`;
  }).join("\n");

const plain = (count: number) => Array.from({ length: count }, (_, i) => `Line number ${i + 1} sung here`).join("\n");

test("a vocal's profile: where singing starts and stops, and its phrases", () => {
  const voice = voiceProfile(vocal(10, 20, 120), 120)!;
  assert.ok(Math.abs(voice.firstSung - 10) < 0.1);
  assert.ok(Math.abs(voice.lastSung - (10 + 19 * 3.5 + 2.5)) < 0.1);
  assert.equal(voice.phrases, 20);
});

test("a silent recording has no profile", () => {
  assert.equal(voiceProfile({ values: new Float32Array(100), start: 0, step: 0.02 }, 2), null);
});

test("a timed sheet on the singing fits; one shifted half a minute doesn't", () => {
  const voice = voiceProfile(vocal(10, 20, 120), 120)!;
  const on = voiceFit({ duration: 120, plain: null, synced: lrc(10, 20) }, voice)!;
  const off = voiceFit({ duration: 150, plain: null, synced: lrc(40, 20) }, voice)!;
  assert.ok(on.score > 0.9, `on ${on.score}`);
  assert.match(on.why, /timed to this vocal/);
  assert.ok(off.score < 0.5, `off ${off.score}`);
});

test("untimed words are judged by length and line count", () => {
  const voice = voiceProfile(vocal(10, 20, 120), 120)!;
  const right = voiceFit({ duration: 121, plain: plain(22), synced: null }, voice)!;
  const short = voiceFit({ duration: null, plain: plain(5), synced: null }, voice)!;
  assert.ok(right.score > 0.9);
  assert.ok(short.score < 0.3);
  assert.match(short.why, /fewer lines/);
});

test("the copy that fits the singing is moved to the top", () => {
  const voice = voiceProfile(vocal(10, 20, 120), 120)!;
  const radioEdit = { id: 1, duration: 95, plain: null, synced: lrc(2, 14) };
  const album = { id: 2, duration: 120, plain: null, synced: lrc(10, 20) };
  const ranked = rankByVoice([radioEdit, album], voice);
  assert.equal(ranked[0].result.id, 2);
  // No vocal to go by: the server's order stands.
  assert.deepEqual(rankByVoice([radioEdit, album], null).map((r) => r.result.id), [1, 2]);
});
