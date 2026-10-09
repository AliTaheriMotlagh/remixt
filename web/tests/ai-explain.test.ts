// What the redesigned Studio and AI producer are built on: saying exactly
// what changed (aiExplain.ts), the timing choices that go with any "who
// leads" sync, the harmony layers, a song's lines (songLines.ts) and
// whether each line is in step (lineStatus.ts) — on plain lane objects.
//
//   node --import ./tests/support/register.mjs --test tests/ai-explain.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { diffMix } from "../src/lib/client/aiExplain.ts";
import { mixFix, mixSignature, studioIdeas, syncOf, timingSignature, type Session } from "../src/lib/client/aiIdeas.ts";
import { keepTrial, revertTrial, tryIdea, useAiLog, useAiTrial } from "../src/lib/client/aiTrial.ts";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import { allInStep, lineStatus, projectKey, stretchWords } from "../src/lib/client/lineStatus.ts";
import { tonalPartner } from "../src/lib/client/pairMatch.ts";
import { allLines, groupSongs, hasParts, kindsOf, type SongStem } from "../src/lib/client/songLines.ts";
import { DEFAULT_FX, useStudioStore, type StudioLane } from "../src/lib/client/studioStore.ts";

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

function session(lanes: StudioLane[]): Session {
  return {
    lanes,
    projectBpm: BPM,
    analyses: new Map(),
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

describe("what exactly happened", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { bpm: 92, musicalKey: { tonic: 9, mode: "minor" }, originalDuration: 40 });

  test("speed, key, volume, start and cut are each said with their numbers", () => {
    const after = normaliseLane({
      ...vocal,
      tempoRatio: 120 / 92,
      pitchSemitones: 3,
      volume: 0.8,
      clips: [
        { from: 0, to: 10, at: 8, label: "Verse 1" },
        { from: 12, to: 20, at: 22, label: "Chorus" },
      ],
    });
    const diff = diffMix({ lanes: [beat, vocal], projectBpm: BPM }, { lanes: [beat, after], projectBpm: BPM });
    const vocalDiff = diff.lanes.find((d) => d.laneId === "vocal")!;
    assert.equal(vocalDiff.status, "changed");
    const byLabel = Object.fromEntries(vocalDiff.changes.map((c) => [c.label, c]));
    assert.equal(byLabel.Speed.value, "92 → 120 BPM");
    assert.match(byLabel.Speed.text, /30\.4% faster/);
    assert.equal(byLabel.Key.value, "A min → C min");
    assert.match(byLabel.Key.text, /3 semitones higher/);
    assert.equal(byLabel.Volume.value, "100% → 80%");
    assert.match(byLabel.Cut.text, /2 pieces.*Verse 1, Chorus/);
    assert.ok(byLabel.Starts, "it comes in later");
    assert.equal(diff.lanes.find((d) => d.laneId === "beat")!.status, "same", "the beat wasn't touched");
    assert.equal(diff.summary.length, 1);
    assert.match(diff.summary[0], /^“vocal”: 30\.4% faster \(92 → 120 BPM\); 3 semitones higher/);
  });

  test("effects and drawn moves are listed in words", () => {
    const after = { ...beat, fx: { ...beat.fx, reverb: 0.2, compress: true, highpass: 110 }, automation: { volume: [{ t: 0, v: 1 }, { t: 4, v: 0 }] } };
    const diff = diffMix({ lanes: [beat], projectBpm: BPM }, { lanes: [after], projectBpm: BPM });
    const changes = diff.lanes[0].changes;
    assert.match(changes.find((c) => c.label === "Sound")!.text, /reverb 20%.*compressor on.*low cut at 110 Hz/);
    assert.equal(changes.find((c) => c.label === "Volume moves")!.value, "drawn");
  });

  test("new lines say where they came from; a beat swapped for its parts is said once", () => {
    const layer = lane("vocal~layer-fifth", "vocals", { pitchSemitones: 7, name: "vocal · harmony" });
    const parts = (["drums", "bass", "other"] as const).map((kind) => lane(`beat~${kind}`, kind));
    const diff = diffMix({ lanes: [beat, vocal], projectBpm: BPM }, { lanes: [...parts, vocal, layer], projectBpm: BPM });
    assert.equal(diff.lanes.find((d) => d.laneId === "beat")!.status, "removed");
    assert.equal(diff.lanes.find((d) => d.laneId === "vocal~layer-fifth")!.from, "vocal");
    assert.ok(diff.summary.some((s) => /“beat” was swapped for its own drums, bass, melody/.test(s)), diff.summary.join(" | "));
    assert.ok(diff.summary.some((s) => /New line “vocal · harmony”, made from “vocal” \(\+7 st\)/.test(s)), diff.summary.join(" | "));
    assert.ok(!diff.summary.some((s) => /New line “beat~drums”/.test(s)), "the parts aren't each a new line");
  });

  test("a change of the song's tempo is said first", () => {
    const diff = diffMix({ lanes: [beat], projectBpm: 120 }, { lanes: [{ ...beat, tempoRatio: 0.85 }], projectBpm: 102 });
    assert.deepEqual(diff.tempo, { from: 120, to: 102 });
    assert.match(diff.summary[0], /120 to 102 BPM/);
  });
});

