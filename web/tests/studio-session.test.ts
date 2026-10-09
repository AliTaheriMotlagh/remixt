// A long session in the Studio: the AI producer used, the mix cleared and
// a new one started, the AI working on just a section or some lanes, the
// undo history kept on the device, and the harmony check finding the
// stretch that rubs — on plain lane objects.
//
//   node --import ./tests/support/register.mjs --test tests/studio-session.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { mixSignature, musicalDecay, studioIdeas, suggestedSections, timingSignature, type Idea, type Session } from "../src/lib/client/aiIdeas.ts";
import { applyScope, lanePart, retime, sectionChoices, useAiScope, WHOLE_SONG } from "../src/lib/client/aiScope.ts";
import { forgetTrial, keepTrial, refusedByScope, revertTrial, setScope, tryIdea, useAiTrial } from "../src/lib/client/aiTrial.ts";
import type { StemAnalysis } from "../src/lib/client/analysis.ts";
import { clipEnd, clipStart, clipsOf, normaliseLane } from "../src/lib/client/clipEdit.ts";
import { harmonyStatus, scanHarmony, worstStretch } from "../src/lib/client/harmony.ts";
import type { Melody } from "../src/lib/client/melody.ts";
import { draftLaneCount, normaliseDraft } from "../src/lib/client/studioDraft.ts";
import { packHistory, resetHistory, undo, unpackHistory } from "../src/lib/client/studioHistory.ts";
import { DEFAULT_FX, PROJECT_DEFAULTS, useStudioStore, type StudioLane } from "../src/lib/client/studioStore.ts";

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
    peaks: [0.1, 0.5, 0.2],
    originalDuration: 60,
    duration: 60,
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

function session(lanes: StudioLane[]): Session {
  return {
    lanes,
    projectBpm: BPM,
    analyses: new Map(lanes.map((l) => [l.laneId, { loudness: l.kind === "vocals" ? 0.3 : 1 } as never])),
    vocal: lanes.find((l) => l.kind === "vocals") ?? null,
    beat: lanes.find((l) => l.kind === "beat") ?? null,
    pair: null,
    drop: null,
    beatParts: [],
    notes: [],
    signature: mixSignature(lanes),
    timing: timingSignature(lanes, BPM),
    options: { vibe: "any" },
  };
}

/** Where a lane plays on the timeline: [start, end] of each clip, rounded. */
const spans = (l: StudioLane) => clipsOf(l).map((c) => [Math.round(clipStart(l, c) * 100) / 100, Math.round(clipEnd(l, c) * 100) / 100]);

const beat = lane("beat", "beat");
const vocal = lane("vocal", "vocals", { offsetSeconds: 4, originalDuration: 40 });

function start(lanes: StudioLane[]) {
  useAiTrial.setState({ trial: null });
  useAiScope.setState({ scope: WHOLE_SONG });
  useStudioStore.setState({ lanes, projectBpm: BPM, duration: 60, isPlaying: false, playhead: 0 });
  resetHistory();
}

