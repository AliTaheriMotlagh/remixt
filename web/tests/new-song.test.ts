// A new song from everything in the mix (lib/client/newSong.ts): one
// tempo and key, the parts that fit (and why the others don't), three to
// four minutes laid out on 8-bar lines, choruses on drops, verses passed
// round the singers, and two voices together only when their notes agree.
//
//   node --import ./tests/support/register.mjs --test tests/new-song.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromaMatch, planNewSong, songShape, speedTo, type NsBeat, type NsVocal } from "../src/lib/client/newSong.ts";
import type { MusicalKey } from "../src/lib/client/musicKey.ts";

const A_MINOR: MusicalKey = { tonic: 9, mode: "minor" };
const C_MAJOR: MusicalKey = { tonic: 0, mode: "major" };
const D_MINOR: MusicalKey = { tonic: 2, mode: "minor" };
const F_SHARP: MusicalKey = { tonic: 6, mode: "major" };

/** A chroma that's all one note (for agreeing / clashing voices). */
const note = (n: number) => Array.from({ length: 12 }, (_, i) => (i === n ? 1 : 0.05));

function vocal(id: string, bpm: number, key: MusicalKey | null, sections = 6, chorus = [2, 4]): NsVocal {
  return {
    id,
    song: `Song ${id}`,
    bpm,
    key,
    sections: Array.from({ length: sections }, (_, i) => ({ index: i, bars: 16, energy: chorus.includes(i) ? 0.9 : 0.4 + i * 0.02, chorus: chorus.includes(i), chroma: note(0) })),
  };
}

function beat(id: string, bpm: number, key: MusicalKey | null, bars = 96, loud = 1): NsBeat {
  return { id, song: `Song ${id}`, bpm, key, introBars: 8, endBar: bars, barEnergy: Array.from({ length: bars }, (_, i) => (i < 8 ? 0.3 : (0.6 + 0.4 * Math.sin(i / 7) ** 2) * loud)) };
}

const totalBars = (plan: ReturnType<typeof planNewSong>) => plan.slots.reduce((n, s) => n + s.bars, 0);

describe("the song's shape", () => {
  test("three to four minutes, whatever the tempo", () => {
    for (const bpm of [70, 90, 100, 128, 160]) {
      const shape = songShape(bpm);
      const seconds = (shape.reduce((n, p) => n + p.bars, 0) * 240) / bpm;
      assert.ok(seconds >= 170 && seconds <= 240, `${bpm} BPM: ${seconds} s`);
      assert.equal(shape[0].name, "Intro");
      assert.equal(shape[shape.length - 1].name, "Outro");
      assert.ok(shape.every((p) => p.bars % 8 === 0), "8-bar lines");
    }
  });

  test("tempo: a part plays at the least bent speed, half and double time counted", () => {
    assert.equal(speedTo(100, 100), 1);
    assert.ok(Math.abs(speedTo(70, 140) - 1) < 1e-9, "double time");
    assert.ok(Math.abs(speedTo(95, 100) - 100 / 95) < 1e-9);
  });
});

