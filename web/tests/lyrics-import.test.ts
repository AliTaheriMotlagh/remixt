// Lyrics brought in from elsewhere (lib/lyricsImport.ts, lib/lyrics.ts):
// pages from Genius and other sites, embed codes, subtitle files, section
// headings, times borrowed from a timed copy, and a first guess at the
// times from a vocal recording.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-import.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { autoTime, borrowTimes, isSection, isSung, parseLyrics, replaceSung, sectionAt, spreadOverBars, subtitlesToLrc, voicedRuns } from "../src/lib/lyrics.ts";
import { isLyricsLink, lyricsFromFile, lyricsFromHtml, lyricsLinkFrom } from "../src/lib/lyricsImport.ts";

describe("section headings", () => {
  test("[Chorus: Artist] is a heading, not an LRC tag dropped on the floor", () => {
    const lines = parseLyrics("[ar:Someone]\n[Verse 1: Someone]\nFirst line\n[Chorus: Someone & Other]\nHook line");
    assert.deepEqual(
      lines.map((l) => l.text),
      ["[Verse 1: Someone]", "First line", "[Chorus: Someone & Other]", "Hook line"]
    );
    assert.ok(isSection(lines[0].text));
    assert.ok(!isSung(lines[0]));
    assert.ok(isSung(lines[1]));
    assert.equal(sectionAt(lines, 3), "Chorus: Someone & Other");
  });

  test("a time stamp is not a heading", () => {
    assert.ok(!isSection("[00:12.50]"));
  });

  test("laid out on bars, headings get no time and a rest only after words", () => {
    const lines = parseLyrics("[Intro]\nOne\nTwo\n[Chorus]\nThree");
    const out = spreadOverBars(lines, 120, { startBar: 1, barsPerLine: 1 });
    // 120 BPM: a bar is 2 s. One at 0, Two at 2, a bar's rest, Three at 6.
    assert.deepEqual(
      out.map((l) => l.time),
      [null, 0, 2, null, 6]
    );
  });

  test("new words go onto the sung lines only", () => {
    const lines = parseLyrics("[Verse]\n[00:01.00]a\n\n[00:03.00]b");
    assert.deepEqual(replaceSung(lines, ["A", "B"]), [
      { time: null, text: "[Verse]" },
      { time: 1, text: "A" },
      { time: null, text: "" },
      { time: 3, text: "B" },
    ]);
  });
});

describe("enhanced LRC and subtitles", () => {
  test("word-by-word times are taken out of the words", () => {
    assert.deepEqual(parseLyrics("[00:01.00]<00:01.00>Hello <00:01.50>world"), [{ time: 1, text: "Hello world" }]);
  });

  test("SRT cues become timed lines, a long silence a verse break", () => {
    const srt = "1\n00:00:12,500 --> 00:00:15,000\n♪ First line ♪\n\n2\n00:00:15,200 --> 00:00:17,000\nSecond\nline\n\n3\n00:00:30,000 --> 00:00:32,000\n<i>Third</i>\n";
    assert.equal(subtitlesToLrc(srt), "[00:12.50]First line\n[00:15.20]Second line\n\n[00:30.00]Third");
    assert.deepEqual(parseLyrics(srt)[0], { time: 12.5, text: "First line" });
  });

  test("WebVTT, with hours left out and cue settings", () => {
    const vtt = "WEBVTT\n\nintro\n00:05.000 --> 00:07.000 align:start\n<v Singer>Hi there</v>\n";
    assert.equal(lyricsFromFile(vtt), "[00:05.00]Hi there");
  });
});

describe("pages", () => {
  test("Genius: the lyrics containers, headers inside them left out, the title split", () => {
    const html = `<html><head><meta property="og:title" content="Someone – A Song Lyrics | Genius Lyrics"></head><body>
      <div data-lyrics-container="true" class="x"><div data-exclude-from-selection="true"><span>12 Contributors</span>A Song Lyrics</div>[Verse 1]<br>First &amp; line<br><a href="/x"><span>Second line</span></a><br><br>[Chorus]<br>Hook</div>
      <div>You might also like</div>
      <div data-lyrics-container="true">Last line<br>The end12Embed</div></body></html>`;
    const got = lyricsFromHtml(html, "https://genius.com/Someone-a-song-lyrics");
    assert.ok(got);
    assert.equal(got.title, "A Song");
    assert.equal(got.artist, "Someone");
    assert.equal(got.source, "genius.com");
    assert.equal(got.text, "[Verse 1]\nFirst & line\nSecond line\n\n[Chorus]\nHook\nLast line\nThe end");
  });

  test("a blog post with the words in paragraphs, between other text", () => {
    const html = `<html><head><title>متن آهنگ فیروز از هیچکس | سایت</title></head><body>
      <nav><a href="/">Home</a><br><a href="/a">A</a><br><a href="/b">B</a><br><a>C</a><br></nav>
      <p>This is a long introduction paragraph that is much longer than any lyric line would ever be on a page, telling you about the song and its history in detail.</p>
      <div class="post-body"><p>خط اول<br>خط دوم<br>خط سوم</p><p>خط چهارم<br>خط پنجم</p></div>
      <footer>Copyright<br>Links<br>More<br>Stuff<br>Here</footer></body></html>`;
    const got = lyricsFromHtml(html, "https://example.ir/firooz");
    assert.ok(got);
    assert.equal(got.text, "خط اول\nخط دوم\nخط سوم\n\nخط چهارم\nخط پنجم");
  });

  test("a block marked as lyrics wins", () => {
    const html = `<div class="song-lyrics">One<br>Two<br>Three<br>Four</div><div>a<br>b<br>c<br>d<br>e<br>f</div>`;
    assert.equal(lyricsFromHtml(html, "https://lyrics.example/x")?.text, "One\nTwo\nThree\nFour");
  });

  test("a page without lyrics is null", () => {
    assert.equal(lyricsFromHtml("<html><body><p>Just one paragraph here.</p></body></html>", "https://x.com"), null);
  });
});

