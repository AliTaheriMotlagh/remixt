"use client";

import { useEffect, useRef } from "react";
import { gridRects, type GridSong, type PairAnalysis, type PairSong } from "@/lib/client/examplesMatch";

/**
 * The vocal's bars against the beat's bar lines. Matched, they sit exactly
 * on the grid; raw, the vocal slides against it, which is the whole problem.
 */
export default function BarGrid({
  vocal,
  beat,
  analysis,
  matched,
  fraction,
}: {
  vocal: GridSong;
  beat: PairSong;
  analysis: PairAnalysis;
  matched: boolean;
  fraction: (() => number) | null;
}) {
  const { bars, rects } = gridRects(vocal, beat, analysis, matched);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = head.current;
    if (!h) return;
    if (!fraction) {
      h.style.display = "none";
      return;
    }
    h.style.display = "block";
    let raf = 0;
    const tick = () => {
      h.style.left = `${Math.min(1, Math.max(0, fraction())) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fraction]);

  const sungBars = rects.filter((r) => r.sung).length;

  return (
    <div
      role="img"
      aria-label={`${matched ? "Matched" : "Raw"} bar grid: ${sungBars} sung vocal bars against ${bars} beat bars. ${
        matched ? "The vocal's bars land on the beat's bar lines." : "The vocal's bars drift off the beat's bar lines."
      }`}
      className="select-none"
    >
      <div className="relative">
        <div className="mb-1 flex text-[10px] text-muted">
          {Array.from({ length: bars }, (_, i) => (
            <span key={i} className="flex-1 border-l border-border pl-1 tabular-nums">
              {i + 1}
            </span>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-lg border border-border bg-background/60">
          {/* The beat */}
          <div className="relative flex h-9 items-center">
            {Array.from({ length: bars }, (_, i) => (
              <div
                key={i}
                className="m-px h-7 flex-1 rounded-sm bg-beat/30"
                style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), rgba(6,182,212,0.45) calc(25% - 1px) 25%)" }}
              />
            ))}
            <span className="absolute left-2 text-[10px] font-semibold uppercase tracking-wide text-beat">Beat</span>
          </div>
          {/* The vocal */}
          <div className="relative h-9 border-t border-border">
            {rects.map((r, i) => (
              <div
                key={i}
                className={`absolute top-1 h-7 rounded-sm ${r.sung ? "bg-vocals/80" : "border border-dashed border-vocals/30"}`}
                style={{ left: `${(r.x / bars) * 100}%`, width: `calc(${(r.w / bars) * 100}% - 2px)` }}
              />
            ))}
            <span className="absolute left-2 top-2.5 text-[10px] font-semibold uppercase tracking-wide text-white mix-blend-difference">Vocal</span>
          </div>
          {/* The beat's bar lines run through both rows. */}
          {Array.from({ length: bars - 1 }, (_, i) => (
            <div key={i} className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: `${((i + 1) / bars) * 100}%` }} />
          ))}
          <div ref={head} className="pointer-events-none absolute inset-y-0 hidden w-0.5 bg-white" />
        </div>
      </div>
    </div>
  );
}
