// DJing live: what travels from the host's decks, and how a listener works
// out where each deck is (lib/liveDj.ts), and what the replay keeps.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanDjStage, djDeckPosition, djOnAir, djStageChanged, EMPTY_DJ_DECK, type DjLiveDeck, type DjLiveStage } from "../src/lib/liveDj.ts";
import { stateChanged } from "../src/lib/liveReplay.ts";

const deck = (o: Partial<DjLiveDeck> = {}): DjLiveDeck => ({ ...EMPTY_DJ_DECK, id: "lib:1", title: "Song", bpm: 120, duration: 200, ...o });
const stage = (o: Partial<DjLiveStage> = {}): DjLiveStage => ({
  decks: { A: deck(), B: deck({ id: "lib:2" }) },
  crossfader: 0,
  curve: "blend",
  faderCurve: "smooth",
  fx: { echo: 0, reverb: 0, horn: 0 },
  ...o,
});

describe("a deck's position", () => {
  test("moves at its rate while it plays, stands still paused", () => {
    assert.equal(djDeckPosition(deck({ playing: true, position: 10, rate: 1.05 }), 2), 12.1);
    assert.equal(djDeckPosition(deck({ playing: false, position: 10 }), 5), 10);
  });
  test("goes round an active loop", () => {
    assert.equal(djDeckPosition(deck({ playing: true, position: 15, loop: { start: 10, end: 18 } }), 5), 12);
  });
  test("never past the end of the song", () => {
    assert.equal(djDeckPosition(deck({ playing: true, position: 199, duration: 200 }), 10), 200);
  });
});

describe("the deck on air", () => {
  test("the one the crossfader and fader let through most", () => {
    const s = stage({ decks: { A: deck({ playing: true }), B: deck({ id: "lib:2", playing: true }) }, crossfader: 0.6 });
    assert.equal(djOnAir(s), "B");
    assert.equal(djOnAir({ ...s, crossfader: -1 }), "A");
  });
  test("a deck that isn't playing isn't on air; nothing playing is null", () => {
    assert.equal(djOnAir(stage({ decks: { A: deck({ playing: true }), B: deck({ id: "lib:2" }) }, crossfader: 1 })), null);
    assert.equal(djOnAir(stage()), null);
  });
});

describe("checking what the host sends", () => {
  test("clamps numbers, drops what isn't a song id, keeps the rest", () => {
    const s = cleanDjStage({
      decks: { A: { id: "lib:abc", playing: true, position: 12, rate: 99, volume: 3, eq: { low: -200 }, title: "x".repeat(500), loop: { start: 4, end: 2 } }, B: { id: "<script>", playing: true } },
      crossfader: 7,
      curve: "weird",
      fx: { echo: 2.7 },
      set: "  Wedding  ",
    })!;
    assert.equal(s.decks.A.rate, 4);
    assert.equal(s.decks.A.volume, 1);
    assert.equal(s.decks.A.eq.low, -60);
    assert.equal(s.decks.A.title.length, 200);
    assert.equal(s.decks.A.loop, null);
    assert.equal(s.decks.B.id, null);
    assert.equal(s.decks.B.playing, false, "an empty deck can't play");
    assert.equal(s.crossfader, 1);
    assert.equal(s.curve, "blend");
    assert.equal(s.fx.echo, 2);
    assert.equal(s.set, "Wedding");
  });
  test("not a stage at all", () => {
    assert.equal(cleanDjStage(null), null);
    assert.equal(cleanDjStage({ decks: 3 }), null);
  });
});

describe("what the replay keeps", () => {
  const playing = stage({ decks: { A: deck({ playing: true, position: 10 }), B: deck({ id: "lib:2" }) } });
  test("a keyframe that only confirms the decks moved on is left out", () => {
    const later = stage({ decks: { A: deck({ playing: true, position: 13 }), B: deck({ id: "lib:2" }) } });
    assert.equal(djStageChanged(playing, later, 3), false);
  });
  test("a jump, a fader, a new song are kept", () => {
    assert.equal(djStageChanged(playing, stage({ decks: { A: deck({ playing: true, position: 40 }), B: deck({ id: "lib:2" }) } }), 3), true);
    assert.equal(djStageChanged(playing, { ...playing, crossfader: 0.5 }, 1), true);
    assert.equal(djStageChanged(playing, { ...playing, decks: { ...playing.decks, B: deck({ id: "lib:3" }) } }, 1), true);
  });
  test("through the live state as a whole", () => {
    const base = { playing: true, position: 10, lanes: [] };
    assert.equal(stateChanged({ ...base, dj: playing }, { ...base, position: 12, dj: { ...playing, decks: { ...playing.decks, A: deck({ playing: true, position: 12 }) } } }, 2), false);
    assert.equal(stateChanged({ ...base, dj: playing }, { ...base, position: 12, dj: { ...playing, fx: { echo: 1, reverb: 0, horn: 0 } } }, 2), true);
  });
});
