// Making a beat last (arrange.ts): when a vocal runs longer than its beat,
// the beat's body plays again, then its own ending — on synthetic beats
// whose bars are known.
//
//   node --import ./tests/support/register.mjs --test tests/beat-reprise.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StemAnalysis } from "../src/lib/client/analysis.ts";
import {
  REPRISE_LABEL,
  beatBody,
  beatStructure,
  isReprise,
  repriseClips,
  repriseFor,
  repriseSource,
  repriseStructure,
  suggestLayout,
  type BeatStructure,
  type HeardVocal,
  type Section,
} from "../src/lib/client/arrange.ts";

const BPM = 120;
const RATE = 86;

/**
 * A beat whose bars have the given power (one value per bar, 2 s each at
 * 120 BPM), with the beat model's beats and downbeats on every hit.
 * `swing` nudges every other beat late, so bars aren't all equally long
 * in the audio and the repeated stretch has to be read from it.
 */
function beat(barPower: number[], swing = 0): BeatStructure {
  const seconds = barPower.length * 2 + 2;
  const energy = new Float32Array(Math.round(seconds * RATE));
  const onsets = new Float32Array(energy.length);
  const beats: number[] = [];
  for (let i = 0; i < barPower.length * 4 + 4; i++) beats.push(0.5 + i * 0.5 + (i % 2 ? swing : 0));
  barPower.forEach((p, bar) => {
    for (let k = Math.round((0.5 + bar * 2) * RATE); k < Math.round((2.5 + bar * 2) * RATE); k++) energy[k] = p;
  });
  for (const b of beats) onsets[Math.round(b * RATE)] = 1;
  const analysis = {
    energy,
    onsets,
    lowOnsets: onsets,
    onsetRate: RATE,
    neural: { beats, downbeats: beats.filter((_, i) => i % 4 === 0) },
  } as unknown as StemAnalysis;
  const structure = beatStructure(analysis, BPM);
  assert.ok(structure, "the synthetic beat has bars");
  return structure;
}

/** 4 quiet bars of intro, 24 at full strength, 4 winding down. */
const SONG = [...Array(4).fill(0.05), ...Array(24).fill(1), ...Array(4).fill(0.3)];

describe("the beat's body", () => {
  test("from where the intro is over to where it winds down, on 4-bar lines", () => {
    const s = beat(SONG);
    assert.equal(s.introBars, 4);
    assert.deepEqual(beatBody(s), { from: 4, to: 28 });
  });

  test("a loop too short to repeat has none", () => {
    assert.equal(beatBody(beat([0.05, ...Array(4).fill(1), 0.3])), null);
  });
});

