// A song's drawn picture (songArt.ts): with no waveform, a record with the
// song's first letter — of its name, not the file's noise.
//
//   node --import ./tests/support/register.mjs --test tests/song-art.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { songArtSvg, songDiscSvg, songInitial } from "../src/lib/songArt.ts";

test("the label's letter is the song's, not the file's", () => {
  assert.equal(songInitial("01 - Shayea - Deli.mp3"), "D");
  assert.equal(songInitial("metallica_nothing_else matters 128"), "M");
  assert.equal(songInitial("هیچکس - فیروز"), "ف");
  assert.equal(songInitial("[HD]"), "♪");
});

test("no waveform: a record on the song's colours; a waveform: its bars", () => {
  const disc = songArtSvg({ title: "Shayea - Deli", artist: "ali" });
  assert.match(disc, /<text[^>]*>D<\/text>/);
  assert.match(disc, /<circle r="236"/);
  const bars = songArtSvg({ title: "Shayea - Deli", peaks: [0.1, 0.5, 0.9, 0.4] });
  assert.doesNotMatch(bars, /<text/);
  assert.match(bars, /<rect x=/);
});

test("the spinning disc has no background of its own, and escapes the letter", () => {
  const svg = songDiscSvg({ title: "<script>" });
  assert.doesNotMatch(svg, /<rect/);
  assert.doesNotMatch(svg, /<script>/);
});
