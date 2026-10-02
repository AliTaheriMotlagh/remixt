"use client";

import { useRef, useState } from "react";
import { filterFrequency } from "@/lib/client/modulation";
import {
  beatLength,
  useStudioStore,
  type AutoPoint,
  type AutomationParam,
  type StudioLane,
} from "@/lib/client/studioStore";

const PARAMS: { id: AutomationParam; label: string; hint: string }[] = [
  { id: "volume", label: "Volume", hint: "Rides the lane's level up and down (100% = its fader)" },
  { id: "filter", label: "Filter", hint: "Sweeps a low-pass filter — down for a muffled build, up to open it out" },
];

function formatValue(param: AutomationParam, v: number) {
  if (param === "volume") return `${Math.round(v * 100)}%`;
  const hz = filterFrequency(v);
  return hz >= 19000 ? "open" : hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`;
}

/**
 * Draw how a lane's volume or filter changes over the song. Tap or click
 * the strip to add a point, drag points to move them, double-click (or
 * select and press "delete point") to remove one. Between points the value
 * glides in a straight line; before the first and after the last it holds.
 */
export default function AutomationLane({ lane, span, accent }: { lane: StudioLane; span: number; accent: string }) {
  const setAutomation = useStudioStore((s) => s.setAutomation);
  const snapToGrid = useStudioStore((s) => s.snapToGrid);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const [param, setParam] = useState<AutomationParam>("volume");
  const [selected, setSelected] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; points: AutoPoint[] } | null>(null);

  const points = lane.automation[param] ?? [];
  const grid = beatLength(projectBpm) / 4;

  function at(e: React.PointerEvent): AutoPoint {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    const t = x * span;
    return { t: snapToGrid ? Math.round(t / grid) * grid : t, v: Math.round(y * 100) / 100 };
  }

  function commit(next: AutoPoint[]) {
    setAutomation(lane.laneId, param, next.length ? next : null);
  }

  function handleDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!ref.current) return;
    e.preventDefault();
    const point = at(e);
    // A new point, dragged from where it was put down.
    const next = [...points, point].sort((a, b) => a.t - b.t);
    const index = next.indexOf(point);
    drag.current = { index, points: next };
    setSelected(index);
    commit(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { index, points };
    setSelected(index);
    ref.current?.setPointerCapture(e.pointerId);
  }

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const moved = at(e);
    const next = state.points.map((p, i) => (i === state.index ? moved : p));
    commit(next);
    // Keep following the same point after the sort in setAutomation.
    const sorted = [...next].sort((a, b) => a.t - b.t);
    drag.current = { index: sorted.indexOf(moved), points: sorted };
    setSelected(sorted.indexOf(moved));
  }

  function handleUp() {
    drag.current = null;
  }

  function remove(index: number) {
    commit(points.filter((_, i) => i !== index));
    setSelected(null);
  }

  // The line, held flat before the first point and after the last.
  const line =
    points.length === 0
      ? "0,0 1000,0"
      : [
          `0,${100 - points[0].v * 100}`,
          ...points.map((p) => `${(p.t / span) * 1000},${100 - p.v * 100}`),
          `1000,${100 - points[points.length - 1].v * 100}`,
        ].join(" ");

  return (
    <div className="flex h-full flex-col gap-1 py-1">
      {/* Stays in view while a zoomed timeline scrolls sideways. */}
      <div className="sticky left-1 flex w-fit max-w-[calc(100vw-10rem)] flex-wrap items-center gap-1 text-[10px] text-muted">
        <span className="mr-0.5">Automate</span>
        {PARAMS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setParam(p.id);
              setSelected(null);
            }}
            className={`nudge ${param === p.id ? "!border-brand !text-foreground" : ""}`}
            title={p.hint}
          >
            {p.label}
            {lane.automation[p.id]?.length ? " •" : ""}
          </button>
        ))}
        {selected !== null && points[selected] && (
          <>
            <span className="ml-1 font-mono">
              {points[selected].t.toFixed(2)}s → {formatValue(param, points[selected].v)}
            </span>
            <button onClick={() => remove(selected)} className="nudge hover:!text-danger">
              delete point
            </button>
          </>
        )}
        {points.length > 0 && (
          <button onClick={() => commit([])} className="nudge ml-auto hover:!text-danger" title="Remove every point">
            clear {param}
          </button>
        )}
      </div>
      <div
        ref={ref}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className="relative min-h-0 flex-1 cursor-crosshair touch-none overflow-hidden rounded-md border border-border bg-background"
        title="Tap to add a point · drag points · double-click a point to delete it"
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <polyline
            points={line}
            fill="none"
            stroke={points.length ? accent : "var(--border)"}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={points.length ? undefined : "4 4"}
          />
        </svg>
        {points.length === 0 && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-muted">
            Tap to add the first {param} point
          </span>
        )}
        {points.map((p, i) => (
          <div
            key={i}
            onPointerDown={(e) => handlePointDown(e, i)}
            onDoubleClick={() => remove(i)}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 cursor-grab rounded-full border-2 border-background pointer-coarse:h-5 pointer-coarse:w-5 ${
              selected === i ? "ring-2 ring-foreground" : ""
            }`}
            style={{ left: `${(p.t / span) * 100}%`, bottom: `${p.v * 100}%`, background: accent }}
          />
        ))}
      </div>
    </div>
  );
}
