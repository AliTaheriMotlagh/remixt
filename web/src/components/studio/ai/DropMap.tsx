"use client";

import { memo, useMemo } from "react";
import { Zap } from "lucide-react";
import type { Session } from "@/lib/client/aiIdeas";
import { clipEnd, clipStart, clipsOf } from "@/lib/client/clipEdit";
import { timelinesOf } from "@/lib/client/harmony";
import { beatLength, useStudioStore, viewDuration, type StudioLane } from "@/lib/client/studioStore";
import { clock } from "./ui";

// The beat's energy, bar by bar, across the song — the shape a drop is
// made of — with its drop marked, and the vocal's sections underneath
// (the chorus picked out). One look says whether the hook lands where the
// beat hits; the switches below put it there, or build up to it.

function Playhead({ span }: { span: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/80" style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} aria-hidden />;
}

export default memo(function DropMap({ session, lanes, projectBpm, duration }: { session: Session; lanes: StudioLane[]; projectBpm: number; duration: number }) {
  const { pair, drop } = session;
  const span = viewDuration(duration, projectBpm);
  const bar = beatLength(projectBpm) * 4;

  const picture = useMemo(() => {
    if (!pair) return null;
    // The beat as it sits now — swapped for its parts (a drop being tried), any part has its timing.
    const beat = lanes.find((l) => l.laneId === pair.beatLaneId) ?? lanes.find((l) => l.laneId.startsWith(`${pair.beatLaneId}~`));
    if (!beat) return null;
    const { structure } = pair;
    const energy = structure.barEnergy.slice(0, structure.endBar);
    const loudest = Math.max(...energy, 1e-9);
    const bars = energy.flatMap((e, i) => timelinesOf(beat, structure.grid.time(structure.downbeat + 4 * i)).map((t) => ({ t, level: e / loudest, i })));
    const dropAt = drop ? (timelinesOf(beat, structure.grid.time(structure.downbeat + 4 * drop.bar))[0] ?? null) : null;
    const vocal = session.vocal ? lanes.find((l) => l.laneId === session.vocal!.laneId) : undefined;
    const parts = vocal
      ? clipsOf(vocal)
          .filter((c) => !c.muted)
          .map((c) => ({ start: clipStart(vocal, c), end: clipEnd(vocal, c), label: c.label ?? "", chorus: c.label === "Chorus" }))
      : [];
    const chorusAt = parts.filter((p) => p.chorus).map((p) => p.start).sort((a, b) => a - b);
    return { bars, dropAt, parts, chorusAt };
  }, [pair, drop, lanes, session.vocal]);

  if (!pair || !picture) {
    return <p className="rounded-xl border border-dashed border-border p-3 text-[11px] text-muted">The drop map needs a vocal and a beat the AI could match.</p>;
  }
  const { bars, dropAt, parts, chorusAt } = picture;
  // How far the nearest chorus starts from the drop.
  const nearest = dropAt !== null && chorusAt.length ? chorusAt.reduce((best, t) => (Math.abs(t - dropAt) < Math.abs(best - dropAt) ? t : best)) : null;
  const offBars = nearest !== null && dropAt !== null ? Math.round((nearest - dropAt) / bar) : null;
  const barWidth = Math.max(0.3, (bar / span) * 100 - 0.25);

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Zap className="text-brand-strong" /> The beat&apos;s energy
          </h3>
          <p className="text-[11px] text-muted">
            {drop && dropAt !== null
              ? `${drop.kind === "drop" ? "Its drop" : "Its biggest moment"} is at ${clock(dropAt)} (bar ${Math.round(dropAt / bar) + 1})`
              : "No clear drop in this beat — moments still work around the vocal"}
          </p>
        </div>
        {offBars !== null && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${offBars === 0 ? "bg-success/15 text-success" : "bg-amber-400/15 text-amber-400"}`}>
            {offBars === 0 ? "Chorus on the drop ✓" : `Chorus ${Math.abs(offBars)} bar${Math.abs(offBars) === 1 ? "" : "s"} ${offBars > 0 ? "after" : "before"} it`}
          </span>
        )}
      </div>
      <div className="relative mt-2.5 select-none" aria-label="The beat's energy over the song, with its drop and the vocal's parts" role="img">
        <div className="relative h-14 overflow-hidden rounded-lg bg-background/60">
          {bars.map((b, n) => (
            <span
              key={n}
              className="absolute bottom-0 rounded-t-[2px]"
              style={{
                left: `${(b.t / span) * 100}%`,
                width: `${barWidth}%`,
                height: `${Math.max(4, b.level * 100)}%`,
                background: dropAt !== null && Math.abs(b.t - dropAt) < bar * 4 - 0.01 && b.t >= dropAt - 0.01 ? "var(--vocals)" : "var(--beat)",
                opacity: 0.35 + b.level * 0.6,
              }}
            />
          ))}
          {dropAt !== null && (
            <span className="absolute inset-y-0 w-0.5 bg-vocals" style={{ left: `${(dropAt / span) * 100}%` }}>
              <span className="absolute top-0.5 left-1 rounded bg-vocals px-1 text-[8.5px] font-black tracking-wide text-white">DROP</span>
            </span>
          )}
          <Playhead span={span} />
        </div>
        {/* The vocal's parts, the chorus picked out. */}
        <div className="relative mt-1 h-3.5">
          {parts.map((p, n) => (
            <span
              key={n}
              className="absolute inset-y-0 truncate rounded-[3px] px-0.5 text-[8.5px] font-bold leading-[0.875rem] text-white"
              style={{
                left: `${(p.start / span) * 100}%`,
                width: `max(2px, calc(${((p.end - p.start) / span) * 100}% - 1px))`,
                background: p.chorus ? "var(--vocals)" : "color-mix(in srgb, var(--vocals) 35%, transparent)",
              }}
              title={p.label || "Vocal"}
            >
              {p.chorus ? "Chorus" : ""}
            </span>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9.5px] text-muted tabular-nums" aria-hidden>
          <span>beat energy · vocal below</span>
          <span>{clock(span)}</span>
        </div>
      </div>
    </div>
  );
});
