// Kept apart from models.ts (which talks to the database) so the browser
// can build the same URL — the lock screen shows the cover while a remix plays.

/** Where a remix's cover is served; the key in the query busts caches when it's replaced. */
export function coverUrl(remixId: string, coverKey: string | null | undefined): string | null {
  return coverKey ? `/api/remixes/${remixId}/cover?v=${encodeURIComponent(coverKey.split("/").pop() ?? "")}` : null;
}

/**
 * A song's cover, by any of its stems — what a lane, a preview or a DJ deck
 * knows. 204 (no content) when the song has none; the UI then draws one (SongArt).
 */
export function stemCoverUrl(stemId: string): string {
  return `/api/stems/${stemId}/cover`;
}
