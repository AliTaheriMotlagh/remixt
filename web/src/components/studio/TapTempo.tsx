"use client";

import { useRef, useState } from "react";

/**
 * Tap along with the beat to measure its tempo — for stems whose detected
 * BPM came out wrong (half, double, or just off). Four taps give a first
 * reading; more taps make it steadier. A pause of two seconds starts over.
 */
export default function TapTempo({ onTempo }: { onTempo: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const [count, setCount] = useState(0);

  function tap() {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > 2000) taps.current = [];
    taps.current = [...taps.current, now].slice(-16);
    setCount(taps.current.length);
    if (taps.current.length < 4) return;
    const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
    // The median ignores the odd early or late tap.
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const bpm = 60000 / median;
    if (bpm >= 40 && bpm <= 240) onTempo(Math.round(bpm * 10) / 10);
  }

  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        tap();
      }}
      className="touch-manipulation rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-brand/60 hover:text-foreground active:bg-brand/20"
      title="Tap along with the beat (4+ taps) to set this lane's BPM"
    >
      {count > 0 && count < 4 ? `tap ${count}/4` : "tap"}
    </button>
  );
}
