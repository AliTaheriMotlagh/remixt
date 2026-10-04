// The AI producer's engine, on plain lane objects: the studio's ideas and
// mix check (aiIdeas.ts), and auditioning ideas from the original mix
// (aiTrial.ts).
//
//   node --import ./tests/support/register.mjs --test tests/ai-producer.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  checkMix,
  compatible,
  findDrop,
  fixesOf,
  ideaFits,
  mixFix,
  mixSignature,
  studioIdeas,
  timingSignature,
  type Idea,
  type Session,
} from "../src/lib/client/aiIdeas.ts";
import { compare, keepTrial, revertTrial, tryIdea, useAiTrial } from "../src/lib/client/aiTrial.ts";
import type { BeatStructure } from "../src/lib/client/arrange.ts";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import { resetHistory, undo } from "../src/lib/client/studioHistory.ts";
import { DEFAULT_FX, useStudioStore, type LoadableStem, type StudioLane } from "../src/lib/client/studioStore.ts";

/** 120 BPM: a bar is 2 seconds. */
const BPM = 120;

function lane(id: string, kind: StudioLane["kind"], opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind,
    trackTitle: id,
    artistName: "Test",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 120,
    duration: 120,
    offsetSeconds: 0,
    bpm: BPM,
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

/** The beat's drums, bass and melody, as the library lists them. */
const PARTS: LoadableStem[] = (["drums", "bass", "other"] as const).map((kind) => ({
  id: `stem-beat-${kind}`,
  kind,
  track_title: "beat",
  artist_name: "Test",
  peaks_json: "[]",
  track_duration: 120,
  track_bpm: BPM,
}));

function session(lanes: StudioLane[], loudness: Record<string, number> = {}, beatParts: LoadableStem[] = []): Session {
  return {
    lanes,
    projectBpm: BPM,
    analyses: new Map(Object.entries(loudness).map(([id, l]) => [id, { loudness: l } as never])),
    vocal: lanes.find((l) => l.kind === "vocals") ?? null,
    beat: lanes.find((l) => l.kind === "beat") ?? null,
    pair: null,
    drop: null,
    beatParts,
    notes: [],
    signature: mixSignature(lanes),
    timing: timingSignature(lanes, BPM),
    options: { vibe: "any" },
  };
}

function structure(barEnergy: number[]): BeatStructure {
  return { barEnergy, bars: barEnergy.length, endBar: barEnergy.length, introBars: 4, downbeat: 0, downbeatConfidence: 1, grid: null as never };
}

describe("finding the beat's drop", () => {
  test("the bar where the energy jumps", () => {
    const energy = [...Array(16).fill(0.2), ...Array(8).fill(1), ...Array(8).fill(0.5)];
    assert.deepEqual(findDrop(structure(energy)), { bar: 16, kind: "drop" });
  });

  test("no jump anywhere: its loudest stretch", () => {
    const energy = [...Array(8).fill(0.8), ...Array(4).fill(1), ...Array(8).fill(0.9)];
    assert.deepEqual(findDrop(structure(energy)), { bar: 8, kind: "peak" });
  });

  test("too short a beat has none", () => {
    assert.equal(findDrop(structure(Array(8).fill(1))), null);
  });
});

describe("the studio's own ideas", () => {
  // A beat from 0s; a vocal that starts at 8s (bar 5) and ends at 44s; the beat
  // plays on to 120s; a second vocal singing over the first.
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const double = lane("double", "vocals", { offsetSeconds: 10, originalDuration: 30 });
  const drums = lane("drums", "drums");

  test("one button to make it sound good, fixes read from where the clips are, drops with the beat's parts", () => {
    const ids = studioIdeas(session([beat, vocal, double, drums])).map((i) => i.id);
    for (const id of ["auto-good", "fix-vocal-clash", "parts-drop", "parts-intro", "sound-punch", "moment-acapella"]) {
      assert.ok(ids.includes(id), `expected ${id} in ${ids.join(", ")}`);
    }
    assert.equal(ids[0], "auto-good", "make it sound good comes first");
  });

  test("every idea has a name, a few plain words, and says what it touches", () => {
    for (const idea of studioIdeas(session([beat, vocal, double, drums]))) {
      assert.ok(idea.icon && idea.title && idea.short && idea.why, idea.id);
      assert.ok(idea.aspects.length > 0, idea.id);
    }
  });

  test("ideas touching the same thing can't be combined", () => {
    const ideas = studioIdeas(session([beat, vocal, drums]));
    const get = (id: string) => ideas.find((i) => i.id === id)!;
    assert.equal(compatible(get("sound-lofi"), get("sound-punch")), false);
    assert.equal(compatible(get("sound-lofi"), get("parts-drop")), true);
  });
});

describe("the mix check", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });

  test("a buried vocal is flagged, with the fix to press", () => {
    const s = session([beat, vocal], { beat: 1, vocal: 0.3 });
    const checks = checkMix(s, s.lanes);
    const volume = checks.find((c) => c.id === "volume")!;
    assert.equal(volume.status, "bad");
    assert.match(volume.text, /buried/);
    assert.equal(volume.fix, "balance");
    assert.equal(checks.find((c) => c.id === "sound"), undefined, "how the vocal sounds is taste, not a problem");
  });

  test("fixing the mix only ever changes volumes, timing and key — never effects", () => {
    const s = session([beat, vocal], { beat: 1, vocal: 0.3 });
    for (const idea of [mixFix(s, ["balance", "length"])!, studioIdeas(s).find((i) => i.id === "auto-good")!]) {
      for (const [id, patch] of Object.entries(idea.patches)) {
        const lane = s.lanes.find((l) => l.laneId === id)!;
        if (lane.kind === "vocals") assert.equal(patch.fx, undefined, `${idea.id} put effects on the vocal`);
      }
    }
    const balance = mixFix(s, ["balance"])!;
    assert.deepEqual(balance.aspects, ["levels"]);
  });

  test("after balancing, it's all good", () => {
    const s = session([beat, vocal], { beat: 1, vocal: 0.3 });
    const balance = mixFix(s, ["balance"])!;
    const after = s.lanes.map((l) => ({ ...l, ...balance.patches[l.laneId] }));
    const checks = checkMix(s, after);
    assert.equal(checks.find((c) => c.id === "volume")!.status, "good");
  });

  test("fixes build on each other: fixing the ending doesn't undo the volume", () => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal], projectBpm: BPM, duration: 120 });
    const s = session([beat, vocal], { beat: 1, vocal: 0.3 });
    const status = (id: string) => checkMix(s, useStudioStore.getState().lanes).find((c) => c.id === id)!.status;
    assert.equal(status("length"), "warn", "the beat plays on long after the vocal");

    // Press Fix on Volume, then on Ending — the way the panel does.
    const first = mixFix(s, ["balance"])!;
    assert.ok(tryIdea(s, first, { add: true }));
    const second = mixFix(s, [...fixesOf(first), "length"])!;
    assert.ok(tryIdea(s, second, { add: true }));

    assert.deepEqual(useAiTrial.getState().trial!.ideas.map((i) => i.id), ["fix:length+balance"]);
    assert.equal(status("volume"), "good");
    assert.equal(status("length"), "good");
    revertTrial();
  });
});

