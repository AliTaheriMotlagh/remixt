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
  masterFor,
  mixFix,
  mixSignature,
  recompileIdea,
  studioIdeas,
  timingSignature,
  type Idea,
  type Session,
} from "../src/lib/client/aiIdeas.ts";
import {
  aspectsOfEdits,
  compare,
  dismissOff,
  keepTrial,
  partsOf,
  removeFromTrial,
  revertTrial,
  switchPart,
  tryIdea,
  tryIdeas,
  useAiTrial,
} from "../src/lib/client/aiTrial.ts";
import { gain, nudge, transpose } from "../src/lib/client/quickAdjust.ts";
import type { BeatStructure } from "../src/lib/client/arrange.ts";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import { resetHistory, undo } from "../src/lib/client/studioHistory.ts";
import { DEFAULT_FX, subscribeMix, useStudioStore, type LoadableStem, type StudioLane } from "../src/lib/client/studioStore.ts";
import type { HandEdit } from "../src/lib/client/aiIdeas.ts";

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

  test("several ideas put on in one go come out the same as one after another", () => {
    const picks = [get("sound-lofi"), get("parts-drop"), get("moment-acapella")];
    for (const idea of picks) tryIdea(s, idea, { add: true });
    const oneByOne = { lanes: state().lanes, ids: useAiTrial.getState().trial!.ideas.map((i) => i.id) };
    revertTrial();

    assert.deepEqual(tryIdeas(s, picks).map((i) => i.id), picks.map((i) => i.id));
    assert.deepEqual(useAiTrial.getState().trial!.ideas.map((i) => i.id), oneByOne.ids);
    assert.deepEqual(state().lanes, oneByOne.lanes);
    revertTrial();
    assert.deepEqual(state().lanes, [beat, vocal, drums]);
  });

  test("an idea worked out again on its own matches the one in the full list", () => {
    // Clips get a fresh random id each time they're cut.
    const sameCuts = (patches: Idea["patches"]) => JSON.parse(JSON.stringify(patches, (key, value) => (key === "id" ? undefined : value)));
    for (const idea of ideas) {
      const again = recompileIdea(idea, s);
      assert.ok(again, idea.id);
      assert.deepEqual(sameCuts(again.patches), sameCuts(idea.patches), idea.id);
      assert.deepEqual(again.aspects, idea.aspects, idea.id);
    }
  });

  test("an idea switched off stays listed, to switch back on", () => {
    tryIdea(s, get("sound-lofi"));
    tryIdea(s, get("parts-drop"), { add: true });
    removeFromTrial(s, "sound-lofi");
    let trial = useAiTrial.getState().trial!;
    assert.deepEqual(trial.ideas.map((i) => i.id), ["parts-drop"]);
    assert.deepEqual(trial.off.map((i) => i.id), ["sound-lofi"]);
    assert.equal(state().lanes.find((l) => l.laneId === "beat")!.fx.drive, 0, "the lo-fi sound is off");

    removeFromTrial(s, "parts-drop");
    trial = useAiTrial.getState().trial!;
    assert.ok(trial, "with everything off, both are still listed");
    assert.deepEqual(trial.ideas, []);
    assert.deepEqual(trial.off.map((i) => i.id), ["parts-drop", "sound-lofi"]);
    assert.deepEqual(state().lanes, [beat, vocal, drums], "everything off: the mix as it was");

    assert.ok(tryIdea(s, get("sound-lofi"), { add: true }));
    assert.ok(state().lanes.find((l) => l.laneId === "beat")!.fx.drive > 0, "back on");
    assert.deepEqual(useAiTrial.getState().trial!.off.map((i) => i.id), ["parts-drop"]);
    dismissOff("parts-drop");
    assert.deepEqual(useAiTrial.getState().trial!.off, []);
  });

  test("keeping with everything switched off keeps nothing", () => {
    tryIdea(s, get("sound-lofi"));
    removeFromTrial(s, "sound-lofi");
    assert.deepEqual(keepTrial(), []);
    assert.equal(useAiTrial.getState().trial, null);
    assert.deepEqual(state().lanes, [beat, vocal, drums]);
  });

  test("each part of an idea switches off on its own", () => {
    const slowed = get("full-slowed");
    assert.deepEqual(partsOf(slowed), ["timing", "key", "effects"]);
    tryIdea(s, slowed);
    const full = state().lanes;
    const vocalNow = () => state().lanes.find((l) => l.laneId === "vocal")!;
    const fullVocal = full.find((l) => l.laneId === "vocal")!;
    assert.notEqual(fullVocal.pitchSemitones, 0, "slowed lowers the pitch");

    switchPart(s, "full-slowed", "key", false);
    assert.equal(vocalNow().pitchSemitones, 0, "its key change is off");
    assert.equal(vocalNow().tempoRatio, fullVocal.tempoRatio, "its speed stays");
    assert.deepEqual(vocalNow().fx, fullVocal.fx, "and its sound");
    assert.deepEqual(useAiTrial.getState().trial!.without, { "full-slowed": ["key"] });

    switchPart(s, "full-slowed", "timing", false);
    assert.equal(vocalNow().tempoRatio, vocal.tempoRatio, "its speed is off too");
    assert.equal(state().projectBpm, BPM);

    switchPart(s, "full-slowed", "key", true);
    switchPart(s, "full-slowed", "timing", true);
    assert.deepEqual(state().lanes, full, "all back on: as it was");
  });

  test("the co-producer's hands-on changes go on top of an idea and switch off like one", () => {
    tryIdea(s, get("full-slowed"));
    const styled = state().lanes;
    const styledBpm = state().projectBpm;
    const styledVocal = styled.find((l) => l.laneId === "vocal")!;
    const hand = (id: string, edits: HandEdit[]): Idea => ({
      id, role: "engineer", kind: "idea", icon: "message-circle", title: id, short: "", why: "", lines: [], patches: {}, aspects: aspectsOfEdits(edits), vibes: [], stems: {}, edits,
    });
    const vocalNow = () => state().lanes.find((l) => l.laneId === "vocal")!;

    assert.ok(tryIdea(s, hand("hand:1", [{ laneId: "vocal", volume: 1.3, fx: { reverb: 0.4 } }]), { add: true }));
    assert.deepEqual(useAiTrial.getState().trial!.ideas.map((i) => i.id), ["full-slowed", "hand:1"], "the style stays on");
    assert.equal(vocalNow().volume, 1.3);
    assert.deepEqual(vocalNow().fx, { ...styledVocal.fx, reverb: 0.4 }, "only the effect it set changes");
    assert.equal(vocalNow().tempoRatio, styledVocal.tempoRatio);

    switchPart(s, "hand:1", "effects", false);
    assert.deepEqual(vocalNow().fx, styledVocal.fx);
    assert.equal(vocalNow().volume, 1.3);

    assert.ok(tryIdea(s, hand("hand:2", [{ speed: 1.1 }]), { add: true }), "a speed change goes on top of a style too");
    assert.equal(state().projectBpm, Math.round(styledBpm * 1.1 * 10) / 10);

    removeFromTrial(s, "hand:1");
    removeFromTrial(s, "hand:2");
    assert.deepEqual(state().lanes, styled, "both off: the style alone");
    assert.deepEqual(useAiTrial.getState().trial!.off.map((i) => i.id), ["hand:2", "hand:1"]);
  });

  test("worked out again (new options, a fresh listen), what was switched off stays off", () => {
    tryIdea(s, get("full-slowed"));
    tryIdea(s, get("sound-lofi"), { add: true });
    switchPart(s, "full-slowed", "key", false);
    removeFromTrial(s, "sound-lofi");
    const was = revertTrial()!;
    assert.deepEqual(state().lanes, [beat, vocal, drums]);

    tryIdeas(s, was.ideas, { after: was });
    const trial = useAiTrial.getState().trial!;
    assert.deepEqual(trial.ideas.map((i) => i.id), ["full-slowed"]);
    assert.deepEqual(trial.off.map((i) => i.id), ["sound-lofi"]);
    assert.deepEqual(trial.without, { "full-slowed": ["key"] });
    assert.equal(state().lanes.find((l) => l.laneId === "vocal")!.pitchSemitones, 0);
  });

  test("the audio engine hears each try once, as where it ended up", () => {
    const heard: { from: StudioLane[]; to: StudioLane[] }[] = [];
    const stop = subscribeMix((now, before) => heard.push({ from: before.lanes, to: now.lanes }));
    try {
      tryIdea(s, get("full-slowed"));
      const first = state().lanes;
      tryIdea(s, get("sound-lofi"), { add: true });
      assert.equal(heard.length, 2, "not once per step of the building");
      assert.deepEqual(heard[0].from, [beat, vocal, drums]);
      assert.equal(heard[1].from, first, "from the first try straight to the second");
      assert.equal(heard[1].to, state().lanes);
    } finally {
      stop();
    }
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

describe("vocal layers, speed styles, rhythm and mastering", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const state = () => useStudioStore.getState();
  const find = (id: string) => state().lanes.find((l) => l.laneId === id)!;

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal], projectBpm: BPM, duration: 120 });
  });

  test("doubles and octaves are offered as extra lanes that follow the vocal", () => {
    const ideas = studioIdeas(session([beat, vocal]));
    const double = ideas.find((i) => i.id === "layer-double")!;
    assert.ok(double, "a double is offered");
    assert.deepEqual(double.lanes!.add.map((l) => l.laneId), ["vocal~layer-dbl-l", "vocal~layer-dbl-r"]);
    assert.deepEqual(double.lanes!.remove, []);
    assert.ok(double.aspects.includes("layers"));
    const [left, right] = double.lanes!.add;
    assert.ok(left.fx.pan < 0 && right.fx.pan > 0, "panned either side");
    assert.ok(left.volume < vocal.volume, "under the lead");
    assert.equal(ideas.find((i) => i.id === "layer-octave-down")!.lanes!.add[0].pitchSemitones, -12);
  });

  test("two layers can be on together, and on top of anything else", () => {
    const s = session([beat, vocal]);
    const ideas = studioIdeas(s);
    const get = (id: string) => ideas.find((i) => i.id === id)!;
    assert.equal(compatible(get("layer-double"), get("layer-octave-down")), true);
    assert.ok(tryIdea(s, get("layer-double")));
    assert.ok(tryIdea(s, get("layer-octave-down"), { add: true }));
    assert.deepEqual(
      state().lanes.map((l) => l.laneId),
      ["beat", "vocal", "vocal~layer-dbl-l", "vocal~layer-dbl-r", "vocal~layer-oct-down"]
    );
    revertTrial();
    assert.deepEqual(state().lanes, [beat, vocal]);
  });

  test("a layer goes wherever its vocal is moved, keeping its own small offset", () => {
    const s = session([beat, vocal]);
    const ideas = studioIdeas(s);
    tryIdea(s, ideas.find((i) => i.id === "layer-double")!);
    // A move of the whole mix, tried with the double on: the double lines up with the moved vocal.
    const moved = studioIdeas({ ...s, lanes: state().lanes, signature: mixSignature(state().lanes), timing: timingSignature(state().lanes, BPM) });
    const stutter = moved.find((i) => i.id === "moment-stutter")!;
    assert.ok(stutter.patches["vocal~layer-dbl-l"]?.clips, "the stutter is copied onto the double");
    assert.deepEqual(
      stutter.patches["vocal~layer-dbl-l"].clips!.map((c) => [c.from, c.to, c.at]),
      stutter.patches["vocal"].clips!.map((c) => [c.from, c.to, c.at])
    );
  });

  test("a vocal's own doubles don't count as a second singer", () => {
    const withLayer = [beat, vocal, lane("vocal~layer-dbl-l", "vocals", { offsetSeconds: 8.013, originalDuration: 36, volume: 0.5 })];
    assert.ok(!studioIdeas(session(withLayer)).some((i) => i.id === "fix-vocal-clash"));
  });

  test("slowed + reverb: everything slower and lower together, the tempo with it", () => {
    const slowed = studioIdeas(session([beat, vocal])).find((i) => i.id === "full-slowed")!;
    assert.ok(slowed, "offered");
    assert.equal(slowed.projectBpm, 102);
    for (const id of ["beat", "vocal"]) {
      assert.ok(Math.abs(slowed.patches[id].tempoRatio! - 0.85) < 1e-9, id);
      assert.equal(slowed.patches[id].pitchSemitones, -3, id);
    }
    assert.ok(Math.abs(slowed.patches.vocal.offsetSeconds! - 8 / 0.85) < 1e-6, "the vocal still comes in on the same beat");
    assert.ok(slowed.patches.vocal.fx!.reverb > 0.3, "drenched in reverb");
    const sped = studioIdeas(session([beat, vocal])).find((i) => i.id === "full-sped-up")!;
    assert.equal(sped.projectBpm, 144);
    assert.equal(sped.patches.vocal.pitchSemitones, 3);
  });

  test("a pumping beat and a gated build are drawn on the beat", () => {
    const ideas = studioIdeas(session([beat, vocal]));
    const pump = ideas.find((i) => i.id === "moment-pump")!;
    const gate = ideas.find((i) => i.id === "moment-gate")!;
    assert.ok(pump.patches.beat.automation!.volume!.length > 100, "a dip on every beat");
    const gated = gate.patches.beat.automation!.volume!;
    assert.ok(gated.some((p) => p.v === 0 && p.t > 4 && p.t < 8), "the beat chops off before the vocal at 8s");
    assert.ok(gated.every((p) => p.t < 4 - 0.01 || p.t <= 8.01), "and only there");
  });

  test("the mastering pick suits the style", () => {
    assert.equal(masterFor(["club"]), "club");
    assert.equal(masterFor(["lofi"]), "warm");
    assert.equal(masterFor(["short"]), "loud");
    assert.equal(masterFor([]), "clean");
  });

  test("fine-tune moves, re-pitches and levels a vocal's layers with it", () => {
    const layer = lane("vocal~layer-oct-down", "vocals", { offsetSeconds: 8, originalDuration: 36, pitchSemitones: -12, volume: 0.4 });
    useStudioStore.setState({ lanes: [beat, vocal, layer] });
    transpose("vocal", 2);
    assert.equal(find("vocal").pitchSemitones, 2);
    assert.equal(find("vocal~layer-oct-down").pitchSemitones, -10, "still an octave under");
    nudge("vocal", 1);
    assert.equal(find("vocal~layer-oct-down").offsetSeconds, 8.5);
    gain("vocal", -6);
    assert.ok(find("vocal~layer-oct-down").volume < 0.4);
  });
});

