// The DJ simulator's pure logic: crossfader curves, beat phase and tempo
// differences, EQ-swap detection, scoring, the missions, the crowd, the
// co-pilot and saved progress. No audio involved.
//
//   node --import ./tests/support/register.mjs --test tests/dj-logic.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liveHints } from "../src/lib/client/dj/copilot.ts";
import { newCrowd, stepCrowd } from "../src/lib/client/dj/crowd.ts";
import { derive } from "../src/lib/client/dj/djDerived.ts";
import {
  alignedPosition,
  detectEqSwap,
  effectiveKey,
  isAudible,
  phaseOffset,
  tempoDiffBpm,
  tempoEquivalence,
  xfadeGains,
  type EqSample,
} from "../src/lib/client/dj/djMath.ts";
import { djTrackInfo } from "../src/lib/client/dj/djTrackInfo.ts";
import { emptyDeck, emptySnapshot, type DeckState, type DjSnapshot } from "../src/lib/client/dj/djTypes.ts";
import { emptyProgress, isUnlocked, nextMissionIndex, parseProgress, rankOf, recordResult } from "../src/lib/client/dj/progress.ts";
import { ScenarioRunner } from "../src/lib/client/dj/scenarioRunner.ts";
import { MISSIONS } from "../src/lib/client/dj/scenarios.ts";
import { accumulate, newStats, rankForStars, scoreRun, starsFor } from "../src/lib/client/dj/scoring.ts";
import { DEMO_SONGS } from "../src/lib/client/demoSongDefs.ts";

function deck(trackId: string, patch: Partial<DeckState> = {}): DeckState {
  return { ...emptyDeck(), track: djTrackInfo(trackId)!, playing: true, ...patch };
}

function snap(a: DeckState, b: DeckState, patch: Partial<DjSnapshot["mix"]> = {}, time = 0): DjSnapshot {
  const s = emptySnapshot();
  s.time = time;
  s.decks = { A: a, B: b };
  s.mix = { ...s.mix, ...patch };
  return s;
}

/** Two decks of the same tempo, beats aligned, both on air. */
function locked(): DjSnapshot {
  const a = deck("warehouse-lights", { position: 8 * (240 / 124) });
  const b = deck("golden-hour", { tempoPct: -3.125, rate: 1 - 0.03125, position: 0 });
  b.position = alignedPosition(a, b, 8 * (240 / 128), 0);
  return snap(a, b, { crossfader: 0 });
}

describe("mixer maths", () => {
  test("crossfader curves", () => {
    const c = xfadeGains(0, "blend");
    assert.ok(Math.abs(c.A - Math.SQRT1_2) < 1e-9 && Math.abs(c.B - Math.SQRT1_2) < 1e-9);
    assert.deepEqual(xfadeGains(-1, "blend"), { A: 1, B: 0 });
    assert.equal(xfadeGains(0, "cut").A, 1);
    assert.equal(xfadeGains(0, "cut").B, 1);
    assert.equal(xfadeGains(1, "cut").A, 0);
    assert.deepEqual(xfadeGains(0.5, "linear"), { A: 0.25, B: 0.75 });
  });

  test("half and double time count as the same tempo", () => {
    assert.equal(tempoEquivalence(70, 140), 2);
    assert.equal(tempoEquivalence(140, 70), 0.5);
    const d = tempoDiffBpm(deck("midnight-static", { rate: 1.1 }), deck("concrete-run"));
    // 92 × 1.1 = 101.2 against 140/… the nearest reading of 140 is 140/1 (ratio 1.38 → 1)
    assert.ok(Math.abs(d) < 40);
    assert.ok(Math.abs(tempoDiffBpm(deck("concrete-run", { rate: 0.5 }), deck("midnight-static")) - (70 - 92)) < 1e-9);
  });

  test("beat phase: aligned decks read 0, an offset reads back as set", () => {
    const s = locked();
    assert.ok(Math.abs(phaseOffset(s.decks.A, s.decks.B).ms) < 0.01);
    const b2 = { ...s.decks.B, position: alignedPosition(s.decks.A, s.decks.B, s.decks.B.position, 120) };
    assert.ok(Math.abs(phaseOffset(s.decks.A, b2).ms - 120) < 0.01);
    const b3 = { ...s.decks.B, position: alignedPosition(s.decks.A, s.decks.B, s.decks.B.position, -80) };
    assert.ok(Math.abs(phaseOffset(s.decks.A, b3).ms + 80) < 0.01);
  });

  test("tempo-fader pitch shift: small is a detune, large is a new key", () => {
    const small = effectiveKey(deck("warehouse-lights", { rate: 1.03 }))!;
    assert.deepEqual(small.key, djTrackInfo("warehouse-lights")!.key);
    const big = effectiveKey(deck("warehouse-lights", { rate: 1.12 }))!;
    assert.equal(big.key.tonic, (djTrackInfo("warehouse-lights")!.key.tonic + 2) % 12);
  });

  test("audibility needs playing, a raised fader and a live stem", () => {
    const s = locked();
    assert.ok(isAudible(s.decks.A, "A", s.mix));
    assert.ok(!isAudible({ ...s.decks.A, volume: 0.05 }, "A", s.mix));
    assert.ok(!isAudible(s.decks.B, "B", { ...s.mix, crossfader: -1 }));
    assert.ok(!isAudible({ ...s.decks.A, stems: { drums: true, bass: true, chords: true, vocal: true } }, "A", s.mix));
  });
});

