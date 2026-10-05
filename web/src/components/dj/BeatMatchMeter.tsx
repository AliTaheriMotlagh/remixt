"use client";

import { useState } from "react";
import { derive, type Derived } from "@/lib/client/dj/djDerived";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { useInterval } from "./useInterval";

const FIT_TEXT: Record<string, { label: string; cls: string }> = {
  same: { label: "Same key", cls: "text-success" },
  relative: { label: "Relative: same notes", cls: "text-success" },
  neighbour: { label: "Neighbours: blends", cls: "text-beat" },
  far: { label: "Two steps: tense", cls: "text-drums" },
  clash: { label: "Clash", cls: "text-danger" },
};

function Gauge({ value, limit, good, unit, label, format }: { value: number; limit: number; good: number; unit: string; label: string; format: (v: number) => string }) {
  const clamped = Math.max(-limit, Math.min(limit, value));
  const pos = ((clamped + limit) / (2 * limit)) * 100;
  const ok = Math.abs(value) <= good;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className={`font-mono text-sm font-bold tabular-nums ${ok ? "text-success" : "text-foreground"}`}>
          {format(value)} {unit}
        </span>
      </div>
      <div className="relative mt-1 h-3 rounded-full bg-black/40" role="img" aria-label={`${label}: ${format(value)} ${unit}`}>
        <div className="absolute inset-y-0 rounded-full bg-success/25" style={{ left: `${((limit - good) / (2 * limit)) * 100}%`, width: `${(good / limit) * 100}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
        <div className={`absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-full ${ok ? "bg-success" : "bg-white"}`} style={{ left: `${pos}%` }} />
      </div>
    </div>
  );
}

/** Live tempo difference, beat phase and Camelot compatibility between the decks. */
export default function BeatMatchMeter({ engine }: { engine: DjEngine }) {
  const [d, setD] = useState<Derived | null>(null);
  useInterval(() => setD(derive(engine.snapshot())), 100);
  const fit = d?.keyFit ? FIT_TEXT[d.keyFit] : null;
  return (
    <section aria-label="Beat-match meter" className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide">Beat-match meter</h3>
      {!d || !d.bothLoaded ? (
        <p className="text-xs text-muted">Load a track on both decks to compare them.</p>
      ) : (
        <>
          <Gauge label="Tempo (A − B)" value={d.tempoDiff} limit={4} good={0.5} unit="BPM" format={(v) => (v > 0 ? "+" : "") + v.toFixed(2)} />
          <Gauge
            label="Beat phase (B vs A)"
            value={d.bothPlaying ? d.phaseMs : 0}
            limit={150}
            good={30}
            unit="ms"
            format={(v) => (d.bothPlaying ? (v > 0 ? "+" : "") + v.toFixed(0) : "n/a")}
          />
          <p className="text-[11px] text-muted">
            {d.bothPlaying
              ? Math.abs(d.phaseMs) <= 30
                ? "Beats are locked."
                : `Deck ${d.phaseMs > 0 ? "B" : "A"} is ${Math.abs(d.phaseBeats).toFixed(2)} of a beat early.`
              : "Start both decks to see the phase."}
          </p>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted">Key</span>
            <span className="font-mono font-bold">
              {d.key?.camelotA} · {d.key?.camelotB}
            </span>
            {fit && <span className={`font-semibold ${fit.cls}`}>{fit.label}</span>}
          </div>
        </>
      )}
    </section>
  );
}
