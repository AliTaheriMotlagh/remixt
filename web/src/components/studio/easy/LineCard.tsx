"use client";

import { memo, useState } from "react";
import { ChevronLeft, ChevronRight, Headphones, Loader2, MessageCircle, Minus, Plus, Split, Trash2 } from "lucide-react";
import type { LineStatus } from "@/lib/client/lineStatus";
import { stretchWords } from "@/lib/client/lineStatus";
import { keyLabel } from "@/lib/client/musicKey";
import { nudge, transpose } from "@/lib/client/quickAdjust";
import { canSeparate, separateBeat } from "@/lib/client/songLines";
import { startNewStep } from "@/lib/client/studioHistory";
import { DEFAULT_FX, FX_PRESETS, laneName, useStudioStore, type LaneFx, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import { KIND_ICON } from "../../StudioLibraryPanel";

// One line of the song (a lane) as the Easy studio shows it: what it is,
// whether it's in step with the rest, and the few things anyone can change
// — on or off, on its own, how loud, how it sounds; for a vocal, a little
// earlier or later and higher or lower; for a beat, taking it apart into
// its drums, bass and melody. Every change is one undo step.

/** Plain names for the effect presets. */
const SOUND_NAMES: Record<string, string> = {
  clean: "Clean",
  "vocal-air": "Bright",
  "vocal-hall": "Big hall",
  "vocal-slap": "Echo",
  "vocal-throw": "Long echo",
  "vocal-radio": "Radio",
  "vocal-double": "Wide",
  "beat-punch": "Punchy",
  "beat-lofi": "Lo-fi",
  "beat-duck": "Softer mids",
};

/** The fx that make a preset's sound (fades are the song's, not the sound's). */
const SOUND_FIELDS = (Object.keys(DEFAULT_FX) as (keyof LaneFx)[]).filter((k) => k !== "fadeIn" && k !== "fadeOut" && k !== "duck");

/** Which preset a lane sounds like now, if any. */
export function presetOf(lane: StudioLane) {
  return (
    FX_PRESETS.find((p) => {
      const fx = { ...DEFAULT_FX, ...p.fx };
      return SOUND_FIELDS.every((k) => lane.fx[k] === fx[k]);
    })?.id ?? null
  );
}

/** An on/off switch, big enough for a thumb. */
export function BigSwitch({ on, onChange, label, color }: { on: boolean; onChange: (on: boolean) => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors"
      style={{ background: on ? (color ?? "var(--brand)") : "var(--border)" }}
    >
      <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

const small =
  "flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold transition-colors hover:border-brand hover:text-foreground disabled:opacity-40";

function LineCard({ lane, status, audible }: { lane: StudioLane; status: LineStatus; audible: boolean }) {
  const accent = kindColor(lane.kind);
  const KindIcon = KIND_ICON[lane.kind];
  const [separating, setSeparating] = useState(false);
  const store = useStudioStore.getState;
  const sound = presetOf(lane);
  const presets = FX_PRESETS.filter((p) => p.kind === "any" || p.kind === (lane.kind === "vocals" ? "vocals" : "beat"));
  const isVocal = lane.kind === "vocals";
  const percent = Math.round(lane.volume * 100);

  function remove() {
    startNewStep();
    store().removeLane(lane.laneId);
    useStudioView.getState().notify(`Removed “${laneName(lane)}” — ⌘Z to undo`);
  }

  async function separate() {
    setSeparating(true);
    try {
      await separateBeat(lane.laneId);
    } finally {
      setSeparating(false);
    }
  }

  return (
    <article
      aria-label={`${kindLabel(lane.kind)}: ${laneName(lane)}`}
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-surface p-3.5 transition-opacity ${audible ? "" : "opacity-60"}`}
      style={{ borderColor: `color-mix(in srgb, ${accent} 45%, var(--border))` }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white" style={{ background: accent }}>
          <KindIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: accent }}>
            {kindLabel(lane.kind)}
          </p>
          <p className="truncate text-sm font-semibold leading-tight" title={lane.trackTitle}>
            {laneName(lane)}
          </p>
          <p className="truncate text-[11px] text-muted">{lane.artistName}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <BigSwitch on={!lane.muted} onChange={() => (startNewStep(), store().toggleMute(lane.laneId))} label={lane.muted ? `Turn ${laneName(lane)} on` : `Turn ${laneName(lane)} off`} color={accent} />
          <span className="text-[10px] font-semibold text-muted">{lane.muted ? "Off" : "On"}</span>
        </div>
      </div>

      {/* In step with the rest of the song? */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {status.bpm !== null && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${status.inStep ? "bg-success/15 text-success" : "bg-amber-400/15 text-amber-400"}`}
            title={status.inStep ? "Moves at the song's speed" : "A different speed from the rest of the song — the AI can match it"}
          >
            {status.bpm.toFixed(0)} BPM · {stretchWords(status.stretch)}
          </span>
        )}
        {status.key && lane.kind !== "drums" && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${status.inKey ? "bg-surface-raised text-muted" : "bg-danger/15 text-danger"}`}
            title={status.inKey ? "Its notes sit with the song's key" : "Its notes clash with the song's key — the AI can shift it"}
          >
            {keyLabel(status.key)}
            {!status.inKey && " · clashes"}
          </span>
        )}
      </div>

      <label className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs font-semibold">Volume</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={lane.volume}
          onChange={(e) => store().setVolume(lane.laneId, Number(e.target.value))}
          onDoubleClick={() => store().setVolume(lane.laneId, 1)}
          className="h-2 min-w-0 flex-1"
          style={{ accentColor: accent }}
          aria-label={`${laneName(lane)} volume`}
        />
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{percent}%</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Sound</span>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin" role="radiogroup" aria-label={`${laneName(lane)} sound`}>
          {presets.map((p) => {
            const on = sound === p.id;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                title={p.hint}
                onClick={() => {
                  startNewStep();
                  store().applyPreset(lane.laneId, p.id);
                }}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                style={on ? { borderColor: accent, background: `color-mix(in srgb, ${accent} 22%, transparent)` } : undefined}
              >
                {SOUND_NAMES[p.id] ?? p.label}
              </button>
            );
          })}
          {!sound && (
            <span className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted" title="Effects set by hand or by the AI">
              Your own
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {isVocal && (
          <>
            <div className="flex items-center gap-1" role="group" aria-label="Timing">
              <button className={small} onClick={() => nudge(lane.laneId, -0.5)} title="Half a beat earlier">
                <ChevronLeft /> Earlier
              </button>
              <button className={small} onClick={() => nudge(lane.laneId, 0.5)} title="Half a beat later">
                Later <ChevronRight />
              </button>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Pitch">
              <button className={small} onClick={() => transpose(lane.laneId, -1)} title="A semitone lower" aria-label="Lower">
                <Minus />
              </button>
              <span className="w-14 text-center text-[11px] text-muted tabular-nums">{lane.pitchSemitones ? `${lane.pitchSemitones > 0 ? "+" : ""}${lane.pitchSemitones} st` : "pitch"}</span>
              <button className={small} onClick={() => transpose(lane.laneId, 1)} title="A semitone higher" aria-label="Higher">
                <Plus />
              </button>
            </div>
          </>
        )}
        {canSeparate(lane) && (
          <button className={`${small} border-brand/50`} onClick={() => void separate()} disabled={separating} title="Drums, bass and melody as lines of their own — each one to change on its own">
            {separating ? <Loader2 className="animate-spin" /> : <Split />} Separate drums · bass · melody
          </button>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-2.5">
        <button
          onClick={() => store().toggleSolo(lane.laneId)}
          aria-pressed={lane.solo}
          className={`${small} ${lane.solo ? "border-success bg-success/15 text-foreground" : "text-muted"}`}
          title="Hear only the lines set to 'Only this'"
        >
          <Headphones /> Only this
        </button>
        <button
          onClick={() =>
            useStudioView.getState().askAi(`About “${laneName(lane)}” (lane ${lane.laneId}): how can this ${isVocal ? "vocal" : "line"} sit better in the mix? Check its timing, key and sound, and try a fix.`)
          }
          className={`${small} text-muted`}
          title="Ask the AI about this line"
        >
          <MessageCircle className="text-brand-strong" /> Ask AI
        </button>
        <button onClick={remove} className={`${small} ml-auto text-muted hover:!border-danger hover:!text-danger`} aria-label={`Remove ${laneName(lane)}`} title="Remove this line (⌘Z brings it back)">
          <Trash2 />
        </button>
      </div>
    </article>
  );
}

export default memo(LineCard);
