// What a radio station plays next, and what listeners get to vote on —
// pure, so it can be tested (tests/radio.test.ts). lib/radio.ts reads the
// station from the database, asks here, and writes the answer back.
//
// The order a real station would use: what the DJ queued by hand first,
// then the song the listeners voted for, then the song most requested,
// then the playlist in rotation (never something heard in the last hour or
// so), then anything from the library when the playlist runs dry.

export type RadioKind = "track" | "remix";

/** Something a station can play: a library song or a published remix. */
import { keyFit, type MusicalKey } from "./client/musicKey";

export type RadioItem = {
  kind: RadioKind;
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover: string | null;
  /** Its tempo, when known — for the crossfade into the next song. */
  bpm?: number | null;
  /** Its key ("9:minor"), when measured — so the next song from the library can be one that mixes with it. */
  key?: string | null;
};

export const itemKey = (i: Pick<RadioItem, "kind" | "id">) => `${i.kind}:${i.id}`;

/** A request with how many listeners asked for it, oldest ask first among equals. */
export type RequestedItem = RadioItem & { count: number; firstAt: number };

export type PickSource = "dj" | "vote" | "request" | "playlist" | "library";

export type PickInput = {
  /** Queued by the DJ to play next, in order. */
  djQueue: RadioItem[];
  /** The vote's choices with their votes (a choice nobody voted for can still win when the vote is on: the first). */
  votes: { item: RadioItem; votes: number }[];
  voting: boolean;
  /** Accepted requests not played yet. */
  requests: RequestedItem[];
  playlist: RadioItem[];
  /** Everything else the station may play when the playlist runs dry (empty: it doesn't). */
  library: RadioItem[];
  /** Keys of what played lately, newest first. */
  recent: string[];
  /** The one playing now (never picked again right away). */
  current?: string | null;
  /** The one playing now, with its tempo and key: the library's next song is one that follows it well. */
  currentItem?: RadioItem | null;
};

/** Songs ahead in the library's rotation the station chooses among for the best follow-on (more would starve some songs). */
export const FOLLOW_ON_CHOICES = 5;

/**
 * 0–1: how well `next` follows `prev` on the radio, as a DJ would pick —
 * keys beside each other on the Camelot wheel, tempos a blend can reach.
 * Unknown keys and tempos count as middling, so unmeasured songs still play.
 */
export function followOn(prev: Pick<RadioItem, "bpm" | "key"> | null | undefined, next: Pick<RadioItem, "bpm" | "key">): number {
  const a = parseKey(prev?.key);
  const b = parseKey(next.key);
  const keyScore = a && b ? { same: 1, relative: 0.95, neighbour: 0.85, far: 0.45, clash: 0.15 }[keyFit(b, a)] : 0.55;
  let tempoScore = 0.55;
  if (prev?.bpm && next.bpm && prev.bpm > 0 && next.bpm > 0) {
    const off = Math.min(...[1, 2, 0.5].map((m) => Math.abs(Math.log((next.bpm! * m) / prev.bpm!))));
    tempoScore = Math.max(0, 1 - off / Math.log(1.25));
  }
  return 0.6 * keyScore + 0.4 * tempoScore;
}

function parseKey(raw: string | null | undefined): MusicalKey | null {
  const m = /^(\d{1,2}):(major|minor)$/.exec(raw ?? "");
  return m && Number(m[1]) <= 11 ? { tonic: Number(m[1]), mode: m[2] as MusicalKey["mode"] } : null;
}

/** How many of the latest plays a playlist song waits out before it comes round again (fewer when the playlist is short). */
export function restFor(size: number) {
  return Math.max(0, Math.min(12, size - 1));
}

/** The playlist in rotation: the first song not heard within its rest, in playlist order after the last one played. */
export function rotation(playlist: RadioItem[], recent: string[], exclude: ReadonlySet<string> = new Set()): RadioItem[] {
  if (!playlist.length) return [];
  const rest = new Set(recent.slice(0, restFor(playlist.length)));
  const lastIndex = playlist.findIndex((p) => itemKey(p) === recent[0]);
  const start = lastIndex >= 0 ? lastIndex + 1 : 0;
  const ordered = [...playlist.slice(start), ...playlist.slice(0, start)];
  const fresh = ordered.filter((p) => !rest.has(itemKey(p)) && !exclude.has(itemKey(p)));
  // Everything rested: the least recently played first.
  if (fresh.length) return fresh;
  const lastHeard = (p: RadioItem) => {
    const i = recent.indexOf(itemKey(p));
    return i < 0 ? Infinity : i;
  };
  return ordered.filter((p) => !exclude.has(itemKey(p))).sort((a, b) => lastHeard(b) - lastHeard(a));
}

/** Requests, most asked for first, then the oldest. */
export function rankRequests(requests: RequestedItem[]) {
  return [...requests].sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);
}

