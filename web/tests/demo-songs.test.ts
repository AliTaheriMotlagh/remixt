// demoSongs: the procedural demo songs — metadata, determinism, levels and
// whether the sung phrases land on bar lines.
//
//   node --import ./tests/support/register.mjs --test tests/demo-songs.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEMO_SONG_DEFS, DEMO_SONGS } from "../src/lib/client/demoSongDefs.ts";
import { SAMPLE_RATE, renderDemoChannels, sumStereo } from "../src/lib/client/demoSongsDsp.ts";
import { camelotCode } from "../src/lib/client/musicKey.ts";

describe("demo song metadata", () => {
  test("at least five songs with different tempo and key", () => {
    assert.ok(DEMO_SONGS.length >= 5);
    assert.equal(new Set(DEMO_SONGS.map((s) => s.bpm)).size, DEMO_SONGS.length);
    assert.equal(new Set(DEMO_SONGS.map((s) => s.camelot)).size >= 5, true);
  });

  test("lengths are 55-80 seconds and each has a chorus of 8+ bars with singing", () => {
    for (const s of DEMO_SONGS) {
      assert.ok(s.durationSec >= 55 && s.durationSec <= 80, `${s.id} ${s.durationSec}`);
      const chorus = s.sections.find((x) => x.name === "chorus");
      assert.ok(chorus && chorus.bars >= 8, s.id);
      assert.ok(s.vocalBars[chorus.startBar]);
      assert.equal(s.camelot, camelotCode(s.key));
    }
  });
});

describe("rendering", () => {
  const def = DEMO_SONG_DEFS.find((d) => d.id === "golden-hour")!;
  const started = Date.now();
  const a = renderDemoChannels(def);
  const elapsed = Date.now() - started;
  const b = renderDemoChannels(def);

  test("is deterministic", () => {
    for (const stem of ["drums", "bass", "chords", "vocal"] as const) {
      assert.deepEqual(a[stem].l.subarray(0, 50000), b[stem].l.subarray(0, 50000));
      assert.deepEqual(a[stem].r.subarray(100000, 150000), b[stem].r.subarray(100000, 150000));
    }
  });

  test("is quick enough", () => assert.ok(elapsed < 2500, `took ${elapsed} ms`));

  test("stems sum to a mix that never clips", () => {
    const mix = sumStereo([a.drums, a.bass, a.chords, a.vocal]);
    let peak = 0;
    for (let i = 0; i < mix.l.length; i++) peak = Math.max(peak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
    assert.ok(peak <= 0.95 && peak > 0.5, `peak ${peak}`);
  });

  test("the vocal sings in the chorus bars and rests in the intro", () => {
    const barLen = Math.round((240 / def.bpm) * SAMPLE_RATE);
    const rms = (bar: number) => {
      let s = 0;
      for (let i = bar * barLen; i < (bar + 1) * barLen; i++) s += a.vocal.l[i] ** 2;
      return Math.sqrt(s / barLen);
    };
    const meta = DEMO_SONGS.find((s) => s.id === def.id)!;
    assert.ok(rms(0) < 0.002, "intro should be silent");
    assert.ok(rms(meta.chorusBar) > 0.02, "chorus should be sung");
    // A phrase ends before the next bar line: the last beat of its second bar is a gap.
    const gapStart = (meta.chorusBar + 1) * barLen + Math.round(barLen * 0.9);
    let tail = 0;
    for (let i = gapStart; i < gapStart + 4000; i++) tail = Math.max(tail, Math.abs(a.vocal.l[i]));
    assert.ok(tail < 0.05, `gap not quiet: ${tail}`);
  });
});
