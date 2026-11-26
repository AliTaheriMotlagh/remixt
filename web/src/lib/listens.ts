// What people actually listen to: one record per song heard, per place it
// was heard — the radio, the DJ decks, a library preview, a remix's page or
// embed — with how long, and whether it was heard to the end or skipped.
// Kept for what comes next (charts, "more like this", artists' stats,
// royalties by listening time); nothing reads it yet but Admin. Shared by the
// browser (lib/client/listens.ts) and the server (api/listens).

export const LISTEN_SOURCES = ["radio", "dj", "preview", "remix", "embed"] as const;
export type ListenSource = (typeof LISTEN_SOURCES)[number];

export const LISTEN_KINDS = ["track", "remix", "stem"] as const;
export type ListenKind = (typeof LISTEN_KINDS)[number];

export type Listen = {
  kind: ListenKind;
  id: string;
  source: ListenSource;
  /** Seconds actually heard (paused time not counted). */
  seconds: number;
  /** The song's length, when the player knew it. */
  duration: number | null;
  /** Heard to (nearly) the end. */
  completed: boolean;
  /** Left within its first half minute for another song. */
  skipped: boolean;
  /** The radio station's slug, for radio listens. */
  station?: string | null;
};

/** Shorter than this isn't a listen (a tap past it, a preview of a second). */
export const MIN_LISTEN_SECONDS = 5;
/** Left for another song before this: a skip. */
export const SKIP_SECONDS = 30;
/** Most listens one beacon carries. */
export const MAX_LISTENS_PER_BEACON = 40;

/** `raw` as a listen worth keeping, or null. */
export function cleanListen(raw: unknown): Listen | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!(LISTEN_KINDS as readonly unknown[]).includes(r.kind)) return null;
  if (!(LISTEN_SOURCES as readonly unknown[]).includes(r.source)) return null;
  if (typeof r.id !== "string" || !/^[\w-]{1,80}$/.test(r.id)) return null;
  const seconds = Number(r.seconds);
  if (!Number.isFinite(seconds) || seconds < MIN_LISTEN_SECONDS) return null;
  const duration = r.duration === null || r.duration === undefined ? null : Number(r.duration);
  const length = duration !== null && Number.isFinite(duration) && duration > 0 && duration <= 4 * 3600 ? duration : null;
  return {
    kind: r.kind as ListenKind,
    id: r.id,
    source: r.source as ListenSource,
    // A listen can't be longer than a few hours, nor much longer than its song (a loop on the decks can).
    seconds: Math.round(Math.min(seconds, 4 * 3600) * 10) / 10,
    duration: length === null ? null : Math.round(length * 10) / 10,
    completed: r.completed === true,
    skipped: r.skipped === true && r.completed !== true,
    station: typeof r.station === "string" && /^[\w-]{1,80}$/.test(r.station) ? r.station : null,
  };
}

/**
 * How one play ended, from what was heard: to (nearly) the end is
 * completed; gone for another song inside SKIP_SECONDS is a skip.
 */
export function outcome(seconds: number, duration: number | null, replaced: boolean): { completed: boolean; skipped: boolean } {
  const completed = duration !== null && duration > 0 && seconds >= Math.min(duration * 0.9, duration - 10);
  return { completed, skipped: !completed && replaced && seconds < SKIP_SECONDS };
}
