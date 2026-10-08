"use client";

import { kindLabel } from "@/lib/stemKinds";
import { audioEngine } from "./audioEngine";
import { createLaneChain, createMasterChain, scheduleLane, type ClipBufferLookup } from "./audioGraph";
import { audioFileName, id3Tag, wavHeader, wavTagChunks, type AudioTags } from "./audioTags";
import { isConstrainedDevice } from "./device";
import { exportTags, type ExportInfo } from "./exportMeta";
import { encodeMp3, openMp3Stream, type PcmSink } from "./mp3";
import { scheduleModulation } from "./modulation";
import { downloadFile } from "./saveFile";
import { getAudibleLaneIds, laneGain, laneName, resolveDelayTime, useStudioStore, type StudioLane } from "./studioStore";

export type ExportRange = "full" | "loop";
export type ExportFormat = "wav" | "mp3";

const FORMAT_KEY = "remixt:export-format";

/** The format exports use — remembered per browser. MP3 unless WAV was picked. */
export function getExportFormat(): ExportFormat {
  try {
    return localStorage.getItem(FORMAT_KEY) === "wav" ? "wav" : "mp3";
  } catch {
    return "mp3";
  }
}

export function setExportFormat(format: ExportFormat) {
  try {
    localStorage.setItem(FORMAT_KEY, format);
  } catch {
    // not remembered, that's all
  }
}

/** Encodes a rendered mix in the chosen format, tagged with `tags` if given. */
export async function encodeAudio(
  buffer: AudioBuffer,
  format: ExportFormat,
  { tags, signal, onProgress }: { tags?: AudioTags; signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}
): Promise<Blob> {
  if (format === "wav") return encodeWav(buffer, tags);
  const mp3 = await encodeMp3(buffer, { bitrate: 256, signal, onProgress });
  return tags ? new Blob([id3Tag(tags) as BlobPart, mp3], { type: "audio/mpeg" }) : mp3;
}

export type ExportOptions = {
  range?: ExportRange;
  /** An exact stretch of the timeline instead, in seconds (used by the social clip export). */
  span?: { start: number; end: number };
  format?: ExportFormat;
  /** Extra seconds rendered past the last lane so reverb/delay tails fit. */
  tailSeconds?: number;
  sampleRate?: number;
  /** What's happening, and how far along it is (0–1) when that's known. */
  onProgress?: (stage: string, fraction?: number) => void;
  signal?: AbortSignal;
};

/**
 * Runs an offline render, reporting how far it's got. Browsers that can
 * pause an offline render (Chrome, Safari) are paused every few percent
 * to read the position; Firefox can't, and just renders.
 */
