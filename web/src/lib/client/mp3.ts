"use client";

import type { Mp3Response } from "./mp3.worker";
import { encodePcmToMp3, type Mp3Bitrate } from "./mp3Core";

function channels(buffer: AudioBuffer) {
  const left = buffer.getChannelData(0).slice();
  const right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();
  return { left, right };
}

/**
 * Encodes an AudioBuffer as MP3 bytes, in a worker where possible.
 * `workerOnly`: fail rather than fall back to encoding on the page's own
 * thread, which freezes it for as long as that takes. `signal` stops the
 * worker. `onProgress` gets 0–1 as it goes.
 */
export async function encodeMp3Bytes(
  buffer: AudioBuffer,
  {
    bitrate = 256,
    trimDelay = false,
    workerOnly = false,
    signal,
    onProgress,
  }: {
    bitrate?: Mp3Bitrate;
    trimDelay?: boolean;
    workerOnly?: boolean;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  } = {}
): Promise<Uint8Array> {
  const options = { sampleRate: buffer.sampleRate, bitrate, trimDelay };
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      signal?.throwIfAborted();
      const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
      const stop = () => {
        worker.terminate();
        reject(signal?.reason ?? new Error("Stopped"));
      };
      signal?.addEventListener("abort", stop, { once: true });
      const finish = () => {
        worker.terminate();
        signal?.removeEventListener("abort", stop);
      };
      worker.onmessage = (event: MessageEvent<Mp3Response>) => {
        if (event.data.ok === null) {
          onProgress?.(event.data.progress);
          return;
        }
        finish();
        if (event.data.ok) resolve(event.data.bytes);
        else reject(new Error(event.data.message));
      };
      worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || "MP3 worker failed"));
      };
      const { left, right } = channels(buffer);
      worker.postMessage({ ...options, left, right }, [left.buffer, right.buffer]);
    });
  } catch (err) {
    if (workerOnly || signal?.aborted) throw err;
    // No worker (or it failed to start) — slower, but still works.
    return encodePcmToMp3({ ...options, ...channels(buffer) }, onProgress);
  }
}

export async function encodeMp3(
  buffer: AudioBuffer,
  options?: { bitrate?: Mp3Bitrate; signal?: AbortSignal; onProgress?: (fraction: number) => void }
): Promise<Blob> {
  const bytes = await encodeMp3Bytes(buffer, options);
  return new Blob([bytes as BlobPart], { type: "audio/mpeg" });
}
