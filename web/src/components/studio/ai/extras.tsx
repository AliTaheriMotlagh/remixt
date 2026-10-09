"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Minus, Plus, Sparkles } from "lucide-react";
import { keepTrial, useAiTrial } from "@/lib/client/aiTrial";
import { masterFor } from "@/lib/client/aiIdeas";
import type { Vibe } from "@/lib/client/aiControl";
import { audioEngine } from "@/lib/client/audioEngine";
import { beatModelEnabled, beatModelSupported, setBeatModelEnabled, useBeatModel } from "@/lib/client/neuralBeats";
import { setStretchEngine, stretchEngine } from "@/lib/client/pitchTempo";
import { changeSpeed, gain, nudge, setSpace, spaceOf, transpose, type Space } from "@/lib/client/quickAdjust";
import { startNewStep } from "@/lib/client/studioHistory";
import { MASTER_PRESETS, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { masterPresetOf } from "../MasterPanel";
import { Switch } from "./ui";

// The AI producer's hands-on corner: small fixes for what's left after an
// idea (each one undo step), one-tap mastering, and the switches for how
// the Studio listens and stretches.

/** Fine-tuning works on the mix as it is: an idea being tried is kept first. */
export function keepWhatsPlaying() {
  if (useAiTrial.getState().trial) keepTrial();
}

function TuneRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{label}</p>
        {hint && <p className="truncate text-[10px] text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">{children}</div>
    </div>
  );
}