async function renderWithProgress(ctx: OfflineAudioContext, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const quantum = 128;
  const steps = 25;
  if (onProgress && typeof ctx.suspend === "function") {
    const every = Math.max(quantum, Math.ceil(ctx.length / steps / quantum) * quantum);
    for (let frame = every; frame < ctx.length; frame += every) {
      ctx
        .suspend(frame / ctx.sampleRate)
        .then(() => {
          // Left suspended when cancelled: nothing more is rendered, and it's dropped.
          if (signal?.aborted) return;
          onProgress(frame / ctx.length);
          void ctx.resume();
        })
        .catch(() => {});
    }
  }
  const rendering = ctx.startRendering();
  if (!signal) return rendering;
  return new Promise<AudioBuffer>((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    rendering.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

/**
 * A stretch of the timeline to render, and how to build the graph that
 * plays it — rendered in one go (renderWhole), or a piece at a time on a
 * phone (renderInPieces).
 */
export type Bounce = {
  /** The timeline second it starts at, and how many seconds it runs. */
  start: number;
  seconds: number;
  sampleRate: number;
  /** Builds the graph on `ctx`, playing the timeline from `playhead` at its time 0. */
  build: (ctx: OfflineAudioContext, playhead: number) => void;
  /** How long the effects ring on after a sound: the lead-in a piece needs (see ringSeconds). */
  ring: number;
  /** The sample rates of the audio it plays (see pieceGrid). */
  sourceRates: number[];
};

/**
 * Phones (and computers short on memory) render in pieces. They reload
 * the page, with no warning, once it holds more memory than they allow
 * (see device.ts): a four-minute mix rendered whole is ~85 MB, another
 * ~85 MB copied out for the MP3 encoder, all on top of the lanes already
 * loaded — enough to lose the page part way through an export.
 */
const inPieces = () => isConstrainedDevice();
/** How much of the mix each piece holds: ~14 MB of audio. */
const PIECE_SECONDS = 40;
/** The most lead-in a piece gets: anything still ringing after that is far below hearing. */
const MAX_RING_SECONDS = 12;
/** Web Audio renders in blocks of this many frames. */
const QUANTUM = 128;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/**
 * The frames every piece (and its lead-in) starts on a multiple of, so it
 * renders exactly as that stretch of the one-go render would: on a whole
 * render quantum (the compressors step their gain per block), and on a
 * whole sample of each lane's audio — at 48 kHz into 44.1 kHz, every 147
 * frames — or the browser rounds where the lane is read from and the piece
 * comes out a fraction of a sample off. (Measured in Chrome: a mix's later
 * pieces are within −56 dB of the one-go render this way, −3 dB without.)
 */
export function pieceGrid(sampleRate: number, sourceRates: number[]) {
  let grid = QUANTUM;
  for (const rate of new Set(sourceRates)) {
    const next = lcm(grid, sampleRate / gcd(sampleRate, Math.round(rate)));
    // An odd rate that would need a grid of over a second: block-aligned only.
    if (next <= sampleRate) grid = next;
  }
  return grid;
}

/**
 * How long the lanes' effects keep sounding after the audio that set them
 * off: the reverb's decay, the echoes until they're 60 dB down, and a
 * second for the compressors and the limiter to settle.
 */
export function ringSeconds(lanes: StudioLane[], bpm: number) {
  let ring = 0;
  for (const { fx } of lanes) {
    if (fx.reverb > 0) ring = Math.max(ring, fx.reverbSize);
    if (fx.delay > 0) {
      const time = resolveDelayTime(fx, bpm);
      const feedback = Math.min(0.85, Math.max(0, fx.delayFeedback));
      // The damping filter only makes the echoes fade sooner than this.
      const echoes = feedback > 0.001 ? Math.log(0.001) / Math.log(feedback) : 0;
      ring = Math.max(ring, time * (1 + echoes));
    }
  }
  return ring + 1;
}

/** Clip buffers as they were when the export began — later pieces aren't thrown by an edit made meanwhile. */
function steadyLookup(lookup: ClipBufferLookup): ClipBufferLookup {
  const seen = new Map<Parameters<ClipBufferLookup>[0], AudioBuffer | undefined>();
  return (clip) => {
    if (!seen.has(clip)) seen.set(clip, lookup(clip));
    return seen.get(clip);
  };
}

async function loadForExport(signal?: AbortSignal) {
  // A phone needs the room more than it needs Before/After to be instant.
  if (inPieces()) audioEngine.dropSpare();
  await audioEngine.ensureAllLoaded();
  signal?.throwIfAborted();
}

function renderWhole(bounce: Bounce, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(bounce.seconds * bounce.sampleRate),
    sampleRate: bounce.sampleRate,
  });
  bounce.build(ctx, bounce.start);
  return renderWithProgress(ctx, onProgress, signal);
}

/**
 * Renders a piece at a time into `sink`, so only one piece is ever in
 * memory. Each piece starts rendering a little early — the lead-in,
 * dropped afterwards — so reverb, echoes and compressors carry across
 * from the piece before and the joins can't be heard.
 */
export async function renderInPieces(bounce: Bounce, sink: PcmSink, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const { sampleRate } = bounce;
  const total = Math.ceil(bounce.seconds * sampleRate);
  const grid = pieceGrid(sampleRate, bounce.sourceRates);
  const onGrid = (seconds: number) => Math.ceil((seconds * sampleRate) / grid) * grid;
  const piece = onGrid(PIECE_SECONDS);
  const ring = onGrid(Math.min(MAX_RING_SECONDS, bounce.ring));
  for (let from = 0; from < total; from += piece) {
    const frames = Math.min(piece, total - from);
    const lead = Math.min(ring, from);
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: lead + frames, sampleRate });
    bounce.build(ctx, bounce.start + (from - lead) / sampleRate);
    const rendered = await renderWithProgress(ctx, onProgress && ((f) => onProgress((from + f * frames) / total)), signal);
    await sink.write(rendered.getChannelData(0).slice(lead), rendered.getChannelData(1).slice(lead));
    onProgress?.((from + frames) / total);
  }
}

/** A WAV file written a piece at a time; each piece goes into a Blob as it comes, rather than all into one big buffer. */
export function wavSink(sampleRate: number, tags?: AudioTags): PcmSink {
  const parts: Blob[] = [];
  let dataBytes = 0;
  return {
    write: async (left, right) => {
      const pcm = pcm16([left, right], left.length);
      dataBytes += pcm.byteLength;
      parts.push(new Blob([pcm]));
    },
    finish: async () => {
      const extra = tags ? wavTagChunks(tags) : new Uint8Array(0);
      const header = wavHeader({ channels: 2, sampleRate, dataBytes, extraBytes: extra.length });
      return new Blob([header as BlobPart, ...parts, extra as BlobPart], { type: "audio/wav" });
    },
    cancel: () => {},
  };
}

