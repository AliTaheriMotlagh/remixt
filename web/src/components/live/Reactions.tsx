"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { LIVE_REACTIONS } from "@/lib/liveShared";

// Reactions on a live stage: a row of buttons to send them, and a layer
// they float up through — yours instantly, everyone else's as they arrive.

export type ReactionLayerHandle = {
  /** Float `count` of `emoji` up the stage (capped, so a flood stays smooth). */
  burst: (emoji: string, count?: number) => void;
};

type Floater = { key: number; emoji: string; x: number; left: number; duration: number; size: number };

const MAX_FLOATING = 40;

export const ReactionLayer = forwardRef<ReactionLayerHandle, { className?: string }>(function ReactionLayer(
  { className = "" },
  ref
) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const next = useRef(0);

  const burst = useCallback((emoji: string, count = 1) => {
    // Respect people who don't want motion: the counts still update elsewhere.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const made: Floater[] = Array.from({ length: Math.min(count, 6) }, () => ({
      key: next.current++,
      emoji,
      x: (Math.random() - 0.5) * 90,
      left: 8 + Math.random() * 84,
      duration: 2.2 + Math.random() * 1.2,
      size: 1.4 + Math.random() * 0.9,
    }));
    setFloaters((current) => [...current, ...made].slice(-MAX_FLOATING));
    for (const f of made) {
      setTimeout(() => setFloaters((current) => current.filter((c) => c.key !== f.key)), f.duration * 1000 + 100);
    }
  }, []);

  useImperativeHandle(ref, () => ({ burst }), [burst]);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {floaters.map((f) => (
        <span
          key={f.key}
          className="live-float"
          style={{ left: `${f.left}%`, fontSize: `${f.size}rem`, ["--x" as string]: `${f.x}px`, ["--d" as string]: `${f.duration}s` }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
});

/** The buttons: tap to send; the totals sit beside them. */
export function ReactionBar({
  totals,
  onReact,
  disabled = false,
  compact = false,
}: {
  totals: Record<string, number>;
  onReact: (emoji: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Send a reaction">
      {LIVE_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          disabled={disabled}
          aria-label={`Send ${emoji}`}
          className={`group flex items-center gap-1 rounded-full border border-border bg-surface-raised transition-transform hover:border-brand active:scale-90 disabled:opacity-40 ${
            compact ? "px-2 py-1 text-base" : "px-2.5 py-1.5 text-xl pointer-coarse:px-3 pointer-coarse:py-2"
          }`}
        >
          <span>{emoji}</span>
          {(totals[emoji] ?? 0) > 0 && (
            <span className="text-[11px] font-medium tabular-nums text-muted">{compactNumber(totals[emoji])}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function compactNumber(n: number) {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
