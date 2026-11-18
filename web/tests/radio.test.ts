// radioPick.ts: what a station plays next and what listeners vote on.
//
//   node --import ./tests/support/register.mjs --test tests/radio.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemKey, nextStart, pickNext, positionAt, restFor, rotation, slugOf, voteChoices, type PickInput, type RadioItem, type RequestedItem } from "../src/lib/radioPick.ts";

const song = (id: string, kind: RadioItem["kind"] = "track"): RadioItem => ({ kind, id, title: id, artist: "a", duration: 180, cover: null });
const asked = (id: string, count: number, firstAt = 0): RequestedItem => ({ ...song(id), count, firstAt });
const base = (over: Partial<PickInput> = {}): PickInput => ({ djQueue: [], votes: [], voting: false, requests: [], playlist: [], library: [], recent: [], ...over });

describe("pickNext", () => {
  test("the DJ's queue first, then the vote, then requests, then the playlist, then the library", () => {
    const all = base({
      djQueue: [song("dj")],
      voting: true,
      votes: [{ item: song("voted"), votes: 3 }],
      requests: [asked("req", 2)],
      playlist: [song("pl")],
      library: [song("lib")],
    });
    assert.deepEqual(pickNext(all), { item: song("dj"), source: "dj" });
    assert.equal(pickNext({ ...all, djQueue: [] })?.source, "vote");
    assert.equal(pickNext({ ...all, djQueue: [], votes: [] })?.source, "request");
    assert.equal(pickNext({ ...all, djQueue: [], votes: [], requests: [] })?.source, "playlist");
    assert.equal(pickNext({ ...all, djQueue: [], votes: [], requests: [], playlist: [] })?.source, "library");
    assert.equal(pickNext(base()), null);
  });

  test("the most voted choice wins; with no votes, a request beats the station's own first choice", () => {
    const votes = [
      { item: song("a"), votes: 1 },
      { item: song("b"), votes: 4 },
    ];
    assert.equal(pickNext(base({ voting: true, votes }))?.item.id, "b");
    const none = votes.map((v) => ({ ...v, votes: 0 }));
    assert.equal(pickNext(base({ voting: true, votes: none, requests: [asked("r", 1)] }))?.item.id, "r");
    assert.equal(pickNext(base({ voting: true, votes: none }))?.item.id, "a");
  });

  test("more listeners asking puts a request first; equal asks go oldest first", () => {
    assert.equal(pickNext(base({ requests: [asked("one", 1, 0), asked("many", 5, 9)] }))?.item.id, "many");
    assert.equal(pickNext(base({ requests: [asked("late", 2, 9), asked("early", 2, 1)] }))?.item.id, "early");
  });

  test("never the song playing now", () => {
    assert.equal(pickNext(base({ playlist: [song("a"), song("b")], current: itemKey(song("a")), recent: [itemKey(song("a"))] }))?.item.id, "b");
    assert.equal(pickNext(base({ requests: [asked("a", 9), asked("b", 1)], current: itemKey(song("a")) }))?.item.id, "b");
  });
});

describe("rotation", () => {
  const list = ["a", "b", "c", "d"].map((id) => song(id));
  test("goes on from the last one played, skipping what's resting", () => {
    assert.deepEqual(rotation(list, [itemKey(song("b"))]).map((s) => s.id).slice(0, 2), ["c", "d"]);
    // a, b, c heard lately (rest 3 for 4 songs): d is next.
    assert.equal(rotation(list, ["a", "b", "c"].map((id) => itemKey(song(id))))[0].id, "d");
  });
  test("everything rested: the least recently played comes back first", () => {
    const recent = ["d", "c", "b", "a"].map((id) => itemKey(song(id)));
    assert.equal(rotation(list.slice(0, 2), recent)[0].id, "a");
  });
  test("rest grows with the playlist, up to 12", () => {
    assert.equal(restFor(1), 0);
    assert.equal(restFor(5), 4);
    assert.equal(restFor(100), 12);
  });
});

describe("voteChoices", () => {
  test("requests first, then the playlist, then the library — all different, never the current song", () => {
    const choices = voteChoices(
      { requests: [asked("r1", 3), asked("p1", 1)], playlist: [song("p1"), song("p2"), song("p3")], library: [song("l1")], recent: [], current: itemKey(song("p2")) },
      4
    );
    assert.deepEqual(
      choices.map((c) => c.id),
      ["r1", "p1", "p3", "l1"]
    );
    assert.equal("count" in choices[0], false);
  });
});

describe("the clock", () => {
  test("where a listener tuning in lands", () => {
    assert.equal(positionAt(1000, 180, 31_000), 30);
    assert.equal(positionAt(1000, 180, 0), 0);
    assert.equal(positionAt(0, 180, 999_999), 180);
  });
  test("gapless while people listen; from now after a silent while", () => {
    assert.equal(nextStart(10_000, 12_000), 10_000);
    assert.equal(nextStart(10_000, 100_000), 100_000);
  });
  test("slugs", () => {
    assert.equal(slugOf("Late Night — Persian Rap!"), "late-night-persian-rap");
    assert.equal(slugOf("رادیو"), "station");
  });
});

describe("crossfades", async () => {
  const { crossfadeFor, crossfadeGains } = await import("../src/lib/radioPick.ts");
  test("tempos that agree blend for 8 bars of the outgoing song (half time counts)", () => {
    const x = crossfadeFor({ bpm: 120, duration: 200 }, { bpm: 61, duration: 200 });
    assert.equal(x.style, "blend");
    assert.equal(x.bars, 8);
    assert.equal(x.seconds, 16);
  });
  test("a slow song blends for 4 bars; never longer than 16 s", () => {
    const x = crossfadeFor({ bpm: 70, duration: 200 }, { bpm: 71, duration: 200 });
    assert.equal(x.style, "blend");
    assert.equal(x.bars, 4);
    assert.ok(x.seconds <= 16);
  });
  test("tempos apart: a quick 2-bar fade; unknown: 6 s; short songs: a third at most", () => {
    assert.deepEqual(crossfadeFor({ bpm: 120, duration: 200 }, { bpm: 95, duration: 200 }), { seconds: 4, style: "quick", bars: 2 });
    assert.deepEqual(crossfadeFor({ bpm: null, duration: 200 }, { bpm: 95, duration: 200 }), { seconds: 6, style: "fade", bars: 0 });
    assert.ok(crossfadeFor({ bpm: 120, duration: 24 }, { bpm: 120, duration: 200 }).seconds <= 8);
  });
  test("equal power: as loud all through", () => {
    for (const p of [0, 0.25, 0.5, 1]) {
      const g = crossfadeGains(p);
      assert.ok(Math.abs(g.out ** 2 + g.in ** 2 - 1) < 1e-9);
    }
    assert.deepEqual(crossfadeGains(0), { out: 1, in: 0 });
  });
});
