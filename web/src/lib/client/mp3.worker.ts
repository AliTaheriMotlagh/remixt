/// <reference lib="webworker" />

// Encodes PCM to MP3 off the main thread (see mp3.ts). A four-minute mix
// is several seconds of work — long enough to freeze a phone's Studio.
//
// Either all at once (an Mp3Request), or as a stream of pieces (open,
// then a chunk at a time, then close) for a mix rendered in pieces.

import { createMp3Stream, encodePcmToMp3, type Mp3Bitrate, type Mp3Request } from "./mp3Core";

declare const self: DedicatedWorkerGlobalScope;

export type Mp3Response =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; message: string }
  | { ok: null; progress: number };

export type Mp3StreamMessage =
  | { stream: "open"; sampleRate: number; bitrate: Mp3Bitrate }
  | { stream: "chunk"; left: Float32Array; right: Float32Array }
  | { stream: "close" };

/** One reply per stream message, in order — or an error, after which the stream is done. */
export type Mp3StreamReply = { stream: "ready" } | { stream: "written" } | { stream: "done"; bytes: Uint8Array } | { error: string };

let stream: Awaited<ReturnType<typeof createMp3Stream>> | null = null;
// Stream messages are handled one after another: opening waits for the encoder to load.
let queue = Promise.resolve();

async function handleStream(message: Mp3StreamMessage) {
  if (message.stream === "open") {
    stream = await createMp3Stream(message);
    self.postMessage({ stream: "ready" } satisfies Mp3StreamReply);
  } else if (message.stream === "chunk") {
    if (!stream) throw new Error("MP3 stream isn't open");
    stream.encode(message.left, message.right);
    self.postMessage({ stream: "written" } satisfies Mp3StreamReply);
  } else {
    if (!stream) throw new Error("MP3 stream isn't open");
    const bytes = stream.finish();
    stream = null;
    self.postMessage({ stream: "done", bytes } satisfies Mp3StreamReply, [bytes.buffer]);
  }
}

self.onmessage = async (event: MessageEvent<Mp3Request | Mp3StreamMessage>) => {
  const data = event.data;
  if ("stream" in data) {
    queue = queue
      .then(() => handleStream(data))
      .catch((err) => {
        stream = null;
        self.postMessage({ error: err instanceof Error ? err.message : String(err) } satisfies Mp3StreamReply);
      });
    return;
  }
  try {
    let reported = 0;
    const bytes = await encodePcmToMp3(data, (progress) => {
      // A few dozen messages is plenty for a progress bar.
      if (progress - reported < 0.02 && progress < 1) return;
      reported = progress;
      self.postMessage({ ok: null, progress } satisfies Mp3Response);
    });
    self.postMessage({ ok: true, bytes } satisfies Mp3Response, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) } satisfies Mp3Response);
  }
};
