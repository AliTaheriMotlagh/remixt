"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { djDeckPosition, type DjLiveDeckId, type DjLiveStage } from "@/lib/liveDj";
import type { FeedStream } from "@/lib/live";
import { DjEngine } from "./djEngine";
import { loadAnyTrack, retainTracks } from "./djLibraryTracks";

// DJing live, the listener's side: this tab's own decks, playing the same
// songs as the host's, kept in step with them — every fader, knob, cut and
// loop mirrored, and the playheads moved when they drift. Used live (the
// feed's stage) and for replays (the replay clock's stage).

const DECKS: DjLiveDeckId[] = ["A", "B"];
/** Further out of step than this is moved; a little drift is left alone. */
const DRIFT_SECONDS = 0.3;
/** Out of step on this many checks in a row (one odd clock reading isn't enough), at most once per MOVE_GAP_MS. */
const OUT_OF_STEP = 2;
const MOVE_GAP_MS = 4000;
const SYNC_MS = 500;

export type DjFollowStatus = "idle" | "loading" | "ready" | "error";

/** Puts the host's mixer onto `engine` (everything but play, pause and where). */
function applyMixer(engine: DjEngine, stage: DjLiveStage) {
  for (const id of DECKS) {
    const want = stage.decks[id];
    const have = engine.deckState(id);
    if (!have.track || have.track.id !== want.id) continue;
    if (Math.abs(have.rate - want.rate) > 1e-4) {
      if (have.tempoRange < 100) engine.setTempoRange(id, 100);
      engine.setTempoPct(id, (want.rate - 1) * 100);
    }
    if (have.keyLock !== want.keyLock) engine.setKeyLock(id, want.keyLock);
    if (Math.abs(have.volume - want.volume) > 1e-3) engine.setVolume(id, want.volume);
    for (const band of ["low", "mid", "high"] as const) {
      if (Math.abs(have.eq[band] - want.eq[band]) > 0.05) engine.setEq(id, band, want.eq[band]);
      if (have.kill[band] !== want.kill[band]) engine.setKill(id, band, want.kill[band]);
    }
    if (Math.abs(have.filter - want.filter) > 1e-3) engine.setFilter(id, want.filter);
    for (const stem of ["drums", "bass", "chords", "vocal"] as const) {
      if (have.stems[stem] !== want.stems[stem]) engine.setStemKill(id, stem, want.stems[stem]);
    }
    if (Math.abs(have.trim - want.trim) > 0.05) engine.setTrim(id, want.trim);
    if (!want.loop && have.loop.active) engine.setLoop(id, null);
    else if (want.loop) engine.setLoop(id, want.loop);
  }
  const mix = engine.snapshot().mix;
  if (mix.curve !== stage.curve) engine.setCurve(stage.curve);
  if (mix.faderCurve !== stage.faderCurve) engine.setFaderCurve(stage.faderCurve);
  if (Math.abs(mix.crossfader - stage.crossfader) > 1e-3) engine.setCrossfader(stage.crossfader);
}

/**
 * Follows a DJ session's decks. Songs load as soon as the host puts them on
 * (so tuning in is instant); sound starts only once `tuned` (browsers want a
 * tap first — call `unlock` inside it).
 */