/** The next song, and why it was chosen. Null when there's nothing at all to play. */
export function pickNext(input: PickInput): { item: RadioItem; source: PickSource } | null {
  const current = input.current ?? null;
  const notNow = (i: RadioItem) => itemKey(i) !== current;
  const dj = input.djQueue.find(notNow);
  if (dj) return { item: dj, source: "dj" };
  if (input.voting && input.votes.length) {
    const top = [...input.votes].filter((v) => notNow(v.item)).sort((a, b) => b.votes - a.votes)[0];
    if (top && top.votes > 0) return { item: top.item, source: "vote" };
  }
  const asked = rankRequests(input.requests).find(notNow);
  if (asked) return { item: asked, source: "request" };
  // With the vote on and nobody voting, the first choice (the station's own pick) plays.
  if (input.voting && input.votes.length) {
    const first = input.votes.map((v) => v.item).find(notNow);
    if (first) return { item: first, source: "vote" };
  }
  const exclude = new Set(current ? [current] : []);
  const fromPlaylist = rotation(input.playlist, input.recent, exclude)[0];
  if (fromPlaylist) return { item: fromPlaylist, source: "playlist" };
  // From the library: of the next few in rotation, the one that follows this song best (earlier in the rotation wins a tie).
  const ahead = rotation(input.library, input.recent, exclude).slice(0, FOLLOW_ON_CHOICES);
  const fromLibrary = input.currentItem
    ? ahead.reduce<RadioItem | undefined>((best, item) => (!best || followOn(input.currentItem, item) > followOn(input.currentItem, best) + 0.05 ? item : best), undefined)
    : ahead[0];
  if (fromLibrary) return { item: fromLibrary, source: "library" };
  return null;
}

/**
 * The choices for the next vote: the most requested songs first (a song
 * many people asked for belongs on the ballot), then the playlist's next
 * songs, then the library — `count` of them, all different, none playing.
 */
export function voteChoices(input: Omit<PickInput, "votes" | "voting" | "djQueue">, count: number): RadioItem[] {
  const out: RadioItem[] = [];
  const seen = new Set<string>(input.current ? [input.current] : []);
  const add = (i: RadioItem | undefined) => {
    if (!i || out.length >= count || seen.has(itemKey(i))) return;
    seen.add(itemKey(i));
    out.push(i);
  };
  for (const r of rankRequests(input.requests)) add(r);
  for (const p of rotation(input.playlist, input.recent, seen)) add(p);
  for (const l of rotation(input.library, input.recent, seen)) add(l);
  return out.map(({ kind, id, title, artist, duration, cover, bpm, key }) => ({ kind, id, title, artist, duration, cover, bpm: bpm ?? null, key: key ?? null }));
}

/** Where the station is in the song that started at `startsAt` (ms), at `now` (ms): seconds in, clamped to the song. */
export function positionAt(startsAt: number, duration: number, now: number) {
  return Math.max(0, Math.min(duration, (now - startsAt) / 1000));
}

/**
 * When the next song starts: right after this one (gapless) — unless the
 * station has been silent a while (nobody listening, so nobody moved it
 * on), then now, so a listener tuning in hears a song from its start.
 */
export function nextStart(endedAt: number, now: number, idleAfter = 30_000) {
  return now - endedAt > idleAfter ? now : endedAt;
}

/** A URL-safe station name: "Late Night Persian Rap" → "late-night-persian-rap". */
export function slugOf(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "station";
}

// ------------------------------------------------------------- transitions

/**
 * The next song is chosen this long before the current one ends, so every
 * listener has time to get it ready (a remix is mixed down in each tab,
 * which takes a while on a phone). The vote for it closes then.
 */
export const NEXT_LEAD_SECONDS = 90;

export type Crossfade = {
  /** How long the two songs overlap (seconds): the next one starts this long before the current one ends. */
  seconds: number;
  /** "blend": tempos close, a long blend on whole bars; "quick": tempos apart, a short fade, so the beats never fight for long; "fade": tempo unknown. */
  style: "blend" | "quick" | "fade";
  bars: number;
};

/**
 * How one song hands over to the next, the way a DJ or a streaming app's
 * automix would: when the tempos are close (half and double time count),
 * 8 bars of the outgoing song's tempo (4 for a slow one), so the next song
 * comes in on a bar line of this one; when they're far apart, 2 bars — a
 * quick fade; with a tempo unknown, 6 seconds. Never more than a third of
 * either song, never under 2 seconds.
 */
export function crossfadeFor(out: { bpm?: number | null; duration: number }, next: { bpm?: number | null; duration: number }): Crossfade {
  const cap = (s: number) => Math.max(2, Math.min(s, out.duration / 3, next.duration / 3, 16));
  if (!(out.bpm && out.bpm > 0)) return { seconds: cap(6), style: "fade", bars: 0 };
  const bar = 240 / out.bpm;
  if (next.bpm && next.bpm > 0) {
    const ratio = [1, 2, 0.5].map((m) => Math.abs(Math.log((next.bpm! * m) / out.bpm!))).sort((a, b) => a - b)[0];
    if (Math.exp(ratio) - 1 <= 0.06) {
      const bars = bar * 8 <= 16 ? 8 : 4;
      // Whole bars that fit under the cap.
      const fit = Math.max(1, Math.floor(cap(bar * bars) / bar + 1e-6));
      return { seconds: fit * bar, style: "blend", bars: fit };
    }
  }
  const bars = Math.max(1, Math.floor(cap(bar * 2) / bar + 1e-6));
  return { seconds: bars * bar, style: "quick", bars };
}

/** Equal-power crossfade gains at `p` (0 → 1 through the overlap): the room stays as loud all through. */
export function crossfadeGains(p: number): { out: number; in: number } {
  const x = Math.max(0, Math.min(1, p));
  return { out: Math.cos((x * Math.PI) / 2), in: Math.sin((x * Math.PI) / 2) };
}
