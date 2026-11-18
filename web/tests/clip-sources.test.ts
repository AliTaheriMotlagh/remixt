// What the clip editor takes from the mix (lib/client/clipSources.ts):
// who's credited for the vocals and the beat, and the vocals' and beat's
// own waveforms for the part picker.
//
//   node --import ./tests/support/register.mjs --test tests/clip-sources.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import { groupPeaks, laneCredits } from "../src/lib/client/clipSources.ts";
import type { StudioLane } from "../src/lib/client/studioStore.ts";

function lane(id: string, opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind: "vocals",
    trackTitle: id,
    artistName: "uploader",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 60,
    duration: 60,
    offsetSeconds: 0,
    bpm: 120,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: {} as StudioLane["fx"],
    clips: null,
    xfade: null,
    automation: {},
    ...opts,
  });
}

test("a vocal from one song over another's beat credits both artists", () => {
  const lanes = [lane("v", { trackTitle: "Adele - Hello" }), lane("d", { kind: "drums", trackTitle: "Daft Punk - Around the World" })];
  assert.deepEqual(laneCredits(lanes, "Me"), { vocalBy: "Adele", beatBy: "Daft Punk" });
});

test("one song remixed needs no credits", () => {
  const lanes = [lane("v", { trackTitle: "Adele - Hello" }), lane("d", { kind: "drums", trackTitle: "Adele - Hello" })];
  assert.deepEqual(laneCredits(lanes, "Me"), { vocalBy: "", beatBy: "" });
});

test("a take recorded here is the user's voice; muted lanes aren't credited", () => {
  const lanes = [
    lane("t", { trackTitle: "Studio vocal — take 1", artistName: "You" }),
    lane("v", { trackTitle: "Adele - Hello", muted: true }),
    lane("d", { kind: "other", trackTitle: "Daft Punk - Around the World" }),
  ];
  assert.deepEqual(laneCredits(lanes, "DJ Me"), { vocalBy: "DJ Me", beatBy: "Daft Punk" });
});

test("a soloed beat leaves the vocals out of the credits and the vocal waveform", () => {
  const lanes = [
    lane("v", { trackTitle: "Adele - Hello", peaks: new Array(60).fill(0.5) }),
    lane("d", { kind: "drums", trackTitle: "Daft Punk - Around the World", solo: true, peaks: new Array(60).fill(0.8) }),
  ];
  assert.deepEqual(laneCredits(lanes, "Me"), { vocalBy: "", beatBy: "" });
  const { vocals, beat } = groupPeaks(lanes, 60, 30);
  assert.ok(vocals.every((p) => p === 0));
  assert.ok(beat.some((p) => p > 0));
});

test("each group's waveform follows only its own lanes", () => {
  const loudEnd = Array.from({ length: 60 }, (_, i) => (i >= 40 ? 1 : 0.1));
  const loudStart = Array.from({ length: 60 }, (_, i) => (i < 20 ? 1 : 0.1));
  const lanes = [lane("v", { peaks: loudEnd }), lane("d", { kind: "bass", peaks: loudStart })];
  const { vocals, beat } = groupPeaks(lanes, 60, 60);
  assert.ok(vocals[50] > vocals[10]);
  assert.ok(beat[10] > beat[50]);
  assert.equal(Math.max(...vocals), 1);
  assert.equal(Math.max(...beat), 1);
});