export function useDjFollower({
  stream,
  serverNow,
  tuned,
  muted,
  volume,
}: {
  /** The session as the feed (or the replay clock) has it; null when not a DJ session. */
  stream: FeedStream | null;
  serverNow: () => number;
  tuned: boolean;
  muted: boolean;
  volume: number;
}) {
  const stage = stream?.state.dj ?? null;
  const active = !!stream;
  const engineRef = useRef<DjEngine | null>(null);
  const [engine, setEngine] = useState<DjEngine | null>(null);
  const [loaded, setLoaded] = useState<Record<DjLiveDeckId, string | null>>({ A: null, B: null });
  const [failed, setFailed] = useState<string | null>(null);
  const [drift, setDrift] = useState(0);
  const latest = useRef(stream);
  useEffect(() => {
    latest.current = stream;
  });

  // The decks: made once a DJ session is being followed, let go of with the page.
  useEffect(() => {
    if (!active) return;
    let e: DjEngine;
    try {
      e = new DjEngine();
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no audio in this browser is a plain state
      setFailed("Your browser couldn't start audio.");
      return;
    }
    engineRef.current = e;
    setEngine(e);
    return () => {
      engineRef.current = null;
      e.dispose();
      retainTracks([]);
      setEngine(null);
      setLoaded({ A: null, B: null });
    };
  }, [active]);

  // Each deck holds the host's song: loaded (or swapped) as soon as it changes.
  const wantA = stage?.decks.A.id ?? null;
  const wantB = stage?.decks.B.id ?? null;
  const loading = useRef<Record<DjLiveDeckId, string | null>>({ A: null, B: null });
  useEffect(() => {
    if (!engine) return;
    const want = { A: wantA, B: wantB };
    for (const id of DECKS) {
      const trackId = want[id];
      if (!trackId) {
        if (engine.deckTrack(id)) engine.unloadTrack(id);
        loading.current[id] = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the host emptied a deck: this one follows
        setLoaded((l) => (l[id] === null ? l : { ...l, [id]: null }));
        continue;
      }
      if (engine.deckTrack(id)?.info.id === trackId || loading.current[id] === trackId) continue;
      loading.current[id] = trackId;
      loadAnyTrack(trackId, engine.ctx)
        .then((track) => {
          if (engineRef.current !== engine || loading.current[id] !== trackId) return;
          engine.loadTrack(id, track);
          retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
          setLoaded((l) => ({ ...l, [id]: trackId }));
          setFailed(null);
          const s = latest.current?.state.dj;
          if (s) applyMixer(engine, s);
        })
        .catch(() => {
          if (loading.current[id] === trackId) loading.current[id] = null;
          setFailed("Couldn't load the song the DJ is playing.");
        });
    }
  }, [engine, wantA, wantB]);

  // The mixer, every time the host's changes (and the listener's own volume).
  const version = stream?.stateVersion ?? -1;
  useEffect(() => {
    if (!engine) return;
    engine.setMaster(muted ? 0 : Math.min(1, 0.85 * volume));
    const s = latest.current?.state.dj;
    if (s) applyMixer(engine, s);
  }, [engine, version, loaded, muted, volume]);

  // One-shot effects: fired when the host's count goes up (not the ones from before tuning in).
  const fxSeen = useRef<DjLiveStage["fx"] | null>(null);
  useEffect(() => {
    const fx = stage?.fx;
    if (!fx) return;
    const seen = fxSeen.current;
    fxSeen.current = fx;
    if (!engine || !tuned || !seen || !stream?.state.playing) return;
    if (fx.echo > seen.echo) engine.echoOut();
    if (fx.reverb > seen.reverb) engine.reverbThrow();
    if (fx.horn > seen.horn) engine.airHorn();
  }, [engine, tuned, stage?.fx, stream?.state.playing]);

  // Play, pause and the playheads, in step with the host's.
  useEffect(() => {
    if (!engine) return;
    if (!tuned) {
      for (const id of DECKS) engine.pause(id);
      return;
    }
    const out = { A: 0, B: 0 };
    const movedAt = { A: -Infinity, B: -Infinity };
    const sync = () => {
      const s = latest.current;
      const dj = s?.state.dj;
      if (!s || !dj) return;
      const elapsed = Math.max(0, serverNow() - s.stateAt) / 1000;
      let worst = 0;
      for (const id of DECKS) {
        // A paused replay stops every deck, whatever each was doing then.
        const want = { ...dj.decks[id], playing: dj.decks[id].playing && s.state.playing };
        const have = engine.deckState(id);
        if (!have.track || have.track.id !== want.id) continue;
        const target = djDeckPosition(want, elapsed);
        if (!want.playing || s.status !== "live" || target >= have.track.duration - 0.05) {
          if (have.playing) engine.pause(id);
          if (Math.abs(engine.deckPosition(id) - target) > 0.05) engine.seek(id, target);
          continue;
        }
        if (!have.playing) {
          engine.seek(id, target);
          engine.play(id);
          continue;
        }
        const off = engine.deckPosition(id) - target;
        if (Math.abs(off) > Math.abs(worst)) worst = off;
        if (Math.abs(off) <= DRIFT_SECONDS) out[id] = 0;
        else if (++out[id] >= OUT_OF_STEP && performance.now() - movedAt[id] > MOVE_GAP_MS) {
          out[id] = 0;
          movedAt[id] = performance.now();
          engine.seek(id, target);
        }
      }
      setDrift(worst);
    };
    sync();
    const timer = setInterval(sync, SYNC_MS);
    return () => clearInterval(timer);
    // The loop re-reads the latest stage itself; it restarts when the host acts or a song lands.
  }, [engine, tuned, version, loaded, serverNow]);

  const needed = DECKS.filter((id) => stage?.decks[id].id);
  const status: DjFollowStatus = !active
    ? "idle"
    : failed && !needed.some((id) => loaded[id] === stage?.decks[id].id)
      ? "error"
      : needed.length === 0
        ? "idle"
        : needed.some((id) => loaded[id] !== stage?.decks[id].id && stage?.decks[id].playing)
          ? "loading"
          : "ready";

  /** Inside the listener's tap: lets the sound start. */
  const unlock = useCallback(() => engineRef.current?.unlock(), []);

  /** Jump every deck to exactly where the host's is. */
  const resync = useCallback(() => {
    const e = engineRef.current;
    const s = latest.current;
    const dj = s?.state.dj;
    if (!e || !s || !dj) return;
    const elapsed = Math.max(0, serverNow() - s.stateAt) / 1000;
    for (const id of DECKS) {
      const want = { ...dj.decks[id], playing: dj.decks[id].playing && s.state.playing };
      if (e.deckTrack(id)?.info.id === want.id) e.seek(id, djDeckPosition(want, elapsed));
    }
  }, [serverNow]);

  /** The room's sound level now, 0…1 (for the dance floor). */
  const level = useCallback(() => engineRef.current?.levels().master ?? 0, []);

  // `blocked`: the decks start inside the "tune in" tap, so the browser never blocks them.
  return { status, drift, blocked: false, unlock, resync, level, error: failed };
}
