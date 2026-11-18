// The cover picture inside a song file (lib/client/audioCover.ts): MP3
// (ID3 v2.2/2.3/2.4), M4A (covr, moov at the end), FLAC and Ogg — each
// built here byte by byte, plus the app's own ID3 writer read back.
//
//   node --import ./tests/support/register.mjs --test tests/audio-cover.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readCover } from "../src/lib/audioCover.ts";
import { id3Tag } from "../src/lib/client/audioTags.ts";

/** A made-up JPEG: the right first bytes, then filler. */
const jpeg = (fill = 7, n = 300) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(fill)]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(300).fill(3)]);
const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const be32 = (n: number) => Uint8Array.from([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const le32 = (n: number) => Uint8Array.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]);
const syncsafe = (n: number) => Uint8Array.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const audio = new Uint8Array(2000).fill(0x55);

function id3(version: 3 | 4, frames: Uint8Array[]) {
  const body = cat(...frames);
  return cat(text("ID3"), Uint8Array.from([version, 0, 0]), syncsafe(body.length), body);
}
function apic(version: 3 | 4, type: number, data: Uint8Array, mime = "image/jpeg", encoding = 0) {
  const description = encoding === 1 ? Uint8Array.from([0xff, 0xfe, 0x41, 0, 0, 0]) : cat(text("cover"), Uint8Array.from([0]));
  const content = cat(Uint8Array.from([encoding]), text(mime), Uint8Array.from([0, type]), description, data);
  return cat(text("APIC"), version === 4 ? syncsafe(content.length) : be32(content.length), Uint8Array.from([0, 0]), content);
}

test("MP3: the front cover from an ID3 v2.3 tag, past other pictures", async () => {
  const front = jpeg(9);
  const file = new Blob([id3(3, [apic(3, 0, png(), "image/png"), apic(3, 3, front)]), audio]);
  const cover = await readCover(file);
  assert.equal(cover?.mime, "image/jpeg");
  assert.deepEqual(cover?.data, front);
});

test("MP3: ID3 v2.4 with a UTF-16 description, and a type the tag gets wrong", async () => {
  const file = new Blob([id3(4, [apic(4, 3, png(), "image/jpg", 1)]), audio]);
  assert.equal((await readCover(file))?.mime, "image/png");
});

test("MP3: an old v2.2 tag's PIC frame", async () => {
  const data = jpeg(4);
  const content = cat(Uint8Array.from([0]), text("JPG"), Uint8Array.from([3]), text("x"), Uint8Array.from([0]), data);
  const frame = cat(text("PIC"), Uint8Array.from([content.length >> 16, (content.length >> 8) & 255, content.length & 255]), content);
  const tag = cat(text("ID3"), Uint8Array.from([2, 0, 0]), syncsafe(frame.length), frame);
  assert.deepEqual((await readCover(new Blob([tag, audio])))?.data, data);
});

test("MP3: what the app's own tag writer puts in comes back out", async () => {
  const data = jpeg(2);
  const tag = id3Tag({ title: "T", artist: "A", cover: { mime: "image/jpeg", data } });
  assert.deepEqual((await readCover(new Blob([tag as BlobPart, audio])))?.data, data);
});

function flacPictureBlock(type: number, data: Uint8Array, mime = "image/jpeg") {
  return cat(be32(type), be32(mime.length), text(mime), be32(0), be32(500), be32(500), be32(24), be32(0), be32(data.length), data);
}

test("FLAC: a PICTURE block after the stream info", async () => {
  const data = jpeg(5);
  const streamInfo = cat(Uint8Array.from([0, 0, 0, 34]), new Uint8Array(34));
  const block = flacPictureBlock(3, data);
  const pictureBlock = cat(Uint8Array.from([0x80 | 6, block.length >> 16, (block.length >> 8) & 255, block.length & 255]), block);
  const file = new Blob([text("fLaC"), streamInfo, pictureBlock, audio]);
  assert.deepEqual((await readCover(file))?.data, data);
});

function atom(name: string, ...children: Uint8Array[]) {
  const body = cat(...children);
  return cat(be32(8 + body.length), text(name), body);
}

test("M4A: the covr atom, with moov at the end of the file", async () => {
  const data = png();
  const covr = atom("covr", atom("data", be32(14), be32(0), data));
  const meta = atom("meta", new Uint8Array(4), atom("hdlr", new Uint8Array(25)), atom("ilst", covr));
  const file = new Blob([atom("ftyp", text("M4A "), be32(0)), atom("mdat", audio), atom("moov", atom("mvhd", new Uint8Array(100)), atom("udta", meta))]);
  const cover = await readCover(file);
  assert.equal(cover?.mime, "image/png");
  assert.deepEqual(cover?.data, data);
});

/** An Ogg page of `serial` carrying `packets` (each ends on a lace under 255 unless `open`). */
function oggPage(serial: number, sequence: number, body: Uint8Array, open = false) {
  const laces: number[] = [];
  let left = body.length;
  while (left >= 255) {
    laces.push(255);
    left -= 255;
  }
  if (!open) laces.push(left);
  else if (left) throw new Error("an open page must end on 255s");
  const header = cat(text("OggS"), Uint8Array.from([0, 0]), new Uint8Array(8), le32(serial), le32(sequence), le32(0), Uint8Array.from([laces.length]), Uint8Array.from(laces));
  return cat(header, body);
}

test("Ogg: a picture in the Vorbis comments, split across two pages", async () => {
  const data = jpeg(6, 900);
  const block = flacPictureBlock(3, data);
  const comment = cat(text("METADATA_BLOCK_PICTURE="), text(btoa(String.fromCharCode(...block))));
  const comments = cat(Uint8Array.from([3]), text("vorbis"), le32(3), text("lib"), le32(2), le32(9), text("TITLE=Hey"), le32(comment.length), comment, Uint8Array.from([1]));
  const ident = cat(Uint8Array.from([1]), text("vorbis"), new Uint8Array(23));
  // The comment packet is cut after 510 bytes (two full laces) and goes on in the next page.
  const first = comments.subarray(0, 510);
  const rest = comments.subarray(510);
  const file = new Blob([oggPage(7, 0, ident), oggPage(7, 1, first, true), oggPage(7, 2, rest), audio]);
  assert.deepEqual((await readCover(file))?.data, data);
});

test("no picture, a WAV, or rubbish: null", async () => {
  assert.equal(await readCover(new Blob([id3(3, []), audio])), null);
  assert.equal(await readCover(new Blob([text("RIFF"), le32(100), text("WAVE"), audio])), null);
  assert.equal(await readCover(new Blob([audio])), null);
  assert.equal(await readCover(new Blob([text("ID3"), Uint8Array.from([3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f])])), null);
});
