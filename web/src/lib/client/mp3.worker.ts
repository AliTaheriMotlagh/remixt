/// <reference lib="webworker" />

// Encodes PCM to MP3 off the main thread (see mp3.ts). A four-minute mix
// is several seconds of work — long enough to freeze a phone's Studio.

import { encodePcmToMp3, type Mp3Request } from "./mp3Core";

declare const self: DedicatedWorkerGlobalScope;

export type Mp3Response = { ok: true; bytes: Uint8Array } | { ok: false; message: string };

self.onmessage = async (event: MessageEvent<Mp3Request>) => {
  try {
    const bytes = await encodePcmToMp3(event.data);
    self.postMessage({ ok: true, bytes } satisfies Mp3Response, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) } satisfies Mp3Response);
  }
};