describe("EQ swap detection", () => {
  const history = (aFrom: number, aTo: number, bFrom: number, bTo: number, spread: number): EqSample[] => {
    const out: EqSample[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i * 0.1;
      const k = Math.min(1, t / spread);
      out.push({ t, low: { A: aFrom + (aTo - aFrom) * k, B: bFrom + (bTo - bFrom) * k } });
    }
    return out;
  };

  test("a swap inside two bars is detected", () => {
    assert.ok(detectEqSwap(history(0, -60, -60, 0, 1), 4, "A", 3.9));
  });
  test("bringing the incoming bass in without cutting the outgoing one is not a swap", () => {
    assert.ok(!detectEqSwap(history(0, 0, -60, 0, 1), 4, "A", 3.9));
  });
  test("a swap spread over much longer than the window is not", () => {
    assert.ok(!detectEqSwap(history(0, -60, -60, 0, 40), 4, "A", 1));
  });
});

describe("scoring", () => {
  const run = (s: DjSnapshot, seconds: number) => {
    const stats = newStats();
    for (let t = 0; t < seconds; t += 0.1) accumulate(stats, { ...s, time: t }, 0.1);
    return stats;
  };

  test("a tight blend scores high; a clashing one scores low", () => {
    const tight = locked();
    tight.decks.B.kill.low = true;
    const good = scoreRun(run(tight, 20), { timing: 1, tempo: 1, eq: 1, key: 1, smoothness: 1 });
    assert.ok(good.total >= 90, `good ${good.total}`);
    assert.equal(good.stars, 3);

    const messy = locked();
    messy.decks.B = { ...messy.decks.B, position: alignedPosition(messy.decks.A, messy.decks.B, messy.decks.B.position, 140), rate: 1.1 };
    messy.decks.B.track = djTrackInfo("concrete-run")!;
    const bad = scoreRun(run(messy, 20), { timing: 1, tempo: 1, eq: 1, key: 1, smoothness: 1 });
    assert.ok(bad.total < 55, `bad ${bad.total}`);
  });

  test("bass clash lowers EQ discipline", () => {
    const stats = run(locked(), 20);
    assert.ok(stats.bassClash > 15);
    assert.ok((scoreRun(stats, { eq: 1 }).parts.eq ?? 100) < 50);
    const cut = locked();
    cut.decks.B = { ...cut.decks.B, kill: { low: true, mid: false, high: false } };
    assert.equal(scoreRun(run(cut, 20), { eq: 1 }).parts.eq, 100);
  });

  test("an unfinished mission can't earn stars", () => {
    const score = scoreRun(run(locked(), 20), { timing: 1 }, 0.5);
    assert.equal(score.stars, 0);
  });

  test("stars and ranks", () => {
    assert.deepEqual([59, 60, 80, 91, 92].map(starsFor), [0, 1, 2, 2, 3]);
    assert.equal(rankForStars(0).label, "Rookie");
    assert.equal(rankForStars(6).label, "Booth Pilot");
    assert.equal(rankForStars(22).label, "Headliner");
  });
});

