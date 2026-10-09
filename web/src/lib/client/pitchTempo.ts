"use client";

import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";
import type { PitchTempoRequest, PitchTempoResponse } from "./pitchTempo.worker";

// Renders a new AudioBuffer with an independent tempo and pitch applied.
// This is a "freeze"/bounce-style operation, not live DSP — we run it once
// whenever a lane's pitch or tempo changes, then play the resulting buffer
// back normally. That keeps multi-lane transport sync simple: after the
// transform, buffer duration == real playback duration, same as today.
//
// Two engines. High quality (the default) is Signalsmith Stretch, a
// spectral stretcher, run through an OfflineAudioContext: far fewer of the
// warbles and echoes a vocal picks up when it's sped up or re-keyed, and
// it keeps a voice's formants where they were when its pitch moves, so a
// vocal shifted a few semitones doesn't turn into a chipmunk or a giant.
// Classic is SoundTouch (time-domain), kept as the fallback for browsers
// where the high-quality engine can't run, and as a choice.

export type StretchEngine = "hq" | "classic";
const ENGINE_KEY = "remixt.stretchEngine";

export function stretchEngine(): StretchEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === "classic" ? "classic" : "hq";
  } catch {
    return "hq";
  }
}

export function setStretchEngine(engine: StretchEngine) {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    // Private mode: remembered for this visit only.
  }
}

/** Set once the high-quality engine has failed in this browser: everything after uses Classic. */
let hqBroken = false;

/** The engine renders really come out of: Classic stands in once the high-quality one has failed. */
export function renderedWith(): StretchEngine {
  return hqBroken ? "classic" : stretchEngine();
}

export async function renderPitchTempo(
  audioCtx: BaseAudioContext,
  sourceBuffer: AudioBuffer,
  { tempo, pitchSemitones, voice = false }: { tempo: number; pitchSemitones: number; voice?: boolean }
): Promise<AudioBuffer> {
  if (Math.abs(tempo - 1) < 0.001 && Math.abs(pitchSemitones) < 0.001) {
    return sourceBuffer;
  }
  if (!hqBroken && stretchEngine() === "hq") {
    try {
      return await renderHq(sourceBuffer, tempo, pitchSemitones, voice);
    } catch {
      hqBroken = true;
    }
  }
  let rendered: { left: Float32Array; right: Float32Array };
  try {
    rendered = await renderInWorker(sourceBuffer, tempo, pitchSemitones);
  } catch {
    // No worker (or it failed to start) — slower, but still works.
    rendered = await renderOnPage(sourceBuffer, tempo, pitchSemitones);
  }
  if (rendered.left.length === 0) return sourceBuffer;

  const outBuffer = audioCtx.createBuffer(2, rendered.left.length, sourceBuffer.sampleRate);
  outBuffer.copyToChannel(rendered.left as Float32Array<ArrayBuffer>, 0);
  outBuffer.copyToChannel(rendered.right as Float32Array<ArrayBuffer>, 1);
  return outBuffer;
}

const STRETCH_MODULE = process.env.NEXT_PUBLIC_STRETCH_MODULE_URL || "/stretch/SignalsmithStretch.mjs";

/** How often the render stops to feed the stretcher more of the stem, in seconds of output. */
const FEED_EVERY = 4;
/** Stem kept on either side of where the stretcher reads (its window and look-ahead reach a little way), in seconds. */
const FEED_MARGIN = 2;

/**
 * Signalsmith Stretch in an offline context: the stem goes in as the
 * node's input buffer and comes out at `tempo`× speed, `semitones` higher —
 * as fast as the CPU allows, on the audio thread, not the page's. Its
 * latency is compensated by the node itself (checked: output = input /
 * rate to within 2 ms), so the result lines up with the original exactly.
 *
 * Memory: a phone reloads the page when it holds too much (see device.ts),
 * so this never adds a whole copy of the stem. The stem goes in a few
 * seconds at a time, just ahead of where the stretcher reads, and what
 * it's past is dropped; and the context renders exactly the length
 * wanted, so what it renders is the result as it is, with no copy to trim
 * it. (A render never depends on what comes after it: this is sample for
 * sample the start of a longer one.)
 */
async function renderHq(source: AudioBuffer, tempo: number, semitones: number, voice: boolean): Promise<AudioBuffer> {
  const { default: SignalsmithStretch } = await import("signalsmith-stretch");
  // Every render loads the same worklet module (copied to public/stretch by
  // scripts/copy-ort.mjs), instead of the library making a new blob URL
  // of itself each time.
  (SignalsmithStretch as typeof SignalsmithStretch & { moduleUrl?: string }).moduleUrl ??= new URL(
    STRETCH_MODULE,
    window.location.href
  ).href;
  const rate = source.sampleRate;
  const frames = Math.max(1, Math.round(source.length / tempo));
  const ctx = new OfflineAudioContext(2, frames, rate);
  const node = await Promise.race([
    SignalsmithStretch(ctx),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The high-quality stretcher didn't start")), 8000)),
  ]);
  node.connect(ctx.destination);

  const feeding = await feedAsRendered(ctx, node, source, tempo);
  await node.schedule({
    output: 0,
    input: 0,
    rate: tempo,
    semitones,
    active: true,
    // A voice keeps its own character when its pitch moves.
    ...(voice && Math.abs(semitones) > 0.001 ? { formantCompensation: true, formantBaseHz: 0 } : {}),
  });
  const out = await ctx.startRendering();
  feeding.check();
  // A silent render from a stem with sound in it means the engine didn't run.
  if (!hasSound(out) && hasSound(source)) throw new Error("The high-quality stretcher gave silence");
  return out;
}

