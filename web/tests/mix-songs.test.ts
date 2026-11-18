// mixSongs.ts: which songs in the mix lyrics are looked up for — the ones
// whose vocal is playing come first.
//
//   node --import ./tests/support/register.mjs --test tests/mix-songs.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mixSongsOf, sungSongs, wordsOf } from "../src/lib/client/mixSongs.ts";
import type { StudioLane } from "../src/lib/client/studioStore.ts";

const lane = (laneId: string, kind: "vocals" | "beat", trackTitle: string, artistName = "Someone") =>
  ({ laneId, kind, trackTitle, artistName, originalDuration: 200 }) as unknown as StudioLane;

describe("mixSongsOf", () => {
  test("the song whose vocal plays comes first, even when its beat lane is lower", () => {
    const songs = mixSongsOf([lane("a", "beat", "Hichkas - Firooz"), lane("b", "vocals", "Shayea - Deli")]);
    assert.deepEqual(
      songs.map((m) => [m.song, m.vocal]),
      [
        ["Deli", true],
        ["Firooz", false],
      ]
    );
  });

  test("one song's beat and vocal are one song, with its vocal lane", () => {
    const songs = mixSongsOf([lane("a", "beat", "Shayea - Deli"), lane("b", "vocals", "Shayea - Deli")]);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].lane.laneId, "b");
    assert.equal(songs[0].vocal, true);
  });

  test("the singer's own takes are never a song to look up", () => {
    assert.deepEqual(mixSongsOf([lane("a", "vocals", "Studio vocal — take 1", "You")]), []);
  });
});

describe("sungSongs", () => {
  test("only the sung songs when something is sung", () => {
    const songs = mixSongsOf([lane("a", "beat", "Hichkas - Firooz"), lane("b", "vocals", "Shayea - Deli")]);
    assert.deepEqual(
      sungSongs(songs).map((m) => m.song),
      ["Deli"]
    );
  });

  test("every song when nothing is sung", () => {
    const songs = mixSongsOf([lane("a", "beat", "Hichkas - Firooz"), lane("b", "beat", "Shayea - Deli")]);
    assert.equal(sungSongs(songs).length, 2);
  });
});

describe("wordsOf: whose words, everywhere", () => {
  test("a vocal in the mix: its song's words, not the beat's", () => {
    const w = wordsOf([lane("a", "beat", "Hichkas - Firooz"), lane("b", "vocals", "Shayea - Deli")]);
    assert.deepEqual([w.songs.map((m) => m.song), w.singAlong], [["Deli"], false]);
  });

  test("no vocal (recording over a beat): the beat's song, to sing along to", () => {
    const w = wordsOf([lane("a", "beat", "Hichkas - Firooz"), lane("t", "vocals", "Studio vocal — take 1", "You")]);
    assert.deepEqual([w.songs.map((m) => m.song), w.singAlong], [["Firooz"], true]);
  });

  test("a listener hearing someone's take: their own words, none found", () => {
    const w = wordsOf([lane("a", "beat", "Hichkas - Firooz"), lane("t", "vocals", "Studio vocal — take 1", "You")], { takesHaveOwnWords: true });
    assert.deepEqual([w.songs.length, w.ownWords], [0, true]);
  });

  test("a muted vocal isn't heard: the beat's words", () => {
    const muted = { ...lane("b", "vocals", "Shayea - Deli"), muted: true } as StudioLane;
    const w = wordsOf([lane("a", "beat", "Hichkas - Firooz"), muted]);
    assert.deepEqual([w.songs.map((m) => m.song), w.singAlong], [["Firooz"], true]);
  });

  test("the radio: only ever the vocal's words — an instrumental shows none", () => {
    const w = wordsOf([lane("a", "beat", "Hichkas - Firooz")], { vocalOnly: true });
    assert.deepEqual([w.songs.length, w.singAlong, w.ownWords], [0, false, false]);
    const take = wordsOf([lane("a", "beat", "Hichkas - Firooz"), lane("t", "vocals", "Studio vocal — take 1", "You")], { vocalOnly: true, takesHaveOwnWords: true });
    assert.deepEqual([take.songs.length, take.ownWords], [0, true]);
  });

  test("an instrumental with no beat song either: nothing", () => {
    assert.deepEqual(wordsOf([]).songs, []);
  });
});
