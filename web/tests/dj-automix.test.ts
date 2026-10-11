// The DJ simulator's auto-mix (lib/client/dj/autoMix.ts), against a fake
// engine whose clock the test moves: it cues the incoming song, starts it on
// the phrase line, swaps the bass halfway and ends on the new deck.
//
//   node --import ./tests/support/register.mjs --test tests/dj-automix.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AutoMix, BLEND_BEATS, type AutoMixEngine } from "../src/lib/client/dj/autoMix.ts";
import { emptySnapshot, type DeckId, type DjSnapshot, type TrackInfo } from "../src/lib/client/dj/djTypes.ts";

const track = (id: string, bpm: number): TrackInfo => ({
  id,
  title: id,
  artist: "Test",
  genre: "House",
  bpm,
  key: { tonic: 0, mode: "minor" },
  camelot: "5A",
  duration: 600,
  firstBeat: 0,
  bars: 300,
  sections: [],
});

function fakeEngine(bpmA = 120, bpmB = 124) {
  const snap: DjSnapshot = emptySnapshot();
  snap.decks.A.track = track("a", bpmA);
  snap.decks.B.track = track("b", bpmB);
  const log: string[] = [];
  const engine: AutoMixEngine & { advance: (sec: number) => void; snap: DjSnapshot; log: string[] } = {
    snap,
    log,
    snapshot: () => structuredClone(snap),
    sync(id: DeckId) {
      const other = snap.decks[id === "A" ? "B" : "A"];
      const me = snap.decks[id];
      const rate = (other.track!.bpm * other.rate) / me.track!.bpm;
      if (Math.abs(rate - 1) * 100 > me.tempoRange) return "out-of-range";
      me.rate = rate;
      log.push(`sync ${id}`);
      return "ok";
    },
    setTempoRange: (id, r) => void (snap.decks[id].tempoRange = r),
    seek: (id, pos) => void (snap.decks[id].position = pos),
    play: (id, when) => {
      snap.decks[id].playing = true;
      // Scheduled ahead on the audio clock: it starts the moment that comes.
      if (when !== undefined) snap.decks[id].position -= (when - snap.time) * snap.decks[id].rate;
      log.push(`play ${id}`);
    },
    pause: (id) => {
      snap.decks[id].playing = false;
      log.push(`pause ${id}`);
    },
    setVolume: (id, v) => void (snap.decks[id].volume = v),
    setKill: (id, band, on) => void (snap.decks[id].kill[band] = on),
    setCrossfader: (x) => void (snap.mix.crossfader = x),
    advance(sec) {
      snap.time += sec;
      for (const d of Object.values(snap.decks)) if (d.playing && d.track) d.position += sec * d.rate;
    },
  };
  return engine;
}

/** Runs the transition in 50 ms ticks until it ends (or a minute passes). */
function run(mix: AutoMix, engine: ReturnType<typeof fakeEngine>, seen: Set<string>) {
  for (let i = 0; i < 1200 && mix.phase !== "done" && mix.phase !== "stopped"; i++) {
    engine.advance(0.05);
    mix.tick();
    seen.add(mix.phase);
  }
}

