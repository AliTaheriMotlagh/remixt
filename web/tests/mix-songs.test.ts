// mixSongs.ts: which songs in the mix lyrics are looked up for — the ones
// whose vocal is playing come first.
//
//   node --import ./tests/support/register.mjs --test tests/mix-songs.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mixSongsOf, sungSongs } from "../src/lib/client/mixSongs.ts";
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
