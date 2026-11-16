// Songs together (mashup.ts and the mashup ideas in aiIdeas.ts): which
// lanes belong to which song, when each is heard, and a DJ blend from one
// song into the next — on plain lane objects and synthetic beats.
//
//   node --import ./tests/support/register.mjs --test tests/mashup.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mixSignature, studioIdeas, timingSignature, type Session } from "../src/lib/client/aiIdeas.ts";
import type { StemAnalysis } from "../src/lib/client/analysis.ts";
import { beatStructure } from "../src/lib/client/arrange.ts";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import { heardSpans, mainBacking, songsOf, whoPlaysWhen } from "../src/lib/client/mashup.ts";
import type { PairContext } from "../src/lib/client/pairMatch.ts";
import { DEFAULT_FX, type StudioLane } from "../src/lib/client/studioStore.ts";

function lane(id: string, kind: StudioLane["kind"], title: string, opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind,
    trackTitle: title,
    artistName: "Test",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 120,
    duration: 120,
    offsetSeconds: 0,
    bpm: 120,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: { ...DEFAULT_FX },
    clips: null,
    xfade: null,
    automation: {},
    ...opts,
  });
}

describe("songs in the mix", () => {
  const lanes = [
    lane("a-voc", "vocals", "Song A"),
    lane("a-beat", "beat", "Song A"),
    lane("b-voc", "vocals", "Song B", { bpm: 100 }),
    lane("b-drums", "drums", "Song B (split)", { bpm: 100 }),
    lane("b-bass", "bass", "Song B (split)", { bpm: 100 }),
    lane("a-voc~layer-double", "vocals", "Song A"),
  ];

  test("lanes group by recording; layers go with their lead; the main backing is the beat, else the drums", () => {
    const songs = songsOf(lanes);
    assert.equal(songs.length, 2);
    assert.deepEqual(songs[0].lanes.map((l) => l.laneId), ["a-voc", "a-beat", "a-voc~layer-double"]);
    assert.deepEqual(songs[0].vocals.map((l) => l.laneId), ["a-voc"]);
    assert.equal(mainBacking(songs[0])!.laneId, "a-beat");
    assert.equal(mainBacking(songs[1])!.laneId, "b-drums");
  });

  test("a lane is heard where its clips play and its drawn volume is up", () => {
    const l = lane("x", "beat", "X", {
      clips: [
        { from: 0, to: 10, at: 0 },
        { from: 20, to: 30, at: 20 },
      ],
      automation: {
        volume: [
          { t: 0, v: 1 },
          { t: 24, v: 1 },
          { t: 26, v: 0 },
        ],
      },
    });
    const spans = heardSpans(l);
    assert.equal(spans.length, 2);
    assert.deepEqual(spans[0], { start: 0, end: 10 });
    assert.ok(Math.abs(spans[1].start - 20) < 1e-9 && Math.abs(spans[1].end - 25.9) < 0.05, JSON.stringify(spans[1]));
    assert.deepEqual(heardSpans({ ...l, muted: true }), []);
  });

  test("who plays when: a vocal row and a music row per song", () => {
    const rows = whoPlaysWhen(lanes.slice(0, 4));
    assert.deepEqual(
      rows.map((r) => `${r.title}:${r.part}`),
      ["Song A:Vocal", "Song A:Music", "Song B:Vocal", "Song B:Music"]
    );
  });
});

describe("a DJ blend from one song into the next", () => {
  /** A beat at 120 BPM with `bars` bars of full-strength music. */
  const structure = (bars: number) => {
    const rate = 86;
    const seconds = bars * 2 + 2;
    const energy = new Float32Array(Math.round(seconds * rate)).fill(1);
    const beats = Array.from({ length: bars * 4 + 4 }, (_, i) => 0.5 + i * 0.5);
    const onsets = new Float32Array(energy.length);
    for (const b of beats) onsets[Math.round(b * rate)] = 1;
    const analysis = { energy, onsets, lowOnsets: onsets, onsetRate: rate, neural: { beats, downbeats: beats.filter((_, i) => i % 4 === 0) } } as unknown as StemAnalysis;
    return beatStructure(analysis, 120)!;
  };

  test("the second song comes in on a bar line 16 bars before the first ends; the first fades and filters out", () => {
    const a = lane("a-beat", "beat", "Song A");
    const av = lane("a-voc", "vocals", "Song A");
    const b = lane("b-beat", "beat", "Song B", { bpm: 110 });
    const bv = lane("b-voc", "vocals", "Song B", { bpm: 110 });
    const lanes = [av, a, bv, b];
    const sa = structure(48);
    const pairs = new Map([
      ["none|a-beat", { structure: sa } as PairContext],
      ["none|b-beat", { structure: structure(40) } as PairContext],
    ]);
    const session: Session = {
      lanes,
      projectBpm: 120,
      analyses: new Map(),
      vocal: av,
      beat: a,
      pair: null,
      drop: null,
      beatParts: [],
      notes: [],
      pairs,
      signature: mixSignature(lanes),
      timing: timingSignature(lanes, 120),
      options: { vibe: "any" },
    };
    const ideas = studioIdeas(session);
    const blend = ideas.find((i) => i.id === "mash-blend:a-voc:b-voc")!;
    assert.ok(blend, `ideas: ${ideas.filter((i) => i.id.startsWith("mash-")).map((i) => i.id).join(", ")}`);
    const bPatch = blend.patches["b-beat"];
    assert.ok(Math.abs(bPatch.tempoRatio! - 120 / 110) < 0.01, "stretched to the first song's tempo");
    // The blend starts on A's bar endBar − 16, a 4-bar line; B's first downbeat (0.5 s into its audio) lands right on it.
    const at = Math.floor((sa.endBar - 16) / 4) * 4;
    const T = sa.grid.time(sa.downbeat + 4 * at);
    const bDownbeat = bPatch.offsetSeconds! + 0.5 / bPatch.tempoRatio!;
    assert.ok(Math.abs(bDownbeat - T) < 0.05, `B's bar 1 at ${bDownbeat}, A's bar ${at + 1} at ${T}`);
    const aVolume = blend.patches["a-beat"].automation!.volume!;
    assert.equal(aVolume[aVolume.length - 1].v, 0, "the first song fades out");
    assert.ok(Math.abs(aVolume[aVolume.length - 1].t - (T + 32)) < 0.05, "by the end of the 16 bars");
    assert.ok(blend.patches["a-beat"].automation!.filter!.some((p) => p.v < 0.5), "and filters out");
    assert.equal(blend.patches["b-voc"].automation!.volume![1].v, 0, "the second song's vocal waits for its turn");
    assert.ok(blend.aspects.includes("automation") && blend.aspects.includes("tempo"));
    // Its vocal stays on its beat.
    assert.equal(blend.patches["b-voc"].offsetSeconds, bPatch.offsetSeconds);
  });
});
