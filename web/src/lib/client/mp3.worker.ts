/// <reference lib="webworker" />

// Encodes PCM to MP3 off the main thread (see mp3.ts). A four-minute mix
// is several seconds of work — long enough to freeze a phone's Studio.

import { encodePcmToMp3, type Mp3Request } from "./mp3Core";

declare const self: DedicatedWorkerGlobalScope;

export type Mp3Response =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; message: string }
  | { ok: null; progress: number };

self.onmessage = async (event: MessageEvent<Mp3Request>) => {
  try {
    let reported = 0;
    const bytes = await encodePcmToMp3(event.data, (progress) => {
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
