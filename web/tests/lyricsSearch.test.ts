// lyricsSearch.ts: finding Persian songs' lyrics whether they're typed in
// Persian or Finglish, and ranking what the library sends back.
//
//   node --import ./tests/support/register.mjs --test tests/lyricsSearch.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  finglishOf,
  findArtist,
  hasSureMatch,
  libraryQueries,
  matchScore,
  normalizePersian,
  otherSpelling,
  rankCandidates,
  skeletonOf,
  type Candidate,
} from "../src/lib/lyricsSearch.ts";
import { splitSongTitle } from "../src/lib/lyrics.ts";

describe("normalizePersian", () => {
  test("folds Arabic letters, marks, ZWNJ and digits", () => {
    assert.equal(normalizePersian("كيف"), "کیف");
    assert.equal(normalizePersian("مَن"), "من");
    assert.equal(normalizePersian("می‌خوام"), "می خوام");
    assert.equal(normalizePersian("۰۲۱"), "021");
  });
});

describe("skeletonOf", () => {
  test("reads the same in Persian and Finglish, whatever the vowels", () => {
    for (const [fa, ...latin] of [
      ["فیروز", "Firooz", "firuz", "firoz"],
      ["هیچکس", "Hichkas", "HichKas"],
      ["بغلم", "Baghalam"],
      ["خونه", "khoone", "khune"],
      ["شاه", "Shah"],
      ["اخطار", "Ekhtar", "akhtar"],
    ]) {
      for (const l of latin) assert.equal(skeletonOf(l), skeletonOf(fa), `${l} ~ ${fa}`);
    }
  });

  test("tells different words apart", () => {
    assert.notEqual(skeletonOf("Firooz"), skeletonOf("Kooche"));
  });
});

describe("finglishOf", () => {
  test("spells long vowels the library's way, with both readings of a first alef", () => {
    assert.deepEqual(finglishOf("فیروز"), ["firooz"]);
    assert.deepEqual(finglishOf("اخطار"), ["akhtar", "ekhtar"]);
    assert.deepEqual(finglishOf("کوچه"), ["kooche"]);
  });

  test("the other spelling of a long oo", () => {
    assert.equal(otherSpelling("firoz"), "firooz");
    assert.equal(otherSpelling("firooz"), "firoz");
    assert.equal(otherSpelling("deli"), "deli");
  });
});

describe("findArtist", () => {
  test("knows artists in either script, the longest name first", () => {
    assert.deepEqual(findArtist(["هیچکس", "فیروز"]), { artist: "Hichkas", rest: ["فیروز"] });
    assert.deepEqual(findArtist(["امیر", "تتلو", "بغلم"]), { artist: "Amir Tataloo", rest: ["بغلم"] });
    assert.deepEqual(findArtist(["tataloo"]), { artist: "Amir Tataloo", rest: [] });
    assert.equal(findArtist(["blinding", "lights"]), null);
  });
});

describe("libraryQueries", () => {
  test("a Persian search is also asked in the library's Finglish", () => {
    const queries = libraryQueries("هیچکس فیروز");
    assert.deepEqual(queries[0], { q: "هیچکس فیروز" });
    assert.ok(queries.some((q) => "q" in q && q.q === "Hichkas firooz"));
    assert.ok(queries.some((q) => "q" in q && q.q === "Hichkas"));
  });

  test("a mix song is looked up by title and artist first", () => {
    const queries = libraryQueries("", { track: "Firooz", artist: "Hichkas" });
    assert.deepEqual(queries[0], { track_name: "Firooz", artist_name: "Hichkas" });
  });

  test("searches that differ only in case are asked once, and never more than six", () => {
    const queries = libraryQueries("Blinding Lights");
    assert.equal(queries.length, 1);
    assert.ok(libraryQueries("هیچکس فیروز اخطار کوچه").length <= 6);
  });
});