describe("keeping tracks whole", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const whole = (lanes: StudioLane[]) => ({ ...session(lanes), options: { vibe: "any" as const, keepWhole: true } });

  test("no idea cuts the vocal; ideas that only work by chopping it aren't offered", () => {
    const ideas = studioIdeas(whole([beat, vocal]));
    const ids = ideas.map((i) => i.id);
    assert.ok(!ids.includes("moment-stutter") && !ids.includes("moment-swell"), ids.join(", "));
    assert.ok(ids.includes("full-slowed") && ids.includes("moment-pump"), "the rest are still there");
    for (const idea of ideas) {
      for (const [id, patch] of Object.entries(idea.patches)) {
        assert.ok(!patch.clips, `${idea.id} cuts ${id}`);
      }
    }
  });

  test("the ending isn't fixed by looping or trimming the beat", () => {
    assert.ok(mixFix(session([beat, vocal]), ["length"]), "normally the long beat is trimmed");
    assert.equal(mixFix(whole([beat, vocal]), ["length"]), null);
  });

  test("without the setting, cutting ideas are offered as before", () => {
    assert.ok(studioIdeas(session([beat, vocal])).some((i) => i.id === "moment-stutter"));
  });
});

describe("every lane in sync", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  // A second beat at 100 BPM, starting off the grid.
  const other = lane("other", "beat", { bpm: 100, offsetSeconds: 3.1, trackTitle: "other song" });

  test("the mix check names a lane at another speed, with the fix", () => {
    const check = checkMix(session([beat, vocal, other]), [beat, vocal, other]).find((c) => c.id === "lanes");
    assert.equal(check?.status, "bad");
    assert.match(check!.text, /other song/);
    assert.equal(check?.fix, "sync");
  });

  test("syncing stretches it to the project tempo and starts it on a bar line", () => {
    const idea = mixFix(session([beat, vocal, other]), ["sync"])!;
    assert.ok(idea, "there's something to sync");
    assert.ok(Math.abs(idea.patches.other.tempoRatio! - 1.2) < 1e-9);
    assert.equal(idea.patches.other.offsetSeconds, 4, "bar 3 (2s bars)");
    const after = [beat, vocal, normaliseLane({ ...other, ...idea.patches.other })];
    assert.equal(checkMix(session([beat, vocal, other]), after).find((c) => c.id === "lanes")?.status, "good");
  });

  test("half time counts: a 60 BPM lane is read at 120, not stretched 2×", () => {
    const slow = lane("slow", "beat", { bpm: 61, trackTitle: "slow song" });
    const idea = mixFix(session([beat, vocal, slow]), ["sync"])!;
    assert.ok(Math.abs(idea.patches.slow.tempoRatio! - 120 / 122) < 1e-9);
  });

  test("a lane too far from the tempo is left alone, and says so", () => {
    const far = lane("far", "beat", { bpm: 88, trackTitle: "far song" });
    const idea = mixFix(session([beat, vocal, far]), ["sync"]);
    assert.ok(!idea?.patches.far?.tempoRatio);
  });
});

