"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, Users } from "lucide-react";
import { useRadio } from "@/lib/client/radioClient";
import RemixtMark from "../RemixtMark";
import { Countdown, LiveDot, Progress, RadioArt, SourceChip, Visualizer, VoteBoard } from "./RadioBits";
import RadioLyrics from "./RadioLyrics";

// The station as a 16:9 picture with its sound, for OBS (Browser Source,
// 1920×1080) → YouTube Live, Twitch, a screen at a party. It tunes itself
// in (OBS lets pages play sound); in a normal browser tab one click starts it.
export default function RadioBroadcast({ slug }: { slug: string }) {
  const radio = useRadio(slug, { heartbeat: true });
  const { feed, tune } = radio;
  const now = feed?.now ?? null;
  const tried = useRef(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page's own address, known only in the browser
    setOrigin(window.location.host);
  }, []);
  useEffect(() => {
    if (!now || tried.current) return;
    tried.current = true;
    void radio.tuneIn();
  }, [now, radio]);
  // On air all day: if the sound stops (a network drop), it tunes back in.
  const { tune: state, tuneIn } = radio;
  useEffect(() => {
    if (!tried.current || state !== "error") return;
    const timer = setTimeout(() => void tuneIn(), 8000);
    return () => clearTimeout(timer);
  }, [state, tuneIn]);

  return (
    <div className="fixed inset-0 isolate overflow-hidden bg-black text-white" style={{ fontSize: "min(1.6vw, 2.85vh)" }}>
      <div className="absolute inset-0 -z-10" aria-hidden>
        <RadioArt item={now} className="size-full scale-125 opacity-60 blur-3xl saturate-150" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/60 to-black/90" />
      </div>
      <div className="flex h-full flex-col p-[3em]">
        <header className="flex items-center gap-[1em]">
          <RemixtMark className="size-[2.4em]" />
          <span className="text-[1.5em] font-black">{feed?.station.name ?? "Remixt Radio"}</span>
          <LiveDot className="ml-[1em] text-[0.9em]" />
          <span className="ml-auto flex items-center gap-[0.4em] text-[1.1em] text-white/80">
            <Users className="size-[1.2em]" /> {feed?.listeners ?? 0} listening
          </span>
        </header>
        <main className="flex min-h-0 flex-1 items-center gap-[3em]">
          <RadioArt item={now} spin={tune === "on"} className="aspect-square h-[62%] max-h-[28em] rounded-[1.6em] shadow-2xl shadow-black/70 ring-1 ring-white/15" />
          <div className="flex min-w-0 flex-1 flex-col gap-[1.2em]">
            {now && <SourceChip row={now} className="self-start text-[0.9em]" />}
            <h1 className="line-clamp-2 text-[4.2em] font-black leading-[1.02] tracking-tight">{now?.title ?? "Nothing on air"}</h1>
            <p className="truncate text-[1.8em] text-white/75">{now?.artist}</p>
            <Progress row={now} position={radio.position} big />
            <RadioLyrics slug={slug} row={now} position={radio.position} big onWords={radio.showWords} />
          </div>
          {feed && feed.station.settings.voting && feed.vote.choices.length > 0 && (
            <aside className="w-[30%] shrink-0 rounded-[1.4em] bg-black/40 p-[1.4em] ring-1 ring-white/10 backdrop-blur">
              <p className="mb-[0.8em] text-[1.3em] font-black">
                Vote for the next song · <Countdown endsAt={now?.endsAt ?? null} serverNow={radio.serverNow} />
              </p>
              <VoteBoard feed={feed} serverNow={radio.serverNow} compact />
            </aside>
          )}
        </main>
        <Visualizer analyser={radio.getAnalyser} levels={radio.levels} live={tune === "on"} className="h-[7em] w-full" bars={96} />
        <footer className="mt-[1em] flex items-center gap-[0.6em] text-[1.3em] text-white/85">
          <Hand className="size-[1.2em]" /> Vote and request at <strong>{origin}/radio/{slug}</strong>
        </footer>
      </div>
      {tune !== "on" && tune !== "loading" && now && (
        <button type="button" onClick={() => void radio.tuneIn()} className="absolute inset-0 flex items-center justify-center bg-black/60 text-[2em] font-black">
          Click to start the sound
        </button>
      )}
    </div>
  );
}
