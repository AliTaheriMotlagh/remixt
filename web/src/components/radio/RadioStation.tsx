"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Code2, Copy, Gamepad2, Radio, Headphones, History as HistoryIcon, Link2, Loader2, MonitorPlay, Pause, Play, Settings2, Share2, Users, Volume1, Volume2, VolumeX } from "lucide-react";
import { clock, useRadio } from "@/lib/client/radioClient";
import { Countdown, History, ItemRow, LiveDot, Progress, RadioArt, RequestPanel, SourceChip, Visualizer, VoteBoard } from "./RadioBits";

// A station's page: what's on (big, with its cover glowing behind it), the
// vote on what's next, requests, what played, and how to share or embed
// it. Everyone here hears the same moment of the same song.

function Copyable({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Copy }) {
  const [done, setDone] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon className="size-3.5" /> {label}
      </p>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-raised px-2.5 py-2 text-xs">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => {});
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-surface-hover"
          aria-label={`Copy: ${label}`}
        >
          {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ShareStation({ slug }: { slug: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const page = `${origin}/radio/${slug}`;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Share2 className="size-5 text-beat" /> Share and embed
      </h2>
      <Copyable label="Listen link" value={page} icon={Link2} />
      <Copyable label="Embed in a site, an app or a game (iframe)" value={`<iframe src="${page}/embed" width="100%" height="168" style="border:0;border-radius:16px" allow="autoplay"></iframe>`} icon={Code2} />
      <Copyable label="Always on — a game, a kiosk, a shop: starts by itself where sound is allowed and keeps going" value={`${page}/embed?autoplay=1`} icon={Radio} />
      <Copyable label="Control it from your game or app (in the page that frames it)" value={`frame.contentWindow.postMessage({ type: "remixt-radio", action: "play" /* "pause", "volume" + value */ }, "*"); // it answers with { type: "remixt-radio:state", now, next, playing }`} icon={Gamepad2} />
      <Copyable label="YouTube Live / Twitch: add as a Browser Source in OBS (1920×1080, tick “Control audio via OBS”)" value={`${page}/broadcast`} icon={MonitorPlay} />
      <Copyable label="What's playing, as JSON (for apps and games, open to any site)" value={`${origin}/api/radio/${slug}/now`} icon={Code2} />
    </div>
  );
}

export default function RadioStation({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const radio = useRadio(slug);
  const { feed, tune, error } = radio;
  const now = feed?.now ?? null;
  const on = tune === "on";
  const VolumeIcon = radio.volume === 0 ? VolumeX : radio.volume < 0.5 ? Volume1 : Volume2;

  if (!feed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        {error ? <p className="text-danger">{error}</p> : <Loader2 className="size-6 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {/* On air: the cover glows behind everything. */}
      <section aria-label="On air" className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-black text-white shadow-2xl shadow-brand/10">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <RadioArt item={now} className="size-full scale-125 opacity-60 blur-3xl saturate-150" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/60 to-black/90" />
          <div className="absolute -left-24 -top-24 size-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 size-72 rounded-full bg-beat/25 blur-3xl" />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-7 sm:pt-6">
          <Link href="/radio" className="flex min-h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white/85 ring-1 ring-white/15 backdrop-blur hover:bg-white/20">
            <ArrowLeft className="size-3.5" /> Stations
          </Link>
          <span className="min-w-0 truncate text-sm font-bold">{feed.station.name}</span>
          <span className="ml-auto flex items-center gap-3">
            <LiveDot />
            <span className="flex items-center gap-1 text-xs font-semibold text-white/80" title="Listening now">
              <Users className="size-3.5" /> {feed.listeners}
            </span>
            {feed.canManage && (
              <Link href={`/radio/${slug}/console`} className="flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-black hover:bg-white/90">
                <Settings2 className="size-3.5" /> Console
              </Link>
            )}
          </span>
        </div>

        <div className="grid gap-5 p-4 sm:p-7 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
          <div className="relative mx-auto w-full max-w-[260px] md:max-w-none">
            <RadioArt item={now} className={`aspect-square w-full rounded-3xl shadow-2xl shadow-black/60 ring-1 ring-white/15 transition-transform duration-700 ${on ? "scale-100" : "scale-[0.97]"}`} />
            {on && <span className="pointer-events-none absolute -inset-1 -z-10 animate-pulse rounded-[28px] bg-gradient-to-br from-brand via-vocals to-beat opacity-50 blur-xl motion-reduce:animate-none" aria-hidden />}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {now ? (
              <>
                <div className="min-w-0">
                  <SourceChip row={now} className="mb-3" />
                  <h1 className="line-clamp-2 text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">{now.title}</h1>
                  <p className="mt-1.5 truncate text-lg text-white/75 sm:text-xl">
                    {now.artist} <span className="text-white/40">· {now.kind === "remix" ? "Remix" : "Song"}</span>
                  </p>
                </div>
                <Progress row={now} position={radio.position} />
              </>
            ) : (
              <div>
                <h1 className="text-3xl font-black sm:text-4xl">Nothing on air</h1>
                <p className="mt-1 text-white/70">{feed.canManage ? "Add songs to the playlist in the console, or switch on “play anything from the library”." : "This station's playlist is empty for now."}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!now || tune === "loading"}
                onClick={() => (on ? radio.tuneOut() : void radio.tuneIn())}
                className="flex min-h-14 items-center gap-2.5 rounded-full bg-white px-7 text-base font-black text-black shadow-lg shadow-white/10 transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
              >
                {tune === "loading" ? <Loader2 className="size-5 animate-spin" /> : on ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
                {tune === "loading" ? "Tuning in…" : on ? "Pause" : "Tune in"}
              </button>
              <label className="flex min-h-11 flex-1 basis-40 items-center gap-2 text-white/80 sm:max-w-56">
                <VolumeIcon className="size-5 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={radio.volume}
                  onChange={(e) => radio.setVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="h-11 w-full accent-white"
                />
              </label>
            </div>
            {tune === "loading" && radio.status && <p className="text-sm text-white/75">{radio.status}</p>}
            {tune === "error" && <p className="text-sm text-danger">{radio.error ?? "This browser couldn't start the sound."} Tap Tune in again.</p>}
            {feed.upcoming && (
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-3 ring-1 ring-white/10 backdrop-blur">
                <RadioArt item={feed.upcoming} className="size-11 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/60">Up next · blends in on the beat</span>
                  <span className="block truncate text-sm font-bold">
                    {feed.upcoming.title} <span className="font-normal text-white/60">· {feed.upcoming.artist}</span>
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-white/70">
                  <Countdown endsAt={feed.upcoming.startsAt} serverNow={radio.serverNow} />
                </span>
              </div>
            )}
            {!on && now && (
              <p className="flex items-center gap-1.5 text-xs text-white/60">
                <Headphones className="size-3.5" /> Everyone hears the same moment — you join the song where the station is.
              </p>
            )}
          </div>
        </div>
        <Visualizer analyser={radio.getAnalyser} live={on} className="h-16 w-full sm:h-24" bars={72} />
      </section>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          {feed.station.settings.voting && feed.vote.choices.length > 0 && (
            <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
              <VoteBoard feed={feed} onVote={radio.vote} serverNow={radio.serverNow} />
            </section>
          )}
          {feed.upNext.length > 0 && (
            <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
              <h2 className="mb-2 text-lg font-bold">Coming up</h2>
              <ul>
                {feed.upNext.map((r, i) => (
                  <ItemRow key={r.rowId} item={r} meta={i === 0 ? "next" : `${clock(r.duration)}`} />
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
            <RequestPanel slug={slug} feed={feed} onRequest={radio.request} onWithdraw={radio.withdraw} signedIn={signedIn} />
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <HistoryIcon className="size-5 text-drums" /> Just played
            </h2>
            <History rows={feed.history} now={radio.serverNow()} />
          </section>
          <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
            <ShareStation slug={slug} />
          </section>
        </div>
      </div>
    </div>
  );
}
