"use client";

import { useState } from "react";
import { useStudioStore } from "@/lib/client/studioStore";

export default function BpmSyncPanel() {
  const lanes = useStudioStore((s) => s.lanes);
  const matchAllToBpm = useStudioStore((s) => s.matchAllToBpm);
  const resetAllTempo = useStudioStore((s) => s.resetAllTempo);

  const knownBpms = lanes.filter((l) => l.bpm && l.bpm > 0);
  const beatLane = lanes.find((l) => l.kind === "beat" && l.bpm);
  const defaultTarget = beatLane?.bpm ?? knownBpms[0]?.bpm ?? 120;

  const [target, setTarget] = useState(defaultTarget);
  const [lastLaneCount, setLastLaneCount] = useState(lanes.length);
  const isMatched = lanes.some((l) => Math.abs(l.tempoRatio - 1) > 0.001);

  // Reset the suggested target BPM whenever the lane set changes, without
  // an Effect: this is React's documented "adjust state during render"
  // pattern for syncing local state to an external change.
  if (lanes.length !== lastLaneCount) {
    setLastLaneCount(lanes.length);
    setTarget(defaultTarget);
  }

  if (knownBpms.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        BPM sync
      </span>
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        {lanes.map((l, i) => (
          <span key={l.laneId}>
            {i > 0 && <span className="mr-1.5 text-border">·</span>}
            {l.trackTitle}: {l.bpm ? `${l.bpm} BPM` : "unknown"}
          </span>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Target
          <input
            type="number"
            min={40}
            max={220}
            step={0.1}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="input w-20 !py-1 text-xs"
          />
          BPM
        </label>
        <button
          onClick={() => matchAllToBpm(target)}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          Match all
        </button>
        {isMatched && (
          <button
            onClick={resetAllTempo}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
