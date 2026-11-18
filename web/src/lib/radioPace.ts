// How often a radio tab asks for its station's feed (used by lib/client/radioClient.ts).

/**
 * How often the feed is asked for. Every ask is a function call and a few
 * database reads on the host's free tier, and a phone on the radio with
 * its screen locked may listen for hours, so the pace follows what's
 * needed: lively on screen (votes, requests, who's listening), relaxed
 * while playing in the background (the next song is announced
 * NEXT_LEAD_SECONDS — 90 s — ahead, and a song change is polled for at
 * its exact moment anyway), and rare for a hidden page not playing.
 */
export function pollEvery({ hidden, playing }: { hidden: boolean; playing: boolean }): number {
  if (!hidden) return 5_000;
  return playing ? 15_000 : 60_000;
}
