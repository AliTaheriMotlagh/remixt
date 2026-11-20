import { crossfadeGains } from "./radioPick";

// Which of the radio's prepared songs sound at a moment, from where, and
// how loud. Pure (no audio, no clock of its own), so the player
// (lib/client/radioDeck.ts) only has to carry it out, and it can be tested.
//
// Two ways to play:
// - 2 players: the outgoing and the incoming song overlap, with
//   equal-power gains over the station's crossfade (computers through Web
//   Audio, Android through the elements' volume).
// - 1 player (iPhone, iPad: a page can't set an element's volume there,
//   and one element that never stops is what keeps the sound going with the
//   screen locked): one song at a time. It changes halfway through the
//   crossfade, where both are equally loud, so the cut lands in the blend
//   rather than at the start of the next song's intro.

/**
 * A song ready to play: its place on the station's clock (ms) and the song's
 * second at its file's start. `cut`: its file already begins with the
 * transition from the song before (a rendered style, lib/radioTransitions.ts),
 * so the player hands over at its start instead of crossfading the two.
 */
export type PlanDeck = { rowId: number; startsAt: number; endsAt: number; offset: number; cut?: boolean };

/** A handover is this quick (seconds): the two files are the same sound there, so it's never heard. */
export const HANDOVER_SECONDS = 0.05;

/** A song to sound now: seconds into its file, and its gain (0–1, before the listener's volume). */
export type PlanVoice = { rowId: number; into: number; gain: number };

export type DeckPlan = {
  /** Oldest first. */
  sound: PlanVoice[];
  /** The next song, to load into a free player before its start (2 players only). */
  preload: number | null;
};

/** What `decks` should do at `serverNow` (ms) with `players` players. */
export function planDecks(decks: PlanDeck[], serverNow: number, players: 1 | 2): DeckPlan {
  const into = (d: PlanDeck) => (serverNow - d.startsAt) / 1000 - d.offset;
  const live = decks.filter((d) => serverNow >= d.startsAt && serverNow < d.endsAt && into(d) >= 0).sort((a, b) => a.startsAt - b.startsAt);
  const later = decks.filter((d) => d.startsAt > serverNow).sort((a, b) => a.startsAt - b.startsAt);

  if (players === 1) {
    let pick: PlanDeck | null = null;
    for (const [i, d] of live.entries()) {
      const before = live[i - 1];
      const overlap = before ? Math.max(0, before.endsAt - d.startsAt) : 0;
      // A rendered change starts in this song's file: switch at its start. A plain crossfade: halfway.
      if (!before || serverNow >= d.startsAt + (d.cut ? 0 : overlap / 2)) pick = d;
    }
    return { sound: pick ? [{ rowId: pick.rowId, into: into(pick), gain: 1 }] : [], preload: null };
  }

  const sounding = live.slice(-2);
  const sound = sounding.map((d, i) => {
    let gain = 1;
    const before = sounding[i - 1];
    const after = sounding[i + 1];
    if (before && before.endsAt > d.startsAt) {
      const overlap = d.cut ? HANDOVER_SECONDS : (before.endsAt - d.startsAt) / 1000;
      gain *= crossfadeGains((serverNow - d.startsAt) / 1000 / overlap).in;
    }
    if (after && after.startsAt < d.endsAt) {
      const overlap = after.cut ? HANDOVER_SECONDS : (d.endsAt - after.startsAt) / 1000;
      gain *= crossfadeGains((serverNow - after.startsAt) / 1000 / overlap).out;
    }
    return { rowId: d.rowId, into: into(d), gain };
  });
  return { sound, preload: later[0]?.rowId ?? null };
}