describe("the reprise", () => {
  const s = beat(SONG);
  const body = beatBody(s)!;

  test("only as much as the vocal needs, in whole 4-bar lines", () => {
    assert.equal(repriseFor(s, s.endBar), null, "the beat already lasts");
    assert.deepEqual(repriseFor(s, s.endBar + 5), { body, extra: 8 });
  });

  test("the body plays again with its last bar right before the ending", () => {
    const reprise = { body, extra: 10 };
    for (let bar = 0; bar < body.to; bar++) assert.equal(repriseSource(reprise, bar), bar, "unchanged up to the end of the body");
    assert.equal(repriseSource(reprise, body.to + reprise.extra - 1), body.to - 1, "the bar before the ending is the body's last");
    for (let bar = body.to; bar < body.to + reprise.extra; bar++) {
      const source = repriseSource(reprise, bar);
      assert.ok(source >= body.from && source < body.to, `bar ${bar} plays body bar ${source}`);
    }
    assert.equal(repriseSource(reprise, body.to + reprise.extra), body.to, "then the beat's own ending");
    assert.equal(repriseSource(reprise, s.bars + reprise.extra - 1), s.bars - 1);
  });

  test("the played bars are exactly as long as the bars of audio they're read from", () => {
    const swung = beat(SONG, 0.04);
    const reprise = { body: beatBody(swung)!, extra: 12 };
    const played = repriseStructure(swung, reprise);
    assert.equal(played.bars, swung.bars + 12);
    assert.equal(played.endBar, swung.endBar + 12);
    const barStart = (of: BeatStructure, bar: number) => of.grid.time(of.downbeat + 4 * bar);
    for (let bar = 0; bar + 1 < played.bars; bar++) {
      const source = repriseSource(reprise, bar);
      const length = barStart(played, bar + 1) - barStart(played, bar);
      const real = barStart(swung, source + 1) - barStart(swung, source);
      assert.ok(Math.abs(length - real) < 1e-9, `bar ${bar}: ${length} against ${real}`);
      assert.equal(played.barEnergy[bar], swung.barEnergy[source]);
    }
  });

  test("the clips abut on the played grid: the start, the body again, the ending", () => {
    const reprise = { body, extra: 12 };
    const played = repriseStructure(s, reprise);
    const duration = s.grid.time(s.downbeat + 4 * s.bars) + 0.5;
    const clips = repriseClips(s, reprise, duration);
    assert.ok(isReprise(clips));
    assert.equal(clips[0].at, 0);
    assert.equal(clips[clips.length - 1].label, "Ending");
    assert.ok(clips.slice(1, -1).every((c) => c.label === REPRISE_LABEL));
    for (let i = 1; i < clips.length; i++) {
      const end = clips[i - 1].at + (clips[i - 1].to - clips[i - 1].from);
      assert.ok(Math.abs(end - clips[i].at) < 1e-6, `clip ${i} starts where clip ${i - 1} ends`);
    }
    // Each repeated stretch starts right on its bar of the played beat.
    const cutAhead = 0.012;
    let bar = body.to;
    for (const clip of clips.slice(1, -1)) {
      assert.ok(Math.abs(clip.at - (played.grid.time(played.downbeat + 4 * bar) - cutAhead)) < 1e-9);
      bar += Math.round((clip.to - clip.from) / 2);
    }
    assert.equal(bar, body.to + reprise.extra);
    // And it all runs exactly as long as the played beat.
    const last = clips[clips.length - 1];
    assert.ok(Math.abs(last.at + (last.to - last.from) - (duration + (played.grid.time(played.downbeat + 4 * played.bars) - s.grid.time(s.downbeat + 4 * s.bars)))) < 1e-6);
  });
});

describe("a vocal longer than the beat", () => {
  /** Sections of `bars` bars each, two bars of rest between them. */
  const vocal = (lengths: number[]): HeardVocal => {
    let bar = 0;
    const sections: Section[] = lengths.map((bars) => {
      const section = { phrases: [], bar, start: bar, end: bar + bars - 0.2 } as Section;
      bar += bars + 2;
      return section;
    });
    return { sections, grid: null as never, guided: true, downbeatConfidence: 1 };
  };

  test("keeps every section when the beat can be made to last", () => {
    const s = beat(SONG);
    const heard = vocal([8, 8, 8, 8, 8, 8]); // 58 bars of song over a 28-bar beat
    const short = suggestLayout(heard, s);
    assert.ok(short.dropped.length > 0, "without a reprise the end is left out");

    const whole = suggestLayout(heard, s, 400);
    assert.deepEqual(whole.dropped, []);
    assert.equal(whole.placements.length, 6);
    const last = whole.placements[5].bar + 8;
    const reprise = repriseFor(s, last)!;
    assert.ok(reprise, "a reprise to cover it");
    assert.ok(repriseStructure(s, reprise).endBar >= last, "the played beat reaches the last word");
  });

  test("a beat long enough is left as it is", () => {
    const s = beat(SONG);
    const heard = vocal([8, 4]);
    const layout = suggestLayout(heard, s, 400);
    assert.deepEqual(layout.dropped, []);
    assert.equal(repriseFor(s, layout.placements[1].bar + 4), null);
  });
});