describe("what was kept is remembered", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useAiLog.setState({ kept: [] });
    useStudioStore.setState({ lanes: [beat, vocal], projectBpm: BPM, duration: 120 });
  });

  test("keeping logs the ideas with the mix before and after; reverting logs nothing", () => {
    const s = session([beat, vocal]);
    const double = studioIdeas(s).find((i) => i.id === "layer-double")!;
    tryIdea(s, double);
    revertTrial();
    assert.equal(useAiLog.getState().kept.length, 0);
    tryIdea(s, double);
    keepTrial();
    const [kept] = useAiLog.getState().kept;
    assert.deepEqual(kept.ideas.map((i) => i.id), ["layer-double"]);
    assert.deepEqual(kept.before.lanes.map((l) => l.laneId), ["beat", "vocal"]);
    assert.equal(kept.after.lanes, useStudioStore.getState().lanes, "the mix is what was kept");
  });
});

describe("timing goes with whoever leads", () => {
  test("a 'who leads' sync takes the person's entry and gaps", () => {
    const t = syncOf({ vibe: "any", sync: "vocal-leads", entry: 8, tight: true });
    assert.equal(t.tempo, "vocal");
    assert.equal(t.keyTo, "vocal");
    assert.equal(t.entry, 8);
    assert.equal(t.structure, "tight");
  });

  test("unset, each keeps its own; a ready-made timing sync keeps its own timing", () => {
    assert.equal(syncOf({ vibe: "any", sync: "beat-leads" }).entry, "auto");
    assert.equal(syncOf({ vibe: "any", sync: "beat-leads" }).structure, "as-sung");
    assert.equal(syncOf({ vibe: "any", sync: "straight-in", entry: 8 }).entry, 0);
    assert.equal(syncOf({ vibe: "any" }).id, "perfect");
  });
});

describe("harmonies", () => {
  const beat = lane("beat", "beat");
  const vocal = lane("vocal", "vocals", { offsetSeconds: 8, originalDuration: 36 });

  beforeEach(() => {
    useAiTrial.setState({ trial: null });
    useStudioStore.setState({ lanes: [beat, vocal], projectBpm: BPM, duration: 120 });
  });

  test("a fifth above and a choir stack are offered, as voices that follow the vocal", () => {
    const ideas = studioIdeas(session([beat, vocal]));
    const fifth = ideas.find((i) => i.id === "layer-fifth")!;
    assert.deepEqual(fifth.lanes!.add.map((l) => l.pitchSemitones), [7]);
    const choir = ideas.find((i) => i.id === "layer-choir")!;
    assert.deepEqual(choir.lanes!.add.map((l) => l.pitchSemitones), [-12, 7, 12]);
    assert.ok(choir.lanes!.add.every((l) => l.volume < vocal.volume), "all under the lead");
    assert.ok(tryIdea(session([beat, vocal]), fifth));
    assert.ok(useStudioStore.getState().lanes.some((l) => l.laneId === "vocal~layer-fifth"));
  });
});

describe("every line of a song", () => {
  const stem = (track: string, kind: SongStem["kind"]): SongStem => ({
    id: `${track}-${kind}`,
    kind,
    track_id: track,
    track_title: `Song ${track}`,
    artist_name: "Someone",
    peaks_json: "[]",
    track_duration: 180,
    track_bpm: 120,
  });
  const rows = [stem("a", "vocals"), stem("a", "beat"), stem("a", "drums"), stem("a", "bass"), stem("a", "other"), stem("b", "vocals"), stem("b", "beat")];

  test("stems grouped into songs, in the order they're listed", () => {
    const songs = groupSongs(rows);
    assert.deepEqual(songs.map((s) => s.trackId), ["a", "b"]);
    assert.deepEqual(kindsOf(songs[0]), ["vocals", "beat", "drums", "bass", "other"]);
  });

  test("all lines: the vocal and the beat's own parts when there are any, else vocal and beat", () => {
    const [a, b] = groupSongs(rows);
    assert.ok(hasParts(a) && !hasParts(b));
    assert.deepEqual(allLines(a).map((s) => s.kind), ["vocals", "drums", "bass", "other"]);
    assert.deepEqual(allLines(b).map((s) => s.kind), ["vocals", "beat"]);
  });
});

describe("is each line in step?", () => {
  const am = { tonic: 9, mode: "minor" as const };
  test("half and double time count as the song's speed", () => {
    const ref = projectKey([]);
    assert.equal(lineStatus(lane("half", "beat", { bpm: 60 }), 120, ref).inStep, true);
    assert.equal(lineStatus(lane("off", "vocals", { bpm: 100 }), 120, ref).inStep, false);
    assert.equal(stretchWords(lineStatus(lane("off", "vocals", { bpm: 100 }), 120, ref).stretch), "20% too slow");
  });

  test("a clashing key is flagged; drums never are", () => {
    const beat = lane("beat", "beat", { musicalKey: am });
    const lanes = [beat, lane("v", "vocals", { musicalKey: { tonic: 3, mode: "minor" } }), lane("d", "drums", { musicalKey: { tonic: 1, mode: "major" } })];
    const ref = projectKey(lanes);
    assert.equal(ref.laneId, "beat");
    assert.equal(lineStatus(lanes[1], 120, ref).inKey, false);
    assert.equal(lineStatus(lanes[2], 120, ref).keyFit, null);
    assert.equal(allInStep(lanes, 120), true);
  });
});

