// Reading which song a streaming service's link is (lib/linkImport.ts), so
// it can be found where it can be downloaded.
//
//   node --import ./tests/support/register.mjs --test tests/link-import.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isStreamingLink, songQueryFromPage, youtubeSearchText } from "../src/lib/linkImport.ts";

const page = (tags: Record<string, string>) =>
  `<html><head>${Object.entries(tags)
    .map(([k, v]) => `<meta property="${k}" content="${v}">`)
    .join("")}</head></html>`;

describe("streaming links", () => {
  test("are recognised by host", () => {
    assert.ok(isStreamingLink("https://open.spotify.com/track/abc"));
    assert.ok(isStreamingLink("https://music.apple.com/us/album/x/1?i=2"));
    assert.ok(isStreamingLink("https://www.deezer.com/track/1"));
    assert.ok(isStreamingLink("https://tidal.com/browse/track/1"));
    assert.ok(!isStreamingLink("https://soundcloud.com/a/b"));
    assert.ok(!isStreamingLink("not a link"));
  });

  test("Spotify: the artist from the description, the song from the title", () => {
    const html = page({ "og:title": "Blinding Lights", "og:description": "The Weeknd · After Hours · Song · 2020" });
    assert.equal(songQueryFromPage(html, "open.spotify.com"), "The Weeknd Blinding Lights");
  });

  test("Apple Music: “Song - Song by Artist - Apple Music”", () => {
    const html = page({ "og:title": "‎Shape of You - Song by Ed Sheeran - Apple Music" });
    assert.equal(songQueryFromPage(html, "music.apple.com"), "Ed Sheeran Shape of You");
  });

  test("Deezer: “Song - Artist”, entities decoded", () => {
    const html = page({ "og:title": "Don&#39;t Start Now - Dua Lipa" });
    assert.equal(songQueryFromPage(html, "www.deezer.com"), "Dua Lipa Don't Start Now");
  });

  test("a page without a title isn't a song", () => {
    assert.equal(songQueryFromPage("<html></html>", "open.spotify.com"), null);
  });

  test("Persian titles come through as they are", () => {
    const html = page({ "og:title": "آهنگ", "og:description": "خواننده · آلبوم · Song · 2021" });
    assert.equal(songQueryFromPage(html, "open.spotify.com"), "خواننده آهنگ");
  });
});

describe("YouTube, found by name", () => {
  test("the usual video noise is dropped, and the channel added when the title doesn't name the artist", () => {
    assert.equal(youtubeSearchText("Blinding Lights (Official Video)", "The Weeknd"), "The Weeknd Blinding Lights");
    assert.equal(youtubeSearchText("Adele - Hello (Official Music Video)", "AdeleVEVO"), "Adele - Hello");
    assert.equal(youtubeSearchText("Song [Lyrics]", "Artist - Topic"), "Artist Song");
  });
});
