"use client";

import { useStemLoading } from "@/lib/client/stemLoading";

/** "Loading 2 stems · 45%" beside play while stems download — what a press of play is waiting on. */
export default function StemLoadPill({ className = "" }: { className?: string }) {
  const loads = useStemLoading((s) => s.stems);
  const all = Object.values(loads);
  if (!all.length) return null;
  const known = all.filter((l) => l.phase === "decode" || l.progress !== null);
  const pct = known.length ? Math.round((known.reduce((sum, l) => sum + (l.phase === "decode" ? 1 : l.progress!), 0) / all.length) * 100) : null;
  const preparing = all.every((l) => l.phase === "decode");
  return (
    <span
      role="status"
      aria-live="polite"
      className={`relative flex h-7 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border border-brand/40 bg-brand/10 pl-2 pr-2.5 text-[11px] font-semibold text-foreground ${className}`}
      title="New stems download once, then play instantly from this device"
    >
      <span className="absolute inset-y-0 left-0 bg-brand/20 transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} aria-hidden />
      <span className="relative h-3 w-3 animate-spin rounded-full border-2 border-brand-strong border-t-transparent" aria-hidden />
      <span className="relative tabular-nums">
        <span className="max-sm:hidden">
          {preparing ? "Preparing" : "Loading"} {all.length} stem{all.length === 1 ? "" : "s"}
          {pct !== null && !preparing ? " · " : "…"}
        </span>
        {pct !== null && !preparing ? `${pct}%` : <span className="sm:hidden">…</span>}
      </span>
    </span>
  );
}