describe("trying ideas", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const drums = lane("drums", "drums");
  let s: Session;
  let ideas: Idea[];
  const get = (id: string) => ideas.find((i) => i.id === id)!;
  const state = () => useStudioStore.getState();

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal, drums], projectBpm: BPM, duration: 120 });
    s = session([beat, vocal, drums]);
    ideas = studioIdeas(s);
  });

  test("trying one idea, then another, swaps them — the second starts from the original", () => {
    assert.ok(tryIdea(s, get("sound-lofi")));
    assert.ok(state().lanes.find((l) => l.laneId === "beat")!.fx.drive > 0, "lo-fi drives the beat");

    assert.ok(tryIdea(s, mixFix(s, ["length"])!));
    const after = state().lanes.find((l) => l.laneId === "beat")!;
    assert.equal(after.fx.drive, 0, "the lo-fi mix is gone");
    assert.ok(after.clips?.length, "the outro is trimmed");
    assert.deepEqual(useAiTrial.getState().trial!.ideas.map((i) => i.id), ["fix:length"]);
  });

  test("ideas that touch different things can be on together", () => {
    tryIdea(s, get("sound-lofi"));
    assert.ok(tryIdea(s, get("parts-drop"), { add: true }));
    const lanes = state().lanes;
    assert.ok(lanes.find((l) => l.laneId === "beat")!.fx.drive > 0);
    assert.ok(lanes.find((l) => l.laneId === "drums")!.automation.volume?.length);
  });

  test("before/after flips between the original and the idea; undo puts the original back", () => {
    tryIdea(s, get("sound-punch"));
    const tried = state().lanes;
    compare();
    assert.deepEqual(state().lanes, [beat, vocal, drums]);
    compare();
    assert.equal(state().lanes, tried);
    revertTrial();
    assert.deepEqual(state().lanes, [beat, vocal, drums]);
    assert.equal(useAiTrial.getState().trial, null);
  });

  test("keep leaves the idea in the mix — even when kept while comparing", () => {
    tryIdea(s, get("sound-punch"));
    const tried = state().lanes;
    compare("original");
    assert.deepEqual(keepTrial().map((i) => i.id), ["sound-punch"]);
    assert.equal(state().lanes, tried);
    assert.equal(useAiTrial.getState().trial, null);
  });

  test("a kept idea is one undo step; undo while trying just reverts", () => {
    resetHistory();
    tryIdea(s, get("sound-lofi"));
    tryIdea(s, get("sound-punch"));
    undo();
    assert.deepEqual(state().lanes, [beat, vocal, drums], "undo while trying = revert");
    assert.equal(useAiTrial.getState().trial, null);

    tryIdea(s, get("sound-punch"));
    keepTrial();
    assert.notDeepEqual(state().lanes, [beat, vocal, drums]);
    undo();
    assert.deepEqual(state().lanes, [beat, vocal, drums], "one undo takes the kept idea back");
  });
});

