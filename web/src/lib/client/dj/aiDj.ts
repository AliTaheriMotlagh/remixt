"use client";

// The AI DJ for back-to-back sets: it plays one deck. While your deck plays
// on its own, it picks a demo song that fits (closest tempo, then key),
// cues it on the first beat in its headphones, waits for your next phrase
// line, starts it synced with its low cut, swaps the bass half way and
// takes the crossfader over 16 bars. Then it's your turn. Driven by tick()
// from the session's timer; it only uses the engine's public controls.

import type { DjEngine } from "./djEngine";
import { beatIndex } from "./djControls";
import { DJ_TRACKS } from "./djTrackInfo";
import type { LoadedTrack } from "./djTracks";
import { keyFit, type MusicalKey } from "../musicKey";
import { tempoGap } from "./djLibrary";
import { otherDeck, type DeckId } from "./djTypes";

type Phase = "idle" | "loading" | "ready" | "blending" | "done";

export class AiDj {
  readonly deck: DeckId;
  private phase: Phase = "idle";
  private solo = 0;
  private blendStart = 0;
  private startBeat = 0;
  private played = new Set<string>();
  status = "The AI DJ is listening to your track.";

  constructor(
    private readonly engine: DjEngine,
    deck: DeckId,
    private readonly load: (id: string) => Promise<LoadedTrack>
  ) {
    this.deck = deck;
  }

  tick(dt: number) {
    const e = this.engine;
    const me = this.deck;
    const you = otherDeck(me);
    const snap = e.snapshot();
    const mine = snap.decks[me];
    const yours = snap.decks[you];
    if (yours.track) this.played.add(yours.track.id);

    switch (this.phase) {
      case "idle":
      case "done": {
        // Your turn finished when you've taken the crossfader back and my deck is quiet.
        if (this.phase === "done") {
          const onYou = me === "B" ? snap.mix.crossfader < -0.6 : snap.mix.crossfader > 0.6;
          if (!onYou || !yours.playing) return;
          if (mine.playing) e.pause(me);
          this.phase = "idle";
          this.solo = 0;
        }
        if (yours.playing && yours.track) this.solo += dt;
        else this.solo = 0;
        if (this.solo > 16) void this.prepare(yours.track!.bpm * yours.rate, yours.track!);
        return;
      }
      case "ready": {
        if (!yours.playing || !yours.track || !mine.track) return;
        // Wait for your next phrase line (32 beats), then go.
        const b = beatIndex(yours.track, yours.position);
        const toLine = 32 - (((b % 32) + 32) % 32);
        const beatSec = 60 / (yours.track.bpm * yours.rate);
        if (toLine * beatSec < 0.12) {
          e.play(me);
          e.sync(me);
          this.blendStart = snap.time;
          this.startBeat = b;
          this.phase = "blending";
          this.status = "The AI DJ is mixing in on the phrase.";
        } else this.status = `The AI DJ will start on your next phrase line (${Math.ceil(toLine)} beats).`;
        return;
      }
      case "blending": {
        if (!yours.track) return;
        const beats = beatIndex(yours.track, yours.position) - this.startBeat;
        const p = Math.max(0, Math.min(1, beats / 64));
        const side = me === "B" ? 1 : -1;
        e.setCrossfader(side * (-1 + 2 * Math.min(1, p * 1.6)));
        if (p > 0.5 && mine.kill.low) {
          e.setKill(you, "low", true);
          e.setKill(me, "low", false);
          this.status = "Bass swapped.";
        }
        if (p >= 1) {
          e.setKill(you, "low", false);
          e.setPfl(me, false);
          this.phase = "done";
          this.status = "Your turn: load a new track on your deck and mix it in.";
        }
        return;
      }
      default:
        return;
    }
  }

  private async prepare(bpm: number, playing: { id: string; key: MusicalKey }) {
    this.phase = "loading";
    this.status = "The AI DJ is choosing a track…";
    const pick = DJ_TRACKS.filter((t) => !this.played.has(t.id) && t.id !== playing.id)
      .map((t) => {
        const fit = keyFit(t.key, playing.key);
        const keyScore = fit === "same" || fit === "relative" ? 0 : fit === "neighbour" ? 0.02 : fit === "far" ? 0.06 : 0.12;
        return { t, s: tempoGap(t.bpm, bpm) + keyScore };
      })
      .sort((a, b) => a.s - b.s)[0]?.t;
    if (!pick) {
      this.phase = "done";
      this.status = "The AI DJ has run out of tracks. Keep going!";
      return;
    }
    try {
      const track = await this.load(pick.id);
      const e = this.engine;
      e.loadTrack(this.deck, track);
      e.setTempoRange(this.deck, 16);
      e.setVolume(this.deck, 0.8);
      e.setKill(this.deck, "low", true);
      e.setPfl(this.deck, true);
      e.sync(this.deck);
      this.played.add(pick.id);
      this.phase = "ready";
      this.status = `The AI DJ has cued ${track.info.title} (${track.info.camelot}).`;
    } catch {
      this.phase = "idle";
      this.solo = 0;
    }
  }
}
