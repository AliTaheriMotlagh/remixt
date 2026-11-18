"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Loader2, Pause, Play, Users } from "lucide-react";
import { useRadio } from "@/lib/client/radioClient";
import RemixtMark from "../RemixtMark";
import { LiveDot, Progress, RadioArt, Visualizer } from "./RadioBits";

// The station inside someone else's site, app or game (an <iframe>): what's
// on, Tune in, and a link to vote and request on Remixt.
//
// ?autoplay=1 starts the sound by itself where the host allows it (OBS, a
// game's web view, a kiosk) and keeps it going. The page that frames it can
// drive it with postMessage —
//   frame.contentWindow.postMessage({ type: "remixt-radio", action: "play" | "pause" | "volume", value: 0.8 }, "*")
// — and hears back on every change:
//   { type: "remixt-radio:state", playing, station, now: { title, artist, cover, startedAt, endsAt }, next, listeners }
export default function RadioEmbed({ slug, autoplay = false }: { slug: string; autoplay?: boolean }) {
  const radio = useRadio(slug);
  const { feed, tune } = radio;
  const now = feed?.now ?? null;
  const on = tune === "on";
  const control = useRef(radio);
  useEffect(() => {
    control.current = radio;
  });

  // Always on: tune in by itself, and again if the sound stops (a network drop, the host pausing it).
  const wantOn = useRef(autoplay);
  useEffect(() => {
    if (!wantOn.current || !now) return;
    if (tune === "off" || tune === "error") {
      const timer = setTimeout(() => void control.current.tuneIn(), tune === "error" ? 8000 : 300);
      return () => clearTimeout(timer);
    }
  }, [tune, now]);

  // The framing page's remote control.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; action?: string; value?: unknown };
      if (m?.type !== "remixt-radio") return;
      if (m.action === "play") {
        wantOn.current = true;
        void control.current.tuneIn();
      } else if (m.action === "pause") {
        wantOn.current = false;
        control.current.tuneOut();
      } else if (m.action === "volume" && typeof m.value === "number") control.current.setVolume(Math.max(0, Math.min(1, m.value)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // …and what's on, told to it on every change.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  useEffect(() => {
    if (window.parent === window || !feed) return;
    const abs = (u: string | null) => (u ? new URL(u, origin).href : null);
    window.parent.postMessage(
      {
        type: "remixt-radio:state",
        playing: on,
        station: { slug, name: feed.station.name },
        now: feed.now ? { title: feed.now.title, artist: feed.now.artist, cover: abs(feed.now.cover), startedAt: feed.now.startsAt, endsAt: feed.now.endsAt } : null,
        next: feed.upcoming ? { title: feed.upcoming.title, artist: feed.upcoming.artist, startsAt: feed.upcoming.startsAt } : null,
        listeners: feed.listeners,
      },
      "*"
    );
  }, [feed?.now?.rowId, feed?.upcoming?.rowId, feed?.listeners, on, slug, origin, feed]);
  return (
    <div className="relative isolate flex h-full min-h-[152px] items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-black p-3 text-white">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <RadioArt item={now} className="size-full scale-150 opacity-50 blur-2xl" />
        <div className="absolute inset-0 bg-black/55" />
      </div>
      <button
        type="button"
        onClick={() => (on ? radio.tuneOut() : void radio.tuneIn())}
        disabled={!now || tune === "loading"}
        aria-label={on ? "Pause" : "Tune in"}
        onClickCapture={() => (wantOn.current = !on)}
        className="relative size-28 shrink-0 overflow-hidden rounded-xl shadow-xl disabled:opacity-70"
      >
        <RadioArt item={now} className="absolute inset-0 size-full rounded-xl" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="flex size-12 items-center justify-center rounded-full bg-white text-black shadow-lg">
            {tune === "loading" ? <Loader2 className="size-5 animate-spin" /> : on ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-0.5 fill-current" />}
          </span>
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <LiveDot label={feed?.station.name ?? "Radio"} className="min-w-0 truncate" />
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-white/70">
            <Users className="size-3" /> {feed?.listeners ?? 0}
          </span>
        </div>
        <p className="mt-1 truncate text-base font-bold">{now?.title ?? (feed ? "Nothing on air" : "Tuning…")}</p>
        <p className="truncate text-xs text-white/70">{now?.artist}</p>
        <div className="mt-1.5">
          <Progress row={now} position={radio.position} />
        </div>
        <div className="flex items-center gap-2">
          <Visualizer analyser={radio.getAnalyser} levels={radio.levels} live={on} className="h-6 min-w-0 flex-1" bars={40} />
          <a href={`/radio/${slug}`} target="_blank" rel="noopener" className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-white/85 hover:underline">
            <RemixtMark className="size-4" /> Vote on Remixt <ArrowUpRight className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
