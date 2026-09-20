"use client";

import { useRef } from "react";
import { beatLength, useStudioStore } from "@/lib/client/studioStore";

/**
 * Project tempo: the grid every other timing control is measured against
 * (the ruler, lane nudges, tempo-synced delays, the metronome).
 */
export default function BpmSyncPanel() {
  const lanes = useStudioStore((s) => s.lanes);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const setProjectBpm = useStudioStore((s) => s.setProjectBpm);
  const matchAllToBpm = useStudioStore((s) => s.matchAllToBpm);
  const resetAllTempo = useStudioStore((s) => s.resetAllTempo);
  const setLoop = useStudioStore((s) => s.setLoop);

  const tapTimes = useRef<number[]>([]);

  const isStretched = lanes.some((l) => Math.abs(l.tempoRatio - 1) > 0.001);
  const withBpm = lanes.filter((l) => l.bpm && l.bpm > 0);
  const hasLoop = loopEnd > loopStart;

  // Tap tempo: average the gaps between the last few taps. Gaps longer
  // than two seconds start a new measurement rather than dragging the
  // average down.
  function handleTap() {
    const now = performance.now();
    const recent = tapTimes.current.filter((t) => now - t < 2000);
    const taps = [...recent, now].slice(-6);
    tapTimes.current = taps;
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (average > 0) setProjectBpm(Math.round((60000 / average) * 10) / 10);
    }
  }

  if (lanes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Project</span>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        Tempo
        <input
          type="number"
          min={20}
          max={300}
          step={0.1}
          value={projectBpm}
          onChange={(e) => setProjectBpm(Number(e.target.value))}
          className="input w-20 !py-1 text-xs"
        />
        BPM
      </label>

      <button
        onClick={handleTap}
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        title="Tap four times in time with the music to set the tempo"
      >
        Tap
      </button>

      <button
        onClick={() => matchAllToBpm(projectBpm)}
        disabled={withBpm.length === 0}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        title="Time-stretch every lane with a known BPM to the project tempo"
      >
        Match all lanes
      </button>

      {isStretched && (
        <button
          onClick={resetAllTempo}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover"
        >
          Reset stretch
        </button>
      )}

      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
        {lanes.map((lane, i) => (
          <span key={lane.laneId}>
            {i > 0 && <span className="mr-2 text-border">·</span>}
            {lane.trackTitle}: {lane.bpm ? `${(lane.bpm * lane.tempoRatio).toFixed(1)} BPM` : "BPM unknown"}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted">
        {hasLoop ? (
          <>
            <span className="font-mono tabular-nums">
              Loop {loopStart.toFixed(2)}s – {loopEnd.toFixed(2)}s
              {" "}
              ({Math.max(1, Math.round((loopEnd - loopStart) / (beatLength(projectBpm) * 4)))} bars)
            </span>
            <button
              onClick={() => setLoop({ enabled: !loopEnabled })}
              className="nudge"
            >
              {loopEnabled ? "loop on" : "loop off"}
            </button>
            <button onClick={() => setLoop({ enabled: false, start: 0, end: 0 })} className="nudge">
              clear
            </button>
          </>
        ) : (
          <span>Drag across the timeline to set a loop region</span>
        )}
      </div>
    </div>
  );
}
