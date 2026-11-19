import { createMp3Encoder } from "wasm-media-encoders";
import { withXingHeader } from "./mp3Xing";

/**
 * A fixed bitrate in kbit/s, or "vbr": LAME's variable bitrate at
 * VBR_QUALITY — as good as 192 kbps or better where the music is busy, and
 * far smaller where it isn't (a vocal's gaps, a bass line): what stems and
 * takes are stored as.
 */
export type Mp3Bitrate = 128 | 160 | 192 | 224 | 256 | 320 | "vbr";

/** LAME's -V2 ("transparent" for nearly everyone; 0 is best, 9 smallest). */
export const VBR_QUALITY = 2;

/** The encoder's settings for this bitrate. */
export function mp3Settings(sampleRate: number, bitrate: Mp3Bitrate) {
  return bitrate === "vbr"
    ? { sampleRate, channels: 2 as const, vbrQuality: VBR_QUALITY }
    : { sampleRate, channels: 2 as const, bitrate };
}

/** The finished file: a VBR one gets the header players need for its length and seeking (see mp3Xing.ts). */
export function finishMp3(bytes: Uint8Array, bitrate: Mp3Bitrate): Uint8Array {
  return bitrate === "vbr" ? withXingHeader(bytes) : bytes;
}

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

/**
 * Encodes stereo PCM to an MP3 file. Runs in a worker or on the page.
 * `onProgress` gets 0–1. `breathe`: on the page, hand the thread back
 * between pieces, so the screen keeps drawing (and the progress shows)
 * instead of freezing until it's done.
 */
export async function encodePcmToMp3(
  { left, right, sampleRate, bitrate, trimDelay }: Mp3Request,
  onProgress?: (fraction: number) => void,
  { breathe = false, signal }: { breathe?: boolean; signal?: AbortSignal } = {}
) {
  const encoder = await createMp3Encoder();
  encoder.configure(mp3Settings(sampleRate, bitrate));
  const skip = trimDelay ? Math.min(MP3_DELAY, left.length) : 0;
  const parts: Uint8Array[] = [];
  for (let start = skip; start < left.length; start += CHUNK) {
    const end = Math.min(left.length, start + CHUNK);
    // The encoder owns the returned buffer, hence the copy.
    parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
    onProgress?.(end / left.length);
    if (breathe) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
  }
  parts.push(encoder.finalize().slice());
  return finishMp3(join(parts), bitrate);
}

/**
 * An MP3 encoder fed a piece of the audio at a time — for audio rendered
 * in pieces, so the whole of it is never in memory at once (see
 * mixdown.ts). `finish` returns the file.
 */
export async function createMp3Stream({ sampleRate, bitrate }: { sampleRate: number; bitrate: Mp3Bitrate }) {
  const encoder = await createMp3Encoder();
  encoder.configure(mp3Settings(sampleRate, bitrate));
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
      return finishMp3(join(parts), bitrate);
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
