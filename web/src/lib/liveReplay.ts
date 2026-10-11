// Replays of live sessions: the pure half, shared by the server (what's
// worth keeping) and the player (where the host was at any moment).
//
// A session is never recorded as audio — there's no media server. What's
// kept is the performance: every change of the stage state (play, pause, a
// seek, a stem muted…), the studio mix as it changed, and the chat. Played
// back through the same follower listeners use live, it sounds the same.

import type { LiveStageState } from "./live";

/** A stage state kept in the timeline, `t` seconds after the session started. */
export type ReplayState = { t: number; state: LiveStageState; remixId: string | null };
/** A studio mix kept in the timeline (its body is fetched when it's needed). */
export type ReplayMix = { id: number; t: number };
export type ReplayChat = { id: number; t: number; name: string; color: string; user_id: string | null; is_host: boolean; body: string };
export type ReplayReaction = { t: number; emoji: string; count: number };

export type Replay = {
  /** Seconds from the session's start to its end. */
  duration: number;
  mode: "perform" | "studio";
  states: ReplayState[];
  mixes: ReplayMix[];
  chat: ReplayChat[];
  reactions: ReplayReaction[];
};

/** A playhead this far from where the last state puts it is a seek, not drift. */
const SEEK_SECONDS = 1;

/**
 * Whether `next` says something the timeline doesn't already: the host
 * resends the state every few seconds as a keyframe, and those add nothing
 * a replay can't work out from the previous one.
 */
export function stateChanged(prev: LiveStageState | null, next: LiveStageState, secondsSincePrev: number) {
  if (!prev) return true;
  if (prev.playing !== next.playing || (prev.note ?? "") !== (next.note ?? "")) return true;
  if (JSON.stringify(prev.lanes) !== JSON.stringify(next.lanes)) return true;
  if (JSON.stringify(prev.selected ?? []) !== JSON.stringify(next.selected ?? [])) return true;
  const expected = prev.position + (prev.playing ? Math.max(0, secondsSincePrev) : 0);
  return Math.abs(next.position - expected) > SEEK_SECONDS;
}

/** The index of the last entry at or before `t` (-1 before the first). Entries are in time order. */
export function indexAt(entries: { t: number }[], t: number) {
  let lo = 0;
  let hi = entries.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Where the host's track was `t` seconds into the session. */
export function positionAt(states: ReplayState[], t: number) {
  const i = indexAt(states, t);
  if (i < 0) return 0;
  const { state, t: at } = states[i];
  return state.position + (state.playing ? t - at : 0);
}