describe("planning a new song", () => {
  const three = {
    vocals: [vocal("v1", 100, A_MINOR), vocal("v2", 98, C_MAJOR), vocal("v3", 50, D_MINOR)],
    beats: [beat("b1", 100, A_MINOR), beat("b2", 102, C_MAJOR, 80, 1.2), beat("b3", 99, D_MINOR, 64)],
  };

  test("three songs: one tempo and key, every part used, each slot on an 8-bar line", () => {
    const plan = planNewSong(three);
    assert.ok(plan.bpm > 95 && plan.bpm < 105);
    assert.ok(plan.seconds >= 170 && plan.seconds <= 240, `${plan.seconds} s`);
    assert.equal(totalBars(plan), plan.bars);
    let at = 0;
    for (const slot of plan.slots) {
      assert.equal(slot.start, at, "slots follow each other");
      assert.equal(slot.start % 8, 0, `${slot.label} starts on an 8-bar line`);
      at += slot.bars;
      assert.ok(slot.why.length > 10, `${slot.label} says why`);
      for (const v of slot.vocals) assert.ok(v.at + v.bars <= slot.bars, "a voice stays inside its part");
    }
    assert.deepEqual(plan.parts.filter((p) => !p.used), [], plan.notes.join(" / "));
    // v3 sings at half time: played at double speed, not bent.
    assert.ok(plan.parts.find((p) => p.id === "v3")!.used);
  });

  test("choruses land on drops with the build bar before; verses go round the singers", () => {
    const plan = planNewSong(three);
    const choruses = plan.slots.filter((s) => s.name === "Chorus");
    assert.ok(choruses.length >= 2);
    for (const c of choruses) {
      assert.ok(c.drop);
      assert.ok(plan.slots[plan.slots.indexOf(c) - 1].build, "a breath before every drop");
    }
    const verseSingers = plan.slots.filter((s) => s.name === "Verse").flatMap((s) => s.vocals.map((v) => v.id));
    assert.ok(new Set(verseSingers).size >= 2, `verses shared: ${verseSingers}`);
    // Choruses are chorus sections.
    for (const c of choruses) for (const v of c.vocals) assert.ok([2, 4].includes(v.section));
  });

  test("a part that would sound bent is left out, and the plan says why; keys are always within reach", () => {
    const plan = planNewSong({
      vocals: [vocal("v1", 100, A_MINOR), vocal("far", 100, F_SHARP), vocal("slow", 76, A_MINOR)],
      beats: [beat("b1", 100, A_MINOR)],
    });
    // Any key is a neighbour key away within three semitones (bestKeyShift).
    const far = plan.parts.find((p) => p.id === "far")!;
    assert.ok(far.used && Math.abs(far.semitones) <= 3);
    const slow = plan.parts.find((p) => p.id === "slow")!;
    assert.equal(slow.used, false);
    assert.match(slow.why!, /faster|slower/);
    assert.ok(plan.notes.some((n) => /Left out Song slow/.test(n)));
    assert.ok(plan.slots.every((s) => s.vocals.every((v) => v.id !== "slow")));
  });

  test("four songs: still three to four minutes, the strongest beat under the drops", () => {
    const plan = planNewSong({
      vocals: [...three.vocals, vocal("v4", 101, A_MINOR)],
      beats: [...three.beats, beat("b4", 100, A_MINOR, 96, 1.6)],
    });
    assert.ok(plan.seconds >= 170 && plan.seconds <= 240);
    for (const c of plan.slots.filter((s) => s.drop)) assert.equal(c.beat?.id, "b4");
  });

  test("the final chorus: two voices together when their notes agree, else taking turns", () => {
    const agree = planNewSong({ vocals: [vocal("v1", 100, A_MINOR), vocal("v2", 100, A_MINOR)], beats: [beat("b1", 100, A_MINOR)] });
    const last = agree.slots.filter((s) => s.name === "Chorus").pop()!;
    assert.equal(last.vocals.length, 2);
    assert.ok(last.vocals.every((v) => v.at === 0), "together");

    const clash = vocal("v2", 100, A_MINOR);
    for (const s of clash.sections) s.chroma = note(6);
    const apart = planNewSong({ vocals: [vocal("v1", 100, A_MINOR), clash], beats: [beat("b1", 100, A_MINOR)] });
    const final = apart.slots.filter((s) => s.name === "Chorus").pop()!;
    assert.equal(final.vocals.length, 2);
    assert.deepEqual(final.vocals.map((v) => v.at), [0, final.bars / 2], "taking turns");
    assert.match(final.why, /take turns/);
  });

  test("notes match after a key change", () => {
    assert.ok(chromaMatch(note(0), note(0)) > 0.99);
    assert.ok(chromaMatch(note(0), note(6)) < 0.3);
  });

  test("nothing to build from: says so", () => {
    assert.throws(() => planNewSong({ vocals: [], beats: [beat("b1", 100, A_MINOR)] }), /No vocal/);
    assert.throws(() => planNewSong({ vocals: [vocal("v1", 100, A_MINOR)], beats: [] }), /No beat/);
  });
});

describe("the tools", () => {
  const input = {
    vocals: [vocal("v1", 100, A_MINOR), vocal("v2", 100, A_MINOR), vocal("v3", 100, A_MINOR)],
    beats: [beat("b1", 100, A_MINOR), beat("b2", 100, A_MINOR, 96, 1.3)],
  };

  test("longer and shorter: a verse and chorus more or fewer", () => {
    const base = planNewSong(input);
    const longer = planNewSong({ ...input, tweaks: { length: 1 } });
    const shorter = planNewSong({ ...input, tweaks: { length: -1 } });
    assert.ok(longer.bars > base.bars);
    assert.ok(shorter.bars < base.bars);
  });

  test("more of one singer: they lead the verses and the choruses", () => {
    const plan = planNewSong({ ...input, tweaks: { favour: "v3" } });
    assert.equal(plan.slots.find((s) => s.name === "Verse")!.vocals[0].id, "v3");
    assert.equal(plan.slots.find((s) => s.name === "Chorus")!.vocals[0].id, "v3");
  });

  test("a part swapped to another singer or beat, and the drops moved to another beat", () => {
    const base = planNewSong(input);
    const verse = base.slots.findIndex((s) => s.name === "Verse");
    const plan = planNewSong({ ...input, tweaks: { swaps: { [verse]: { vocal: "v2", beat: "b1" } }, dropBeat: "b1" } });
    assert.deepEqual(plan.slots[verse].vocals.map((v) => v.id), ["v2"]);
    assert.equal(plan.slots[verse].beat?.id, "b1");
    assert.match(plan.slots[verse].why, /your pick/);
    for (const c of plan.slots.filter((s) => s.drop)) assert.equal(c.beat?.id, "b1");
  });
});
