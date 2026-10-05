"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Headphones, Link2, RefreshCw, Volume2, VolumeX, WifiOff } from "lucide-react";
import FollowButton from "@/components/FollowButton";
import ReportButton from "@/components/ReportButton";
import { audioEngine } from "@/lib/client/audioEngine";
import { useLiveConnection, useLiveFollower } from "@/lib/client/liveSync";
import { useStudioStore } from "@/lib/client/studioStore";
import type { LiveStream, Recap as RecapData } from "@/lib/live";
import type { FollowState } from "@/lib/social";
import LiveChat from "./LiveChat";
import Recap from "./Recap";
import { ReactionBar, ReactionLayer, compactNumber, type ReactionLayerHandle } from "./Reactions";
import { StageClock, StageHeader, StageProgress, StemStrips } from "./Stage";

const VOLUME_KEY = "remixt_live_volume";

export function LiveBadge({ status }: { status: LiveStream["status"] | "away" }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
      </span>
    );
  if (status === "away")
    return <span className="rounded bg-drums/90 px-1.5 py-0.5 text-[11px] font-bold uppercase text-black">Back soon</span>;
  return (
    <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
      {status === "scheduled" ? "Upcoming" : "Ended"}
    </span>
  );
}

/** Counts down to a start time. */
function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  const left = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {d > 0 && `${d}d `}
      {h > 0 || d > 0 ? `${h}h ` : ""}
      {m}m {s}s
    </span>
  );
}

