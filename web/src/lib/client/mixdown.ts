"use client";

import { audioEngine } from "./audioEngine";
import { createLaneChain, createMasterChain, scheduleLane } from "./audioGraph";
import { encodeMp3 } from "./mp3";
import { scheduleModulation } from "./modulation";
import { getAudibleLaneIds, laneGain, useStudioStore, type StudioLane } from "./studioStore";

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

/** Encodes a rendered mix in the chosen format. */
export async function encodeAudio(buffer: AudioBuffer, format: ExportFormat): Promise<Blob> {
  return format === "mp3" ? encodeMp3(buffer, { bitrate: 256 }) : encodeWav(buffer);
}

export type ExportOptions = {
  range?: ExportRange;
  /** An exact stretch of the timeline instead, in seconds (used by the social clip export). */
  span?: { start: number; end: number };
  format?: ExportFormat;
  /** Extra seconds rendered past the last lane so reverb/delay tails fit. */
  tailSeconds?: number;
  sampleRate?: number;
  onProgress?: (stage: string) => void;
};

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
}: ExportOptions = {}): Promise<AudioBuffer> {
  onProgress?.("Loading stems…");
  await audioEngine.ensureAllLoaded();

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

  return ctx.startRendering();
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV file. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next frame so Safari has actually started the download.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export function safeFilename(title: string) {
  const cleaned = title
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return cleaned || "remixt-mix";
}

/** Convenience: render + encode + download in one call. */
export async function exportMixdown(
  title: string,
  options: ExportOptions = {}
): Promise<void> {
  const format = options.format ?? getExportFormat();
  const buffer = await renderMixdown(options);
  options.onProgress?.(format === "mp3" ? "Encoding MP3…" : "Encoding…");
  const blob = await encodeAudio(buffer, format);
  downloadBlob(blob, `${safeFilename(title)}.${format}`);
}

/** Exports a single lane on its own — handy for sharing an acapella. */
export async function exportLane(lane: StudioLane, title: string) {
  await audioEngine.ensureAllLoaded();
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

  const rendered = await ctx.startRendering();
  const format = getExportFormat();
  downloadBlob(await encodeAudio(rendered, format), `${safeFilename(title)}-${lane.kind}.${format}`);
}
