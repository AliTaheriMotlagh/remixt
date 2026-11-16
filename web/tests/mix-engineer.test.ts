// The mix engineer (mixEngineer.ts): measuring stems and mixes at full
// rate, what a lane's filters do to each band, the decisions made from
// those measurements, and mastering to a loudness target — on synthetic
// audio whose answers are known.
//
//   node --import ./tests/support/register.mjs --test tests/mix-engineer.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BANDS,
  BASS,
  HIGHS,
  LOUDNESS_TARGETS,
  MIDS,
  MUD,
  MUD_LIMIT,
  PRESENCE,
  SUB,
  bandGains,
  bandShares,
  compressorGainDb,
  db,
  engineerMix,
  fxPower,
  loudnessChange,
  masterToTarget,
  measureChannels,
  planMaster,
  type EngineerLane,
  type Tone,
} from "../src/lib/client/mixEngineer.ts";
import { DEFAULT_FX, type MasterFx } from "../src/lib/client/studioStore.ts";

const RATE = 44100;

/** Sines at `hz` with `amplitude`s, `seconds` long, the same in both channels. */
function tones(parts: [hz: number, amplitude: number][], seconds = 4): Float32Array[] {
  const x = new Float32Array(Math.round(seconds * RATE));
  for (const [hz, a] of parts) for (let i = 0; i < x.length; i++) x[i] += a * Math.sin((2 * Math.PI * hz * i) / RATE);
  return [x, Float32Array.from(x)];
}

describe("measuring", () => {
  test("a sine's power lands in its band, at its mean square", () => {
    const tone = measureChannels(tones([[1000, 0.5]]), RATE);
    const total = tone.bands.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(db(total) - db(0.125)) < 0.3, `total ${db(total)} dB`);
    assert.ok(bandShares(tone.bands)[MIDS] > -0.5, "nearly all of it in the mids");
    assert.ok(Math.abs(tone.peakDb - 20 * Math.log10(0.5)) < 0.05);
    assert.ok(Math.abs(tone.crestDb - 3.01) < 0.1, "a sine's crest is 3 dB");
    assert.ok(tone.correlation > 0.999);
  });

  test("loudness is BS.1770's: a full-scale 997 Hz sine in both channels is about +0 LUFS", () => {
    const tone = measureChannels(tones([[997, 1]]), RATE);
    assert.ok(Math.abs(tone.lufs - 0) < 0.15, `${tone.lufs}`);
    const quieter = measureChannels(tones([[997, 0.1]]), RATE);
    assert.ok(Math.abs(quieter.lufs + 20) < 0.15);
  });

  test("silence between lines doesn't count against a vocal's tone", () => {
    const [a] = tones([[1000, 0.5]], 8);
    for (let i = 0; i < a.length / 2; i++) a[i] = 0;
    const tone = measureChannels([a, a], RATE);
    assert.ok(Math.abs(tone.active - 0.5) < 0.1);
    assert.ok(Math.abs(db(tone.bands.reduce((s, b) => s + b, 0)) - db(0.125)) < 0.5, "its level while it sounds");
  });
});

describe("what a lane's filters do", () => {
  test("the bell is at 1.4 kHz with the gain asked for; the high-pass cuts below its frequency", () => {
    assert.ok(Math.abs(db(fxPower({ ...DEFAULT_FX, eqMid: -3 }, 1400)) + 3) < 0.05);
    const hp = { ...DEFAULT_FX, highpass: 120 };
    assert.ok(db(fxPower(hp, 30)) < -20);
    assert.ok(Math.abs(db(fxPower(hp, 2000))) < 0.1);
    const gains = bandGains(hp);
    assert.ok(db(gains[SUB]) < -15 && db(gains[MIDS]) > -0.2);
  });

  test("a cut where a sound is quiet barely changes how loud it reads", () => {
    const bands = BANDS.map((_, b) => (b === MIDS ? 1 : 1e-4));
    assert.ok(Math.abs(loudnessChange(bands, bandGains({ ...DEFAULT_FX, highpass: 150 }))) < 0.25);
    assert.ok(loudnessChange(bands, bandGains({ ...DEFAULT_FX, eqMid: -4 })) < -2);
  });
});

/** A made-up measurement: band shares in dB (from the loudest band), at `lufs`. */
function tone(shares: number[], lufs: number, extra: Partial<Tone> = {}): Tone {
  // Scaled so the bands add up to about the loudness asked for.
  const raw = shares.map((s) => 10 ** (s / 10));
  const total = raw.reduce((a, b) => a + b, 0);
  const bands = raw.map((p) => (p / total) * 10 ** ((lufs + 0.691) / 10));
  return { bands, lufs, peakDb: -3, crestDb: 10, correlation: 0.8, active: 1, seconds: 180, ...extra };
}
//                      Sub  Bass Low  Mud  Mid  Pres High Air
const BEAT_SHAPE = [    0,   2,   -2,  -6,  -6,  -14, -18, -26];
const MELODY_SHAPE = [ -20, -8,   -3,  -2,   0,  -8,  -14, -22];
const VOCAL_SHAPE = [  -30, -18,  -6,  -2,   0,  -4,  -12, -20];