/** Watching a live session: hear the host's performance in step, chat, react. */
export default function LiveRoom({
  stream,
  cover,
  follow,
  userId,
}: {
  stream: LiveStream;
  cover: string | null;
  follow: FollowState;
  userId: string | null;
}) {
  const layer = useRef<ReactionLayerHandle>(null);
  const conn = useLiveConnection(stream.id, {
    isHost: false,
    onReactions: (bursts) => {
      for (const b of bursts) layer.current?.burst(b.emoji, Math.min(b.count, 4));
    },
  });
  const live = conn.stream;
  const status = live?.status ?? stream.status;
  const remixId = live ? live.remixId : stream.remix_id;

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

  const follower = useLiveFollower({
    remixId: status === "live" ? remixId : null,
    stream: live,
    serverNow: conn.serverNow,
    tuned,
    muted,
    volume,
  });
  const lanes = useStudioStore((s) => s.lanes);
  const playing = !!live?.state.playing && status === "live" && !live.hostAway;

  const [recap, setRecap] = useState<RecapData | null>(null);
  useEffect(() => {
    if (status !== "ended") return;
    audioEngine.pause();
    let cancelled = false;
    fetch(`/api/live/${stream.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data?.recap && setRecap(data.recap));
    return () => {
      cancelled = true;
    };
  }, [status, stream.id]);

  const [reactionTotals, setReactionTotals] = useState<Record<string, number>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the feed's totals, as they arrive
    if (live) setReactionTotals(live.reactions);
  }, [live]);

  function react(emoji: string) {
    layer.current?.burst(emoji, 1);
    setReactionTotals((t) => ({ ...t, [emoji]: (t[emoji] ?? 0) + 1 }));
    conn.sendReaction(emoji);
  }

  async function tuneIn() {
    // Inside the tap, so phones let the sound start later.
    await audioEngine.prepareAudio().catch(() => {});
    setTuned(true);
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
      // Cancelled share sheet, or no clipboard access: nothing to do.
    }
  }

  if (conn.missing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">This session is gone</h1>
        <Link href="/live" className="mt-4 inline-block text-brand-strong hover:underline">
          See who&apos;s live
        </Link>
      </div>
    );
  }

  const title = live?.title ?? stream.title;
  const viewers = live?.viewers ?? stream.viewers;
  const away = !!live?.hostAway && status === "live";
  const hasStage = !!remixId && status === "live";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge status={away ? "away" : status} />
            {status === "live" && (
              <span className="flex items-center gap-1 text-xs text-muted" aria-label={`${viewers} watching`}>
                <Eye className="h-3.5 w-3.5" /> <span className="tabular-nums">{compactNumber(viewers)}</span> watching
              </span>
            )}
            {conn.offline && (
              <span className="flex items-center gap-1 text-xs text-drums">
                <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-xl font-bold sm:text-2xl">{title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <Link href={`/artist/${stream.host_id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:underline">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: stream.host_color }}
              >
                {stream.host_name.slice(0, 1).toUpperCase()}
              </span>
              {stream.host_name}
            </Link>
            {stream.tags.map((tag) => (
              <Link key={tag} href={`/remixes?tag=${encodeURIComponent(tag)}`} className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] hover:text-foreground">
                {tag}
              </Link>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FollowButton artistId={stream.host_id} initial={follow} signedIn={!!userId} isSelf={false} />
          <button
            type="button"
            onClick={copyLink}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted hover:text-foreground"
          >
            <Link2 className="h-4 w-4" /> {copied ? "Link copied" : "Share"}
          </button>
          <ReportButton kind="live" targetId={stream.id} signedIn={!!userId} />
        </div>
      </div>

      {stream.description && status !== "ended" && <p className="mb-4 max-w-3xl text-sm text-muted">{stream.description}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {status === "scheduled" && (
            <section className="rounded-2xl border border-border bg-gradient-to-br from-vocals-dim to-beat-dim p-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Starts in</p>
              <p className="mt-2 text-3xl font-bold">
                {stream.scheduled_at ? <Countdown to={stream.scheduled_at} /> : "soon"}
              </p>
              {stream.scheduled_at && (
                <p className="mt-2 text-sm text-muted">{new Date(stream.scheduled_at).toLocaleString()}</p>
              )}
              <p className="mt-4 text-sm text-muted">Follow {stream.host_name} and you&apos;ll get a notification when it starts. This page goes live by itself.</p>
            </section>
          )}

          {status === "ended" && <Recap recap={recap ?? emptyRecap(stream)} title={title} remixId={stream.remix_id} />}

          {status === "live" && (
            <section aria-label="Stage" className="flex flex-col gap-3">
              <div className="relative">
                <StageHeader
                  title={stream.remix_title ?? "Live set"}
                  artist={stream.host_name}
                  cover={cover}
                  state={live?.state ?? null}
                >
                  <div className="mt-4 flex flex-col gap-2">
                    <StageProgress />
                    <div className="flex items-center justify-between gap-2">
                      <StageClock />
                      <span className="text-[11px] text-muted">
                        {away
                          ? "The host stepped away — back in a moment"
                          : !hasStage
                            ? "The host is picking the next track"
                            : playing
                              ? "Playing live"
                              : "Paused by the host"}
                      </span>
                    </div>
                  </div>
                </StageHeader>
                <ReactionLayer ref={layer} className="rounded-xl" />
              </div>

              {hasStage ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
                  {!tuned ? (
                    <button
                      type="button"
                      onClick={tuneIn}
                      disabled={follower.status !== "ready"}
                      className="flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
                    >
                      <Headphones className="h-4 w-4" />
                      {follower.status === "loading" ? "Loading the stems…" : follower.status === "error" ? "Couldn't load the track" : "Tune in"}
                    </button>
                  ) : (
                    <>
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
                        className="w-32 accent-brand sm:w-44"
                        aria-label="Volume"
                      />
                      <button
                        type="button"
                        onClick={follower.resync}
                        className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted hover:text-foreground"
                        title="Jump to exactly where the host is"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Re-sync
                      </button>
                      <span className="text-[11px] text-muted" aria-live="polite">
                        {follower.blocked
                          ? "Tap play — your browser blocked the sound"
                          : !playing
                            ? "Waiting for the host to play"
                            : Math.abs(follower.drift) < 0.2
                              ? "In sync"
                              : "Syncing…"}
                      </span>
                    </>
                  )}
                  {!tuned && (
                    <p className="text-xs text-muted">You&apos;ll hear exactly what the host is playing, in step with them.</p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
                  The host hasn&apos;t put a track on yet — chat and reactions still work.
                </p>
              )}

              {hasStage && lanes.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stems — as the host plays them</h2>
                  <StemStrips lanes={lanes} playing={playing} />
                </div>
              )}
            </section>
          )}

          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Send some love</p>
            <ReactionBar totals={reactionTotals} onReact={react} disabled={status !== "live" || conn.banned} />
          </div>
        </div>

        <LiveChat
          streamId={stream.id}
          conn={conn}
          signedIn={!!userId}
          isHost={false}
          chatMode={live?.chatMode ?? stream.chat_mode}
          slowMode={live?.slowMode ?? stream.slow_mode}
          pinned={live?.pinned ?? null}
          isFollowing={follow.isFollowing}
          className="h-[28rem] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:h-[calc(100dvh-var(--header-h)-2rem)] lg:max-h-[44rem]"
        />
      </div>
    </div>
  );
}

function emptyRecap(stream: LiveStream): RecapData {
  const start = stream.started_at ? new Date(stream.started_at).getTime() : 0;
  const end = stream.ended_at ? new Date(stream.ended_at).getTime() : Date.now();
  return {
    durationSeconds: start ? Math.round((end - start) / 1000) : 0,
    peak: stream.peak_viewers,
    unique: 0,
    messages: 0,
    reactions: 0,
    topReaction: null,
    newFollowers: 0,
    chatters: 0,
  };
}
