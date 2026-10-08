import { createMp3Encoder } from "wasm-media-encoders";

export type Mp3Bitrate = 128 | 160 | 192 | 256 | 320;

export type Mp3Request = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  bitrate: Mp3Bitrate;
  /**
   * Skip LAME's encoder + decoder delay, so the MP3 starts exactly where
   * the audio did — needed for anything that has to line up on the
   * timeline (a recorded take), pointless for a finished mix.
   */
  trimDelay?: boolean;
};

/** LAME's encoder + decoder delay, in samples (see splitter.worker.ts). */
const MP3_DELAY = 576 + 529;
const CHUNK = 1152 * 64;

/** Encodes stereo PCM to an MP3 file. Runs in a worker or on the page. `onProgress` gets 0–1. */
export async function encodePcmToMp3(
  { left, right, sampleRate, bitrate, trimDelay }: Mp3Request,
  onProgress?: (fraction: number) => void
) {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: 2, bitrate });
  const skip = trimDelay ? Math.min(MP3_DELAY, left.length) : 0;
  const parts: Uint8Array[] = [];
  for (let start = skip; start < left.length; start += CHUNK) {
    const end = Math.min(left.length, start + CHUNK);
    // The encoder owns the returned buffer, hence the copy.
    parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
    onProgress?.(end / left.length);
  }
  parts.push(encoder.finalize().slice());
  return join(parts);
}

/**
 * An MP3 encoder fed a piece of the audio at a time — for audio rendered
 * in pieces, so the whole of it is never in memory at once (see
 * mixdown.ts). `finish` returns the file.
 */
export async function createMp3Stream({ sampleRate, bitrate }: { sampleRate: number; bitrate: Mp3Bitrate }) {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: 2, bitrate });
  const parts: Uint8Array[] = [];
  return {
    encode(left: Float32Array, right: Float32Array) {
      for (let start = 0; start < left.length; start += CHUNK) {
        const end = Math.min(left.length, start + CHUNK);
        parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
      }
    },
    finish() {
      parts.push(encoder.finalize().slice());
      return join(parts);
    },
  };
}

function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
