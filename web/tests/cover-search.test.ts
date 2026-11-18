// coverSearch.ts: what to ask the music catalogue for a song's cover, and
// which of its answers is surely the song.
//
//   node --import ./tests/support/register.mjs --test tests/cover-search.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { artworkAt, bestCover, coverTerms, songOf, type StoreSong } from "../src/lib/coverSearch.ts";

const art = (n: number) => `https://is1-ssl.mzstatic.com/image/thumb/Music/v4/${n}/cover.jpg/100x100bb.jpg`;
const song = (trackName: string, artistName: string, n: number, collectionName = `${trackName} - Single`): StoreSong => ({
  kind: "song",
  trackName,
  artistName,
  collectionName,
  artworkUrl100: art(n),
});

describe("songOf", () => {
  test("the name and artist from a downloaded file's name", () => {
    assert.deepEqual(songOf("Hichkas - Firooz (Ganja2Music).mp3"), { song: "Firooz", artist: "Hichkas" });
  });
  test("a known artist inside a name with no dash", () => {
    assert.deepEqual(songOf("Hichkas Firooz"), { song: "firooz", artist: "Hichkas" });
  });
  test("an artist given separately wins", () => {
    assert.deepEqual(songOf("Blinding Lights", "The Weeknd"), { song: "Blinding Lights", artist: "The Weeknd" });
  });
});

describe("coverTerms", () => {
  test("artist and name first, never the artist alone", () => {
    const terms = coverTerms("Shayea - Deli 320 (RadioJavan)");
    assert.equal(terms[0], "Shayea Deli");
    assert.ok(!terms.some((t) => t.toLowerCase() === "shayea"));
    assert.ok(terms.length <= 3);
  });
  test("a Persian name is asked in Finglish too", () => {
    const terms = coverTerms("دانلود آهنگ هیچکس - فیروز");
    assert.ok(terms.some((t) => /hichkas/i.test(t) && /fir/i.test(t)), terms.join(" | "));
  });
  test("nothing to ask for an empty name", () => {
    assert.deepEqual(coverTerms("site.com"), []);
  });
});

describe("artworkAt", () => {
  test("asks the same picture at a bigger size", () => {
    assert.equal(artworkAt(art(1)), "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/1/cover.jpg/600x600bb.jpg");
  });
});

describe("bestCover", () => {
  const found = [
    song("Bazam Kalan", "Reza Pishro & Hichkas", 1),
    song("Firooz (Piano Version)", "Some Pianist", 2),
    song("Firooz", "Hichkas", 3, "Asphalt Jungle"),
  ];

  test("the song by its artist, not another song by them or someone's version", () => {
    assert.equal(bestCover(found, "Hichkas - Firooz.mp3")?.url, artworkAt(art(3)));
  });

  test("no cover when only the artist matches", () => {
    assert.equal(bestCover([song("Bazam Kalan", "Reza Pishro & Hichkas", 1)], "Hichkas - Firooz"), null);
  });

  test("no cover when only the name matches and the artist is someone else", () => {
    assert.equal(bestCover([song("Firooz", "Another Band", 4)], "Hichkas - Firooz"), null);
  });

  test("karaoke and tribute records are left out", () => {
    const karaoke = [song("Blinding Lights", "Karaoke Hits Band", 5, "Karaoke Hits 2020"), song("Blinding Lights", "The Weeknd", 6, "After Hours")];
    assert.equal(bestCover(karaoke, "The Weeknd - Blinding Lights (Official Video)")?.url, artworkAt(art(6)));
  });

  test("with no artist known, a one-word name is too many songs to guess", () => {
    assert.equal(bestCover([song("Firooz", "Hichkas", 3)], "Firooz.mp3"), null);
  });

  test("with no artist known, a longer name that matches exactly is trusted", () => {
    assert.equal(bestCover([song("Amire Bi Gazand", "Mohsen Chavoshi", 7)], "Amire Bi Gazand 320.mp3")?.artist, "Mohsen Chavoshi");
  });

  test("the record itself before a live or remixed version", () => {
    const both = [song("Blinding Lights (Live)", "The Weeknd", 9), song("Blinding Lights", "The Weeknd", 10)];
    assert.equal(bestCover(both, "The Weeknd - Blinding Lights")?.url, artworkAt(art(10)));
  });

  test("a name in Persian letters matches the catalogue's Finglish", () => {
    assert.equal(bestCover([song("Amire Bi Gazand", "Mohsen Chavoshi", 11)], "محسن چاوشی - امیر بی گزند")?.url, artworkAt(art(11)));
  });

  test("a version note after the name doesn't stop a match", () => {
    assert.equal(bestCover([song("Deli (Remix)", "Shayea", 8)], "Shayea - Deli")?.url, artworkAt(art(8)));
  });
});