function TuneButton({ onClick, children, active, title }: { onClick: () => void; children: React.ReactNode; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-w-[2.75rem] border-l border-border px-2.5 py-1.5 text-[11px] font-semibold first:border-l-0 ${active ? "bg-brand text-white" : "hover:bg-surface-hover"}`}
    >
      {children}
    </button>
  );
}

/**
 * Hands-on fixes: the vocal early or late (`timing`), or louder or softer,
 * higher or lower, the beat's level, the whole song's speed and the space
 * around the voice (`mix`).
 */
export function FineTune({ vocal, beat, only }: { vocal: StudioLane; beat: StudioLane | null; only: "timing" | "mix" }) {
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const before = () => keepWhatsPlaying();
  const space = spaceOf(vocal.fx);
  if (only === "timing") {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
        <TuneRow label="Vocal timing" hint="Early or late? Move it (in beats)">
          <TuneButton onClick={() => (before(), nudge(vocal.laneId, -0.5))} title="Half a beat earlier">−½</TuneButton>
          <TuneButton onClick={() => (before(), nudge(vocal.laneId, -0.125))} title="An eighth of a beat earlier">−⅛</TuneButton>
          <TuneButton onClick={() => (before(), nudge(vocal.laneId, 0.125))} title="An eighth of a beat later">+⅛</TuneButton>
          <TuneButton onClick={() => (before(), nudge(vocal.laneId, 0.5))} title="Half a beat later">+½</TuneButton>
        </TuneRow>
        <TuneRow label="Whole song speed" hint={`${projectBpm.toFixed(0)} BPM — everything together`}>
          <TuneButton onClick={() => (before(), changeSpeed(0.97))}>Slower</TuneButton>
          <TuneButton onClick={() => (before(), changeSpeed(1.03))}>Faster</TuneButton>
        </TuneRow>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
      <TuneRow label="Vocal volume" hint={`${Math.round(vocal.volume * 100)}%`}>
        <TuneButton onClick={() => (before(), gain(vocal.laneId, -1.5))} title="Vocal quieter">
          <Minus className="text-sm" />
        </TuneButton>
        <TuneButton onClick={() => (before(), gain(vocal.laneId, 1.5))} title="Vocal louder">
          <Plus className="text-sm" />
        </TuneButton>
      </TuneRow>
      {beat && (
        <TuneRow label="Beat volume" hint={`${Math.round(beat.volume * 100)}%`}>
          <TuneButton onClick={() => (before(), gain(beat.laneId, -1.5))} title="Beat quieter">
            <Minus className="text-sm" />
          </TuneButton>
          <TuneButton onClick={() => (before(), gain(beat.laneId, 1.5))} title="Beat louder">
            <Plus className="text-sm" />
          </TuneButton>
        </TuneRow>
      )}
      <TuneRow label="Vocal pitch" hint={vocal.pitchSemitones ? `${vocal.pitchSemitones > 0 ? "+" : ""}${vocal.pitchSemitones} semitones` : "as sung"}>
        <TuneButton onClick={() => (before(), transpose(vocal.laneId, -1))} title="A semitone lower">Lower</TuneButton>
        <TuneButton onClick={() => (before(), transpose(vocal.laneId, 1))} title="A semitone higher">Higher</TuneButton>
      </TuneRow>
      <TuneRow label="Space around the voice">
        {(["dry", "room", "hall"] as Space[]).map((s) => (
          <TuneButton key={s} active={space === s} onClick={() => (before(), setSpace(vocal.laneId, s))}>
            {s === "dry" ? "Dry" : s === "room" ? "Room" : "Hall"}
          </TuneButton>
        ))}
      </TuneRow>
    </div>
  );
}

/** One-tap mastering: the master bus presets, with the one that suits the style being tried (or last kept) marked as the AI's pick. */
export function MasterIt({ vibes }: { vibes: Vibe[] }) {
  const master = useStudioStore((s) => s.master);
  const current = masterPresetOf(master);
  const pick = masterFor(vibes);
  return (
    <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 lg:grid-cols-2">
      {MASTER_PRESETS.filter((p) => p.id !== "off").map((p) => {
        const on = current?.id === p.id;
        return (
          <button
            key={p.id}
            onClick={() => {
              keepWhatsPlaying();
              startNewStep();
              useStudioStore.getState().setMaster(on ? MASTER_PRESETS[0].master : p.master);
              useStudioView.getState().notify(on ? "Master off" : `Mastered: ${p.label} — ⌘Z to undo`);
            }}
            aria-pressed={on}
            title={p.hint}
            className={`relative h-full rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${on ? "border-brand bg-brand/15" : "border-border bg-surface hover:border-brand/60"}`}
          >
            <span className="flex items-center justify-between gap-1 font-semibold">
              {p.label}
              <span className={`h-2 w-2 rounded-full ${on ? "bg-brand" : "bg-border"}`} aria-hidden />
            </span>
            <span className="line-clamp-2 block text-[10px] leading-snug text-muted">{p.hint}</span>
            {p.id === pick && !on && <span className="absolute -top-1.5 right-1.5 rounded-full bg-vocals px-1.5 text-[9px] font-bold text-white">AI pick</span>}
          </button>
        );
      })}
    </div>
  );
}

/** How the Studio listens and stretches: the beat model and the high-quality stretcher, each with a switch. */
export function Engines() {
  const model = useBeatModel();
  const [beatsOn, setBeatsOn] = useState(true);
  const [beatsHere, setBeatsHere] = useState(true);
  const [hq, setHq] = useState(true);
  const [rerendering, setRerendering] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    setBeatsOn(beatModelEnabled());
    setBeatsHere(beatModelSupported());
    setHq(stretchEngine() === "hq");
  }, []);
  const status = !beatsHere
    ? "doesn't run on phones (it needs more memory than a phone gives a web page) — beats a computer already heard are used, otherwise bars come from the Studio's own tracker."
    : !beatsOn || model.status === "off"
      ? "off — bars come from the Studio's own tracker"
      : model.status === "loading"
        ? model.fromCache
          ? "starting…"
          : `downloading ${Math.round((100 * model.loaded) / Math.max(1, model.total))}% of ${(model.total / 1e6).toFixed(0)} MB (first time only)`
        : model.status === "failed"
          ? `couldn't load (${model.error ?? "error"}) — using the Studio's own tracker`
          : model.working
            ? "listening to the beat…"
            : model.status === "ready"
              ? "on — hears every beat and where each bar starts"
              : "on — loads when the AI first listens";
  return (
    <details className="group rounded-xl border border-border text-[11px]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-semibold">
        <span>
          <Sparkles /> Listening & sound engines
        </span>
        <ChevronDown className="text-muted group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        <div className="flex items-start gap-2.5">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">AI beat tracking</span> (Beat This! model, ~10 MB, runs on this device)
            <span className="block text-muted">{status}</span>
          </span>
          <Switch
            on={beatsOn && beatsHere}
            disabled={!beatsHere}
            onChange={(on) => {
              setBeatsOn(on);
              setBeatModelEnabled(on);
            }}
            label={`AI beat tracking: ${beatsOn ? "on" : "off"}`}
          />
        </div>
        <div className="flex items-start gap-2.5">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">High-quality stretch</span> — cleaner speed and key changes, voices keep their natural tone
            <span className="block text-muted">{rerendering ? "re-rendering the lanes…" : hq ? "on (Signalsmith Stretch)" : "off (classic SoundTouch)"}</span>
          </span>
          <Switch
            on={hq}
            busy={rerendering}
            disabled={rerendering}
            onChange={(on) => {
              setHq(on);
              setStretchEngine(on ? "hq" : "classic");
              setRerendering(true);
              void audioEngine.rerenderAll().finally(() => setRerendering(false));
            }}
            label={`High-quality stretch: ${hq ? "on" : "off"}`}
          />
        </div>
      </div>
    </details>
  );
}