describe("the AI on just a section, or just some lanes", () => {
  const louder: StudioLane = { ...vocal, volume: 1.4, fx: { ...vocal.fx, reverb: 0.3 } };

  test("the whole song: the idea as it is", () => {
    assert.deepEqual(applyScope([beat, vocal], [beat, louder], WHOLE_SONG), [beat, louder]);
  });

  test("a section: the original outside it, the idea's version only inside, on a lane of its own", () => {
    const out = applyScope([beat, vocal], [beat, louder], { range: { start: 10, end: 20, label: "Chorus" }, lanes: null });
    assert.equal(out[0], beat, "a lane the idea didn't change stays the same lane");
    const [outside, inside] = out.slice(1);
    assert.equal(outside.laneId, "vocal");
    assert.deepEqual(spans(outside), [[4, 10], [20, 44]]);
    assert.equal(outside.volume, 1);
    assert.notEqual(inside.laneId, "vocal");
    assert.deepEqual(spans(inside), [[10, 20]]);
    assert.equal(inside.volume, 1.4);
    assert.match(inside.name!, /Chorus/);
  });

  test("a lane's own fades stay where it really starts and ends, never at a cut", () => {
    const faded = { ...vocal, fx: { ...vocal.fx, fadeIn: 2, fadeOut: 3 } };
    const before = lanePart(faded, 10, 20, false)!;
    const during = lanePart(faded, 10, 20, true)!;
    assert.equal(before.fx.fadeIn, 2);
    assert.equal(before.fx.fadeOut, 3, "the part after the section still ends where the lane did");
    assert.equal(during.fx.fadeIn, 0);
    assert.equal(during.fx.fadeOut, 0);
    assert.equal(lanePart(faded, 50, 55, false), faded, "nothing to cut: the same lane");
  });

  test("some lanes: the others stay exactly as they were", () => {
    const punchy = { ...beat, fx: { ...beat.fx, drive: 0.2 } };
    const out = applyScope([beat, vocal], [punchy, louder], { range: null, lanes: ["vocal"] });
    assert.deepEqual(out, [beat, louder]);
  });

  test("a beat swapped for its parts stays itself outside the section; a layer of a lane left out isn't added", () => {
    const drums = lane("beat~drums", "drums");
    const layer = lane("vocal~layer-oct", "vocals");
    const out = applyScope([beat, vocal], [vocal, drums, layer], { range: { start: 10, end: 20, label: "S" }, lanes: null });
    const ids = out.map((l) => l.laneId);
    assert.deepEqual(ids, ["beat", "beat~drums", "vocal", "vocal~layer-oct"]);
    assert.deepEqual(spans(out[0]), [[0, 10], [20, 60]]);
    assert.deepEqual(spans(out[1]), [[10, 20]]);
    const vocalOnly = applyScope([beat, vocal], [beat, vocal, layer], { range: null, lanes: ["beat"] });
    assert.deepEqual(vocalOnly.map((l) => l.laneId), ["beat", "vocal"]);
  });

  test("sections to pick: the loop, the selected clips, markers and the next 8 bars", () => {
    const choices = sectionChoices({
      lanes: [beat, vocal],
      loopStart: 8,
      loopEnd: 16,
      markers: [{ id: "m", label: "Chorus", start: 20, end: 30 }],
      selectedClips: [{ laneId: "vocal", clipId: "whole" }],
      playhead: 5,
      projectBpm: BPM,
      duration: 60,
    });
    assert.deepEqual(
      choices.map((c) => [c.id, c.start, c.end]),
      [
        ["loop", 8, 16],
        ["selection", 4, 44],
        ["marker:m", 20, 30],
        ["bars", 4, 20],
      ]
    );
  });

  test("tried on a section, kept as one undo step", () => {
    start([beat, vocal]);
    const s = session([beat, vocal]);
    const idea = studioIdeas(s).find((i) => i.id === "sound-punch")!;
    setScope(s, { range: { start: 10, end: 20, label: "S" }, lanes: null });
    assert.ok(tryIdea(s, idea));
    const lanes = useStudioStore.getState().lanes;
    assert.ok(lanes.length > 2, "the changed lanes play the idea in the section only");
    for (const l of lanes.filter((l) => l.laneId === "beat" || l.laneId === "vocal")) {
      assert.deepEqual(l.fx, (l.laneId === "beat" ? beat : vocal).fx, "outside the section, as it was");
    }
    assert.equal(useStudioStore.getState().projectBpm, BPM);
    keepTrial();
    undo();
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["beat", "vocal"]);
  });

  test("a part re-keyed on its own: everything else on stays on for the whole song", () => {
    start([beat, vocal]);
    const s = session([beat, vocal]);
    assert.ok(tryIdea(s, studioIdeas(s).find((i) => i.id === "sound-punch")!));
    const punched = useStudioStore.getState().lanes.find((l) => l.laneId === "vocal")!.fx;
    const rekey: Idea = {
      id: "key-part", role: "engineer", kind: "fix", icon: "music", title: "Key", short: "", why: "", lines: [], patches: {},
      aspects: ["key"], vibes: [], stems: { vocal: "stem-vocal" },
      edits: [{ laneId: "vocal", pitchSemitones: 2 }],
      scope: { range: { start: 10, end: 20, label: "S" }, lanes: ["vocal"] },
    };
    assert.ok(tryIdea(s, rekey, { add: true }));
    const lanes = useStudioStore.getState().lanes;
    const outside = lanes.find((l) => l.laneId === "vocal")!;
    const inside = lanes.find((l) => l.laneId !== "vocal" && l.laneId.startsWith("vocal"))!;
    assert.equal(outside.pitchSemitones, 0);
    assert.deepEqual(spans(outside), [[4, 10], [20, 44]]);
    assert.equal(inside.pitchSemitones, 2);
    assert.deepEqual(spans(inside), [[10, 20]]);
    assert.deepEqual(outside.fx, punched, "the sound idea is still on outside the part");
    assert.deepEqual(inside.fx, punched, "…and inside it");
    assert.deepEqual(useAiScope.getState().scope, WHOLE_SONG, "the AI still works on the whole song");
  });

  test("an idea that meets the vocal and beat on a new tempo still goes on a section — at the song's own speed", () => {
    start([beat, vocal]);
    const s = session([beat, vocal]);
    // Like Make it sound good: both lanes 5% faster (126 BPM), the vocal louder.
    const met: Idea = {
      id: "met", role: "engineer", kind: "auto", icon: "sparkles", title: "Make it sound good", short: "", why: "", lines: [],
      patches: { beat: { tempoRatio: 1.05 }, vocal: { tempoRatio: 1.05, volume: 1.3 } }, projectBpm: 126,
      aspects: ["tempo", "levels"], vibes: [], stems: { beat: "stem-beat", vocal: "stem-vocal" },
    };
    setScope(s, { range: { start: 10, end: 20, label: "S" }, lanes: null });
    assert.ok(tryIdea(s, met), "not refused");
    const { lanes, projectBpm } = useStudioStore.getState();
    assert.equal(projectBpm, BPM, "the song keeps its tempo");
    assert.deepEqual(lanes.find((l) => l.laneId === "beat"), beat, "played back at the song's speed, the beat is as it was");
    const inside = lanes.find((l) => l.laneId.startsWith("vocal~"))!;
    assert.ok(Math.abs(inside.tempoRatio - 1) < 1e-9);
    assert.equal(inside.volume, 1.3);
    assert.deepEqual(spans(inside), [[10, 20]]);
  });

  test("the whole mix sped up together stays lined up", () => {
    const moved = retime([lane("a", "beat", { offsetSeconds: 10, automation: { volume: [{ t: 20, v: 1 }] } })], 2)[0];
    assert.equal(moved.tempoRatio, 2);
    assert.equal(moved.offsetSeconds, 5);
    assert.equal(moved.automation.volume![0].t, 10);
    assert.equal(moved.duration, 30);
  });

  test("parts to pick, found from the song: labelled parts, the vocal's entry, the intro and the ending", () => {
    const arranged = lane("vocal", "vocals", {
      offsetSeconds: 8,
      clips: [
        { from: 0, to: 4, at: 0, label: "Verse" },
        { from: 4, to: 8, at: 4, label: "Verse" },
        { from: 8, to: 16, at: 8, label: "Chorus" },
        { from: 30, to: 38, at: 24, label: "Chorus" },
      ],
    });
    const picks = suggestedSections(session([beat, arranged]), [beat, arranged], 60);
    const found = picks.map((p) => [p.name, p.start, p.end]);
    assert.deepEqual(found.slice(0, 3), [
      ["Verse", 8, 16],
      ["Chorus", 16, 24],
      ["Chorus 2", 32, 40],
    ]);
    assert.ok(found.some(([name, start, end]) => name === "Intro" && start === 0 && end === 8));
    assert.ok(found.some(([name]) => name === "Vocal comes in"));
    assert.ok(found.some(([name, , end]) => name === "Ending" && end === 60));
  });

  test("speeding up the whole song can't go on just a section — and says why", () => {
    start([beat, vocal]);
    const s = session([beat, vocal]);
    const faster: Idea = { id: "hand:faster", role: "engineer", kind: "idea", icon: "zap", title: "Faster", short: "", why: "", lines: [], patches: {}, aspects: ["tempo"], vibes: [], stems: {}, edits: [{ speed: 1.1 }] };
    setScope(s, { range: { start: 10, end: 20, label: "S" }, lanes: null });
    assert.equal(tryIdea(s, faster), false);
    assert.ok(refusedByScope("hand:faster"));
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["beat", "vocal"]);
  });
});

