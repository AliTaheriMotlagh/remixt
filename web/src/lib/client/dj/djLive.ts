"use client";

import { djOnAir, type DjLiveDeck, type DjLiveStage } from "@/lib/liveDj";
import type { DjEngine } from "./djEngine";
import type { DeckState, DjSnapshot } from "./djTypes";

// DJing live, the host's side: the decks are described (lib/liveDj.ts) and
// sent through the live session's stage state a moment after each change,
// plus a keyframe every few seconds so listeners who drift catch up.

const CHANGE_DELAY_MS = 120;
const KEYFRAME_PLAYING_MS = 3000;
const KEYFRAME_IDLE_MS = 8000;

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

function deckOf(d: DeckState): DjLiveDeck {
  const t = d.track;
  return {
    id: t?.id ?? null,
    title: t?.title ?? "",
    artist: t?.artist ?? "",
    ...(t?.coverStemId ? { cover: t.coverStemId } : {}),
    bpm: t ? round(t.bpm, 2) : 0,
    camelot: t?.camelot ?? "",
    duration: t ? round(t.duration, 2) : 0,
    playing: !!t && d.playing,
    position: round(d.position),
    rate: round(d.rate, 5),
    keyLock: d.keyLock,
    volume: round(d.volume),
    eq: { low: round(d.eq.low, 1), mid: round(d.eq.mid, 1), high: round(d.eq.high, 1) },
    kill: { ...d.kill },
    filter: round(d.filter),
    stems: { ...d.stems },
    trim: round(d.trim, 1),
    loop: d.loop.active ? { start: round(d.loop.start), end: round(d.loop.end) } : null,
  };
}

/** The decks as the room needs them. */
export function djStageOf(s: DjSnapshot, set?: string | null): DjLiveStage {
  return {
    decks: { A: deckOf(s.decks.A), B: deckOf(s.decks.B) },
    crossfader: round(s.mix.crossfader),
    curve: s.mix.curve,
    faderCurve: s.mix.faderCurve,
    fx: { echo: s.fx.echo ?? 0, reverb: s.fx.reverb ?? 0, horn: s.fx.horn ?? 0 },
    ...(set ? { set: set.slice(0, 60) } : {}),
  };
}

/** Everything but the playheads: a change here is worth sending at once. */
const shapeOf = (stage: DjLiveStage) => JSON.stringify({ ...stage, decks: { A: { ...stage.decks.A, position: 0 }, B: { ...stage.decks.B, position: 0 } } });

/**
 * Broadcasts the decks to live session `streamId` until the returned
 * function is called. `setName` says which set the Auto DJ is playing.
 */
export function startDjBroadcast(streamId: string, engine: DjEngine, setName: () => string | null = () => null): () => void {
  let stopped = false;
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  let keyframe: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  let again = false;
  let lastShape = "";
  let lastPlaying = false;

  async function send() {
    changeTimer = null;
    if (stopped) return;
    if (sending) {
      again = true;
      return;
    }
    sending = true;
    try {
      const stage = djStageOf(engine.snapshot(), setName());
      lastShape = shapeOf(stage);
      const onAir = djOnAir(stage);
      lastPlaying = stage.decks.A.playing || stage.decks.B.playing;
      await fetch(`/api/live/${streamId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playing: lastPlaying,
          // The deck the room hears most: what the stage clock and the dance floor follow.
          position: onAir ? stage.decks[onAir].position : 0,
          lanes: [],
          dj: stage,
        }),
      });
    } catch {
      // The next keyframe catches up.
    } finally {
      sending = false;
      if (again && !stopped) {
        again = false;
        void send();
      }
    }
  }

  // Every control the host touches makes the engine publish; a seek or a
  // new song shows as a different shape or a jump, sent straight away.
  let lastPositions = { A: 0, B: 0 };
  let lastAt = performance.now();
  const unsubscribe = engine.subscribe(() => {
    if (stopped) return;
    const s = engine.getUi();
    const stage = djStageOf(s, setName());
    const now = performance.now();
    const elapsed = (now - lastAt) / 1000;
    const jumped = (["A", "B"] as const).some((id) => {
      const d = stage.decks[id];
      const expected = lastPositions[id] + (d.playing ? elapsed * d.rate : 0);
      return Math.abs(d.position - expected) > 0.5;
    });
    lastPositions = { A: stage.decks.A.position, B: stage.decks.B.position };
    lastAt = now;
    if ((jumped || shapeOf(stage) !== lastShape) && !changeTimer) changeTimer = setTimeout(() => void send(), CHANGE_DELAY_MS);
  });

  const tick = () => {
    void send();
    keyframe = setTimeout(tick, lastPlaying ? KEYFRAME_PLAYING_MS : KEYFRAME_IDLE_MS);
  };
  tick();

  return () => {
    stopped = true;
    unsubscribe();
    for (const t of [changeTimer, keyframe]) if (t) clearTimeout(t);
  };
}