/** What feedAsRendered needs of the stretcher node. */
export type StretchInput = {
  addBuffers: (buffers: Float32Array[]) => Promise<number>;
  dropBuffers: (toSeconds: number) => Promise<unknown>;
};

/**
 * Hands `source` to the stretcher a piece at a time while `ctx` renders:
 * enough to start with now, then at every pause (every FEED_EVERY seconds
 * of output) the stem up to where it'll read by the next one, letting go
 * of what it's past. Call it before rendering; after, `check()` throws if
 * any of it failed — the render can't be stopped, so it's thrown away.
 */
export async function feedAsRendered(
  ctx: Pick<OfflineAudioContext, "length" | "sampleRate" | "suspend" | "resume">,
  node: StretchInput,
  source: AudioBuffer,
  tempo: number
) {
  const rate = source.sampleRate;
  const channels = [source.getChannelData(0), source.numberOfChannels > 1 ? source.getChannelData(1) : source.getChannelData(0)];
  // (Its types leave out the transfer list the node takes after the buffers.)
  const addBuffers = node.addBuffers as (buffers: Float32Array[], transfer?: Transferable[]) => Promise<number>;
  let fed = 0;
  /** The stem up to where the stretcher reads by output second `t` + FEED_EVERY, and nothing it's past. */
  const feedUntil = async (t: number) => {
    const end = Math.min(source.length, Math.ceil(((t + FEED_EVERY) * tempo + FEED_MARGIN) * rate));
    if (end > fed) {
      const piece = channels.map((data) => data.slice(fed, end));
      fed = end;
      await addBuffers.call(node, piece, piece.map((p) => p.buffer));
    }
    if (t > 0) await node.dropBuffers(Math.max(0, t * tempo - FEED_MARGIN));
  };
  await feedUntil(0);

  let fault: unknown = null;
  const quantum = 128;
  const every = Math.max(quantum, Math.round((FEED_EVERY * ctx.sampleRate) / quantum) * quantum);
  for (let frame = every; frame < ctx.length; frame += every) {
    const t = frame / ctx.sampleRate;
    ctx
      .suspend(t)
      .then(() => feedUntil(t))
      .catch((err) => (fault ??= err))
      .then(() => ctx.resume())
      .catch(() => {});
  }
  return {
    check() {
      if (fault) throw fault;
    },
  };
}

function hasSound(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 997) if (Math.abs(data[i]) > 1e-4) return true;
  return false;
}

/**
 * One worker per render, so lanes changed together (AI Match, "match
 * all") render in parallel on separate cores, and the page stays
 * responsive throughout.
 */
function renderInWorker(sourceBuffer: AudioBuffer, tempo: number, pitchSemitones: number) {
  return new Promise<{ left: Float32Array; right: Float32Array }>((resolve, reject) => {
    const worker = new Worker(new URL("./pitchTempo.worker.ts", import.meta.url), { type: "module" });
    const left = sourceBuffer.getChannelData(0).slice();
    const right = (
      sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : sourceBuffer.getChannelData(0)
    ).slice();
    worker.onmessage = (event: MessageEvent<PitchTempoResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "pitch/tempo worker failed"));
    };
    worker.postMessage({ left, right, tempo, pitchSemitones } satisfies PitchTempoRequest, [
      left.buffer,
      right.buffer,
    ]);
  });
}

async function renderOnPage(sourceBuffer: AudioBuffer, tempo: number, pitchSemitones: number) {
  const source = new WebAudioBufferSource(sourceBuffer);
  const soundtouch = new SoundTouch();
  soundtouch.tempo = tempo;
  soundtouch.pitchSemitones = pitchSemitones;
  const filter = new SimpleFilter(source, soundtouch);

  const CHUNK_FRAMES = 4096;
  const scratch = new Float32Array(CHUNK_FRAMES * 2);
  const chunks: Float32Array[] = [];
  let totalFrames = 0;
  let iterations = 0;

  // Yield to the event loop periodically so a long track doesn't freeze
  // the UI thread for the whole render.
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

  for (;;) {
    const framesExtracted = filter.extract(scratch, CHUNK_FRAMES);
    if (framesExtracted <= 0) break;
    chunks.push(scratch.slice(0, framesExtracted * 2));
    totalFrames += framesExtracted;
    iterations++;
    if (iterations % 40 === 0) await yieldToUI();
  }

  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    const frames = chunk.length / 2;
    for (let i = 0; i < frames; i++) {
      left[offset + i] = chunk[i * 2];
      right[offset + i] = chunk[i * 2 + 1];
    }
    offset += frames;
  }
  return { left, right };
}
