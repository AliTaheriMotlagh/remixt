// singerParts.ts: who sings where (lyric headers, voices), and the cut.
//
//   node --import ./tests/support/register.mjs --test tests/singer-parts.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normaliseLane } from "../src/lib/client/clipEdit.ts";
import type { StudioLane } from "../src/lib/client/studioStore.ts";
import {
  fingerprint,
  groupVoices,
  linesOutside,
  lyricSections,
  mergeSpans,
  performers,
  phrasesOf,
  readHeader,
  rmsCurve,
  toBars,
  withoutSpans,
} from "../src/lib/client/singerParts.ts";
import { parseLyrics } from "../src/lib/lyrics.ts";

describe("lyric headers", () => {
  test("section and singers, Genius style", () => {
    assert.deepEqual(readHeader("[Verse 2: 2 Chainz]"), { label: "Verse 2", performers: ["2 Chainz"] });
    assert.deepEqual(readHeader("[Chorus: Kid Cudi & 2 Chainz]"), { label: "Chorus", performers: ["Kid Cudi", "2 Chainz"] });
    assert.deepEqual(readHeader("[Hook: Drake, Future]"), { label: "Hook", performers: ["Drake", "Future"] });
    assert.deepEqual(readHeader("[Bridge]"), { label: "Bridge", performers: [] });
    assert.deepEqual(readHeader("(Kid Cudi)"), { label: "", performers: ["Kid Cudi"] });
    assert.equal(readHeader("[01:23.45]"), null);
    assert.equal(readHeader("plain words"), null);
  });

  test("timed lines belong to the section above; each runs to the next one", () => {
    const sheet = parseLyrics(
      ["[Verse 1: Kid Cudi]", "[00:10.00] first line", "[00:14.00] second", "[Chorus: Kid Cudi & 2 Chainz]", "[00:20.00] hook", "[Verse 2: 2 Chainz]", "[00:40.00] his verse", "[00:48.00] end"].join("\n")
    );
    const sections = lyricSections(sheet, 60);
    assert.deepEqual(
      sections.map((s) => [s.label, s.performers.join("+"), Math.round(s.start * 10) / 10, Math.round(s.end * 10) / 10, s.line]),
      [
        ["Verse 1", "Kid Cudi", 9.7, 18, "first line"],
        ["Chorus", "Kid Cudi+2 Chainz", 19.7, 24, "hook"],
        ["Verse 2", "2 Chainz", 39.7, 52, "his verse"],
      ]
    );
    const who = performers(sections);
    assert.deepEqual(
      who.map((p) => [p.name, p.sections.length, p.shared]),
      [
        ["2 Chainz", 2, 1],
        ["Kid Cudi", 2, 1],
      ]
    );
  });
});

/** A "voice": a tone at `hz` with bright or dark harmonics, `seconds` long. */
function voice(hz: number, bright: boolean, seconds: number, rate = 22050) {
  const out = new Float32Array(Math.floor(seconds * rate));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    let v = 0;
    for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * hz * h * t) / (bright ? h ** 0.6 : h ** 2.2);
    out[i] = v * 0.15 * (1 + 0.1 * Math.sin(2 * Math.PI * 5 * t));
  }
  return out;
}

function song(parts: { who: "a" | "b"; seconds: number }[], rate = 22050) {
  const gap = new Float32Array(Math.floor(0.6 * rate));
  const chunks: Float32Array[] = [];
  for (const p of parts) chunks.push(p.who === "a" ? voice(110, false, p.seconds, rate) : voice(260, true, p.seconds, rate), gap);
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

describe("voices", () => {
  const rate = 22050;
  const order: ("a" | "b")[] = ["a", "a", "b", "a", "b", "b", "a", "b"];
  const samples = song(order.map((who) => ({ who, seconds: 2 })), rate);
  const phrases = phrasesOf(rmsCurve(samples, rate), 50);

  test("phrases where it's sung, gaps between them", () => {
    assert.equal(phrases.length, order.length);
    assert.ok(Math.abs(phrases[1].start - 2.6) < 0.1, `second phrase at ${phrases[1].start}`);
  });

  test("two singers come out as two voices, each phrase with the right one", () => {
    const prints = phrases.map((p) => fingerprint(samples, rate, p));
    const voices = groupVoices(prints, phrases.map((p) => p.end - p.start));
    assert.equal(voices.count, 2);
    const a = voices.labels[0];
    assert.deepEqual(
      voices.labels.map((l) => (l === a ? "a" : "b")),
      order
    );
    assert.ok(voices.confidence > 0.5, `confidence ${voices.confidence}`);
  });

  test("one singer stays one voice", () => {
    const one = song(Array.from({ length: 8 }, () => ({ who: "a" as const, seconds: 2 })), rate);
    const ph = phrasesOf(rmsCurve(one, rate), 50);
    const voices = groupVoices(ph.map((p) => fingerprint(one, rate, p)), ph.map((p) => p.end - p.start));
    assert.equal(voices.count, 1);
  });

  test("long phrases are cut in pieces of at most 3 s", () => {
    const long = phrasesOf(rmsCurve(voice(110, false, 14, rate), rate), 50);
    assert.equal(long.length, 5);
    assert.ok(long.every((p) => p.end - p.start <= 3.01));
  });
});

describe("the cut", () => {
  const lane = (opts: Partial<StudioLane> = {}) =>
    normaliseLane({
      laneId: "v",
      stemId: "s",
      kind: "vocals",
      trackTitle: "t",
      artistName: "a",
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
    } as StudioLane);

  test("spans taken out of the vocal, fades on the new edges, the rest untouched", () => {
    const out = withoutSpans(lane(), [
      { start: 10, end: 20 },
      { start: 30, end: 35 },
    ])!;
    const clips = out.clips!.map((c) => [c.from, c.to, c.at, c.fadeIn ?? 0, c.fadeOut ?? 0]);
    assert.deepEqual(clips, [
      [0, 10, 0, 0, 0.03],
      [20, 30, 20, 0.03, 0.03],
      [35, 60, 35, 0.03, 0],
    ]);
  });

  test("follows the lane's speed and offset", () => {
    const out = withoutSpans(lane({ tempoRatio: 2, offsetSeconds: 5 }), [{ start: 10, end: 15 }])!;
    // Timeline 10..15 is stem (10−5)×2 = 10 .. 20.
    assert.deepEqual(
      out.clips!.map((c) => [c.from, c.to]),
      [
        [0, 10],
        [20, 60],
      ]
    );
  });

  test("everything taken out mutes the lane; nothing in the spans changes nothing", () => {
    assert.equal(withoutSpans(lane(), [{ start: 0, end: 61 }])!.muted, true);
    assert.equal(withoutSpans(lane({ clips: [{ id: "c", from: 0, to: 5, at: 0 }] }), [{ start: 30, end: 40 }]), null);
  });

  test("spans joined, widened to bars; lyric lines inside go", () => {
    assert.deepEqual(mergeSpans([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 3.02, end: 4 }]), [
      { start: 1, end: 4 },
      { start: 5, end: 8 },
    ]);
    assert.deepEqual(toBars([{ start: 2.5, end: 5.1 }], 2), [{ start: 2, end: 6 }]);
    const lines = [
      { time: 1, text: "keep" },
      { time: 12, text: "go" },
      { time: null, text: "[Verse]" },
    ];
    assert.deepEqual(linesOutside(lines, [{ start: 10, end: 20 }]).map((l) => l.text), ["keep", "[Verse]"]);
  });
});
