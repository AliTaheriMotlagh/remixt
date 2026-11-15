// Song pages on Iranian music sites (lib/musicPages.ts): the song and singer
// from the page's title, and the MP3 to download from it.
//
//   node --import ./tests/support/register.mjs --test tests/music-pages.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { audioLinksFrom, isAudioUrl, pageTitleParts } from "../src/lib/musicPages.ts";
import { lyricsFromHtml } from "../src/lib/lyricsImport.ts";
import { persianArtistQuery } from "../src/lib/lyricsSearch.ts";

describe("a music page's title", () => {
  test("“<singer> به نام <song>”", () => {
    assert.deepEqual(pageTitleParts("دانلود آهنگ احسان آروبند به نام شایعه"), { artist: "احسان آروبند", title: "شایعه" });
    assert.deepEqual(pageTitleParts("آلبوم شایع بنام دو به شک"), { artist: "شایع", title: "آلبوم دو به شک" });
  });
  test("“<song> از <singer>”, entities decoded", () => {
    assert.deepEqual(pageTitleParts("دانلود آهنگ منم حاجی سیستمم اینه از شایع"), { title: "منم حاجی سیستمم اینه", artist: "شایع" });
    assert.deepEqual(pageTitleParts("دانلود آهنگ High Road از Koe Wetzel &#038; Jessie Murph"), { title: "High Road", artist: "Koe Wetzel & Jessie Murph" });
  });
  test("“<song> » <singers>”, with MP3 and quality extras dropped", () => {
    assert.deepEqual(pageTitleParts("ریمیکس هیروشیما » شایع و هیچکس MP3"), { title: "ریمیکس هیروشیما", artist: "شایع و هیچکس" });
    assert.equal(pageTitleParts("دانلود آهنگ علی فنا پرت ۲ + کیفیت عالی").title, "علی فنا پرت ۲");
    assert.equal(pageTitleParts("دانلود آهنگ علی احمدیانی غم عشق / کیفیت اصلی آهنگ و متن").title, "علی احمدیانی غم عشق");
  });
});

describe("the song's file on the page", () => {
  const page = `
    <a href="https://dl.example.ir/Music/Hamed%20Homayoun%20-%20Shayee%20%28128%29.mp3">128</a>
    <a href="https://dl.example.ir/Music/Hamed%20Homayoun%20-%20Shayee.mp3">320</a>
    <a href="https://dl.example.ir/Music/Pishvaz/Shayee%20Pishvaz.mp3">پیشواز</a>
    <a href="/other-song.mp3">another song</a>
    <a href="https://example.ir/next-page/">next</a>`;
  test("the first song's best copy first, ringtone cuts left out", () => {
    const links = audioLinksFrom(page, "https://example.ir/song.html");
    assert.deepEqual(
      links.map((l) => l.url),
      [
        "https://dl.example.ir/Music/Hamed%20Homayoun%20-%20Shayee.mp3",
        "https://dl.example.ir/Music/Hamed%20Homayoun%20-%20Shayee%20%28128%29.mp3",
        "https://example.ir/other-song.mp3",
      ]
    );
    assert.equal(links[1].kbps, 128);
  });
  test("a labelled 320 beats an unlabelled copy", () => {
    const links = audioLinksFrom(`<a href="https://x.ir/a/Song%20(128).mp3"></a><a href="https://x.ir/a/Song%20(320).mp3"></a><a href="https://x.ir/a/Song.mp3"></a>`, "https://x.ir/");
    assert.equal(links[0].kbps, 320);
  });
  test("a page with no audio has none; an MP3's own address is a file", () => {
    assert.deepEqual(audioLinksFrom(`<a href="/a.html">x</a>`, "https://x.ir/"), []);
    assert.equal(isAudioUrl("https://dl.x.ir/Music/Song%20(320).mp3?dl=1"), true);
    assert.equal(isAudioUrl("https://x.ir/song-page/"), false);
  });
});

describe("lyrics on a Persian music page", () => {
  test("named from the title, the heading over the words left out, one line per <br>", () => {
    const html = `<html><head><meta property="og:title" content="دانلود آهنگ حامد همایون به نام شایعه | رزموزیک"></head><body>
      <div class="matnmusic"><div class="text"><h3>متن آهنگ شایعه حامد همایون</h3><p>بگو رفتنت فقط یه شایعه اس<br />
      تو که میخواستی به این زودی بری<br />
      پاشو مثل اون روزا همش بخند<br />
      پاشو این نقشتو من دوس ندارم</p></div></div></body></html>`;
    const lyrics = lyricsFromHtml(html, "https://rozmusic.com/song.html");
    assert.ok(lyrics);
    assert.equal(lyrics.title, "شایعه");
    assert.equal(lyrics.artist, "حامد همایون");
    assert.equal(lyrics.text.split("\n")[0], "بگو رفتنت فقط یه شایعه اس");
    assert.equal(lyrics.text.split("\n").length, 4);
  });
});

describe("a Persian page with only an English translation", () => {
  test("isn't taken for the lyrics", () => {
    const html = `<html><head><title>دانلود آهنگ حامد همایون به نام شایعه</title></head><body>
      <div class="center ltr">Say you left, just a rumor<br />You wanted to leave so soon<br />Pashoo laughs like that<br />I do not like this role<br />Eight night Eid night</div></body></html>`;
    assert.equal(lyricsFromHtml(html, "https://musicfeed.ir/song/"), null);
  });
});

describe("a music page's facts about the song", () => {
  test("aren't lyrics", () => {
    const html = `<html><head><title>دانلود آهنگ علی احمدیانی غم عشق</title></head><body><div class="entry-content">
      <p>نام آهنگ : غم عشق</p><p>نام خواننده : احمدیانی</p><p>زمان : 4:21 دقیقه</p><p>فرمت : mp3 -Audio</p>
      <p>دانلود اهنگ کردی علی احمدیانی با بهترین کیفیت و لینک دانلود مستقیم</p></div></body></html>`;
    assert.equal(lyricsFromHtml(html, "https://beatmastering.ir/song/"), null);
  });
});

describe("searching the sites in Persian", () => {
  test("a known artist typed in Finglish is searched in Persian letters", () => {
    assert.equal(persianArtistQuery("shayea monam haji"), "شایع monam haji");
    assert.equal(persianArtistQuery("شایع"), null);
    assert.equal(persianArtistQuery("unknown singer"), null);
  });
});
