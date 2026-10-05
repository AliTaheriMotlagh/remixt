"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Link2, Pause, Play, Radio, RotateCcw, SkipBack, SkipForward, Square, Users } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { useLiveConnection } from "@/lib/client/liveSync";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { resetHistory } from "@/lib/client/studioHistory";
import { useStudioStore } from "@/lib/client/studioStore";
import type { ChatMode, LiveStream, Recap as RecapData } from "@/lib/live";
import { TITLE_MAX } from "@/lib/liveShared";
import { LiveBadge } from "./LiveRoom";
import LiveChat from "./LiveChat";
import Recap from "./Recap";
import { ReactionBar, ReactionLayer, compactNumber, type ReactionLayerHandle } from "./Reactions";
import { StageClock, StageHeader, StageProgress, formatClock } from "./Stage";

type RemixChoice = { id: string; title: string; lanes: number };

const NOTE_PRESETS = ["Drop incoming 🔥", "Vocals only", "Beat only", "Last chorus", "Request me anything!"];
const PUBLISH_PLAYING_MS = 3000;
const PUBLISH_IDLE_MS = 8000;

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok, data: data as Record<string, unknown> | null, error: res?.ok ? null : ((data as { error?: string } | null)?.error ?? "Couldn't reach the server") };
}

