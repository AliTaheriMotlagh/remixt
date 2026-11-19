// Stems and takes are stored as VBR MP3 (lib/client/mp3Core.ts) with a
// Xing header added (lib/client/mp3Xing.ts): far smaller than 192 kbps
// where the audio is quiet or simple, a header that gives an <audio>
// element the right length, and the audio itself unmoved — the frames
// after the header are exactly the encoder's.
//
//   node --import ./tests/support/register.mjs --test tests/mp3-vbr.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { encodePcmToMp3 } from "../src/lib/client/mp3Core.ts";
import { mp3Frames, withXingHeader } from "../src/lib/client/mp3Xing.ts";

const RATE = 44100;
const SECONDS = 12;

/** A vocal-ish stem: a tone every other second, silence between. */
function sparse() {
  const left = new Float32Array(RATE * SECONDS);
  for (let i = 0; i < left.length; i++) {
    const t = i / RATE;
    left[i] = Math.floor(t) % 2 === 0 ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0;
  }
  return { left, right: left.slice() };
}

test("a VBR stem is much smaller than 192 kbps and carries a Xing header", async () => {
  const { left, right } = sparse();
  const cbr = await encodePcmToMp3({ left, right, sampleRate: RATE, bitrate: 192 });
  const vbr = await encodePcmToMp3({ left, right, sampleRate: RATE, bitrate: "vbr" });
  assert.ok(vbr.length < cbr.length * 0.5, `VBR ${vbr.length} B vs CBR ${cbr.length} B`);

  // CBR files are as before: no header.
  assert.equal(Buffer.from(cbr.subarray(0, 200)).indexOf("Xing"), -1);

  const parsed = mp3Frames(vbr);
  assert.ok(parsed);
  const [first, ...audio] = parsed.frames;
  const tag = Buffer.from(vbr.subarray(first.offset, first.offset + first.length));
  const at = tag.indexOf("Xing");
  assert.equal(at, 36, "after the header and stereo side information");
  assert.equal(tag.readUInt32BE(at + 8), audio.length, "frame count");
  assert.equal(tag.readUInt32BE(at + 12), vbr.length, "byte count");
  // The table only ever moves forward through the file.
  const toc = [...tag.subarray(at + 16, at + 116)];
  assert.deepEqual(toc, [...toc].sort((a, b) => a - b));
  // Length a player works out: frames × 1152 samples.
  assert.ok(Math.abs((audio.length * 1152) / RATE - SECONDS) < 0.1);
  // No LAME gapless tag: players mustn't trim the encoder delay again.
  assert.equal(tag.indexOf("LAME"), -1);
});

test("the header goes in front of the encoder's frames, which stay byte for byte", async () => {
  const { left, right } = sparse();
  const raw = await encodePcmToMp3({ left, right, sampleRate: RATE, bitrate: 192 });
  const wrapped = withXingHeader(raw);
  const header = wrapped.length - raw.length;
  assert.equal(header, 417, "a 128 kbps frame at 44.1 kHz");
  assert.deepEqual(Buffer.from(wrapped.subarray(header)), Buffer.from(raw));
  assert.equal(mp3Frames(wrapped)!.frames.length, mp3Frames(raw)!.frames.length + 1);
});

test("anything that isn't MPEG-1 Layer III is left alone", () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(withXingHeader(junk), junk);
});
