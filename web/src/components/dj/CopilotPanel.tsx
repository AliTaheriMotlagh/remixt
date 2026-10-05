"use client";

import { useState } from "react";
import { Bot, CheckCircle2, Lightbulb, TriangleAlert } from "lucide-react";
import { liveHints, type Hint } from "@/lib/client/dj/copilot";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { useInterval } from "./useInterval";

const ICON = {
  warn: <TriangleAlert className="mt-0.5 text-drums" />,
  tip: <Lightbulb className="mt-0.5 text-beat" />,
  good: <CheckCircle2 className="mt-0.5 text-success" />,
} as const;

/**
 * The Co-pilot: watches both decks about four times a second and says what
 * to do next in plain language. `missionHint` (from the current objective)
 * comes first.
 */
export default function CopilotPanel({
  engine,
  enabled,
  onToggle,
  missionHint,
}: {
  engine: DjEngine;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  missionHint?: () => string | null;
}) {
  const [hints, setHints] = useState<Hint[]>([]);
  useInterval(() => {
    if (!enabled) return;
    const next = liveHints(engine.snapshot(), missionHint?.() ?? null);
    setHints((prev) => (prev.length === next.length && prev.every((h, i) => h.text === next[i].text) ? prev : next));
  }, enabled ? 250 : null);

  return (
    <section aria-label="Co-pilot" className="rounded-2xl border border-border bg-surface p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          <Bot /> Co-pilot
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="size-4 accent-brand" />
          Assist
        </label>
      </header>
      {!enabled ? (
        <p className="mt-2 text-xs text-muted">Assist is off. Turn it on for live, plain-language hints.</p>
      ) : hints.length === 0 ? (
        <p className="mt-2 text-xs text-muted">All clear. Nothing to fix right now.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5" aria-live="polite">
          {hints.map((h) => (
            <li key={h.id + h.text} className="flex items-start gap-2 rounded-lg bg-background/50 px-2.5 py-1.5 text-sm">
              {ICON[h.level]}
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
