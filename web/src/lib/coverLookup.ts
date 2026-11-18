// Asks Apple's catalogue (the iTunes Search API) for a song's cover — see
// coverSearch.ts for what is asked and which answer is trusted. Server
// only: answers are kept for a day, and the catalogue is asked at most
// ASKS_PER_MINUTE times a minute (it turns away more than about twenty), so
// a Library full of songs without covers fills in over a few visits rather
// than all failing at once.

import { bestCover, coverTerms, type FoundCover, type StoreSong } from "./coverSearch";

const SEARCH = "https://itunes.apple.com/search";
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 1000;
const ASKS_PER_MINUTE = 15;

const cache = new Map<string, { at: number; cover: FoundCover | null }>();
const asked: number[] = [];

/** Whether the catalogue may be asked once more now (and counts it). */
function mayAsk() {
  const now = Date.now();
  while (asked.length && now - asked[0] > 60_000) asked.shift();
  if (asked.length >= ASKS_PER_MINUTE) return false;
  asked.push(now);
  return true;
}

async function search(term: string): Promise<StoreSong[]> {
  const params = new URLSearchParams({ term, media: "music", entity: "song", limit: "50" });
  const res = await fetch(`${SEARCH}?${params}`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results?: StoreSong[] };
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * The cover of the song called `title` (by `artist`, when known), or null
 * when the catalogue surely hasn't got it. `undefined`: it couldn't be
 * asked just now (too many asks this minute, or it didn't answer) — try
 * again later.
 */
export async function findCoverOnline(title: string, artist = ""): Promise<FoundCover | null | undefined> {
  const terms = coverTerms(title, artist);
  if (!terms.length) return null;
  const key = `${terms[0].toLowerCase()}|${artist.toLowerCase()}`;
  const kept = cache.get(key);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.cover;
  let cover: FoundCover | null = null;
  for (const term of terms) {
    if (!mayAsk()) return undefined;
    try {
      cover = bestCover(await search(term), title, artist);
    } catch {
      return undefined;
    }
    if (cover) break;
  }
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), cover });
  return cover;
}

/** The picture itself, for keeping (a JPEG of at most `max` bytes), or null. */
export async function fetchCoverImage(url: string, max = 1024 * 1024): Promise<Buffer | null> {
  try {
    const parsed = new URL(url);
    // Only the catalogue's own picture servers.
    if (parsed.protocol !== "https:" || !/(^|\.)mzstatic\.com$/.test(parsed.hostname)) return null;
    const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    return body.length > 0 && body.length <= max ? body : null;
  } catch {
    return null;
  }
}
