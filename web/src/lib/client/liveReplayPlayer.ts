"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { indexAt, positionAt, type Replay } from "@/lib/liveReplay";
import type { FeedStream, LiveStream } from "@/lib/live";

// Playing a live session back. The replay has its own clock (seconds into
// the session) that plays, pauses and seeks; at any moment it hands the
// follower (liveSync.ts) a stage state that looks exactly like the live
// one did, so the stems are played the same way they were on the night.

const TICK_MS = 250;

export type ReplayClock = {
  /** Seconds into the session, as last rendered. */
  t: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  /** The replay's clock in ms, standing in for the server's. */
  now: () => number;
  /** The stage as it was at `t`, for the follower. */
  stream: FeedStream | null;
};

export function useReplayClock(replay: Replay | null, stream: LiveStream): ReplayClock {
  const clock = useRef({ base: 0, wall: 0, playing: false });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Bumped on every play, pause and seek: the follower re-syncs on a new version. */
  const [epoch, setEpoch] = useState(0);
  /** Where the clock was last set (played, paused or sought). */
  const [base, setBase] = useState(0);
  const duration = replay?.duration ?? 0;

  const read = useCallback(() => {
    const c = clock.current;
    return c.playing ? c.base + (performance.now() - c.wall) / 1000 : c.base;
  }, []);
  const now = useCallback(() => read() * 1000, [read]);

  const set = useCallback((base: number, on: boolean) => {
    clock.current = { base: Math.max(0, Math.min(duration, base)), wall: performance.now(), playing: on };
    setT(clock.current.base);
    setBase(clock.current.base);
    setPlaying(on);
    setEpoch((e) => e + 1);
  }, [duration]);

  const play = useCallback(() => set(read() >= duration - 0.5 ? 0 : read(), true), [set, read, duration]);
  const pause = useCallback(() => set(read(), false), [set, read]);
  const seek = useCallback((to: number) => set(to, clock.current.playing), [set]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const at = read();
      if (at >= duration) set(duration, false);
      else setT(at);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, read, set, duration]);

  const states = replay?.states;
  const row = states ? indexAt(states, t) : -1;
  const synth = useMemo<FeedStream | null>(() => {
    if (!states?.length) return null;
    const entry = states[Math.max(0, row)];
    // Before the first state the stage is idle; paused, it's frozen where the replay stands.
    const state =
      row < 0
        ? { playing: false, position: 0, lanes: entry.state.lanes }
        : playing
          ? entry.state
          : { ...entry.state, playing: false, position: positionAt(states, base) };
    const stateAt = row < 0 || !playing ? base * 1000 : entry.t * 1000;
    return {
      status: "live",
      mode: stream.mode,
      mixVersion: 0,
      title: stream.title,
      remixId: entry.remixId ?? stream.remix_id,
      state,
      stateAt,
      stateVersion: epoch * 1_000_000 + row + 1,
      modVersion: 0,
      chatMode: "off",
      slowMode: 0,
      pinned: null,
      viewers: 0,
      peak: stream.peak_viewers,
      hostAway: false,
      reactions: {},
    };
    // `epoch` covers every change of the clock; `row` every change of the stage.
  }, [states, row, epoch, playing, base, stream]);

  return { t, playing, play, pause, seek, now, stream: synth };
}