describe("drops with the beat's own parts from the library", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const state = () => useStudioStore.getState();
  let s: Session;
  let ideas: Idea[];
  const get = (id: string) => ideas.find((i) => i.id === id)!;

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal], projectBpm: BPM, duration: 120 });
    s = session([beat, vocal], {}, PARTS);
    ideas = studioIdeas(s);
  });

  test("no splitting needed: the drum drop brings the library's parts in by itself", () => {
    const drop = get("parts-drop");
    assert.ok(drop, "offered without any part lanes in the mix");
    assert.deepEqual(drop.lanes!.remove, ["beat"]);
    assert.deepEqual(drop.lanes!.add.map((l) => l.kind), ["drums", "bass", "other"]);
    assert.ok(ideaFits(drop, state().lanes));

    assert.ok(tryIdea(s, drop));
    const kinds = state().lanes.map((l) => l.kind).sort();
    assert.deepEqual(kinds, ["bass", "drums", "other", "vocals"], "the beat is now its parts");
    const drums = state().lanes.find((l) => l.kind === "drums")!;
    assert.ok(drums.automation.volume?.some((p) => p.v === 0), "the drums drop out");
    assert.equal(drums.offsetSeconds, beat.offsetSeconds, "lined up exactly where the beat was");

    // The Mix check still sees the beat (through its parts) while the drop is on.
    const loud = session([beat, vocal], { beat: 1, vocal: 1 }, PARTS);
    assert.deepEqual(
      checkMix(loud, state().lanes).map((c) => c.id),
      checkMix(loud, [beat, vocal]).map((c) => c.id)
    );

    revertTrial();
    assert.deepEqual(state().lanes, [beat, vocal], "undo puts the beat back");
  });

  test("with a sound on, the parts take that sound too", () => {
    tryIdea(s, get("sound-punch"));
    assert.ok(tryIdea(s, get("parts-drop"), { add: true }));
    const drums = state().lanes.find((l) => l.kind === "drums")!;
    assert.ok(drums.fx.drive > 0, "the punchy mix carried over to the parts");
    assert.equal(useAiTrial.getState().trial!.ideas.length, 2);
    keepTrial();
    assert.equal(state().lanes.filter((l) => l.kind === "beat").length, 0);
  });
});