/** The host's whole show: perform, watch the room, run the chat, end it. */
export default function HostConsole({
  stream: initial,
  remixes,
  cover,
}: {
  stream: LiveStream;
  remixes: RemixChoice[];
  cover: string | null;
}) {
  const layer = useRef<ReactionLayerHandle>(null);
  const conn = useLiveConnection(initial.id, {
    isHost: true,
    onReactions: (bursts) => {
      for (const b of bursts) layer.current?.burst(b.emoji, Math.min(b.count, 5));
    },
  });
  const live = conn.stream;
  const status = live?.status ?? initial.status;

  const [remixId, setRemixId] = useState<string | null>(initial.remix_id);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [title, setTitle] = useState(initial.title);

  const lanes = useStudioStore((s) => s.lanes);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const duration = useStudioStore((s) => s.duration);

  // --- Load the remix being performed ---------------------------------------------------
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!remixId || loaded.current === remixId) return;
    let cancelled = false;
    audioEngine.stop();
    setLoadState("loading");
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
        loaded.current = remixId;
        void audioEngine.ensureAllLoaded().catch(() => {});
        setLoadState("ready");
      })
      .catch(() => !cancelled && setLoadState("error"));
    return () => {
      cancelled = true;
    };
  }, [remixId]);

  useEffect(
    () => () => {
      audioEngine.stop();
    },
    []
  );

  // --- Broadcast the performance -----------------------------------------------------------
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  });
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  });
  const publishing = useRef(false);
  const queued = useRef(false);
  const publish = useCallback(async () => {
    if (statusRef.current !== "live" || loaded.current === null) return;
    if (publishing.current) {
      queued.current = true;
      return;
    }
    publishing.current = true;
    try {
      const s = useStudioStore.getState();
      await fetch(`/api/live/${initial.id}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playing: s.isPlaying,
          position: Math.round(s.playhead * 1000) / 1000,
          lanes: s.lanes.map((l) => ({ muted: l.muted, solo: l.solo, volume: Math.round(l.volume * 100) / 100 })),
          note: noteRef.current.trim() || undefined,
        }),
      });
    } catch {
      // The next keyframe will catch up.
    } finally {
      publishing.current = false;
      if (queued.current) {
        queued.current = false;
        void publish();
      }
    }
  }, [initial.id]);

  // Any change to a stem, or play/pause, goes out at once.
  useEffect(() => {
    if (status !== "live") return;
    const signature = (s: ReturnType<typeof useStudioStore.getState>) =>
      JSON.stringify([s.isPlaying, s.lanes.map((l) => [l.muted, l.solo, Math.round(l.volume * 100)])]);
    let last = signature(useStudioStore.getState());
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useStudioStore.subscribe((state) => {
      const next = signature(state);
      if (next === last) return;
      last = next;
      if (timer) return; // faders send a few updates a second, not hundreds
      timer = setTimeout(() => {
        timer = null;
        void publish();
      }, 120);
    });
    // Keyframes: they correct drift and say the host is still here.
    let beat: ReturnType<typeof setTimeout>;
    const tick = () => {
      void publish();
      beat = setTimeout(tick, useStudioStore.getState().isPlaying ? PUBLISH_PLAYING_MS : PUBLISH_IDLE_MS);
    };
    tick();
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      clearTimeout(beat);
    };
  }, [status, publish, remixId, loadState]);

  // Leaving by accident ends nothing, but the room would be left with silence.
  useEffect(() => {
    if (status !== "live") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // --- Controls -------------------------------------------------------------------------------
  async function togglePlay() {
    setError(null);
    if (isPlaying) {
      audioEngine.pause();
      return;
    }
    try {
      await audioEngine.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the audio");
    }
  }

  function seekTo(seconds: number) {
    audioEngine.seek(Math.max(0, Math.min(duration || seconds, seconds)));
    // The seek restarts playback asynchronously; send once it has settled.
    setTimeout(() => void publish(), 250);
  }

  function setLane(laneId: string, patch: { muted?: boolean; solo?: boolean; volume?: number }) {
    useStudioStore.setState((s) => ({ lanes: s.lanes.map((l) => (l.laneId === laneId ? { ...l, ...patch } : l)) }));
  }

  async function chooseRemix(id: string) {
    setError(null);
    if (!id) return;
    const result = await api(`/api/live/${initial.id}`, "PATCH", { remixId: id });
    if (!result.ok) return setError(result.error);
    audioEngine.stop();
    loaded.current = null;
    setRemixId(id);
    conn.refresh();
  }

  async function goLive() {
    setError(null);
    const result = await api(`/api/live/${initial.id}`, "PATCH", { action: "start" });
    if (!result.ok) return setError(result.error);
    conn.refresh();
  }

  async function endSession() {
    setConfirmEnd(false);
    audioEngine.pause();
    const result = await api(`/api/live/${initial.id}`, "PATCH", { action: "end" });
    if (!result.ok) return setError(result.error);
    const detail = await api(`/api/live/${initial.id}`, "GET");
    setRecap((detail.data?.recap as RecapData | null) ?? null);
    conn.refresh();
  }

  async function saveSettings(patch: { title?: string; chatMode?: ChatMode; slowMode?: number }) {
    const result = await api(`/api/live/${initial.id}`, "PATCH", patch);
    if (!result.ok) setError(result.error);
    else conn.refresh();
  }

  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/live/${initial.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — the link is /live/" + initial.id);
    }
  }

  // Elapsed time.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const started = initial.started_at ? new Date(initial.started_at).getTime() : null;
  const elapsed = status === "live" && started && now ? (now - started) / 1000 : 0;

  const reactions = live?.reactions ?? {};
  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const viewers = live?.viewers ?? 0;
  const chosen = remixes.find((r) => r.id === remixId);
  const anySolo = lanes.some((l) => l.solo);

  if (status === "ended") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Recap
          host
          recap={recap ?? { durationSeconds: Math.round(elapsed), peak: live?.peak ?? 0, unique: 0, messages: 0, reactions: totalReactions, topReaction: null, newFollowers: 0, chatters: 0 }}
          title={title}
          remixId={remixId}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/live/new" className="flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
            Plan another session
          </Link>
          <Link href="/live" className="flex h-10 items-center rounded-lg border border-border px-4 text-sm text-muted hover:text-foreground">
            Back to Live
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="touch-targets mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge status={status} />
            <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-strong">Host console</span>
            {status === "live" && <span className="font-mono text-xs tabular-nums text-muted">{formatClock(elapsed)}</span>}
            {conn.offline && <span className="text-xs text-drums">Reconnecting…</span>}
          </div>
          <h1 className="mt-1 truncate text-xl font-bold sm:text-2xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyLink} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted hover:text-foreground">
            <Link2 className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
          </button>
          {status === "scheduled" ? (
            <button
              type="button"
              onClick={goLive}
              className="flex h-10 items-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              <Radio className="h-4 w-4" /> Go live now
            </button>
          ) : confirmEnd ? (
            <span className="flex items-center gap-2 rounded-lg border border-danger/50 px-2 py-1 text-sm">
              End for everyone?
              <button type="button" onClick={endSession} className="rounded bg-danger px-3 py-1.5 text-xs font-semibold text-white">
                End
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="px-2 py-1.5 text-xs text-muted hover:text-foreground">
                Keep going
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="flex h-10 items-center gap-2 rounded-lg border border-danger/60 px-4 text-sm font-semibold text-danger hover:bg-danger/10"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> End session
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Eye className="h-3.5 w-3.5" />} label="Watching now" value={compactNumber(viewers)} />
            <Stat icon={<Users className="h-3.5 w-3.5" />} label="Peak" value={compactNumber(live?.peak ?? 0)} />
            <Stat label="Reactions" value={compactNumber(totalReactions)} />
            <Stat label="Messages" value={compactNumber(conn.chat.length)} hint={conn.chat.length >= 300 ? "latest 300" : undefined} />
          </div>

          {/* Stage + transport */}
          <section aria-label="Performance" className="flex flex-col gap-3">
            <div className="relative">
              <StageHeader
                title={chosen?.title ?? "Pick a track to perform"}
                artist="You"
                cover={cover}
                state={note.trim() ? { playing: isPlaying, position: 0, lanes: [], note: note.trim() } : null}
              >
                <div className="mt-4 flex flex-col gap-2">
                  <StageProgress />
                  <div className="flex items-center justify-between gap-2">
                    <StageClock />
                    <span className="text-[11px] text-muted">
                      {status === "scheduled" ? "Not live yet — warm up with sound check" : isPlaying ? "On air" : "Paused — listeners hear silence"}
                    </span>
                  </div>
                </div>
              </StageHeader>
              <ReactionLayer ref={layer} className="rounded-xl" />
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <select
                value={remixId ?? ""}
                onChange={(e) => chooseRemix(e.target.value)}
                className="input !w-auto min-w-0 flex-1 sm:max-w-xs"
                aria-label="Track to perform"
              >
                <option value="" disabled>
                  {remixes.length ? "Choose a remix…" : "Publish a remix first"}
                </option>
                {remixes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {r.lanes} stems
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => seekTo(useStudioStore.getState().playhead - 10)} disabled={loadState !== "ready"} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-40" aria-label="Back 10 seconds">
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={loadState !== "ready"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                </button>
                <button type="button" onClick={() => seekTo(useStudioStore.getState().playhead + 10)} disabled={loadState !== "ready"} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-40" aria-label="Forward 10 seconds">
                  <SkipForward className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => seekTo(0)} disabled={loadState !== "ready"} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-40" aria-label="Back to the start">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
              <ScrubBar duration={duration} onSeek={seekTo} disabled={loadState !== "ready"} />
              {loadState === "loading" && <span className="text-xs text-muted">Loading stems…</span>}
              {loadState === "error" && <span className="text-xs text-danger">Couldn&apos;t load that remix</span>}
            </div>

            {/* Stems: the performance */}
            {lanes.length > 0 && (
              <div>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stems — what you do here, they hear</h2>
                <ul className="flex flex-col gap-1.5">
                  {lanes.map((lane) => {
                    const on = !lane.muted && (!anySolo || lane.solo);
                    return (
                      <li key={lane.laneId} className={`flex flex-wrap items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 ${on ? "bg-surface-raised" : "bg-surface opacity-60"}`}>
                        <span className="min-w-0 flex-1 basis-32">
                          <span className="block truncate text-sm font-medium">{lane.name ?? lane.trackTitle}</span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted">{lane.kind}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setLane(lane.laneId, { muted: !lane.muted })}
                          aria-pressed={lane.muted}
                          className={`h-9 w-9 rounded-md border text-xs font-bold ${lane.muted ? "border-danger bg-danger/20 text-danger" : "border-border text-muted hover:text-foreground"}`}
                          title="Mute"
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => setLane(lane.laneId, { solo: !lane.solo })}
                          aria-pressed={lane.solo}
                          className={`h-9 w-9 rounded-md border text-xs font-bold ${lane.solo ? "border-drums bg-drums/20 text-drums" : "border-border text-muted hover:text-foreground"}`}
                          title="Solo"
                        >
                          S
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.01}
                          value={lane.volume}
                          onChange={(e) => setLane(lane.laneId, { volume: Number(e.target.value) })}
                          className="w-28 accent-brand sm:w-40"
                          aria-label={`${lane.name ?? lane.trackTitle} level`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Message to the room */}
            <div className="rounded-xl border border-border bg-surface p-3">
              <label htmlFor="stage-note" className="text-xs font-semibold uppercase tracking-wide text-muted">
                On-stage note — shows under the title for everyone
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="stage-note"
                  value={note}
                  maxLength={80}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => void publish()}
                  onKeyDown={(e) => e.key === "Enter" && void publish()}
                  placeholder="Drop incoming 🔥"
                  className="input"
                />
                {note && (
                  <button type="button" onClick={() => { setNote(""); noteRef.current = ""; void publish(); }} className="shrink-0 rounded-lg border border-border px-3 text-sm text-muted hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {NOTE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setNote(preset); noteRef.current = preset; void publish(); }}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Reactions seen */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reactions from the room (tap to send one back)</p>
            <ReactionBar
              totals={reactions}
              onReact={(emoji) => {
                layer.current?.burst(emoji, 1);
                conn.sendReaction(emoji);
              }}
              disabled={status !== "live"}
            />
          </div>

          {/* Audience */}
          <section className="rounded-xl border border-border bg-surface p-3" aria-label="Audience">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Audience · {live?.viewers ?? 0} here now
            </h2>
            {conn.audience && (conn.audience.signedIn.length > 0 || conn.audience.guests > 0) ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {conn.audience.signedIn.map((a) => (
                  <li key={a.id}>
                    <Link href={`/artist/${a.id}`} className="flex items-center gap-1.5 rounded-full bg-surface-raised py-0.5 pl-0.5 pr-2.5 text-xs hover:underline">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: a.color }}>
                        {a.name.slice(0, 1).toUpperCase()}
                      </span>
                      {a.name}
                    </Link>
                  </li>
                ))}
                {conn.audience.guests > 0 && (
                  <li className="rounded-full bg-surface-raised px-2.5 py-1 text-xs text-muted">
                    + {conn.audience.guests} guest{conn.audience.guests === 1 ? "" : "s"}
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Nobody yet — share the link and they&apos;ll show up here.</p>
            )}
          </section>

          {/* Settings */}
          <section className="rounded-xl border border-border bg-surface p-3" aria-label="Session settings">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Session settings</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                Title
                <input
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim().length >= 2 && title !== (live?.title ?? initial.title) && void saveSettings({ title: title.trim() })}
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Who can chat
                <select
                  value={live?.chatMode ?? initial.chat_mode}
                  onChange={(e) => void saveSettings({ chatMode: e.target.value as ChatMode })}
                  className="input"
                >
                  <option value="open">Everyone (guests too)</option>
                  <option value="followers">Followers only</option>
                  <option value="off">Chat off</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Slow mode
                <select
                  value={live?.slowMode ?? initial.slow_mode}
                  onChange={(e) => void saveSettings({ slowMode: Number(e.target.value) })}
                  className="input"
                >
                  <option value={0}>Off</option>
                  <option value={3}>3 seconds</option>
                  <option value={10}>10 seconds</option>
                  <option value={30}>30 seconds</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Keep this tab open and visible while you&apos;re live — it&apos;s what sends your performance to the room. Hover a message in the chat to pin it, hide it, or ban who wrote it.
            </p>
          </section>
        </div>

        <LiveChat
          streamId={initial.id}
          conn={conn}
          signedIn
          isHost
          chatMode={live?.chatMode ?? initial.chat_mode}
          slowMode={live?.slowMode ?? initial.slow_mode}
          pinned={live?.pinned ?? null}
          isFollowing
          className="h-[30rem] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:h-[calc(100dvh-var(--header-h)-2rem)] lg:max-h-[48rem]"
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon?: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        {icon} {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

/** A seek slider that follows the playhead and only seeks when released. */
function ScrubBar({ duration, onSeek, disabled }: { duration: number; onSeek: (s: number) => void; disabled: boolean }) {
  const playhead = useStudioStore((s) => s.playhead);
  const [dragging, setDragging] = useState<number | null>(null);
  return (
    <input
      type="range"
      min={0}
      max={Math.max(1, duration)}
      step={0.1}
      value={dragging ?? Math.min(playhead, Math.max(1, duration))}
      disabled={disabled}
      onChange={(e) => setDragging(Number(e.target.value))}
      onPointerUp={() => {
        if (dragging !== null) onSeek(dragging);
        setDragging(null);
      }}
      onKeyUp={() => {
        if (dragging !== null) onSeek(dragging);
        setDragging(null);
      }}
      className="min-w-32 flex-1 accent-brand"
      aria-label="Seek"
    />
  );
}