function lane(id: string, kind: EngineerLane["kind"], t: Tone, opts: Partial<EngineerLane> = {}): EngineerLane {
  return { laneId: id, kind, title: id, volume: 1, muted: false, fx: { ...DEFAULT_FX }, tone: t, song: id, layer: false, ...opts };
}

describe("the lane compressor's level", () => {
  test("its automatic make-up gain lifts a quiet sound ~10 dB; a loud one less, since it's compressed more", () => {
    assert.ok(Math.abs(compressorGainDb(-50) - 9.9) < 0.05, `${compressorGainDb(-50)}`);
    assert.ok(compressorGainDb(-14) < compressorGainDb(-20));
    assert.ok(compressorGainDb(-14) > 0, "still louder than without it");
  });
});

describe("the engineer's decisions", () => {
  test("two beats never both keep their bass", () => {
    const plan = engineerMix({
      mode: "full",
      bpm: 90,
      beatId: "beatA",
      lanes: [lane("beatA", "beat", tone(BEAT_SHAPE, -12)), lane("beatB", "beat", tone(BEAT_SHAPE, -11)), lane("voc", "vocals", tone(VOCAL_SHAPE, -16))],
    });
    const fx = (id: string) => plan.lanes.find((l) => l.laneId === id)!.fx;
    assert.equal(plan.lowOwner, "beatA");
    assert.ok(fx("beatA").highpass <= 30);
    assert.ok(fx("beatB").highpass >= 120, `the other beat's lows are cut (${fx("beatB").highpass} Hz)`);
    assert.ok(fx("voc").highpass >= 70);
    // The vocal's own: its lowest notes decide where its low cut goes.
    const deep = engineerMix({ mode: "full", bpm: 90, lanes: [lane("beat", "beat", tone(BEAT_SHAPE, -12)), lane("v", "vocals", tone(VOCAL_SHAPE, -16), { lowestNoteHz: 110 })] });
    assert.equal(deep.lanes.find((l) => l.laneId === "v")!.fx.highpass, 70);
  });

  test("a bass line owns the low end over the beat; the beat's own drums keep their kick", () => {
    const plan = engineerMix({
      mode: "full",
      bpm: 120,
      lanes: [
        lane("bass", "bass", tone([-2, 0, -6, -14, -20, -30, -40, -50], -14), { song: "A" }),
        lane("drums", "drums", tone(BEAT_SHAPE, -13), { song: "A" }),
        lane("keys", "other", tone(MELODY_SHAPE, -15), { song: "B" }),
      ],
    });
    const fx = (id: string) => plan.lanes.find((l) => l.laneId === id)!.fx;
    assert.equal(plan.lowOwner, "bass");
    assert.ok(fx("drums").highpass <= 30, "same song's drums keep the kick");
    assert.ok(fx("keys").highpass >= 120);
    assert.notEqual(fx("keys").pan, 0, "another song's melody moves to the side");
    assert.equal(fx("bass").pan, 0);
  });

  test("a vocal the backing covers gets room: the backing's mids come down, the vocal clears it", () => {
    const plan = engineerMix({
      mode: "full",
      bpm: 95,
      lanes: [lane("beat", "beat", tone([-14, -10, -6, -4, 0, -1, -6, -16], -10)), lane("voc", "vocals", tone(VOCAL_SHAPE, -18))],
    });
    const beat = plan.lanes.find((l) => l.laneId === "beat")!;
    assert.ok(beat.fx.eqMid < 0, "the beat's mids cut");
    assert.ok(beat.reasons.some((r) => /covered the vocal/.test(r)));
    const presence = plan.masking.find((m) => m.band === PRESENCE)!;
    assert.ok(presence.after > presence.before, `${presence.before} → ${presence.after}`);
    assert.ok(beat.fx.duck > 0, "and it dips while the voice sings");
    const voc = plan.lanes.find((l) => l.laneId === "voc")!;
    assert.ok(voc.fx.eqMid > 0, "the vocal's presence lifted where cutting the beat wasn't enough");
  });

  test("a mix piled up in the low mids comes out clearly cleaner, the vocal cut first", () => {
    const muddy = [-4, -2, -2, -4, -6, -14, -18, -26];
    const plan = engineerMix({
      mode: "full",
      bpm: 90,
      lanes: [lane("beat", "beat", tone(muddy, -11)), lane("voc", "vocals", tone([-30, -12, -2, 0, -1, -6, -14, -22], -15))],
    });
    assert.ok(plan.mud.before > MUD_LIMIT, `starts muddy: ${plan.mud.before}`);
    assert.ok(plan.mud.after < plan.mud.before - 1.5, `${plan.mud.before} → ${plan.mud.after}`);
    assert.ok(plan.lanes.find((l) => l.laneId === "voc")!.fx.eqLowMid <= -3);
    assert.ok(plan.lanes.find((l) => l.laneId === "beat")!.fx.eqLowMid >= -3, "the bass line's own body is cut least");
    assert.ok(plan.lines.some((l) => /pile-up/.test(l)));
  });

  test("levels: the lead sits its offset under the backing as the ear weighs it, faders in range", () => {
    const plan = engineerMix({
      mode: "full",
      bpm: 90,
      lanes: [lane("beat", "beat", tone(BEAT_SHAPE, -9)), lane("voc", "vocals", tone(VOCAL_SHAPE, -30)), lane("feat", "vocals", tone(VOCAL_SHAPE, -20))],
      leadId: "voc",
    });
    for (const l of plan.lanes) assert.ok(l.volume > 0 && l.volume <= 1.5, `${l.laneId} at ${l.volume}`);
    const level = (id: string) => plan.lanes.find((l) => l.laneId === id)!;
    assert.equal(level("voc").role, "lead");
    assert.equal(level("feat").role, "vocal");
    assert.ok(level("feat").fx.pan !== 0, "the second voice beside the lead");
    // The quiet lead needed more than the faders give: everything came down together, and it says so.
    assert.equal(level("voc").volume, 1.5);
    assert.ok(plan.lines.some((l) => /down together/.test(l)));
  });

  test("on a style, the style's colour stays — only the corrections go on top", () => {
    const styled = { ...DEFAULT_FX, lowpass: 7000, drive: 0.25, reverb: 0.22, reverbSize: 2.4, highpass: 220, compress: true };
    const plan = engineerMix({
      mode: "on-style",
      bpm: 80,
      lanes: [lane("beat", "beat", tone(BEAT_SHAPE, -12)), lane("voc", "vocals", tone(VOCAL_SHAPE, -16), { fx: styled })],
    });
    const voc = plan.lanes.find((l) => l.laneId === "voc")!.fx;
    assert.equal(voc.lowpass, 7000);
    assert.equal(voc.drive, 0.25);
    assert.equal(voc.reverb, 0.22);
    assert.equal(voc.highpass, 220, "a style's higher low cut is never lowered");
  });

  test("muted lanes, layers and lanes not measured are left alone", () => {
    const plan = engineerMix({
      mode: "full",
      bpm: 90,
      lanes: [
        lane("beat", "beat", tone(BEAT_SHAPE, -12)),
        lane("voc", "vocals", tone(VOCAL_SHAPE, -16)),
        lane("voc~layer-double", "vocals", tone(VOCAL_SHAPE, -16), { layer: true }),
        lane("off", "beat", tone(BEAT_SHAPE, -12), { muted: true }),
        lane("new", "drums", undefined as never),
      ],
    });
    assert.deepEqual(plan.lanes.map((l) => l.laneId).sort(), ["beat", "voc"]);
  });
});

