"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { History, Link2, Pause, Play, Shield, Volume2, VolumeX } from "lucide-react";
import FollowButton from "@/components/FollowButton";
import { audioEngine } from "@/lib/client/audioEngine";
import { useLiveFollower } from "@/lib/client/liveSync";
import { useReplayClock } from "@/lib/client/liveReplayPlayer";
import { applyLiveMix, type LiveMix } from "@/lib/client/liveStudio";
import { describeMixChanges } from "@/lib/client/liveStudioDiff";
import { useStudioStore } from "@/lib/client/studioStore";
import type { LiveStream, Recap as RecapData } from "@/lib/live";
import { indexAt, type Replay } from "@/lib/liveReplay";
import type { FollowState } from "@/lib/social";
import { LiveBadge } from "./LiveRoom";
import Recap from "./Recap";
import { ReactionLayer, type ReactionLayerHandle } from "./Reactions";
import ReadOnlyStudio, { type StudioActivity } from "./ReadOnlyStudio";
import { StageHeader, StemStrips, formatClock } from "./Stage";

const VOLUME_KEY = "remixt_live_volume";
const HEAT_BINS = 60;

/** Chat and reactions over the session, as bars: where the room got loud. Tapping one jumps there. */
function Heat({ replay, t, onSeek }: { replay: Replay; t: number; onSeek: (t: number) => void }) {
  const bins = useMemo(() => {
    const out = new Array<number>(HEAT_BINS).fill(0);
    const d = Math.max(1, replay.duration);
    for (const c of replay.chat) out[Math.min(HEAT_BINS - 1, Math.floor((c.t / d) * HEAT_BINS))] += 2;
    for (const r of replay.reactions) out[Math.min(HEAT_BINS - 1, Math.floor((r.t / d) * HEAT_BINS))] += r.count;
    const max = Math.max(1, ...out);
    return out.map((v) => v / max);
  }, [replay]);
  if (!replay.chat.length && !replay.reactions.length) return null;
  const at = replay.duration > 0 ? t / replay.duration : 0;
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {bins.map((v, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          onClick={() => onSeek((i / HEAT_BINS) * replay.duration)}
          className={`min-w-0 flex-1 rounded-t-sm transition-colors ${i / HEAT_BINS <= at ? "bg-brand" : "bg-brand/30 hover:bg-brand/60"}`}
          style={{ height: `${Math.max(8, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** An ended session, played back: the stems as the host played them, the studio as it changed, the chat as it was said. */
export default function LiveReplay({
  stream,
  cover,
  follow,
  userId,
  recap,
}: {
  stream: LiveStream;
  cover: string | null;
  follow: FollowState;
  userId: string | null;
  recap: RecapData;
}) {
  const studio = stream.mode === "studio";
  const [replay, setReplay] = useState<Replay | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/live/${stream.id}/replay`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Replay) => !cancelled && setReplay(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [stream.id]);

  const clock = useReplayClock(replay, stream);
  const [tuned, setTuned] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(VOLUME_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved level is only known in the browser
      if (saved > 0 && saved <= 1.5) setVolume(saved);
    } catch {
      // Storage blocked: the default level it is.
    }
  }, []);

  // Studio sessions: the mix as it stood at this point, fetched when the replay gets there.
  const [studioReady, setStudioReady] = useState(false);
  const [activity, setActivity] = useState<StudioActivity[]>([]);
  const mixes = replay?.mixes ?? [];
  const mixIndex = mixes.length ? Math.max(0, indexAt(mixes, clock.t)) : -1;
  const mixId = mixIndex >= 0 ? mixes[mixIndex].id : null;
  const lastMix = useRef<LiveMix | null>(null);
  const bodies = useRef(new Map<number, unknown>());
  const activityId = useRef(0);
  useEffect(() => {
    if (!studio || mixId === null) return;
    let cancelled = false;
    const cached = bodies.current.get(mixId);
    const body = cached !== undefined ? Promise.resolve(cached) : fetch(`/api/live/${stream.id}/replay?mix=${mixId}`).then((res) => (res.ok ? res.json() : null));
    void body.then((raw) => {
      if (cancelled || !raw) return;
      bodies.current.set(mixId, raw);
      const applied = applyLiveMix(raw);
      if (!applied) return;
      const lines = describeMixChanges(lastMix.current, applied);
      lastMix.current = applied;
      setStudioReady(true);
      if (lines.length) {
        const at = (mixes[mixIndex]?.t ?? 0) * 1000;
        setActivity((list) => [...lines.map((text) => ({ id: activityId.current++, text, at })).reverse(), ...list].slice(0, 80));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mix the replay reaches
  }, [studio, mixId, stream.id]);

  const follower = useLiveFollower({
    remixId: !studio ? (clock.stream?.remixId ?? null) : null,
    stream: clock.stream,
    serverNow: clock.now,
    tuned,
    muted,
    volume,
    studioReady: studio ? studioReady : undefined,
  });
  const lanes = useStudioStore((s) => s.lanes);

  // Reactions burst on screen as the replay passes them.
  const layer = useRef<ReactionLayerHandle>(null);
  const lastT = useRef(0);
  useEffect(() => {
    const from = lastT.current;
    lastT.current = clock.t;
    if (!replay || !clock.playing || clock.t < from || clock.t - from > 2) return;
    for (const r of replay.reactions) if (r.t > from && r.t <= clock.t) layer.current?.burst(r.emoji, Math.min(r.count, 2));
  }, [clock.t, clock.playing, replay]);

  const chat = useMemo(() => {
    if (!replay) return [];
    // Nothing to play back (an older session): the whole chat, as it was.
    if (!replay.states.length && !replay.mixes.length) return replay.chat.slice(-200);
    const upTo = indexAt(replay.chat, clock.t);
    return replay.chat.slice(Math.max(0, upTo - 199), upTo + 1);
  }, [replay, clock.t]);
  const chatBox = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = chatBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat.length]);

  async function toggle() {
    if (clock.playing) return clock.pause();
    if (!tuned) {
      // Inside the tap, so phones let the sound start.
      await audioEngine.prepareAudio().catch(() => {});
      setTuned(true);
    }
    clock.play();
  }

  function changeVolume(next: number) {
    setVolume(next);
    setMuted(false);
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // Not remembered; fine.
    }
  }

  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      if (navigator.share) await navigator.share({ title: stream.title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Cancelled share sheet, or no clipboard access.
    }
  }

  const has = !!replay && (replay.states.length > 0 || replay.mixes.length > 0);
  const duration = replay?.duration ?? recap.durationSeconds;
  const loading = has && follower.status === "loading";
  const audible = !!clock.stream?.state.playing && clock.playing;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge status="ended" />
            {has && (
              <span className="flex items-center gap-1 rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-strong">
                <History className="h-3 w-3" /> Replay
              </span>
            )}
            {stream.ended_at && <span className="text-xs text-muted">{new Date(stream.ended_at).toLocaleDateString()}</span>}
          </div>
          <h1 className="mt-1.5 text-xl font-bold sm:text-2xl">{stream.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Link href={`/artist/${stream.host_id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:underline">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: stream.host_color }}>
                {stream.host_name.slice(0, 1).toUpperCase()}
              </span>
              {stream.host_name}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FollowButton artistId={stream.host_id} initial={follow} signedIn={!!userId} isSelf={userId === stream.host_id} />
          <button type="button" onClick={copyLink} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted hover:text-foreground">
            <Link2 className="h-4 w-4" /> {copied ? "Link copied" : "Share"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {has ? (
            <section aria-label="Replay" className="flex flex-col gap-3">
              <div className="relative">
                <StageHeader
                  title={studio ? "Making a remix live in the Studio" : (clock.stream?.remixId === stream.remix_id ? (stream.remix_title ?? "Live set") : "Live set")}
                  artist={stream.host_name}
                  cover={cover}
                  state={clock.stream?.state ?? null}
                >
                  <div className="mt-4 flex flex-col gap-2">
                    {replay && <Heat replay={replay} t={clock.t} onSeek={clock.seek} />}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, duration)}
                      step={1}
                      value={Math.min(clock.t, duration)}
                      onChange={(e) => clock.seek(Number(e.target.value))}
                      className="w-full accent-brand"
                      aria-label="Position in the session"
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="font-mono tabular-nums">
                        {formatClock(clock.t)} / {formatClock(duration)}
                      </span>
                      <span aria-live="polite">
                        {loading ? "Loading the stems…" : !clock.playing ? "Paused" : audible ? "Playing as it happened" : "The host was between tracks here"}
                      </span>
                    </div>
                  </div>
                </StageHeader>
                <ReactionLayer ref={layer} className="z-10 rounded-xl" />
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <button
                  type="button"
                  onClick={() => void toggle()}
                  disabled={follower.status === "error"}
                  className="flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
                >
                  {clock.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {follower.status === "error" ? "Couldn't load the track" : clock.playing ? "Pause" : clock.t > 0 ? "Resume" : "Play the replay"}
                </button>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
                  aria-label={muted ? "Unmute" : "Mute"}
                  aria-pressed={muted}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="w-28 accent-brand sm:w-40"
                  aria-label="Volume"
                />
                {follower.blocked && <span className="text-[11px] text-drums">Tap play — your browser blocked the sound</span>}
              </div>

              {studio ? (
                <ReadOnlyStudio activity={activity} />
              ) : (
                lanes.length > 0 && (
                  <div>
                    <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stems — as the host played them</h2>
                    <StemStrips lanes={lanes} playing={audible} />
                  </div>
                )
              )}
            </section>
          ) : (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              {failed || replay ? "There's no replay of this session — it ended before replays were kept, or nothing was played." : "Loading the replay…"}
            </p>
          )}

          <Recap recap={recap} title={stream.title} remixId={stream.remix_id} host={userId === stream.host_id} />
        </div>

        <section
          aria-label="Chat replay"
          className="flex h-[24rem] flex-col rounded-xl border border-border bg-surface lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:h-[calc(100dvh-var(--header-h)-2rem)] lg:max-h-[44rem]"
        >
          <h2 className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Chat replay</h2>
          {chat.length === 0 ? (
            <p className="p-3 text-xs text-muted">
              {replay?.chat.length ? "Messages show up here as the replay reaches them." : "Nobody chatted during this session."}
            </p>
          ) : (
            <ol ref={chatBox} className="flex-1 overflow-y-auto p-2">
              {chat.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1">
                  <span className="mt-0.5 w-9 shrink-0 font-mono text-[10px] text-muted">{formatClock(c.t)}</span>
                  <p className="min-w-0 flex-1 break-words text-[13px] leading-snug">
                    <span className="font-semibold" style={{ color: c.user_id ? c.color : undefined }}>
                      {c.name}
                    </span>
                    {c.is_host && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-brand/20 px-1 text-[10px] font-bold uppercase text-brand-strong">
                        <Shield className="h-2.5 w-2.5" /> Host
                      </span>
                    )}
                    <span> {c.body}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
