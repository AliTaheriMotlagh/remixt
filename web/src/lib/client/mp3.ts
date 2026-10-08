"use client";

import type { Mp3Response, Mp3StreamMessage, Mp3StreamReply } from "./mp3.worker";
import { createMp3Stream, encodePcmToMp3, type Mp3Bitrate } from "./mp3Core";

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

/** Somewhere stereo audio goes a piece at a time, turned into a file at the end. */
export type PcmSink = {
  /** Takes the pieces in order; the arrays may be handed off (don't reuse them). */
  write: (left: Float32Array, right: Float32Array) => Promise<void>;
  finish: () => Promise<Blob>;
  /** Lets go of it (stops the worker) — harmless once finished. */
  cancel: () => void;
};

/**
 * An MP3 encoder fed a piece at a time, in a worker where possible (on
 * the page's own thread otherwise, a piece's worth of freeze at a time).
 * `write` waits while a piece is still being encoded, so only one is ever
 * queued behind it. `signal` stops it.
 */
export async function openMp3Stream({
  sampleRate,
  bitrate = 256,
  signal,
}: {
  sampleRate: number;
  bitrate?: Mp3Bitrate;
  signal?: AbortSignal;
}): Promise<PcmSink> {
  try {
    return await workerMp3Stream(sampleRate, bitrate, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    const stream = await createMp3Stream({ sampleRate, bitrate });
    return {
      write: async (left, right) => {
        signal?.throwIfAborted();
        stream.encode(left, right);
      },
      finish: async () => new Blob([stream.finish() as BlobPart], { type: "audio/mpeg" }),
      cancel: () => {},
    };
  }
}

function workerMp3Stream(sampleRate: number, bitrate: Mp3Bitrate, signal?: AbortSignal): Promise<PcmSink> {
  signal?.throwIfAborted();
  const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
  // The worker replies to each message in turn.
  const waiting: { resolve: (reply: Mp3StreamReply) => void; reject: (err: unknown) => void }[] = [];
  let failure: unknown = null;
  const fail = (err: unknown) => {
    failure ??= err;
    worker.terminate();
    signal?.removeEventListener("abort", onAbort);
    for (const w of waiting.splice(0)) w.reject(failure);
  };
  const onAbort = () => fail(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
  signal?.addEventListener("abort", onAbort, { once: true });
  worker.onmessage = (event: MessageEvent<Mp3StreamReply>) => {
    if ("error" in event.data) fail(new Error(event.data.error));
    else waiting.shift()?.resolve(event.data);
  };
  worker.onerror = (event) => fail(new Error(event.message || "MP3 worker failed"));

  const send = (message: Mp3StreamMessage, transfer: Transferable[] = []) =>
    failure
      ? Promise.reject(failure)
      : new Promise<Mp3StreamReply>((resolve, reject) => {
          waiting.push({ resolve, reject });
          worker.postMessage(message, transfer);
        });

  let encoding: Promise<unknown> = Promise.resolve();
  const sink: PcmSink = {
    write: async (left, right) => {
      await encoding;
      encoding = send({ stream: "chunk", left, right }, [left.buffer, right.buffer]);
      // Seen by the next write or finish; not left unhandled meanwhile.
      encoding.catch(() => {});
    },
    finish: async () => {
      await encoding;
      const reply = await send({ stream: "close" });
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
      if (!("bytes" in reply)) throw new Error("MP3 worker failed");
      return new Blob([reply.bytes as BlobPart], { type: "audio/mpeg" });
    },
    cancel: () => fail(new DOMException("Cancelled", "AbortError")),
  };
  return send({ stream: "open", sampleRate, bitrate }).then(() => sink);
}
