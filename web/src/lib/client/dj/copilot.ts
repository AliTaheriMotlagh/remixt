// The Co-pilot: reads the live decks and says, in plain language, what
// to do next. Pure: give it a snapshot and it returns hints, most
// important first.

import { derive } from "./djDerived";
import type { DeckId, DjSnapshot } from "./djTypes";

export type HintLevel = "warn" | "tip" | "good";
export type Hint = { id: string; level: HintLevel; text: string };

const deckName = (d: DeckId) => `Deck ${d}`;

export function liveHints(snap: DjSnapshot, missionHint?: string | null): Hint[] {
  const d = derive(snap);
  const { A, B } = snap.decks;
  const hints: Hint[] = [];
  const add = (id: string, level: HintLevel, text: string) => hints.push({ id, level, text });

  if (missionHint) add("mission", "tip", missionHint);

  if (!A.track || !B.track) {
    add("load", "tip", `Load a track on ${!A.track ? "Deck A" : "Deck B"} (the Load button) to start mixing.`);
  } else if (!A.playing && !B.playing) {
    add("play", "tip", "Nothing is playing. Press PLAY on a deck.");
  }

  for (const id of ["A", "B"] as DeckId[]) {
    const deck = snap.decks[id];
    if (deck.track && deck.playing && deck.volume < 0.15) add(`vol-${id}`, "tip", `${deckName(id)} is playing but its channel fader is down, so it is silent.`);
    if (deck.track && deck.playing && d.audible[id] && deck.stems.vocal && deck.stems.drums && deck.stems.bass && deck.stems.chords) add(`silent-${id}`, "tip", `Every stem on ${deckName(id)} is killed: nothing will play.`);
  }

  if (d.bothPlaying) {
    const other = d.adjust === "A" ? "B" : "A";
    if (Math.abs(d.tempoDiff) > 0.5) {
      const slow = d.adjust === "B" ? d.tempoDiff > 0 : d.tempoDiff < 0;
      add(
        "tempo",
        "warn",
        `${deckName(d.adjust)} is ${Math.abs(d.tempoDiff).toFixed(1)} BPM ${slow ? "slow" : "fast"} next to ${deckName(other)}. Nudge the pitch fader ${slow ? "up" : "down"}, or press SYNC.`
      );
    } else if (Math.abs(d.phaseMs) > 30) {
      const nudge = d.adjust === "B" ? (d.phaseMs > 0 ? "−" : "+") : d.phaseMs > 0 ? "+" : "−";
      add("phase", "warn", `Tempos match but the beats are ${Math.round(Math.abs(d.phaseMs))} ms apart. Hold ${deckName(d.adjust)}'s nudge ${nudge} briefly.`);
    } else if (d.bothAudible) {
      add("locked", "good", "Locked in: tempo and beats match.");
    }
  }

  if (d.bothAudible) {
    if (d.bassClash) add("bass", "warn", "Both bass lines are open: cut the low EQ on one deck, or swap them.");
    if (d.keyFit === "clash") add("key", "warn", `${d.key?.camelotA} and ${d.key?.camelotB} clash. Keep the blend short, or pick a track with a closer Camelot code.`);
    else if (d.keyFit === "far") add("key", "tip", `${d.key?.camelotA} and ${d.key?.camelotB} are two steps apart: a bit tense. Same code or ±1 is safest.`);
  }

  if (snap.mix.masterLevel > 0.97) add("clip", "warn", "The master is clipping. Turn the master down or pull a channel fader back.");

  for (const id of ["A", "B"] as DeckId[]) {
    const deck = snap.decks[id];
    if (deck.track && deck.playing && deck.position > deck.track.duration - 12 && !deck.loop.active && !(snap.decks[id === "A" ? "B" : "A"].playing)) {
      add(`end-${id}`, "warn", `${deckName(id)} is nearly out of music, and the other deck isn't playing. Start the next track.`);
    }
  }

  const order = { warn: 0, tip: 1, good: 2 } as const;
  return hints.sort((a, b) => (a.id === "mission" ? -1 : b.id === "mission" ? 1 : order[a.level] - order[b.level])).slice(0, 4);
}
