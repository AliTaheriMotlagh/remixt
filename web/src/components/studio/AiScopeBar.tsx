"use client";

import { Crosshair, Drum, Mic } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { originOf, sectionChoices, useAiScope, WHOLE_SONG, type Scope } from "@/lib/client/aiScope";
import { laneName, useStudioStore, type StudioLane } from "@/lib/client/studioStore";

// What the AI producer may change: the whole song or one section of it,
// and every lane or only some. Every idea, fix and style follows it; the
// rest of the mix stays exactly as it is.

export default function AiScopeBar({ lanes, onChange, disabled }: { lanes: StudioLane[]; onChange: (scope: Scope) => void; disabled: boolean }) {
  const scope = useAiScope((s) => s.scope);
  const view = useStudioStore(
    useShallow((s) => ({
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      markers: s.markers,
      selectedClips: s.selectedClips,
      projectBpm: s.projectBpm,
      duration: s.duration,
    }))
  );
  // The playhead moves every frame: read when drawn, not followed.
  const choices = sectionChoices({ ...view, lanes, playhead: useStudioStore.getState().playhead });
  // Lanes as the person added them — a vocal's layers and a beat's parts go with it.
  const own = lanes.filter((l) => originOf(l.laneId) === l.laneId);
  const picked = new Set(scope.lanes ?? []);
  const range = scope.range;
  const current = range ? choices.find((c) => Math.abs(c.start - range.start) < 0.01 && Math.abs(c.end - range.end) < 0.01) : null;

  const pickSection = (id: string) => {
    const choice = choices.find((c) => c.id === id);
    if (choice) onChange({ ...scope, range: { start: choice.start, end: choice.end, label: choice.label } });
  };
  const toggleLane = (laneId: string) => {
    const next = new Set(picked);
    if (next.has(laneId)) next.delete(laneId);
    else next.add(laneId);
    const all = own.every((l) => next.has(l.laneId));
    onChange({ ...scope, lanes: next.size === 0 || all ? null : own.map((l) => l.laneId).filter((id) => next.has(id)) });
  };
  const segment = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1 px-2 py-1.5 whitespace-nowrap transition-colors disabled:opacity-40 ${on ? "bg-brand text-white" : "text-muted hover:text-foreground"}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5" aria-label="What the AI works on">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-muted">
          <Crosshair /> AI works on
        </span>
        <div className="flex flex-1 overflow-hidden rounded-lg border border-border text-[11px] font-semibold" role="group">
          <button type="button" className={segment(!range)} aria-pressed={!range} disabled={disabled} onClick={() => range && onChange({ ...scope, range: null })}>
            Whole song
          </button>
          <button
            type="button"
            className={segment(!!range)}
            aria-pressed={!!range}
            disabled={disabled || !choices.length}
            onClick={() => !range && choices[0] && pickSection(choices[0].id)}
            title="Just one stretch of the song — the loop, the selected clips, a marker or the next 8 bars"
          >
            A section
          </button>
        </div>
      </div>
      {range && (
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          <select value={current?.id ?? ""} onChange={(e) => pickSection(e.target.value)} disabled={disabled} className="input !py-1 text-xs">
            {!current && <option value="">{range.label}</option>}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span>Drag across the ruler to loop a stretch, or select clips, to pick any part.</span>
        </label>
      )}
      {own.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Lanes the AI may change">
          <button
            type="button"
            onClick={() => onChange({ ...scope, lanes: null })}
            disabled={disabled}
            aria-pressed={!scope.lanes}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${!scope.lanes ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
          >
            All lanes
          </button>
          {own.map((l) => {
            const on = picked.has(l.laneId);
            const LaneIcon = l.kind === "vocals" ? Mic : Drum;
            return (
              <button
                key={l.laneId}
                type="button"
                onClick={() => toggleLane(l.laneId)}
                disabled={disabled}
                aria-pressed={on}
                className={`flex max-w-[11rem] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${on ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
              >
                <LaneIcon className="shrink-0" />
                <span className="truncate">{laneName(l)}</span>
              </button>
            );
          })}
        </div>
      )}
      {(range || scope.lanes) && (
        <p className="text-[11px] text-muted">
          Ideas change {range ? `only ${range.label.toLowerCase()}` : "the whole song"}
          {scope.lanes ? ` of ${scope.lanes.map((id) => own.find((l) => l.laneId === id)).filter(Boolean).map((l) => laneName(l!)).join(", ")}` : ""} — the rest stays as it is.{" "}
          <button type="button" onClick={() => onChange(WHOLE_SONG)} disabled={disabled} className="font-semibold text-brand-strong hover:underline">
            Whole mix
          </button>
        </p>
      )}
    </div>
  );
}
