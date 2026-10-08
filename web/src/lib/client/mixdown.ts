"use client";

import { kindLabel } from "@/lib/stemKinds";
import { audioEngine } from "./audioEngine";
import { createLaneChain, createMasterChain, scheduleLane } from "./audioGraph";
import { audioFileName, id3Tag, wavHeader, wavTagChunks, type AudioTags } from "./audioTags";
import { exportTags, type ExportInfo } from "./exportMeta";
import { encodeMp3 } from "./mp3";
import { scheduleModulation } from "./modulation";
import { downloadFile } from "./saveFile";
import { getAudibleLaneIds, laneGain, laneName, useStudioStore, type StudioLane } from "./studioStore";

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
 * Bounces the current project to a stereo AudioBuffer.
 *
 * The render runs through exactly the same graph builders as live
 * playback, on an OfflineAudioContext, so what you export is what you
 * heard — including lane offsets, fades, FX, the master limiter and the
 * master fader. Muted/un-soloed lanes are dropped, the metronome is not
 * included.
 */
export async function renderMixdown({
  range = "full",
  span,
  tailSeconds = 2.5,
  sampleRate = 44100,
  onProgress,
  signal,
}: ExportOptions = {}): Promise<AudioBuffer> {
  onProgress?.("Loading stems…");
  await audioEngine.ensureAllLoaded();
  signal?.throwIfAborted();

  const state = useStudioStore.getState();
  const audible = getAudibleLaneIds(state.lanes);
  const lanes = state.lanes.filter((l) => audible.has(l.laneId));
  if (lanes.length === 0) {
    throw new Error("Nothing to export — every lane is muted or the project is empty.");
  }

  const useLoop = !!span || (range === "loop" && state.loopEnabled && state.loopEnd > state.loopStart);
  const start = span ? span.start : useLoop ? state.loopStart : 0;
  const end = span ? span.end : useLoop ? state.loopEnd : state.duration;
  const length = Math.max(0.1, end - start) + (useLoop ? 0 : tailSeconds);

  onProgress?.("Rendering mix…");
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(length * sampleRate),
    sampleRate,
  });

  const master = createMasterChain(ctx, ctx.destination, state.master);
  master.gain.gain.value = state.masterVolume;

  for (const lane of lanes) {
    const buffer = audioEngine.getProcessedBuffer(lane.laneId);
    if (!buffer) continue;
    const chain = createLaneChain(ctx, lane, state.projectBpm, master.input);
    chain.volumeGain.gain.value = laneGain(lane, audible, state.crossfader);
    scheduleLane({
      ctx,
      lane,
      buffer,
      chain,
      startTime: 0,
      playhead: start,
      until: useLoop ? end - start : undefined,
      clipBuffer: audioEngine.clipLookup(lane.laneId),
    });
    scheduleModulation({ chain, lane, lanes: state.lanes, when: 0, playhead: start, length });
  }

  return renderWithProgress(ctx, onProgress && ((f) => onProgress("Rendering mix…", f)), signal);
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV file, with `tags` after the samples if given. */
export function encodeWav(buffer: AudioBuffer, tags?: AudioTags): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const extra = tags ? wavTagChunks(tags) : new Uint8Array(0);

  // The samples go in a buffer of their own and the Blob joins the parts,
  // so a long mix isn't copied once more just to put a header on it.
  const pcm = new ArrayBuffer(dataSize + (dataSize % 2));
  const view = new DataView(pcm);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  const header = wavHeader({ channels, sampleRate: buffer.sampleRate, dataBytes: dataSize, extraBytes: extra.length });
  return new Blob([header as BlobPart, pcm, extra as BlobPart], { type: "audio/wav" });
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
  const { onProgress, signal } = options;
  const format = options.format ?? getExportFormat();
  const buffer = await renderMixdown({ ...options, onProgress });
  signal?.throwIfAborted();
  onProgress?.("Adding title, credits and cover…");
  const state = useStudioStore.getState();
  const audible = getAudibleLaneIds(state.lanes);
  const tags = await exportTags(info, {
    lanes: state.lanes.filter((l) => audible.has(l.laneId)),
    lengthSeconds: buffer.duration,
    bpm: state.projectBpm,
  });
  signal?.throwIfAborted();
  onProgress?.(format === "mp3" ? "Encoding MP3…" : "Encoding WAV…", 0);
  const blob = await encodeAudio(buffer, format, { tags, signal, onProgress: (f) => onProgress?.("Encoding MP3…", f) });
  const name = audioFileName({ artist: info.artist, title: info.title, extension: format });
  return { file: new File([blob], name, { type: blob.type }), tags, seconds: buffer.duration };
}

/** Renders a single lane on its own — handy for sharing an acapella. */
export async function exportLane(
  lane: StudioLane,
  info: ExportInfo,
  { onProgress, signal, format = getExportFormat() }: Pick<ExportOptions, "onProgress" | "signal" | "format"> = {}
): Promise<ExportedFile> {
  onProgress?.("Loading the lane…");
  await audioEngine.ensureAllLoaded();
  signal?.throwIfAborted();
  const buffer = audioEngine.getProcessedBuffer(lane.laneId);
  if (!buffer) throw new Error("That lane hasn't finished loading yet.");

  const state = useStudioStore.getState();
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(((lane.clips ? lane.duration : buffer.duration) + 2.5) * sampleRate),
    sampleRate,
  });
  // A stem on its own is exported clean: the master's tone and glue are for the whole mix.
  const master = createMasterChain(ctx, ctx.destination);
  const chain = createLaneChain(ctx, lane, state.projectBpm, master.input);
  chain.volumeGain.gain.value = lane.volume;
  scheduleLane({
    ctx,
    lane,
    buffer,
    chain,
    startTime: 0,
    playhead: lane.offsetSeconds,
    clipBuffer: audioEngine.clipLookup(lane.laneId),
  });
  // The lane's own automation comes along; ducking doesn't — there are no vocals in a solo export.
  scheduleModulation({
    chain,
    lane: { ...lane, fx: { ...lane.fx, duck: 0 } },
    lanes: [lane],
    when: 0,
    playhead: lane.offsetSeconds,
    length: ctx.length / sampleRate,
  });

  const rendered = await renderWithProgress(ctx, onProgress && ((f) => onProgress("Rendering the lane…", f)), signal);
  onProgress?.("Adding title, credits and cover…");
  // "Vocals", or "Hook · Vocals" for a lane given a name of its own.
  const name = laneName(lane);
  const part = name === lane.trackTitle ? kindLabel(lane.kind) : `${name} · ${kindLabel(lane.kind)}`;
  const tags = await exportTags(info, { lanes: [lane], lengthSeconds: rendered.duration, bpm: state.projectBpm, part });
  signal?.throwIfAborted();
  onProgress?.(format === "mp3" ? "Encoding MP3…" : "Encoding WAV…", 0);
  const blob = await encodeAudio(rendered, format, { tags, signal, onProgress: (f) => onProgress?.("Encoding MP3…", f) });
  const file = new File([blob], audioFileName({ artist: info.artist, title: info.title, part, extension: format }), { type: blob.type });
  return { file, tags, seconds: rendered.duration };
}