describe("clearing the mix with the AI producer open", () => {
  beforeEach(() => start([beat, vocal]));

  // (The store subscriptions that call forgetTrial on a clear only run in a browser.)
  test("what was being tried, and the section, are let go — the cleared mix is never put back over the new one", () => {
    const s = session([beat, vocal]);
    setScope(s, { range: { start: 10, end: 20, label: "S" }, lanes: null });
    assert.ok(tryIdea(s, studioIdeas(s).find((i) => i.id === "sound-punch")!));
    useStudioStore.getState().clearLanes();
    forgetTrial();
    assert.equal(useAiTrial.getState().trial, null);
    assert.deepEqual(useAiScope.getState().scope, WHOLE_SONG);
    const fresh = lane("other", "vocals");
    useStudioStore.setState({ lanes: [fresh] });
    assert.equal(revertTrial(), null, "nothing to revert to");
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["other"]);
  });

  test("an idea worked out for the old mix never brings its lanes back into the new one", () => {
    const fresh = lane("other", "vocals");
    start([fresh]);
    // Made for the old vocal, as if nothing had changed (the timing matches the new mix).
    const s = session([fresh]);
    const layer: Idea = {
      id: "layer-test", role: "remixer", kind: "moment", icon: "users", title: "Layer", short: "", why: "", lines: [],
      patches: {}, aspects: ["layers"], vibes: [], stems: {},
      lanes: { add: [lane("vocal~layer-x", "vocals")], remove: [] },
    };
    assert.equal(tryIdea(s, layer), false);
    const idea = studioIdeas(session([beat, vocal])).find((i) => i.id === "sound-punch")!;
    tryIdea(s, idea);
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["other"], "re-worked for the new mix, if at all — never the old lanes");
  });
});