describe("links and embed codes", () => {
  test("Genius embed code gives its lyrics page", () => {
    const embed = `<div id='rg_embed_link_378195' class='rg_embed_link' data-song-id='378195'>Read <a href='https://genius.com/Sia-chandelier-lyrics'>“Chandelier” by Sia</a> on Genius</div> <script crossorigin src='//genius.com/songs/378195/embed.js'></script>`;
    assert.equal(lyricsLinkFrom(embed), "https://genius.com/Sia-chandelier-lyrics");
    assert.ok(isLyricsLink(embed));
  });

  test("an embed with only the song id", () => {
    assert.equal(lyricsLinkFrom(`<script src='//genius.com/songs/42/embed.js'></script>`), "https://genius.com/songs/42");
  });

  test("an iframe, a plain link, a bare address", () => {
    assert.equal(lyricsLinkFrom(`<iframe src="https://lyrics.example/embed/9"></iframe>`), "https://lyrics.example/embed/9");
    assert.equal(lyricsLinkFrom("https://www.azlyrics.com/lyrics/x/y.html"), "https://www.azlyrics.com/lyrics/x/y.html");
    assert.equal(lyricsLinkFrom("genius.com/Some-song-lyrics"), "https://genius.com/Some-song-lyrics");
    assert.ok(isLyricsLink("https://genius.com/x"));
  });

  test("lyrics themselves are not a link", () => {
    assert.ok(!isLyricsLink("First line\nSecond line"));
    assert.equal(lyricsLinkFrom("Just words here"), null);
  });
});

describe("borrowing times", () => {
  test("matches lines in order, skips extras, fills a gap between neighbours", () => {
    const words = parseLyrics("[Verse]\nI walk alone tonight\nThe city lights are bright\nA line only here\nAnd I keep on going");
    const timed = parseLyrics("[00:10.00]I walk alone tonight\n[00:12.00]Ad lib\n[00:14.00]The city lights are bright!\n[00:20.00]And I keep on goin'");
    const got = borrowTimes(words, timed);
    assert.ok(got);
    assert.equal(got.matched, 3);
    assert.deepEqual(
      got.lines.map((l) => l.time),
      [null, 10, 14, 17, 20]
    );
  });

  test("Persian lines match across letter forms", () => {
    const words = parseLyrics("مي‌خواهم بروم\nدیگر نمی‌مانم");
    const timed = parseLyrics("[00:05.00]میخواهم بروم\n[00:09.00]دیگر نمیمانم");
    assert.deepEqual(borrowTimes(words, timed)?.lines.map((l) => l.time), [5, 9]);
  });

  test("a different song is not trusted", () => {
    assert.equal(borrowTimes(parseLyrics("One thing\nAnother thing"), parseLyrics("[00:01.00]Something else\n[00:02.00]Entirely")), null);
  });
});

describe("timing from a vocal", () => {
  /** A loudness curve at 20 points a second with singing over the given stretches. */
  function curve(seconds: number, sung: [number, number][]) {
    const values = new Float32Array(seconds * 20);
    for (let i = 0; i < values.length; i++) {
      const t = i / 20;
      values[i] = sung.some(([s, e]) => t >= s && t < e) ? 0.6 + 0.2 * Math.sin(i) : 0.02;
    }
    return { values, start: 0, step: 0.05 };
  }

  test("finds the stretches of singing, with breaths inside a phrase ignored", () => {
    const runs = voicedRuns(curve(10, [[1, 2], [2.05, 3], [5, 6]]));
    assert.deepEqual(runs.map(([s, e]) => [Math.round(s * 10) / 10, Math.round(e * 10) / 10]), [[1, 3], [5, 6]]);
  });

  test("each line starts where its phrase does", () => {
    const env = curve(30, [[2, 5], [6, 9], [12, 15], [16, 19]]);
    const lines = parseLyrics("[Verse]\nfirst line of words\nsecond line of words\n\nthird line of words\nfourth line of words");
    const got = autoTime(lines, env);
    assert.ok(got);
    assert.deepEqual(
      got.map((l) => l.time),
      [null, 2, 6, null, 12, 16]
    );
  });

  test("more phrases than lines: the long pauses are the line breaks", () => {
    // Each line is sung as two phrases with a short gap; lines are a long pause apart.
    const env = curve(30, [[2, 3.5], [3.8, 5], [8, 9.5], [9.8, 11], [14, 15.5], [15.8, 17]]);
    const got = autoTime(parseLyrics("one two three four\nfive six seven eight\nnine ten eleven twelve"), env);
    assert.deepEqual(got?.map((l) => l.time), [2, 8, 14]);
  });

  test("a range keeps out what's sung before it", () => {
    const env = curve(30, [[1, 2], [10, 12], [14, 16]]);
    const got = autoTime(parseLyrics("a b c\nd e f"), env, { from: 5 });
    assert.deepEqual(got?.map((l) => l.time), [10, 14]);
  });

  test("silence gives nothing", () => {
    assert.equal(autoTime(parseLyrics("a\nb"), { values: new Float32Array(100), start: 0, step: 0.05 }), null);
  });
});
