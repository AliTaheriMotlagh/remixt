"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { visitorId } from "./presence";
import { audioEngine } from "./audioEngine";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "./remixLanes";
import { resetHistory } from "./studioHistory";
import { useStudioStore } from "./studioStore";
import type { Audience, Feed, FeedStream, LiveEvent, LiveStageState } from "@/lib/live";

// The client half of a live session (lib/live.ts): a polling loop that
// keeps chat, counts and the host's stage state fresh, a clock that agrees
// with the server's, and — for listeners — the follower that plays the
// host's remix in step with them.

const FAST_MS = 1500;
const HOST_MS = 1200;
const HIDDEN_MS = 6000;
const CHAT_KEEP = 300;
/** Listeners report in as viewers every this many polls. */
const HEARTBEAT_EVERY = 4;

export type LiveReactionBurst = { id: number; emoji: string; count: number };

export type LiveFeedState = {
  stream: FeedStream | null;
  chat: LiveEvent[];
  audience: Audience | null;
  banned: boolean;
  /** The server has no such session (or it was removed). */
  missing: boolean;
  /** Polling is failing: shown as "reconnecting…". */
  offline: boolean;
};

export type LiveConnection = LiveFeedState & {
  /** The server's clock now, in ms. */
  serverNow: () => number;
  sendChat: (body: string, guestName?: string) => Promise<string | null>;
  sendReaction: (emoji: string) => void;
  /** Poll again straight away (after the host changed something). */
  refresh: () => void;
  /** Messages the host has hidden, applied locally at once. */
  dropLocal: (eventId: number) => void;
};

/**
 * Follows a live session: polls the feed, merges chat, plays incoming
 * reactions through `onReactions`. Stops when the session ends.
 */
export function useLiveConnection(
  streamId: string,
  {
    isHost,
    initialChat = [],
    onReactions,
  }: { isHost: boolean; initialChat?: LiveEvent[]; onReactions?: (bursts: LiveReactionBurst[]) => void }
): LiveConnection {
  const [state, setState] = useState<LiveFeedState>({
    stream: null,
    chat: initialChat,
    audience: null,
    banned: false,
    missing: false,
    offline: false,
  });
  const sessionId = useRef<string>("");
  const after = useRef(0);
  const modVersion = useRef(-1);
  const clockOffset = useRef(0);
  const bestRtt = useRef(Infinity);
  const wake = useRef<(() => void) | null>(null);
  const reactionsRef = useRef(onReactions);
  const pending = useRef<Record<string, number>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    reactionsRef.current = onReactions;
  });

  useEffect(() => {
    sessionId.current = visitorId();
    let cancelled = false;
    let polls = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const heartbeat = !isHost && polls++ % HEARTBEAT_EVERY === 0;
      const sent = Date.now();
      let delay = isHost ? HOST_MS : FAST_MS;
      try {
        const params = new URLSearchParams({
          sid: sessionId.current,
          after: String(after.current),
          mv: String(modVersion.current),
          hb: heartbeat ? "1" : "0",
        });
        const res = await fetch(`/api/live/${streamId}/feed?${params}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setState((s) => ({ ...s, missing: true }));
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const feed = (await res.json()) as Feed;
        if (cancelled) return;
        failures = 0;

        // Agree with the server's clock: the reading with the shortest
        // round trip is the most trustworthy one.
        const rtt = Date.now() - sent;
        if (rtt <= bestRtt.current * 1.5 + 20) {
          clockOffset.current = feed.now + rtt / 2 - Date.now();
          bestRtt.current = Math.min(bestRtt.current * 1.2 + 5, rtt);
        }

        const chatEvents: LiveEvent[] = [];
        const bursts: LiveReactionBurst[] = [];
        for (const event of feed.events) {
          after.current = Math.max(after.current, event.id);
          if (event.kind === "reaction") {
            if (!event.mine) bursts.push({ id: event.id, emoji: event.body, count: event.count });
          } else chatEvents.push(event);
        }
        if (bursts.length) reactionsRef.current?.(bursts);

        const hiddenSet = new Set(feed.hidden);
        const refreshHidden = feed.hidden.length > 0 || feed.stream.modVersion !== modVersion.current;
        modVersion.current = feed.stream.modVersion;
        setState((s) => {
          let chat = s.chat;
          if (refreshHidden) chat = chat.filter((e) => !hiddenSet.has(e.id));
          if (chatEvents.length) {
            const known = new Set(chat.map((e) => e.id));
            chat = [...chat, ...chatEvents.filter((e) => !known.has(e.id) && !hiddenSet.has(e.id))].slice(-CHAT_KEEP);
          }
          return {
            stream: feed.stream,
            chat,
            audience: feed.audience ?? s.audience,
            banned: feed.you.banned,
            missing: false,
            offline: false,
          };
        });
        if (feed.stream.status === "ended") return; // nothing more will happen
        if (document.visibilityState !== "visible") delay = HIDDEN_MS;
      } catch {
        failures++;
        if (!cancelled) setState((s) => ({ ...s, offline: failures >= 2 }));
        delay = Math.min(10_000, 1500 * 2 ** Math.min(failures, 3));
      }
      if (cancelled) return;
      timer = setTimeout(poll, delay);
    }

    wake.current = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    const onVisible = () => document.visibilityState === "visible" && wake.current?.();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      wake.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [streamId, isHost]);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  const sendChat = useCallback(
    async (body: string, guestName?: string) => {
      const res = await fetch(`/api/live/${streamId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: sessionId.current, body, name: guestName }),
      }).catch(() => null);
      if (!res) return "Couldn't reach the server";
      if (!res.ok) return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't send that";
      wake.current?.();
      return null;
    },
    [streamId]
  );

  // Taps are batched: a fast tapper makes one request every few hundred ms.
  const sendReaction = useCallback(
    (emoji: string) => {
      pending.current[emoji] = (pending.current[emoji] ?? 0) + 1;
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        const batch = pending.current;
        pending.current = {};
        for (const [e, count] of Object.entries(batch)) {
          void fetch(`/api/live/${streamId}/react`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sid: sessionId.current, emoji: e, count }),
          }).catch(() => {});
        }
      }, 350);
    },
    [streamId]
  );

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    []
  );

  const refresh = useCallback(() => wake.current?.(), []);
  const dropLocal = useCallback(
    (eventId: number) => setState((s) => ({ ...s, chat: s.chat.filter((e) => e.id !== eventId) })),
    []
  );

  return { ...state, serverNow, sendChat, sendReaction, refresh, dropLocal };
}