/**
 * Renders, tags and encodes a bounce into a file: in one go, or on a
 * phone a piece at a time, each encoded as soon as it's rendered.
 * `stage` names the rendering ("Rendering mix…").
 */
async function bounceToFile(
  bounce: Bounce,
  {
    format,
    name,
    stage,
    tagsFor,
    onProgress,
    signal,
  }: {
    format: ExportFormat;
    name: string;
    stage: string;
    tagsFor: (seconds: number) => Promise<AudioTags>;
    onProgress?: ExportOptions["onProgress"];
    signal?: AbortSignal;
  }
): Promise<ExportedFile> {
  const encoding = format === "mp3" ? "Encoding MP3…" : "Encoding WAV…";
  if (!inPieces()) {
    const buffer = await renderWhole(bounce, onProgress && ((f) => onProgress(stage, f)), signal);
    signal?.throwIfAborted();
    onProgress?.("Adding title, credits and cover…");
    const tags = await tagsFor(buffer.duration);
    signal?.throwIfAborted();
    onProgress?.(encoding, 0);
    const blob = await encodeAudio(buffer, format, { tags, signal, onProgress: (f) => onProgress?.(encoding, f) });
    return { file: new File([blob], name, { type: blob.type }), tags, seconds: buffer.duration };
  }

  const seconds = Math.ceil(bounce.seconds * bounce.sampleRate) / bounce.sampleRate;
  onProgress?.("Adding title, credits and cover…");
  const tags = await tagsFor(seconds);
  signal?.throwIfAborted();
  const sink = format === "mp3" ? await openMp3Stream({ sampleRate: bounce.sampleRate, bitrate: 256, signal }) : wavSink(bounce.sampleRate, tags);
  try {
    const both = `${stage.replace(/…$/, "")} and encoding…`;
    onProgress?.(both, 0);
    await renderInPieces(bounce, sink, onProgress && ((f) => onProgress(both, f)), signal);
    onProgress?.("Finishing the file…");
    const audio = await sink.finish();
    const blob = format === "mp3" ? new Blob([id3Tag(tags) as BlobPart, audio], { type: "audio/mpeg" }) : audio;
    return { file: new File([blob], name, { type: blob.type }), tags, seconds };
  } finally {
    sink.cancel();
  }
}

/** The current project's mix, as a bounce — what's audible, with the master on it. */
async function mixBounce({ range = "full", span, tailSeconds = 2.5, sampleRate = 44100, onProgress, signal }: ExportOptions = {}) {
  onProgress?.("Loading stems…");
  await loadForExport(signal);

  const state = useStudioStore.getState();
  const audible = getAudibleLaneIds(state.lanes);
  const lanes = state.lanes.filter((l) => audible.has(l.laneId));
  if (lanes.length === 0) {
    throw new Error("Nothing to export — every lane is muted or the project is empty.");
  }

  const useLoop = !!span || (range === "loop" && state.loopEnabled && state.loopEnd > state.loopStart);
  const start = span ? span.start : useLoop ? state.loopStart : 0;
  const end = span ? span.end : useLoop ? state.loopEnd : state.duration;
  // Taken now, so every piece plays the same audio even if a lane changes meanwhile.
  const sources = lanes.flatMap((lane) => {
    const buffer = audioEngine.getProcessedBuffer(lane.laneId);
    return buffer ? [{ lane, buffer, clipBuffer: steadyLookup(audioEngine.clipLookup(lane.laneId)) }] : [];
  });

  const bounce: Bounce = {
    start,
    seconds: Math.max(0.1, end - start) + (useLoop ? 0 : tailSeconds),
    sampleRate,
    ring: ringSeconds(lanes, state.projectBpm),
    sourceRates: sources.map((s) => s.buffer.sampleRate),
    build: (ctx, playhead) => {
      const master = createMasterChain(ctx, ctx.destination, state.master);
      master.gain.gain.value = state.masterVolume;
      for (const { lane, buffer, clipBuffer } of sources) {
        const chain = createLaneChain(ctx, lane, state.projectBpm, master.input);
        chain.volumeGain.gain.value = laneGain(lane, audible, state.crossfader);
        scheduleLane({
          ctx,
          lane,
          buffer,
          chain,
          startTime: 0,
          playhead,
          until: useLoop ? end - playhead : undefined,
          clipBuffer,
        });
        scheduleModulation({ chain, lane, lanes: state.lanes, when: 0, playhead, length: ctx.length / ctx.sampleRate });
      }
    },
  };
  return { bounce, lanes, bpm: state.projectBpm };
}

/**
 * Bounces the current project to a stereo AudioBuffer.
 *
 * The render runs through exactly the same graph builders as live
 * playback, on an OfflineAudioContext, so what you export is what you
 * heard — including lane offsets, fades, FX, the master limiter and the
 * master fader. Muted/un-soloed lanes are dropped, the metronome is not
 * included.
 */