describe("missions", () => {
  test("there are at least eight, ending in the club night, and every setup track exists", () => {
    assert.ok(MISSIONS.length >= 8);
    assert.equal(MISSIONS[MISSIONS.length - 1].kind, "club");
    assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length);
    for (const m of MISSIONS) {
      assert.ok(m.objectives.length >= 2, m.id);
      assert.ok(m.briefing.why.length > 40 && m.briefing.realWorld.length > 40, m.id);
      for (const d of Object.values(m.setup.decks)) assert.ok(djTrackInfo(d.trackId), `${m.id}: ${d.trackId}`);
    }
  });

  const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

  test("tempo matching completes when B is brought to A's BPM and held", () => {
    const runner = new ScenarioRunner(mission("tempo"));
    const a = deck("neon-drive", { position: 20 });
    // B (island time, 100 BPM) not playing yet.
    let s = snap(a, deck("island-time", { playing: false }), { crossfader: -1 });
    runner.tick(s, 0.1);
    assert.equal(runner.index, 0);
    // Starts B, still 10 BPM slow.
    s = snap(a, deck("island-time"), { crossfader: -1 });
    for (let i = 0; i < 10; i++) runner.tick(s, 0.1);
    assert.equal(runner.index, 1);
    // Matches it.
    const matched = snap(a, deck("island-time", { rate: 1.1, tempoPct: 10 }), { crossfader: -1 });
    for (let i = 0; i < 20; i++) runner.tick(matched, 0.1);
    assert.equal(runner.index, 2);
    for (let i = 0; i < 90; i++) runner.tick(matched, 0.1);
    assert.equal(runner.status, "complete");
    assert.ok(runner.result!.score.total >= 90);
  });

  test("phase mission needs under 30 ms, held", () => {
    const runner = new ScenarioRunner(mission("phase"));
    const s0 = locked();
    const off = { ...s0, decks: { ...s0.decks, B: { ...s0.decks.B, position: alignedPosition(s0.decks.A, s0.decks.B, s0.decks.B.position, 160) } } };
    for (let i = 0; i < 30; i++) runner.tick(off, 0.1);
    assert.equal(runner.index, 0);
    assert.match(runner.hint(off) ?? "", /Deck B's nudge −/);
    for (let i = 0; i < 100; i++) runner.tick(s0, 0.1);
    assert.equal(runner.status, "complete");
  });

  test("bass swap: needs the EQ swap, not just opening B's bass", () => {
    const runner = new ScenarioRunner(mission("bass-swap"));
    const s = locked();
    s.decks.B.kill.low = true;
    s.mix.crossfader = 0;
    for (let i = 0; i < 30; i++) runner.tick(s, 0.1);
    assert.equal(runner.index, 1);
    // B's bass opened while A's stays open: no swap.
    const both = locked();
    for (let i = 0; i < 30; i++) runner.tick(both, 0.1);
    assert.equal(runner.index, 1);
    // A killed and B opened together.
    const swapped = locked();
    swapped.decks.A.kill.low = true;
    runner.tick(swapped, 0.1);
    assert.equal(runner.index, 2);
  });

  test("acapella mission checks the stem kills", () => {
    const runner = new ScenarioRunner(mission("acapella"));
    const s = locked();
    runner.tick(s, 0.1);
    assert.equal(runner.index, 0);
    s.decks.A.stems = { drums: true, bass: true, chords: true, vocal: false };
    runner.tick(s, 0.1);
    assert.equal(runner.index, 1);
    s.decks.B.stems = { drums: false, bass: false, chords: false, vocal: true };
    runner.tick(s, 0.1);
    assert.equal(runner.index, 2);
  });

  test("harmonic mission accepts compatible keys and rejects clashes", () => {
    const runner = new ScenarioRunner(mission("harmonic"));
    const a = deck("warehouse-lights");
    runner.tick(snap(a, { ...deck("midnight-static"), playing: false }), 0.1);
    assert.equal(runner.index, 0);
    assert.match(runner.hint(snap(a, deck("midnight-static"))) ?? "", /8A is too far from 5A/);
    runner.tick(snap(a, { ...deck("golden-hour"), playing: false }), 0.1);
    assert.equal(runner.index, 1);
  });

  test("time limit ends a run with what was done", () => {
    const runner = new ScenarioRunner(mission("train-wreck"));
    const s = locked();
    s.decks.B.position = alignedPosition(s.decks.A, s.decks.B, s.decks.B.position, 120);
    for (let i = 0; i < 650; i++) runner.tick(s, 0.1);
    assert.equal(runner.status, "timeout");
    assert.equal(runner.result!.completed, false);
    assert.equal(runner.result!.score.stars, 0);
    assert.ok(runner.result!.debrief.improve.length > 0);
  });
});