describe("the undo history, kept on the device", () => {
  test("packed small and back: lanes shared between steps kept once, waveforms once per stem", () => {
    const moved = { ...vocal, offsetSeconds: 6 };
    const steps = [
      { ...PROJECT_DEFAULTS, duration: 60, lanes: [beat, vocal] },
      { ...PROJECT_DEFAULTS, duration: 60, lanes: [beat, moved] },
    ];
    const packed = packHistory({ past: steps, future: [{ ...PROJECT_DEFAULTS, duration: 60, lanes: [{ ...beat, solo: true }] }] });
    assert.equal(packed.lanes.length, 4, "beat once, both vocals, the soloed beat");
    assert.deepEqual(Object.keys(packed.peaks).sort(), ["stem-beat", "stem-vocal"]);
    assert.ok(!("peaks" in packed.lanes[0]));
    const back = unpackHistory(structuredClone(packed));
    assert.equal(back.past.length, 2);
    assert.deepEqual(back.past[1].lanes[1], { ...moved });
    assert.deepEqual(back.past[0].lanes[0].peaks, beat.peaks);
    assert.equal(back.future[0].lanes[0].solo, false, "soloing isn't part of the mix");
  });

  test("the last steps only, and a cleared mix still counts as work to bring back", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...PROJECT_DEFAULTS, duration: 60, lanes: [{ ...beat, volume: i / 100 }] }));
    assert.equal(packHistory({ past: many, future: [] }).past.length, 60);
    const cleared = normaliseDraft({ savedAt: 1, lanes: [], project: PROJECT_DEFAULTS, sourceRemix: null, history: { past: [{ ...PROJECT_DEFAULTS, duration: 60, lanes: [beat, vocal] }], future: [] } });
    assert.ok(cleared);
    assert.equal(draftLaneCount(cleared!), 2);
    assert.equal(normaliseDraft({ savedAt: 1, lanes: [], project: PROJECT_DEFAULTS, sourceRemix: null, history: { past: [], future: [] } }), null);
  });

});