export async function renderMixdown(options: ExportOptions = {}): Promise<AudioBuffer> {
  const { onProgress, signal } = options;
  const { bounce } = await mixBounce(options);
  onProgress?.("Rendering mix…");
  return renderWhole(bounce, onProgress && ((f) => onProgress("Rendering mix…", f)), signal);
}

/** Interleaves channels as 16-bit PCM. */
function pcm16(channelData: Float32Array[], frames: number): ArrayBuffer {
  const channels = channelData.length;
  const pcm = new ArrayBuffer(frames * channels * 2);
  const view = new DataView(pcm);
  let offset = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return pcm;
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV file, with `tags` after the samples if given. */
export function encodeWav(buffer: AudioBuffer, tags?: AudioTags): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
  // The samples go in a buffer of their own and the Blob joins the parts,
  // so a long mix isn't copied once more just to put a header on it.
  const pcm = pcm16(channelData, buffer.length);
  const pad = new Uint8Array(pcm.byteLength % 2);
  const extra = tags ? wavTagChunks(tags) : new Uint8Array(0);
  const header = wavHeader({ channels, sampleRate: buffer.sampleRate, dataBytes: pcm.byteLength, extraBytes: extra.length });
  return new Blob([header as BlobPart, pcm, pad, extra as BlobPart], { type: "audio/wav" });
}

/** @deprecated Use saveFile (share sheet on phones) or downloadFile from saveFile.ts. */
export function downloadBlob(blob: Blob, filename: string) {
  downloadFile(blob, filename);
}

/** A finished export: the file, and the details shown next to its Save button. */
export type ExportedFile = {
  file: File;
  tags: AudioTags;
  seconds: number;
};

/**
 * Renders, encodes and tags the mix, ready to save. `onProgress` gets the
 * stage and, while rendering and encoding, how far along it is (0–1).
 */
export async function exportMixdown(info: ExportInfo, options: ExportOptions = {}): Promise<ExportedFile> {
  const format = options.format ?? getExportFormat();
  const { bounce, lanes, bpm } = await mixBounce(options);
  return bounceToFile(bounce, {
    format,
    name: audioFileName({ artist: info.artist, title: info.title, extension: format }),
    stage: "Rendering mix…",
    tagsFor: (lengthSeconds) => exportTags(info, { lanes, lengthSeconds, bpm }),
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Renders a single lane on its own — handy for sharing an acapella. */
export async function exportLane(
  lane: StudioLane,
  info: ExportInfo,
  { onProgress, signal, format = getExportFormat() }: Pick<ExportOptions, "onProgress" | "signal" | "format"> = {}
): Promise<ExportedFile> {
  onProgress?.("Loading the lane…");
  await loadForExport(signal);
  const buffer = audioEngine.getProcessedBuffer(lane.laneId);
  if (!buffer) throw new Error("That lane hasn't finished loading yet.");

  const bpm = useStudioStore.getState().projectBpm;
  const clipBuffer = steadyLookup(audioEngine.clipLookup(lane.laneId));
  const bounce: Bounce = {
    start: lane.offsetSeconds,
    seconds: (lane.clips ? lane.duration : buffer.duration) + 2.5,
    sampleRate: 44100,
    ring: ringSeconds([lane], bpm),
    sourceRates: [buffer.sampleRate],
    build: (ctx, playhead) => {
      // A stem on its own is exported clean: the master's tone and glue are for the whole mix.
      const master = createMasterChain(ctx, ctx.destination);
      const chain = createLaneChain(ctx, lane, bpm, master.input);
      chain.volumeGain.gain.value = lane.volume;
      scheduleLane({ ctx, lane, buffer, chain, startTime: 0, playhead, clipBuffer });
      // The lane's own automation comes along; ducking doesn't — there are no vocals in a solo export.
      scheduleModulation({
        chain,
        lane: { ...lane, fx: { ...lane.fx, duck: 0 } },
        lanes: [lane],
        when: 0,
        playhead,
        length: ctx.length / ctx.sampleRate,
      });
    },
  };

  // "Vocals", or "Hook · Vocals" for a lane given a name of its own.
  const name = laneName(lane);
  const part = name === lane.trackTitle ? kindLabel(lane.kind) : `${name} · ${kindLabel(lane.kind)}`;
  return bounceToFile(bounce, {
    format,
    name: audioFileName({ artist: info.artist, title: info.title, part, extension: format }),
    stage: "Rendering the lane…",
    tagsFor: (lengthSeconds) => exportTags(info, { lanes: [lane], lengthSeconds, bpm, part }),
    onProgress,
    signal,
  });
}