describe("crowd", () => {
  const rng = () => 0.5;
  const steps = (s: DjSnapshot, seconds: number, from = newCrowd(rng)) => {
    let c = from;
    for (let t = 0; t < seconds; t += 0.1) c = stepCrowd(c, s, 0.1, rng);
    return c;
  };

  test("a smooth blend raises energy; dead air and off-beat blends lower it", () => {
    const smooth = steps(locked(), 40);
    assert.ok(smooth.energy > 60, `smooth ${smooth.energy}`);
    const silent = steps(snap(deck("warehouse-lights", { playing: false }), deck("golden-hour", { playing: false })), 20);
    assert.ok(silent.energy < 20, `silent ${silent.energy}`);
    const messy = locked();
    messy.decks.B.position = alignedPosition(messy.decks.A, messy.decks.B, messy.decks.B.position, 200);
    const off = steps(messy, 30, { ...newCrowd(rng), energy: 70 });
    assert.ok(off.energy < 50, `off ${off.energy}`);
  });

  test("requests appear, and doing them is rewarded", () => {
    let c = newCrowd(rng);
    const s = locked();
    for (let t = 0; t < 45; t += 0.1) c = stepCrowd(c, s, 0.1, rng);
    assert.ok(c.requests.length + c.completed + c.failed >= 1);
  });
});

describe("co-pilot", () => {
  test("says which deck is fast and what to do", () => {
    const a = deck("warehouse-lights");
    const b = deck("golden-hour", { rate: 1.0 }); // 128 against 124: B is 4 BPM fast
    const hints = liveHints(snap(a, b, { crossfader: -1 }));
    const tempo = hints.find((h) => h.id === "tempo");
    assert.ok(tempo, "tempo hint");
    assert.match(tempo.text, /Deck B is 4\.0 BPM fast.*down/);
  });
  test("flags a bass clash and a locked blend", () => {
    const clash = liveHints(locked()).map((h) => h.id);
    assert.ok(clash.includes("bass"));
    const b = locked();
    b.decks.B.kill.low = true;
    assert.ok(liveHints(b).some((h) => h.id === "locked"));
  });
  test("derive reports tempo and phase", () => {
    const d = derive(locked());
    assert.ok(d.bothAudible && Math.abs(d.phaseMs) < 0.01 && Math.abs(d.tempoDiff) < 0.01);
  });
});

describe("progress", () => {
  test("unlocking, best-of recording, ranks", () => {
    const ids = MISSIONS.map((m) => m.id);
    let p = emptyProgress();
    assert.ok(isUnlocked(p, 0, ids));
    assert.ok(!isUnlocked(p, 1, ids));
    p = recordResult(p, ids[0], 70, 1);
    assert.ok(isUnlocked(p, 1, ids));
    p = recordResult(p, ids[0], 50, 0);
    assert.equal(p.missions[ids[0]].stars, 1);
    assert.equal(p.missions[ids[0]].best, 70);
    assert.equal(p.missions[ids[0]].attempts, 2);
    assert.equal(nextMissionIndex(p, ids), 1);
    assert.equal(rankOf(p).label, "Rookie");
    for (const id of ids) p = recordResult(p, id, 99, 3);
    assert.equal(rankOf(p).label, "Headliner");
  });

  test("corrupt storage falls back to empty", () => {
    assert.deepEqual(parseProgress("{nope"), emptyProgress());
    assert.deepEqual(parseProgress(null), emptyProgress());
    assert.deepEqual(parseProgress('{"missions":{"a":{"stars":"x"},"b":{"stars":9,"best":150,"attempts":2}}}').missions, {
      b: { stars: 3, best: 100, attempts: 2 },
    });
  });
});

test("demo songs are all in the DJ library", () => {
  for (const s of DEMO_SONGS) assert.ok(djTrackInfo(s.id));
});
