"use client";

import { useEffect, useState } from "react";
import MixWaveform from "./MixWaveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import RemixtMark from "./RemixtMark";
import { setMixCredit } from "@/lib/client/mediaSession";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Position readout, on its own so only it re-renders every frame. */
function Clock() {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted">
      {formatTime(playhead)} / {formatTime(duration)}
    </span>
  );
}

/** The player other sites embed (see /embed/[id]): play, scrub, and a link back. */
export default function EmbedPlayer({
  remixId,
  title,
  artist,
  pageUrl,
}: {
  remixId: string;
  title: string;
  artist: string;
  pageUrl: string;
}) {
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const [state, setState] = useState<"loading" | "ready" | "starting" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/remixes/${remixId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        loadRemix((data.lanes as RemixLaneApi[]).map(laneFromApi), projectFromApi(data.remix), {
          id: remixId,
          title,
        });
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
      audioEngine.stop();
    };
  }, [remixId, title, loadRemix]);

  // On the lock screen, this remix is by its artist (not the stems' artists).
  useEffect(() => {
    setMixCredit(artist);
    return () => setMixCredit(null);
  }, [artist]);

  async function toggle() {
    if (isPlaying) {
      audioEngine.pause();
      return;
    }
    setState("starting");
    try {
      await audioEngine.play();
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex h-full min-h-[136px] items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <button
        onClick={toggle}
        disabled={state === "loading"}
        className="flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-xl text-white disabled:opacity-50"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {state === "starting" || state === "loading" ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : isPlaying ? (
          "⏸"
        ) : (
          "▶"
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm">
            <a href={pageUrl} target="_blank" rel="noopener" className="font-semibold hover:underline">
              {title}
            </a>
            <span className="text-muted"> · {artist}</span>
          </p>
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener"
            className="flex shrink-0 items-center gap-1 text-[11px] font-bold tracking-tight text-brand-strong hover:underline"
          >
            <RemixtMark className="h-4 w-4" />
            Remixt ↗
          </a>
        </div>
        {state === "error" ? (
          <p className="mt-3 text-xs text-danger">Couldn&apos;t play this remix here — open it on Remixt.</p>
        ) : (
          <div className="mt-2">
            <MixWaveform height={48} showComments={false} />
          </div>
        )}
        <div className="mt-1">
          <Clock />
        </div>
      </div>
    </div>
  );
}
