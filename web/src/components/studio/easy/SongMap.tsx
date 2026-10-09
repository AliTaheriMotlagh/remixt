"use client";

import { useMemo } from "react";
import { audioEngine } from "@/lib/client/audioEngine";
import { clipEnd, clipStart, clipsOf } from "@/lib/client/clipEdit";
import { beatLength, getAudibleLaneIds, useStudioStore, viewDuration, type StudioLane } from "@/lib/client/studioStore";
import { kindColor } from "@/lib/stemKinds";
import { KIND_ICON } from "../../StudioLibraryPanel";
import LaneStrip from "../LaneStrip";

// The Easy studio's picture of the song: a row per line, a block wherever
// it plays, the parts of the song named along the top (the AI names the
// vocal's sections; markers count too), and the playhead. Tap anywhere to
// jump there. Nothing on it can be dragged by accident.

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Part = { start: number; end: number; label: string };

/** The song's named parts: the vocal's labelled clips (joined where they follow on), then the markers. */
function partsOf(lanes: StudioLane[], markers: { start: number; end: number; label: string }[], bar: number): Part[] {
  const parts: Part[] = [];
  const vocal = lanes.find((l) => l.kind === "vocals" && l.clips?.some((c) => c.label));
  if (vocal) {
    const labelled = clipsOf(vocal)
      .filter((c) => c.label && !c.muted)
      .map((c) => ({ start: clipStart(vocal, c), end: clipEnd(vocal, c), label: c.label! }))
      .sort((a, b) => a.start - b.start);
    for (const p of labelled) {
      const last = parts[parts.length - 1];
      if (last && last.label === p.label && p.start - last.end < bar) last.end = Math.max(last.end, p.end);
      else parts.push({ ...p });
    }
  }
  for (const m of markers) parts.push({ start: m.start, end: Math.max(m.end, m.start + bar), label: m.label });
  return parts;
}

function Playhead({ span }: { span: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return (
    <span
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 rounded-full bg-foreground shadow-[0_0_8px_var(--foreground)]"
      style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }}
      aria-hidden
    />
  );
}

export default function SongMap() {
  const lanes = useStudioStore((s) => s.lanes);
  const duration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const markers = useStudioStore((s) => s.markers);
  const loop = useStudioStore((s) => (s.loopEnabled && s.loopEnd > s.loopStart ? { start: s.loopStart, end: s.loopEnd } : null));
  const span = viewDuration(duration, projectBpm);
  const bar = beatLength(projectBpm) * 4;
  const parts = useMemo(() => partsOf(lanes, markers, bar), [lanes, markers, bar]);
  const audible = getAudibleLaneIds(lanes);

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    audioEngine.seek(Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * span)));
  }

  return (
    <section aria-label="Song map" className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">Your song</h2>
        <p className="text-[11px] text-muted">Tap the map to jump there · {clock(duration)}</p>
      </div>
      <div className="flex gap-2">
        {/* Which line each row is. */}
        <div className="flex shrink-0 flex-col gap-1.5 pt-5" aria-hidden>
          {lanes.map((lane) => {
            const KindIcon = KIND_ICON[lane.kind];
            return (
              <span key={lane.laneId} className="flex h-4 w-4 items-center justify-center text-[11px]" style={{ color: kindColor(lane.kind) }}>
                <KindIcon />
              </span>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-1 cursor-pointer select-none" onClick={seek} role="presentation">
          {/* The parts of the song, named. */}
          <div className="relative mb-1 h-4">
            {parts.map((p, i) => (
              <span
                key={`${p.label}-${i}`}
                className="absolute top-0 truncate rounded bg-surface-raised px-1 text-[9.5px] font-semibold leading-4 text-muted"
                style={{ left: `${(p.start / span) * 100}%`, maxWidth: `${Math.max(4, ((p.end - p.start) / span) * 100)}%` }}
                title={`${p.label} · ${clock(p.start)}`}
              >
                {p.label}
              </span>
            ))}
          </div>
          <div className="relative flex flex-col gap-1.5 rounded-lg bg-background/60 py-0.5">
            {/* Bar lines every 8 bars, so the length reads at a glance. */}
            {Array.from({ length: Math.floor(span / (bar * 8)) }, (_, i) => (
              <span key={i} className="pointer-events-none absolute inset-y-0 w-px bg-border/70" style={{ left: `${(((i + 1) * bar * 8) / span) * 100}%` }} aria-hidden />
            ))}
            {loop && <span className="pointer-events-none absolute inset-y-0 bg-brand/15" style={{ left: `${(loop.start / span) * 100}%`, width: `${((loop.end - loop.start) / span) * 100}%` }} aria-hidden />}
            {lanes.map((lane) => (
              <LaneStrip key={lane.laneId} lane={lane} span={span} className="h-4" dim={!audible.has(lane.laneId)} />
            ))}
            <Playhead span={span} />
          </div>
          <div className="mt-1 flex justify-between text-[9.5px] text-muted tabular-nums" aria-hidden>
            <span>0:00</span>
            <span>{clock(span / 2)}</span>
            <span>{clock(span)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
