// audioTags.ts: the ID3 tag and WAV INFO chunks exported files carry, and
// their file names.
//
//   node --test tests/audio-tags.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { audioFileName, fileSafeName, id3Key, id3Tag, wavHeader, wavTagChunks, type AudioTags } from "../src/lib/client/audioTags.ts";

const tags: AudioTags = {
  title: "شب‌های تهران (remix)",
  artist: "Ali",
  album: "Remixt",
  genre: "Remix",
  year: 2026,
  bpm: 123.6,
  key: "Am",
  lengthMs: 61_500,
  credits: [
    { role: "Vocals", track: "Song A", artist: "Singer" },
    { role: "Beat", track: "Song B", artist: "Producer" },
  ],
  comment: "Made with Remixt — remixt.app",
  url: "https://remixt.app/r/abcd1234",
  siteUrl: "https://remixt.app",
  siteName: "Remixt",
  cover: { mime: "image/jpeg", data: Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3) },
};

/** Walks an ID3v2.3 tag's frames: id → body. */
function frames(tag: Uint8Array) {
  const size = (tag[6] << 21) | (tag[7] << 14) | (tag[8] << 7) | tag[9];
  assert.equal(size, tag.length - 10, "tag size covers every frame");
  const view = new DataView(tag.buffer, tag.byteOffset);
  const out: [string, Uint8Array][] = [];
  let at = 10;
  while (at < tag.length) {
    const id = String.fromCharCode(...tag.subarray(at, at + 4));
    const length = view.getUint32(at + 4);
    out.push([id, tag.subarray(at + 10, at + 10 + length)]);
    at += 10 + length;
  }
  assert.equal(at, tag.length);
  return out;
}

function text(body: Uint8Array) {
  if (body[0] === 0) return String.fromCharCode(...body.subarray(1));
  assert.equal(body[0], 1);
  assert.deepEqual([...body.subarray(1, 3)], [0xff, 0xfe], "UTF-16 with a little-endian BOM");
  return new TextDecoder("utf-16le").decode(body.subarray(3));
}

describe("id3Tag", () => {
  const tag = id3Tag(tags);
  const all = frames(tag);
  const get = (id: string) => all.find(([f]) => f === id)?.[1];

  test("is an ID3v2.3 tag", () => {
    assert.equal(String.fromCharCode(...tag.subarray(0, 3)), "ID3");
    assert.equal(tag[3], 3);
  });

  test("keeps a Persian title intact (UTF-16) and plain text as Latin-1", () => {
    assert.equal(text(get("TIT2")!), tags.title);
    assert.equal(get("TPE1")![0], 0);
    assert.equal(text(get("TPE1")!), "Ali");
  });

  test("has the site, BPM, key, year and length", () => {
    assert.equal(text(get("TALB")!), "Remixt");
    assert.equal(text(get("TPUB")!), "Remixt");
    assert.equal(text(get("TBPM")!), "124");
    assert.equal(text(get("TKEY")!), "Am");
    assert.equal(text(get("TYER")!), "2026");
    assert.equal(text(get("TLEN")!), "61500");
  });

  test("credits the vocal and the beat", () => {
    assert.equal(text(get("TIT3")!), "Vocals: Singer – Song A · Beat: Producer – Song B");
    assert.equal(text(get("TOPE")!), "Singer, Producer");
    const custom = all.filter(([f]) => f === "TXXX").map(([, b]) => text(b));
    assert.ok(custom.some((t) => t.startsWith("VOCALS") && t.endsWith("Singer – Song A")));
    assert.ok(custom.some((t) => t.startsWith("BEAT") && t.endsWith("Producer – Song B")));
  });

  test("links back to the remix and the site", () => {
    assert.equal(String.fromCharCode(...get("WOAS")!), tags.url);
    assert.equal(String.fromCharCode(...get("WPUB")!), "https://remixt.app/");
  });

  test("carries the cover as the front cover", () => {
    const apic = get("APIC")!;
    const mimeEnd = apic.indexOf(0, 1);
    assert.equal(String.fromCharCode(...apic.subarray(1, mimeEnd)), "image/jpeg");
    assert.equal(apic[mimeEnd + 1], 3);
    assert.deepEqual([...apic.subarray(mimeEnd + 3)], [...tags.cover!.data]);
  });

  test("comment has a language and the made-with line", () => {
    const comm = get("COMM")!;
    assert.equal(String.fromCharCode(...comm.subarray(1, 4)), "eng");
  });
});

describe("WAV", () => {
  test("RIFF size counts the samples and the tag chunks after them", () => {
    const extra = wavTagChunks(tags);
    const header = wavHeader({ channels: 2, sampleRate: 44100, dataBytes: 400, extraBytes: extra.length });
    const view = new DataView(header.buffer);
    assert.equal(view.getUint32(4, true), 36 + 400 + extra.length);
    assert.equal(view.getUint32(40, true), 400);
    assert.equal(extra.length % 2, 0, "chunks stay word-aligned");
  });

  test("LIST/INFO holds the title in UTF-8, then an id3 chunk", () => {
    const extra = wavTagChunks(tags);
    assert.equal(String.fromCharCode(...extra.subarray(0, 4)), "LIST");
    assert.equal(String.fromCharCode(...extra.subarray(8, 12)), "INFO");
    const listSize = new DataView(extra.buffer).getUint32(4, true);
    const after = 8 + listSize + (listSize % 2);
    assert.equal(String.fromCharCode(...extra.subarray(after, after + 4)), "id3 ");
    assert.ok(new TextDecoder().decode(extra.subarray(0, after)).includes(tags.title));
  });
});

describe("names", () => {
  test("keeps Persian and accents, drops what file systems refuse", () => {
    assert.equal(fileSafeName('شب / تهران: "remix"?'), "شب تهران remix");
    assert.equal(fileSafeName("Café del Mar..."), "Café del Mar");
    assert.equal(fileSafeName("  ???  "), "Remixt mix");
  });

  test("Artist - Title (Part).ext", () => {
    assert.equal(audioFileName({ artist: "Ali", title: "Night Drive", extension: "mp3" }), "Ali - Night Drive.mp3");
    assert.equal(audioFileName({ artist: "Ali", title: "Night Drive", part: "Vocals", extension: "wav" }), "Ali - Night Drive (Vocals).wav");
  });

  test("ID3 key names", () => {
    assert.equal(id3Key({ tonic: 9, mode: "minor" }), "Am");
    assert.equal(id3Key({ tonic: 1, mode: "major" }), "C#");
    assert.equal(id3Key({ tonic: 10, mode: "minor" }), "Bbm");
  });
});