// --- Listening along ------------------------------------------------------------------------

/** Where the host is in the remix right now, on the server's clock. */
export function hostPosition(state: LiveStageState, stateAt: number, serverNow: number) {
  return state.position + (state.playing ? Math.max(0, serverNow - stateAt) / 1000 : 0);
}

/** Listeners further out of step than this are moved; a little drift is left alone. */
const DRIFT_SECONDS = 0.35;

export type FollowStatus = "idle" | "loading" | "ready" | "error";

/**
 * Plays the host's remix in step with them. Loads the remix's stems into
 * the Studio's engine, then mirrors the host's play/pause, playhead and
 * each stem's mute/solo/volume — but only once the listener has pressed
 * "tune in" (browsers don't allow sound before a tap).
 */
export function useLiveFollower({
  remixId,
  stream,
  serverNow,
  tuned,
  muted,
  volume,
}: {
  remixId: string | null;
  stream: FeedStream | null;
  serverNow: () => number;
  tuned: boolean;
  muted: boolean;
  volume: number;
}) {
  const [status, setStatus] = useState<FollowStatus>("idle");
  const [blocked, setBlocked] = useState(false);
  const [drift, setDrift] = useState(0);
  const loadedRemix = useRef<string | null>(null);
  const latest = useRef(stream);
  useEffect(() => {
    latest.current = stream;
  });

  // Load (or swap) the remix the host is performing.
  useEffect(() => {
    if (!remixId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load is a plain state
      setStatus("idle");
      return;
    }
    if (loadedRemix.current === remixId) return;
    let cancelled = false;
    audioEngine.stop();
    setStatus("loading");
    fetch(`/api/remixes/${remixId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("no remix"))))
      .then((data) => {
        if (cancelled) return;
        useStudioStore
          .getState()
          .loadRemix((data.lanes as RemixLaneApi[]).map(laneFromApi), projectFromApi(data.remix), {
            id: remixId,
            title: data.remix.title,
          });
        resetHistory();
        loadedRemix.current = remixId;
        // Fetch the stems now, so pressing play later is instant.
        void audioEngine.ensureAllLoaded().catch(() => {});
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [remixId]);

  useEffect(
    () => () => {
      audioEngine.stop();
      loadedRemix.current = null;
    },
    []
  );

  // Mirror the host's stems (mute/solo/level), and the listener's own volume.
  const version = stream?.stateVersion ?? -1;
  useEffect(() => {
    if (status !== "ready" || !stream) return;
    const { lanes, setMasterVolume } = useStudioStore.getState();
    const theirs = stream.state.lanes;
    useStudioStore.setState({
      lanes: lanes.map((lane, i) =>
        theirs[i] ? { ...lane, muted: theirs[i].muted, solo: theirs[i].solo, volume: theirs[i].volume } : lane
      ),
    });
    setMasterVolume?.(muted ? 0 : volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, version, muted, volume]);

  // Keep the playhead and play/pause with the host's.
  useEffect(() => {
    if (status !== "ready" || !stream || !tuned) {
      if (tuned === false && useStudioStore.getState().isPlaying) audioEngine.pause();
      return;
    }
    let cancelled = false;
    let busy = false;

    async function sync() {
      const stream = latest.current;
      if (busy || cancelled || !stream) return;
      busy = true;
      try {
        const store = useStudioStore.getState();
        const target = hostPosition(stream.state, stream.stateAt, serverNow());
        const length = store.duration || Infinity;
        if (!stream.state.playing || stream.status !== "live" || target >= length) {
          if (store.isPlaying) audioEngine.pause();
          if (Math.abs(store.playhead - Math.min(target, length)) > 0.05) audioEngine.seek(Math.min(target, length));
          setDrift(0);
          return;
        }
        if (!store.isPlaying) {
          audioEngine.seek(target);
          try {
            await audioEngine.play();
            setBlocked(false);
          } catch {
            setBlocked(true);
          }
          return;
        }
        const off = store.playhead - target;
        setDrift(off);
        if (Math.abs(off) > DRIFT_SECONDS) audioEngine.seek(target + 0.1);
      } finally {
        busy = false;
      }
    }
    void sync();
    const timer = setInterval(sync, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // The follower re-reads the latest stream each second; it restarts when the host acts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tuned, version, serverNow]);

  const resync = useCallback(() => {
    if (!stream) return;
    const target = hostPosition(stream.state, stream.stateAt, serverNow());
    audioEngine.seek(target);
  }, [stream, serverNow]);

  return { status, blocked, drift, resync };
}