describe("choosing one option keeps the others", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });
  const drums = lane("drums", "drums");
  let s: Session;
  let ideas: Idea[];
  const get = (id: string) => ideas.find((i) => i.id === id)!;
  const on = () => useAiTrial.getState().trial!.ideas.map((i) => i.id);

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal, drums], projectBpm: BPM, duration: 120 });
    s = session([beat, vocal, drums]);
    ideas = studioIdeas(s);
  });

  test("a style, a sound, a moment and a layer all stay on together", () => {
    assert.ok(tryIdea(s, get("full-slowed"), { add: true }));
    assert.ok(tryIdea(s, get("sound-punch"), { add: true }));
    assert.ok(tryIdea(s, get("moment-acapella"), { add: true }));
    assert.ok(tryIdea(s, get("layer-double"), { add: true }));
    assert.deepEqual(on().sort(), ["full-slowed", "layer-double", "moment-acapella", "sound-punch"]);
  });

  test("only the same kind makes way: another sound replaces the sound, another timing the timing", () => {
    tryIdea(s, get("full-slowed"), { add: true });
    tryIdea(s, get("sound-punch"), { add: true });
    tryIdea(s, get("layer-double"), { add: true });
    tryIdea(s, get("sound-lofi"), { add: true });
    assert.deepEqual(on().sort(), ["full-slowed", "layer-double", "sound-lofi"]);
    tryIdea(s, get("full-sped-up"), { add: true });
    assert.deepEqual(on().sort(), ["full-sped-up", "layer-double", "sound-lofi"]);
  });

  test("stepping to the next idea replaces just the one being browsed", () => {
    tryIdea(s, get("layer-double"), { add: true });
    tryIdea(s, get("sound-punch"), { add: true });
    tryIdea(s, get("sound-lofi"), { add: true, replace: "sound-punch" });
    assert.deepEqual(on().sort(), ["layer-double", "sound-lofi"]);
  });

  test("the later idea wins where two set the same thing, the earlier keeps the rest", () => {
    tryIdea(s, get("full-slowed"), { add: true });
    tryIdea(s, get("sound-punch"), { add: true });
    const v = useStudioStore.getState().lanes.find((l) => l.laneId === "vocal")!;
    assert.ok(Math.abs(v.tempoRatio - 0.85) < 1e-9, "the style's speed stays");
    assert.ok(v.fx.reverb < 0.2, "the punch sound replaced the slowed reverb");
    revertTrial();
  });
});