describe("mastering to a target", () => {
  const streaming = LOUDNESS_TARGETS.find((t) => t.id === "streaming")!;
  const loud = LOUDNESS_TARGETS.find((t) => t.id === "loud")!;

  test("a dull, light mix gets lows and highs; a spiky one more glue", () => {
    const plan = planMaster({ lufs: -20, peakDb: -3, crestDb: 18, shares: [-18, -10, -5, -6, -5, -14, -26, -36] }, streaming);
    assert.ok(plan.master.low > 0 && plan.master.high > 0);
    const calm = planMaster({ lufs: -20, peakDb: -3, crestDb: 9, shares: [-9, -4.5, -6.5, -10, -9.5, -16, -20, -27] }, streaming);
    assert.ok(plan.master.glue > calm.master.glue);
    assert.equal(calm.master.low, 0);
    assert.equal(calm.master.high, 0);
  });

  test("checked by rendering: the gain is corrected until it measures on target", async () => {
    // A stand-in for the mix: tones, their level following the master's gain (and half of glue's make-up).
    const base = tones([[60, 0.05], [440, 0.05], [3000, 0.02]], 3);
    let renders = 0;
    const render = async (master: MasterFx) => {
      renders++;
      const k = 10 ** (((master.gain ?? 0) + master.glue * 2.8) / 20);
      return { channels: base.map((c) => c.map((v) => v * k)), rate: RATE };
    };
    const result = await masterToTarget(render, streaming);
    assert.ok(Math.abs(result.after.lufs - (streaming.lufs + 1)) < 0.5, `${result.after.lufs}`);
    assert.ok(result.before.lufs < result.after.lufs - 5);
    assert.ok(renders <= 4);
    assert.equal(result.short, false);
  });

  test("a target it can't reach cleanly says so instead of squashing the mix", async () => {
    // Flattened already (a crest of a couple of dB): pushing it would only squash it more.
    const squashed = tones([[100, 0.7], [150, 0.7]], 3).map((c) => c.map((v) => Math.max(-0.03, Math.min(0.03, v * 3))));
    const result = await masterToTarget(async () => ({ channels: squashed, rate: RATE }), loud);
    assert.equal(result.short, true);
  });
});

void [BASS, HIGHS, MUD];
