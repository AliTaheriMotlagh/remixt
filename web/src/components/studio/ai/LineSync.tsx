"use client";

import { memo, useMemo } from "react";
import { CheckIcon, Link } from "lucide-react";
import { originOf, type Scope } from "@/lib/client/aiScope";
import { lineStatus, projectKey, stretchWords } from "@/lib/client/lineStatus";
import { keyLabel } from "@/lib/client/musicKey";
import { laneName, type StudioLane } from "@/lib/client/studioStore";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import { KIND_ICON } from "../../StudioLibraryPanel";
import { Switch } from "./ui";

// Every line of the mix — vocals, beats, drums, bass, melody — and whether
// it moves with the rest: its speed against the song's, its key against
// the song's. Each has a switch for whether the AI may change it at all;
// the lines switched off stay exactly as they are, whatever is tried.

export default memo(function LineSync({
  lanes,
  projectBpm,
  scope,
  onScope,
  disabled,
}: {
  /** The mix as it sounds now (what's being tried included). */
  lanes: StudioLane[];
  projectBpm: number;
  scope: Scope;
  onScope: (scope: Scope) => void;
  disabled: boolean;
}) {
  // A vocal's layers and a beat's swapped-in parts go with the line they came from.
  const own = useMemo(() => lanes.filter((l) => originOf(l.laneId) === l.laneId), [lanes]);
  const reference = useMemo(() => projectKey(lanes), [lanes]);
  const inStep = own.filter((l) => lineStatus(l, projectBpm, reference).inStep).length;
  const picked = new Set(scope.lanes ?? own.map((l) => l.laneId));

  function toggle(laneId: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(laneId);
    else next.delete(laneId);
    // At least one line: with none, there'd be nothing for the AI to do.
    if (!next.size) return;
    const all = own.every((l) => next.has(l.laneId));
    onScope({ ...scope, lanes: all ? null : own.map((l) => l.laneId).filter((id) => next.has(id)) });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Link className="text-brand-strong" /> Line sync
          </h3>
          <p className="text-[11px] text-muted">
            {inStep === own.length ? `All ${own.length} lines move at ${projectBpm.toFixed(0)} BPM` : `${inStep} of ${own.length} lines move at the song's ${projectBpm.toFixed(0)} BPM`} · switch a line off to keep the AI away from it
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${inStep === own.length ? "bg-success/15 text-success" : "bg-amber-400/15 text-amber-400"}`}
        >
          {inStep}/{own.length}
        </span>
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {own.map((lane) => {
          const status = lineStatus(lane, projectBpm, reference);
          const KindIcon = KIND_ICON[lane.kind];
          const color = kindColor(lane.kind);
          const on = picked.has(lane.laneId);
          const layers = lanes.filter((l) => l.laneId !== lane.laneId && originOf(l.laneId) === lane.laneId).length;
          return (
            <li key={lane.laneId} className={`flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/50 p-2 ${on ? "" : "opacity-60"}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }} aria-hidden>
                <KindIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {laneName(lane)}
                  <span className="ml-1 text-[10px] font-normal" style={{ color }}>
                    {kindLabel(lane.kind)}
                    {layers ? ` +${layers}` : ""}
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-[10.5px]">
                  {status.bpm !== null && (
                    <span className={status.inStep ? "text-success" : "text-amber-400"}>
                      {status.inStep && <CheckIcon />} {status.bpm.toFixed(0)} BPM{status.inStep ? "" : ` · ${stretchWords(status.stretch)}`}
                    </span>
                  )}
                  {status.key && lane.kind !== "drums" && (
                    <span className={status.inKey ? "text-muted" : "text-danger"}>
                      {keyLabel(status.key)}
                      {lane.pitchSemitones ? ` (${lane.pitchSemitones > 0 ? "+" : ""}${lane.pitchSemitones})` : ""}
                      {!status.inKey && " · clashes"}
                    </span>
                  )}
                  {lane.tempoRatio !== 1 && <span className="text-muted">{Math.abs(Math.round((lane.tempoRatio - 1) * 1000) / 10)}% {lane.tempoRatio > 1 ? "faster" : "slower"} than recorded</span>}
                </p>
              </div>
              <Switch on={on} disabled={disabled || (on && picked.size === 1)} onChange={(next) => toggle(lane.laneId, next)} label={on ? `The AI may change ${laneName(lane)}` : `The AI leaves ${laneName(lane)} alone`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
});