describe("harmony: what rubs, and where", () => {
  const RATE = 43;
  const vocalOf = (notes: number[]) => {
    const midi = new Float32Array(notes.length * RATE);
    const confidence = new Float32Array(midi.length);
    notes.forEach((m, n) => {
      for (let f = n * RATE; f < n * RATE + RATE - 4; f++) {
        midi[f] = m;
        confidence[f] = 0.9;
      }
    });
    const melody: Melody = { midi, confidence, rate: RATE, offset: 0, tuning: 0 };
    return { melody } as unknown as StemAnalysis;
  };
  /** A beat playing a major triad, a key per stretch: [seconds, semitones up from C]. */
  const beatOf = (parts: [number, number][]) => {
    const chromaRate = 11025 / 2048;
    const rows: number[][] = [];
    for (const [seconds, shift] of parts) {
      for (let f = 0; f < Math.round(seconds * chromaRate); f++) {
        const row = Array(12).fill(0);
        for (const [pc, v] of [[0, 0.4], [4, 0.3], [7, 0.3]]) row[(pc + shift) % 12] = v;
        rows.push(row);
      }
    }
    for (let i = 0; i < 4; i++) rows.push(rows[rows.length - 1]);
    return { chroma: Float32Array.from(rows.flat()), chromaRate } as unknown as StemAnalysis;
  };
  const laneOf = (duration: number) => ({ offsetSeconds: 0, tempoRatio: 1, pitchSemitones: 0, clips: null, originalDuration: duration });

  test("a note a semitone off the chord rubs; one the chord just doesn't have doesn't", () => {
    const over = (note: number) => scanHarmony({ analysis: vocalOf(Array(16).fill(note)), lane: laneOf(16) }, { analysis: beatOf([[16, 0]]), lane: laneOf(16) })!;
    const f = over(65); // F, a semitone above the chord's E
    const d = over(62); // D, a tone from both C and E
    assert.ok(f.now.clash > 0.9);
    assert.ok(d.now.clash < 0.05);
    assert.equal(harmonyStatus(f.now), "bad");
  });

  test("the stretch where the beat changes key is found, with the shift that fixes it there", () => {
    const tune = Array.from({ length: 48 }, (_, i) => [60, 64, 67, 72, 64, 60][i % 6]);
    const scan = scanHarmony({ analysis: vocalOf(tune), lane: laneOf(48) }, { analysis: beatOf([[32, 0], [16, 2]]), lane: laneOf(48) })!;
    const stretch = worstStretch(scan);
    assert.ok(stretch);
    assert.equal(stretch!.start, 32);
    assert.equal(stretch!.end, 48);
    assert.equal(stretch!.shift, 2);
    assert.ok(stretch!.best.inChord > stretch!.now.inChord);
  });

  test("a vocal in tune all the way through has no stretch to fix", () => {
    const tune = Array.from({ length: 32 }, (_, i) => [60, 64, 67][i % 3]);
    const scan = scanHarmony({ analysis: vocalOf(tune), lane: laneOf(32) }, { analysis: beatOf([[32, 0]]), lane: laneOf(32) })!;
    assert.equal(worstStretch(scan), null);
  });
});

describe("mixing", () => {
  test("a reverb rings out on the beat", () => {
    // 120 BPM: a beat is half a second.
    assert.equal(musicalDecay(1.6, 120), 1.5);
    assert.equal(musicalDecay(2.4, 120), 2);
    assert.equal(musicalDecay(4, 90), 4);
  });

  test("a mix fitted to this vocal and beat comes first among the sounds", () => {
    const ideas = studioIdeas(session([beat, vocal])).filter((i) => i.id.startsWith("sound-"));
    assert.equal(ideas[0].id, "sound-fitted");
    const fx = ideas[0].patches.vocal.fx!;
    assert.ok(fx.compress && fx.reverbSize > 0);
  });
});