describe("ranking", () => {
  const song = (id: number, title: string, artist: string, extra: Partial<Candidate> = {}): Candidate => ({
    id,
    title,
    artist,
    duration: 200,
    plain: "words",
    synced: null,
    ...extra,
  });

  test("the song asked for beats the artist's other songs", () => {
    assert.ok(matchScore("هیچکس فیروز", "Firooz", "Hichkas") > matchScore("هیچکس فیروز", "Mesle Hichkas 2", "Someone"));
    const ranked = rankCandidates(
      [song(1, "Mesle Hichkas", "Ehsan"), song(2, "Ashegham", "Hichkas"), song(3, "Firooz", "Hichkas", { synced: "[00:01.00]x" })],
      "hichkas firoz"
    );
    assert.equal(ranked[0].id, 3);
  });

  test("the same song comes once, its timed copy kept", () => {
    const ranked = rankCandidates([song(1, "Firooz", "Hichkas"), song(2, "Firooz", "Hichkas", { synced: "[00:01.00]x" })], "Firooz");
    assert.deepEqual(
      ranked.map((r) => r.id),
      [2]
    );
  });

  test("the recording as long as the mix's comes first", () => {
    const ranked = rankCandidates([song(1, "Deli", "Shayea", { duration: 150 }), song(2, "Deli", "Shayea", { duration: 231 })], "Deli", 230);
    assert.equal(ranked[0].id, 2);
  });

  test("Persian words found in the lyrics count", () => {
    const ranked = rankCandidates(
      [song(1, "Track", "Artist", { plain: "something else" }), song(2, "Track", "Artist B", { plain: "دلم برات تنگ شده" })],
      "دلم تنگ"
    );
    assert.equal(ranked[0].id, 2);
  });

  test("a sure match stops the search", () => {
    assert.ok(hasSureMatch([song(1, "Firooz", "Hichkas")], "هیچکس فیروز"));
    assert.ok(!hasSureMatch([song(1, "Ashegham", "Hichkas")], "هیچکس فیروز"));
  });
});

describe("splitSongTitle", () => {
  test("song and artist from file names and download sites", () => {
    assert.deepEqual(splitSongTitle("Hichkas - Firooz.mp3"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("Hichkas - Firooz 320"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("Shayea - Deli (128) Music-Fa.com"), { song: "Deli", artist: "Shayea" });
    assert.deepEqual(splitSongTitle("دانلود آهنگ هیچکس - فیروز"), { song: "فیروز", artist: "هیچکس" });
    assert.deepEqual(splitSongTitle("Blinding Lights"), { song: "Blinding Lights", artist: "" });
    assert.deepEqual(splitSongTitle('Artist "Song Name" Official'), { song: "Song Name", artist: "Artist" });
  });

  test("download sites named without an address, track numbers, names joined by dashes", () => {
    assert.deepEqual(splitSongTitle("Hichkas - Firooz Ganja2Music"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("Shayea - Deli (RadioJavan)"), { song: "Deli", artist: "Shayea" });
    assert.deepEqual(splitSongTitle("Ganja2Music - Hichkas - Firooz"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("Mohsen Chavoshi - Amire Bi Gazand 320 (UpMusic)"), { song: "Amire Bi Gazand", artist: "Mohsen Chavoshi" });
    assert.deepEqual(splitSongTitle("Hichkas-Firooz-320.mp3"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("01 Hichkas - Firooz.mp3"), { song: "Firooz", artist: "Hichkas" });
    assert.deepEqual(splitSongTitle("02. Blinding Lights"), { song: "Blinding Lights", artist: "" });
  });

  test("numbers that are the name stay", () => {
    assert.deepEqual(splitSongTitle("99 Problems"), { song: "99 Problems", artist: "" });
    assert.deepEqual(splitSongTitle("50 Cent - In Da Club"), { song: "In Da Club", artist: "50 Cent" });
    assert.deepEqual(splitSongTitle("Dr. Dre - Still D.R.E."), { song: "Still D.R.E.", artist: "Dr. Dre" });
  });
});
