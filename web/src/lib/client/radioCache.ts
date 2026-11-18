// What the radio has mixed, kept on this device (localCache.ts, kind
// "radio"): each song and remix as one WAV from its very start, so tuning
// in again — the same station or another, today or next week — plays it
// at once instead of downloading and mixing it again.
//
// The key is the song's content, not its id: the play payload (every lane,
// its stem, volume, effects, offsets…) and how long the station plays it.
// A remix edited after it was kept gets a new key, so an old mix is never
// played for it; the old one just ages out of the cache.

import { cacheGet, cachePut } from "./localCache";

/** Raise when the radio's mixing changes how a song sounds: everything kept before is mixed again. */
export const RADIO_MIX_VERSION = 1;

/** A file shorter than a WAV header is a broken entry. */
const WAV_HEADER = 44;

/** The key a song's whole mix is kept under. */
export async function radioMixKey(kind: string, payload: unknown, duration: number): Promise<string> {
  const text = JSON.stringify([RADIO_MIX_VERSION, kind, Math.round(duration * 1000), payload]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The kept whole mix, or null. */
export async function keptMix(key: string): Promise<Blob | null> {
  const blob = await cacheGet<Blob>("radio", key);
  return blob instanceof Blob && blob.size > WAV_HEADER ? blob : null;
}

/** Keeps a whole mix (from the song's start). Never throws: at worst it's mixed again next time. */
export function keepMix(key: string, blob: Blob): Promise<void> {
  return cachePut("radio", key, blob, blob.size).catch(() => {});
}