describe("auto-mix", () => {
  test("says what's missing instead of starting", () => {
    const engine = fakeEngine();
    assert.match(AutoMix.blocker(engine.snapshot(), "A") ?? "", /play on deck A/);
    engine.snap.decks.B.track = null;
    engine.snap.decks.A.playing = true;
    assert.match(AutoMix.blocker(engine.snapshot(), "A") ?? "", /deck B/);
  });

  test("blends A into B on the phrase line, swapping the bass halfway", () => {
    const engine = fakeEngine();
    engine.snap.decks.A.playing = true;
    engine.snap.decks.A.position = 5; // beat 10 at 120 BPM: 22 beats to the next phrase line
    engine.snap.mix.crossfader = -1;
    const mix = new AutoMix(engine, "A");
    assert.equal(mix.start(), true);
    assert.equal(engine.snap.decks.B.playing, false, "cued, not started");
    assert.equal(engine.snap.decks.B.volume, 0);
    assert.equal(engine.snap.decks.B.kill.low, true, "comes in with its bass cut");
    assert.ok(Math.abs(engine.snap.decks.B.rate * 124 - 120) < 1e-9, "matched to A's tempo");

    const seen = new Set<string>();
    run(mix, engine, seen);
    assert.equal(mix.phase, "done");
    for (const phase of ["wait", "blend", "swap", "out"]) assert.ok(seen.has(phase), `went through ${phase}`);
    // B started on beat 32 of A (16 s at 120 BPM), give or take a tick.
    const started = engine.log.indexOf("play B");
    assert.ok(started >= 0);
    const d = engine.snapshot();
    assert.equal(d.decks.A.playing, false, "the old song stops");
    assert.equal(d.decks.B.playing, true);
    assert.equal(d.mix.crossfader, 1);
    assert.equal(d.decks.B.kill.low, false, "the new song's bass is back");
    assert.equal(d.decks.A.kill.low, false, "the old deck is left ready for next time");
    assert.ok(d.decks.B.position * (124 / 60) >= BLEND_BEATS - 1, "the blend lasted 16 bars");
  });

  test("starts the new song exactly on the line, in step", () => {
    const engine = fakeEngine();
    engine.snap.decks.A.playing = true;
    engine.snap.decks.A.position = 5;
    const mix = new AutoMix(engine, "A");
    mix.start();
    for (let i = 0; i < 400 && mix.phase === "wait"; i++) {
      engine.advance(0.07);
      mix.tick();
    }
    // Once the scheduled start has come, B's beats sit exactly on A's.
    engine.advance(0.5);
    const { A, B } = engine.snapshot().decks;
    const beatsA = (A.position * 120) / 60;
    const beatsB = (B.position * 124) / 60;
    assert.ok(Math.abs(beatsA - 32 - beatsB) < 1e-6, `B is on A's phrase line (A ${beatsA}, B ${beatsB})`);
  });

  test("fits the transition into what's left of a short song", () => {
    const engine = fakeEngine();
    engine.snap.decks.A.track!.duration = 60; // 120 beats
    engine.snap.decks.A.playing = true;
    engine.snap.decks.A.position = 43; // 34 beats left: no room for a 32-beat wait
    const mix = new AutoMix(engine, "A");
    assert.equal(mix.start(), true);
    const seen = new Set<string>();
    run(mix, engine, seen);
    assert.equal(mix.phase, "done", "finished before deck A ran out");
    assert.ok(engine.snap.decks.A.position <= 60);

    const late = fakeEngine();
    late.snap.decks.A.track!.duration = 60;
    late.snap.decks.A.playing = true;
    late.snap.decks.A.position = 58;
    const tooLate = new AutoMix(late, "A");
    assert.equal(tooLate.start(), false);
    assert.match(tooLate.reason ?? "", /about to end/);
  });

  test("widens the tempo range when SYNC can't reach", () => {
    const engine = fakeEngine(120, 150);
    engine.snap.decks.A.playing = true;
    const mix = new AutoMix(engine, "A");
    assert.equal(mix.start(), true);
    assert.equal(engine.snap.decks.B.tempoRange, 100);
  });

  test("stops if the playing deck is stopped, and cancel gives the decks back", () => {
    const engine = fakeEngine();
    engine.snap.decks.A.playing = true;
    const mix = new AutoMix(engine, "A");
    mix.start();
    engine.snap.decks.A.playing = false;
    mix.tick();
    assert.equal(mix.phase, "stopped");
    assert.match(mix.reason ?? "", /stopped/);

    const again = new AutoMix(engine, "A");
    engine.snap.decks.A.playing = true;
    again.start();
    again.cancel();
    assert.equal(again.phase, "stopped");
    assert.equal(engine.snap.decks.B.volume, 0.8);
    assert.equal(engine.snap.decks.B.kill.low, false);
  });
});