describe("drums carry no key", () => {
  const am = { tonic: 9, mode: "minor" as const };

  test("the project key never comes from drums, and matching keys leaves them alone", () => {
    const drums = lane("d", "drums", { musicalKey: { tonic: 1, mode: "major" } });
    const melody = lane("m", "other", { musicalKey: am });
    const vocal = lane("v", "vocals", { musicalKey: { tonic: 0, mode: "minor" } });
    useStudioStore.setState({ lanes: [vocal, drums, melody], projectBpm: BPM });
    assert.equal(projectKey([vocal, drums, melody]).laneId, "m");
    useStudioStore.getState().matchAllKeys();
    const after = useStudioStore.getState().lanes;
    assert.equal(after.find((l) => l.laneId === "d")!.pitchSemitones, 0, "drums aren't re-pitched");
    assert.equal(after.find((l) => l.laneId === "v")!.pitchSemitones, -3, "the vocal moves to the melody's key");
  });

  test("a drums lane's notes come from the song's melody (or bass) playing in step with it", () => {
    const drums = lane("d", "drums", { trackTitle: "Song", offsetSeconds: 2 });
    const melody = lane("m", "other", { trackTitle: "Song", offsetSeconds: 2 });
    const bass = lane("b", "bass", { trackTitle: "Song", offsetSeconds: 2 });
    const elsewhere = lane("x", "other", { trackTitle: "Song", offsetSeconds: 6 });
    assert.equal(tonalPartner([drums, bass, melody], drums)?.laneId, "m");
    assert.equal(tonalPartner([drums, bass], drums)?.laneId, "b");
    assert.equal(tonalPartner([drums, elsewhere], drums), null, "one not in step with it doesn't count");
  });
});

describe("balancing every line", () => {
  const heardAs = (lanes: StudioLane[], loudness: Record<string, number>): Session => ({
    ...session(lanes),
    beat: lanes.find((l) => l.kind === "drums") ?? null,
    analyses: new Map(Object.entries(loudness).map(([id, l]) => [id, { loudness: l } as never])),
  });

  test("a song's own lines keep their balance with each other; the vocal rides over them all", () => {
    const parts = (["drums", "bass", "other"] as const).map((kind) => lane(kind, kind, { trackTitle: "Song", volume: kind === "other" ? 0.5 : 1 }));
    const vocal = lane("vocal", "vocals", { trackTitle: "Another" });
    const idea = mixFix(heardAs([...parts, vocal], { drums: 0.5, bass: 0.4, other: 0.2, vocal: 0.9 }), ["balance"])!;
    const v = (id: string) => idea.patches[id]?.volume ?? [...parts, vocal].find((l) => l.laneId === id)!.volume;
    assert.equal(v("drums"), v("bass"), "drums and bass stay level with each other");
    assert.ok(Math.abs(v("other") / v("drums") - 0.5) < 0.02, "the melody stays at half the drums, as it was");
    assert.ok(v("vocal") > 0.5 && v("vocal") <= 1.5);
  });

  test("a very quiet vocal never pulls the beat down more than 9 dB", () => {
    const drums = lane("drums", "drums", { trackTitle: "Song" });
    const vocal = lane("vocal", "vocals", { trackTitle: "Another" });
    const idea = mixFix(heardAs([drums, vocal], { drums: 0.5, vocal: 0.005 }), ["balance"])!;
    assert.equal(idea.patches.vocal.volume, 1.5);
    assert.ok(idea.patches.drums.volume! >= 0.29, `the drums stay audible (${idea.patches.drums.volume})`);
  });
});

describe("what happened, said plainly", () => {
  test("a vocal counted in half time is said that way, both sides at the same count", () => {
    const vocal = lane("vocal", "vocals", { bpm: 152 });
    const after = { ...vocal, bpm: 76, tempoRatio: 79 / 76 };
    const diff = diffMix({ lanes: [vocal], projectBpm: 79 }, { lanes: [after], projectBpm: 79 });
    const speed = diff.lanes[0].changes.find((c) => c.label === "Speed")!;
    assert.equal(speed.value, "76 → 79 BPM");
    assert.match(speed.text, /3\.9% faster \(its 152 BPM counted in half time\)/);
    assert.match(diff.summary.join(" "), /3\.9% faster \(76 → 79 BPM, half time\)/);
  });

  test("decibels keep their capital B", () => {
    const beat = lane("beat", "beat");
    const diff = diffMix({ lanes: [beat], projectBpm: BPM }, { lanes: [{ ...beat, volume: 0.5 }], projectBpm: BPM });
    assert.match(diff.summary[0], /quieter by 6 dB/);
  });
});
