// Editing lyric timing a line at a time (with the lines after it following
// along), the song's parts, lining timed lyrics up with a vocal stem, and
// reading the words out of Genius's embed.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-timing.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alignToVoice, applyFit, nudgeLine, snapToPhrases, retimeLine, sectionsOf, type Envelope, type LyricLine } from "../src/lib/lyrics.ts";
import { geniusEmbedHtml, geniusSongId, lyricsFromGeniusEmbed } from "../src/lib/lyricsImport.ts";

const sheet = (): LyricLine[] => [
  { time: null, text: "[Verse 1]" },
  { time: 10, text: "one" },
  { time: 12, text: "two" },
  { time: 14, text: "three" },
  { time: null, text: "" },
  { time: null, text: "[Chorus]" },
  { time: 20, text: "four" },
  { time: 22, text: "five" },
];

describe("retimeLine", () => {
  test("with ripple, the lines after it move by as much", () => {
    const out = retimeLine(sheet(), 2, 13);
    // Without ripple only the line moves (clamped between its neighbours).
    assert.deepEqual(out.map((l) => l.time), [null, 10, 13, 14, null, null, 20, 22]);
    const rippled = retimeLine(sheet(), 2, 13, { ripple: true });
    assert.deepEqual(rippled.map((l) => l.time), [null, 10, 13, 15, null, null, 21, 23]);
  });

  test("with ripple, moving earlier pulls the rest earlier too", () => {
    const out = retimeLine(sheet(), 6, 18.5, { ripple: true });
    assert.deepEqual(out.map((l) => l.time), [null, 10, 12, 14, null, null, 18.5, 20.5]);
  });

  test("never goes before the line ahead of it", () => {
    const out = retimeLine(sheet(), 3, 5, { ripple: true });
    assert.equal(out[3].time, 12.05);
    // …and without ripple it stays short of the next line.
    assert.equal(retimeLine(sheet(), 1, 30)[1].time, 11.95);
  });

  test("an untimed line gets its time without moving the rest", () => {
    const lines: LyricLine[] = [
      { time: 5, text: "a" },
      { time: null, text: "b" },
      { time: 9, text: "c" },
    ];
    assert.deepEqual(retimeLine(lines, 1, 7, { ripple: true }).map((l) => l.time), [5, 7, 9]);
  });

  test("nudgeLine moves a timed line and leaves an untimed one", () => {
    assert.deepEqual(nudgeLine(sheet(), 1, 0.5, { ripple: true }).map((l) => l.time), [null, 10.5, 12.5, 14.5, null, null, 20.5, 22.5]);
    assert.deepEqual(nudgeLine(sheet(), 0, 1), sheet());
  });
});

describe("sectionsOf", () => {
  test("names the song's parts by their headings, with where they start and end", () => {
    assert.deepEqual(sectionsOf(sheet()), [
      { name: "Verse 1", index: 0, start: 10, end: 20, last: 14, lines: 3 },
      { name: "Chorus", index: 5, start: 20, end: null, last: 22, lines: 2 },
    ]);
  });

  test("a part's start and end are where it plays, not where it's written", () => {
    // The vocal was rearranged: the chorus (written second) now plays first.
    const lines: LyricLine[] = [
      { time: null, text: "[Verse]" },
      { time: 34, text: "second line, timed first by mistake" },
      { time: 30, text: "first line" },
      { time: null, text: "[Chorus]" },
      { time: 5, text: "the hook" },
      { time: 9, text: "again" },
    ];
    assert.deepEqual(
      sectionsOf(lines).map((s) => [s.name, s.start, s.last, s.end]),
      [
        ["Verse", 30, 34, null],
        ["Chorus", 5, 9, 30],
      ]
    );
  });

  test("without headings, verses are the blocks between blank lines", () => {
    const lines: LyricLine[] = [
      { time: 1, text: "a" },
      { time: 2, text: "b" },
      { time: null, text: "" },
      { time: 5, text: "c" },
    ];
    assert.deepEqual(
      sectionsOf(lines).map((s) => [s.name, s.start, s.end]),
      [
        ["Verse 1", 1, 5],
        ["Verse 2", 5, null],
      ]
    );
  });
});

