/**
 * A VBR MP3 needs a header saying how many frames it has and where each
 * percent of it starts (a "Xing" frame, before the audio). Without one an
 * `<audio>` element guesses the length from the first frame's bitrate —
 * minutes off for a stem that opens quietly — and seeks to the wrong spot.
 * The encoder (wasm-media-encoders) doesn't write it, so it's added here.
 *
 * Only the Xing part is written, not LAME's gapless tag: with the tag,
 * players would cut the encoder's delay a second time — the splitter
 * already skips it (see MP3_DELAY in splitter.worker.ts) — and the stem
 * would start early, out of step with the rest. Players skip a Xing frame
 * without playing it, so the audio itself lines up exactly as before.
 */

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATES_V1 = [44100, 48000, 32000, 0];

type Frame = { offset: number; length: number };

/** MPEG-1 Layer III frames, in order. Stops at the first thing that isn't one. */
export function mp3Frames(bytes: Uint8Array): { frames: Frame[]; header: number } | null {
  const frames: Frame[] = [];
  let header = 0;
  for (let at = 0; at + 4 <= bytes.length; ) {
    // Sync, MPEG-1, Layer III.
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xfe) !== 0xfa) break;
    const bitrate = BITRATES_V1_L3[bytes[at + 2] >> 4];
    const sampleRate = SAMPLE_RATES_V1[(bytes[at + 2] >> 2) & 3];
    if (!bitrate || !sampleRate) break;
    const padding = (bytes[at + 2] >> 1) & 1;
    const length = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
    if (at + length > bytes.length) break;
    if (!frames.length) header = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    frames.push({ offset: at, length });
    at += length;
  }
  return frames.length ? { frames, header } : null;
}

/**
 * `bytes` (raw MP3 frames, as the encoder gives them) with a Xing frame in
 * front. Returned unchanged when they aren't MPEG-1 Layer III frames.
 */
export function withXingHeader(bytes: Uint8Array): Uint8Array {
  const found = mp3Frames(bytes);
  if (!found) return bytes;
  const { frames, header } = found;

  // The Xing frame copies the audio's sample rate and channel mode, at
  // 128 kbps: big enough for the table, and no padding.
  const sampleRate = SAMPLE_RATES_V1[(header >> 10) & 3];
  const mono = ((header >> 6) & 3) === 3;
  const size = Math.floor((144 * 128_000) / sampleRate);
  const tag = new Uint8Array(size);
  const view = new DataView(tag.buffer);
  // 0xFFFB: sync, MPEG-1, Layer III, no CRC. Bitrate index 9 (128 kbps),
  // the audio's sample rate, no padding; channel mode and the rest as the audio has them.
  view.setUint32(0, ((0xfffb << 16) | (9 << 12) | (header & 0x0c00) | (header & 0xff)) >>> 0);
  // After the side information, which a decoder reads as all zeros (silence).
  const at = 4 + (mono ? 17 : 32);
  tag.set([0x58, 0x69, 0x6e, 0x67], at); // "Xing"
  view.setUint32(at + 4, 0x0f); // frames, bytes, table, quality
  view.setUint32(at + 8, frames.length);
  const total = size + bytes.length;
  view.setUint32(at + 12, total);
  // Where each percent of the playing time starts, as a 256th of the file.
  for (let i = 0; i < 100; i++) {
    const frame = frames[Math.min(frames.length - 1, Math.floor((i / 100) * frames.length))];
    tag[at + 16 + i] = Math.min(255, Math.floor(((size + frame.offset) / total) * 256));
  }
  view.setUint32(at + 116, 0); // quality: unknown

  const out = new Uint8Array(total);
  out.set(tag);
  out.set(bytes, size);
  return out;
}
