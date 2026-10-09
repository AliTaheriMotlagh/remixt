"use client";

import { clipEnd, clipStart, clipsOf } from "@/lib/client/clipEdit";
import type { StudioLane } from "@/lib/client/studioStore";
import { kindColor } from "@/lib/stemKinds";

// A lane's clips as blocks on a strip — the shape of an arrangement at a
// glance, with no editing: the Easy studio's song map and the AI
// producer's before/after pictures are drawn with it.

/** Where a lane plays, as fractions of `span` seconds: one block per clip that isn't muted. */
export function laneBlocks(lane: StudioLane, span: number) {
  if (!(span > 0)) return [];
  return clipsOf(lane)
    .filter((c) => !c.muted)
    .map((c) => {
      const start = Math.max(0, clipStart(lane, c));
      const end = Math.min(span, clipEnd(lane, c));
      return { left: start / span, width: Math.max(0, end - start) / span, label: c.label, reverse: !!c.reverse };
    })
    .filter((b) => b.width > 0);
}

export default function LaneStrip({
  lane,
  span,
  className = "h-2",
  dim = false,
  color,
}: {
  lane: StudioLane;
  /** Seconds the strip's width stands for. */
  span: number;
  className?: string;
  /** Faded: muted, or the "before" side of a comparison. */
  dim?: boolean;
  color?: string;
}) {
  const accent = color ?? kindColor(lane.kind);
  return (
    <div className={`relative ${className}`} aria-hidden>
      {laneBlocks(lane, span).map((b, i) => (
        <span
          key={i}
          className="absolute inset-y-0 rounded-[3px]"
          style={{
            left: `${b.left * 100}%`,
            width: `max(2px, calc(${b.width * 100}% - 1px))`,
            background: accent,
            opacity: dim ? 0.35 : b.reverse ? 0.6 : 0.9,
          }}
        />
      ))}
    </div>
  );
}
