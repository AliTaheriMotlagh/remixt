// lib/songPrivacy.ts: private songs, publishing some parts only, asking a
// song's owner before a remix of it goes public, and roles in a shared session.
//
//   node --import ./tests/support/register.mjs --test tests/song-privacy.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  inLibraryOf, isPublicPart, mayEdit, publishPlan, suggestedSplits, waitingFor, waitingMessage, type UsedSong,
} from "../src/lib/songPrivacy.ts";

describe("who sees a part", () => {
  const beat = { ownerId: "prod", visibility: "private" as const, heldBack: false, sharedWith: ["singer"] };
  test("a private song: its owner and the people it's shared with — nobody else, not guests", () => {
    assert.equal(inLibraryOf(beat, "prod"), true);
    assert.equal(inLibraryOf(beat, "singer"), true);
    assert.equal(inLibraryOf(beat, "stranger"), false);
    assert.equal(inLibraryOf(beat, null), false);
  });
  test("a public song's part held back stays private; the rest is everyone's", () => {
    assert.equal(isPublicPart({ visibility: "public", heldBack: false }), true);
    assert.equal(inLibraryOf({ ...beat, visibility: "public", heldBack: true }, "stranger"), false);
    assert.equal(inLibraryOf({ ...beat, visibility: "public", heldBack: true }, "singer"), true);
    assert.equal(inLibraryOf({ ...beat, visibility: "public" }, null), true);
  });
});

describe("publishing a song", () => {
  const has = ["vocals", "beat", "drums"];
  test("every part, some parts, or none (private)", () => {
    assert.deepEqual(publishPlan(has, has), { visibility: "public", heldBack: [], published: has });
    assert.deepEqual(publishPlan(has, ["beat"]), { visibility: "public", heldBack: ["vocals", "drums"], published: ["beat"] });
    assert.deepEqual(publishPlan(has, []), { visibility: "private", heldBack: [], published: [] });
  });
  test("parts the song doesn't have are ignored", () => {
    assert.deepEqual(publishPlan(["vocals"], ["bass"]).visibility, "private");
  });
});

describe("publishing a remix of someone else's private song", () => {
  const song = (over: Partial<UsedSong>): UsedSong => ({ trackId: "t", title: "Night Beat", ownerId: "prod", ownerName: "Prod", allPublic: false, ...over });

  test("public songs and the publisher's own need nobody", () => {
    assert.deepEqual(waitingFor([song({ allPublic: true }), song({ trackId: "u", ownerId: "me" })], "me", new Map()), []);
  });
  test("someone else's private song waits for its owner until they agree", () => {
    const s = [song({})];
    assert.equal(waitingFor(s, "me", new Map())[0].status, "not asked");
    assert.equal(waitingFor(s, "me", new Map([["t", "asked"]]))[0].status, "asked");
    assert.equal(waitingFor(s, "me", new Map([["t", "declined"]]))[0].status, "declined");
    assert.deepEqual(waitingFor(s, "me", new Map([["t", "agreed"]])), []);
  });
  test("a song used twice (vocal and beat lanes) is asked about once", () => {
    assert.equal(waitingFor([song({}), song({})], "me", new Map()).length, 1);
  });
  test("what the publisher is told", () => {
    assert.match(waitingMessage(waitingFor([song({})], "me", new Map())), /goes public as soon as Prod agrees/);
    assert.match(waitingMessage(waitingFor([song({})], "me", new Map([["t", "declined"]]))), /doesn't want “Night Beat”/);
    const two = waitingFor([song({}), song({ trackId: "v", ownerId: "sing", ownerName: "Sing" })], "me", new Map());
    assert.match(waitingMessage(two), /Prod and Sing agree/);
    assert.equal(waitingMessage([]), "");
  });
});

describe("working together", () => {
  test("the owner always edits; a listener doesn't unless allowed", () => {
    assert.equal(mayEdit({ owner: true, canEdit: false }), true);
    assert.equal(mayEdit({ owner: false, canEdit: false }), false);
    assert.equal(mayEdit({ owner: false, canEdit: true }), true);
  });
  test("a fair split: equal among makers, listeners out, adds up to 100%, the owner keeps the rounding", () => {
    const s = suggestedSplits([
      { id: "a", owner: true, role: "producer" },
      { id: "b", owner: false, role: "vocalist" },
      { id: "c", owner: false, role: "songwriter" },
      { id: "d", owner: false, role: "listener" },
    ]);
    assert.deepEqual(s.map((x) => x.userId), ["a", "b", "c"]);
    assert.equal(s.reduce((n, x) => n + x.bp, 0), 10_000);
    assert.equal(s[0].bp, 3334);
  });
  test("the owner keeps their minimum even among many", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, owner: i === 0, role: "producer" as const }));
    const s = suggestedSplits(many, 1_000);
    assert.ok(s[0].bp >= 1_000);
    assert.equal(s.reduce((n, x) => n + x.bp, 0), 10_000);
  });
});
