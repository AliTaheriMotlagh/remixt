"use client";

import { cacheGet, cachePut } from "./localCache";
import { renderedWith, stretchEngine } from "./pitchTempo";

// Stems (and clips) rendered at a speed and pitch, kept on disk
// (localCache.ts) so a draft reopened, a remix opened again or an idea
// tried a second time plays at once instead of stretching the stem all
// over again — the slowest thing the Studio does, above all on a phone.
//
// Kept as 16-bit samples, half the room of the floats the render is (and
// the stem was an MP3: nothing of it is lost), left channel then right.
// Written and read a slice at a time, so a phone never holds a second
// whole copy of the render (see device.ts).

/** Bump when the stretch engines change how they sound, so old renders aren't played. */
const RENDER_VERSION = 1;
/** Frames per slice written or read. */
const SLICE = 1 << 18;

type Kept = { length: number; sampleRate: number; channels: number; audio: Blob };

/** Names a render of `stemId`: `what` says at which speed and pitch (a whole stem's, or one clip's). */
export function renderId(stemId: string, what: string, sampleRate: number, voice: boolean) {
  return `${stemId}|${what}|${stretchEngine()}|${voice ? "voice" : "inst"}|${sampleRate}|v${RENDER_VERSION}`;
}

/** The render kept under `id`, as audio (at the rate it was rendered at), or null. */
export async function keptRender(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
  const kept = await cacheGet<Kept>("render", id);
  if (!kept || kept.audio.size !== kept.length * kept.channels * 2) return null;
  try {
    const buffer = ctx.createBuffer(kept.channels, kept.length, kept.sampleRate);
    for (let ch = 0; ch < kept.channels; ch++) {
      for (let from = 0; from < kept.length; from += SLICE) {
        const frames = Math.min(SLICE, kept.length - from);
        const start = (ch * kept.length + from) * 2;
        const ints = new Int16Array(await kept.audio.slice(start, start + frames * 2).arrayBuffer());
        const floats = new Float32Array(frames);
        for (let i = 0; i < frames; i++) floats[i] = ints[i] / 32767;
        buffer.copyToChannel(floats, ch, from);
      }
    }
    return buffer;
  } catch {
    // The browser lost the file behind it: render again.
    return null;
  }
}

const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Keeps a render on disk, in the background — a slice at a time, letting
 * the page run in between. Only one the engine the person chose really
 * made (if the high-quality one failed, Classic stood in: not kept).
 */
export function keepRender(id: string, buffer: AudioBuffer) {
  if (renderedWith() !== stretchEngine()) return;
  void (async () => {
    try {
      const parts: Blob[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let from = 0; from < buffer.length; from += SLICE) {
          const frames = Math.min(SLICE, buffer.length - from);
          const ints = new Int16Array(frames);
          for (let i = 0; i < frames; i++) {
            const v = data[from + i];
            ints[i] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
          }
          parts.push(new Blob([ints]));
          await yieldToPage();
        }
      }
      const audio = new Blob(parts);
      await cachePut(
        "render",
        id,
        { length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, audio } satisfies Kept,
        audio.size
      );
    } catch {
      // Only a cache.
    }
  })();
}
