"use client";

import { audioEngine } from "./audioEngine";
import { createLaneChain, createMasterChain, scheduleLane } from "./audioGraph";
import { getAudibleLaneIds, useStudioStore, type StudioLane } from "./studioStore";

export type ExportRange = "full" | "loop";

export type ExportOptions = {
  range?: ExportRange;
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

  const useLoop = range === "loop" && state.loopEnabled && state.loopEnd > state.loopStart;
  const start = useLoop ? state.loopStart : 0;
  const end = useLoop ? state.loopEnd : state.duration;
  const length = Math.max(0.1, end - start) + (useLoop ? 0 : tailSeconds);

  onProgress?.("Rendering mix…");
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(length * sampleRate),
    sampleRate,
  });

  const master = createMasterChain(ctx, ctx.destination);
  master.gain.gain.value = state.masterVolume;

  for (const lane of lanes) {
    const buffer = audioEngine.getProcessedBuffer(lane.laneId);
    if (!buffer) continue;
    const chain = createLaneChain(ctx, lane, state.projectBpm, master.input);
    chain.volumeGain.gain.value = lane.volume;
    scheduleLane({
      ctx,
      lane,
      buffer,
      chain,
      startTime: 0,
      playhead: start,
      until: useLoop ? end - start : undefined,
    });
  }

  const rendered = await ctx.startRendering();
  onProgress?.("Encoding…");
  return rendered;
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
  const buffer = await renderMixdown(options);
  const blob = encodeWav(buffer);
  downloadBlob(blob, `${safeFilename(title)}.wav`);
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
    length: Math.ceil((buffer.duration + 2.5) * sampleRate),
    sampleRate,
  });
  const master = createMasterChain(ctx, ctx.destination);
  const chain = createLaneChain(ctx, lane, state.projectBpm, master.input);
  chain.volumeGain.gain.value = lane.volume;
  scheduleLane({ ctx, lane, buffer, chain, startTime: 0, playhead: lane.offsetSeconds });

  const rendered = await ctx.startRendering();
  downloadBlob(encodeWav(rendered), `${safeFilename(title)}-${lane.kind}.wav`);
}