/** A loudness curve with singing (level 1) from each start for `length` seconds, 50 points a second. */
function voice(starts: number[], length = 1.2, seconds = 120): Envelope {
  const rate = 50;
  const values = new Float32Array(seconds * rate);
  for (let i = 0; i < values.length; i++) values[i] = 0.02 + 0.01 * Math.sin(i);
  for (const s of starts) for (let i = Math.round(s * rate); i < Math.min(values.length, Math.round((s + length) * rate)); i++) values[i] = 1;
  return { values, start: 0, step: 1 / rate };
}

describe("alignToVoice", () => {
  // Phrases at uneven gaps, as a song's lines are.
  const original = [8, 11.5, 13, 17.2, 19, 24.6, 26.1, 31, 33.4, 38];
  const lines: LyricLine[] = original.map((time, i) => ({ time, text: `line ${i}` }));

  test("finds how far the vocal has been moved in the mix", () => {
    const fit = alignToVoice(lines, voice(original.map((t) => t + 6.3)));
    assert.ok(fit);
    assert.ok(Math.abs(fit.shift - 6.3) < 0.03, `shift ${fit.shift}`);
    assert.equal(fit.matched, original.length);
  });

  test("works when the vocal comes in earlier, too", () => {
    const fit = alignToVoice(lines, voice(original.map((t) => t - 4)));
    assert.ok(fit && Math.abs(fit.shift + 4) < 0.03);
  });

  test("finds a version sung faster than the lyrics were timed to, so the last line lands too", () => {
    const sung = original.map((t) => 8 + (t - 8) / 1.04 + 3);
    const scales = Array.from({ length: 25 }, (_, i) => 0.94 + i * 0.005);
    const fit = alignToVoice(lines, voice(sung), { scales });
    assert.ok(fit);
    const placed = applyFit(lines, fit);
    for (const [i, line] of placed.entries()) assert.ok(Math.abs(line.time! - sung[i]) < 0.1, `line ${i}: ${line.time} vs ${sung[i]}`);
  });

  test("each line set on the phrase it's nearest", () => {
    const off = original.map((t, i) => ({ time: t + (i % 2 ? 0.2 : -0.15), text: `line ${i}` }));
    const snapped = snapToPhrases(off, voice(original));
    for (const [i, line] of snapped.entries()) assert.ok(Math.abs(line.time! - original[i]) < 0.03, `line ${i}: ${line.time}`);
  });

  test("gives up on singing that doesn't follow the lines", () => {
    // Evenly spaced phrases every 0.9 s: something is near any line, but no shift fits better than another.
    const steady = Array.from({ length: 120 }, (_, i) => 1 + i * 0.9);
    assert.equal(alignToVoice(lines, voice(steady, 0.5)), null);
  });
});

describe("Genius embeds", () => {
  const html =
    '<div id="rg_embed_link_378195" class="rg_embed_link" data-song-id="378195">Read <a href="https://genius.com/Sia-chandelier-lyrics">“Chandelier” by Sia</a> on Genius</div>' +
    '<div class="rg_embed music"><div class="rg_embed_header">Header</div><div class="rg_embed_body"><p>[Verse 1]<br>Party girls don\'t get hurt<br>Can\'t feel anything</p></div><div class="rg_embed_footer">Powered by Genius</div></div>';

  test("reads the words, song and artist out of what the embed writes", () => {
    const found = lyricsFromGeniusEmbed(html);
    assert.ok(found);
    assert.equal(found.title, "Chandelier");
    assert.equal(found.artist, "Sia");
    assert.equal(found.text, "[Verse 1]\nParty girls don't get hurt\nCan't feel anything");
  });

  test("unpacks the HTML from the embed script's JSON.parse('…') calls", () => {
    // How embed.js writes it: a JSON string inside a single-quoted JS string, with \u003C for "<".
    const literal = JSON.stringify(html).replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const js = `(function(){ document.write(JSON.parse('${literal}')); })();`;
    assert.equal(geniusEmbedHtml(js), html);
    assert.equal(lyricsFromGeniusEmbed(geniusEmbedHtml(js))?.title, "Chandelier");
  });

  test("no embed body: nothing", () => {
    assert.equal(lyricsFromGeniusEmbed("<p>Just a page</p>"), null);
  });

  test("song ids from links and embed code", () => {
    assert.equal(geniusSongId("https://genius.com/songs/378195"), 378195);
    assert.equal(geniusSongId("<div class='rg_embed_link' data-song-id='42'>"), 42);
    assert.equal(geniusSongId("https://genius.com/Sia-chandelier-lyrics"), null);
  });
});
