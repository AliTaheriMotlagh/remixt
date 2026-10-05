"use client";

import { Headphones, Mic2, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import type { LiveStageState } from "@/lib/live";

// What's happening on stage: the track, the playhead, and each stem as the
// host is playing it. The same view is the host's own monitor and what
// listeners watch, so everyone sees the same performance.

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

const KIND_COLOR: Record<string, string> = {
  vocals: "var(--vocals)",
  beat: "var(--beat)",
  drums: "var(--drums)",
  bass: "var(--bass)",
  other: "var(--other)",
};

/** Playhead and length, on its own so only it re-renders every frame. */
export function StageClock({ className = "" }: { className?: string }) {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  return (
    <span className={`font-mono text-xs tabular-nums text-muted ${className}`}>
      {formatClock(playhead)} / {formatClock(duration)}
    </span>
  );
}

export function StageProgress() {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const pct = duration > 0 ? Math.min(100, (playhead / duration) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="Track position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="h-full rounded-full bg-gradient-to-r from-vocals to-beat" style={{ width: `${pct}%` }} />
    </div>
  );
}

function laneAudible(lane: Pick<StudioLane, "muted" | "solo">, anySolo: boolean) {
  return !lane.muted && (!anySolo || lane.solo);
}

/** Read-only stem strips: audible ones breathe with the music, muted ones go dark. */
export function StemStrips({
  lanes,
  playing,
  children,
}: {
  lanes: Pick<StudioLane, "laneId" | "kind" | "muted" | "solo" | "volume" | "trackTitle" | "name">[];
  playing: boolean;
  /** Per-stem controls, for the host (the strip is read-only without). */
  children?: (lane: Pick<StudioLane, "laneId" | "kind" | "muted" | "solo" | "volume">) => ReactNode;
}) {
  const anySolo = lanes.some((l) => l.solo);
  if (lanes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {lanes.map((lane, i) => {
        const on = laneAudible(lane, anySolo);
        const color = KIND_COLOR[lane.kind] ?? "var(--brand)";
        return (
          <li
            key={lane.laneId}
            className={`flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5 transition-opacity ${on ? "bg-surface-raised" : "bg-surface opacity-50"}`}
          >
            <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{lane.name ?? lane.trackTitle}</span>
              <span className="block text-[10px] uppercase tracking-wide text-muted">
                {lane.kind}
                {lane.solo && <span className="ml-1.5 font-bold text-drums">solo</span>}
                {lane.muted && <span className="ml-1.5">muted</span>}
              </span>
            </span>
            <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-background sm:w-24" aria-hidden>
              <span
                className={`block h-full rounded-full ${on && playing ? "live-level" : ""}`}
                style={{
                  width: `${on ? Math.min(100, lane.volume * 70) : 0}%`,
                  background: color,
                  ["--d" as string]: `${0.55 + (i % 4) * 0.17}s`,
                }}
              />
            </span>
            {on ? <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Audible" /> : <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Silent" />}
            {children?.(lane)}
          </li>
        );
      })}
    </ul>
  );
}

/** The cover, the title and the on-stage note, with reactions floating over it. */
export function StageHeader({
  title,
  artist,
  cover,
  state,
  children,
}: {
  title: string;
  artist: string;
  cover: string | null;
  state: LiveStageState | null;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-vocals-dim via-surface to-beat-dim p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-raised sm:h-24 sm:w-24">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- covers are user uploads served by the app itself
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-brand-strong">
              <Headphones className="h-8 w-8" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Mic2 className="h-3 w-3" /> On stage
          </p>
          <h2 className="truncate text-lg font-bold sm:text-xl">{title}</h2>
          <p className="truncate text-sm text-muted">by {artist}</p>
          {state?.note && (
            <p className="mt-1.5 inline-block max-w-full truncate rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
              {state.note}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
