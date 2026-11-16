"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { create } from "zustand";
import { keepTrial, useAiTrial } from "@/lib/client/aiTrial";
import { masterFor } from "@/lib/client/aiIdeas";
import type { Vibe } from "@/lib/client/aiControl";
import { audioEngine } from "@/lib/client/audioEngine";
import { clipStart, clipsOf } from "@/lib/client/clipEdit";
import { renderMixdown } from "@/lib/client/mixdown";
import { LOUDNESS_TARGETS, masterToTarget, type LoudnessTarget, type MasterResult } from "@/lib/client/mixEngineer";
import { beatModelEnabled, beatModelSupported, setBeatModelEnabled, useBeatModel } from "@/lib/client/neuralBeats";
import { setStretchEngine, stretchEngine } from "@/lib/client/pitchTempo";
import { changeSpeed, gain, nudge, setSpace, spaceOf, transpose, type Space } from "@/lib/client/quickAdjust";
import { startNewStep } from "@/lib/client/studioHistory";
import { MASTER_PRESETS, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { masterPresetOf } from "../MasterPanel";
import { Switch } from "./ui";

// The AI producer's hands-on corner: small fixes for what's left after an
// idea (each one undo step), mastering to a loudness target by measurement
// (presets by ear too), and the switches for how
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

/** The stretch mastering listens to: the vocal's first chorus, else the middle of the song — 20 seconds of its loudest part. */
function masterSpan() {
  const { lanes, duration } = useStudioStore.getState();
  const length = Math.min(20, Math.max(4, duration));
  const choruses = lanes
    .filter((l) => l.kind === "vocals" && !l.muted)
    .flatMap((l) => clipsOf(l).filter((c) => c.label === "Chorus" && !c.muted).map((c) => clipStart(l, c)));
  const at = choruses.length ? Math.min(...choruses) : duration * 0.45;
  const start = Math.max(0, Math.min(at, duration - length));
  return { start, end: start + length };
}

/** Loudness on a scale from −30 to −6 LUFS: before, after, and the target marked. */
function LoudnessMeter({ result }: { result: MasterResult }) {
  const x = (lufs: number) => `${Math.max(0, Math.min(100, ((lufs + 30) / 24) * 100))}%`;
  const aim = result.target.lufs + 1;
  return (
    <div className="flex flex-col gap-1" role="img" aria-label={`Loudness ${result.before.lufs.toFixed(1)} to ${result.after.lufs.toFixed(1)} LUFS, target ${aim}`}>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-background via-brand/30 to-danger/40">
        <span className="absolute -inset-y-1 w-0.5 bg-success" style={{ left: x(aim) }} title={`Target on its loudest part: ${aim} LUFS`} />
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted bg-surface" style={{ left: x(result.before.lufs) }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-background" style={{ left: x(result.after.lufs) }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted tabular-nums" aria-hidden>
        <span>−30</span>
        <span>−18</span>
        <span>−6 LUFS</span>
      </div>
    </div>
  );
}

/**
 * Mastering by measurement: the loudest part of the mix rendered, its
 * loudness, peak and tone measured, the master set to reach a target and
 * checked by rendering again (see masterToTarget) — with the numbers
 * before and after. The presets stay, for mastering by ear.
 */
/**
 * What the last mastering measured, and whether one is running — kept
 * outside the card. Mastering first keeps whatever is being tried, which
 * rebuilds the panel (and this card with it): held in the card, the
 * numbers were gone by the time they arrived, and mastering looked like it
 * had done nothing.
 */
const useMastered = create<{ result: MasterResult | null; busy: string | null }>(() => ({ result: null, busy: null }));

export function MasterIt({ vibes }: { vibes: Vibe[] }) {
  const master = useStudioStore((s) => s.master);
  const current = masterPresetOf(master);
  const pick = masterFor(vibes);
  const loudPick = pick === "club" || pick === "loud";
  const busy = useMastered((s) => s.busy);
  const result = useMastered((s) => s.result);
  const setBusy = (id: string | null) => useMastered.setState({ busy: id });
  const setResult = (done: MasterResult | null) => useMastered.setState({ result: done });
  const [error, setError] = useState<string | null>(null);

  async function toTarget(target: LoudnessTarget) {
    if (useMastered.getState().busy) return;
    keepWhatsPlaying();
    setBusy(target.id);
    setError(null);
    try {
      const span = masterSpan();
      const done = await masterToTarget(async (m) => {
        const buffer = await renderMixdown({ span, master: m, tailSeconds: 0 });
        return { channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)), rate: buffer.sampleRate };
      }, target);
      startNewStep();
      useStudioStore.getState().setMaster(done.master);
      setResult(done);
      useStudioView.getState().notify(`Mastered to ${target.label}: ${done.after.lufs.toFixed(1)} LUFS on its loudest part — ⌘Z to undo`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't render the mix to measure it");
    } finally {
      setBusy(null);
    }
  }

  const shown = result && Math.abs((result.master.gain ?? 0) - (master.gain ?? 0)) < 0.05 && Math.abs(result.master.glue - master.glue) < 0.01 ? result : null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {LOUDNESS_TARGETS.map((t) => {
          const on = shown?.target.id === t.id;
          const aiPick = (t.id === "loud") === loudPick;
          return (
            <button
              key={t.id}
              onClick={() => void toTarget(t)}
              disabled={!!busy}
              aria-pressed={on}
              aria-busy={busy === t.id}
              title={t.hint}
              className={`relative rounded-xl border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-70 ${on ? "border-brand bg-brand/15" : "border-border bg-surface hover:border-brand/60"}`}
            >
              <span className="flex items-center justify-between gap-1 font-semibold">
                {t.label} <span className="font-mono text-[10px] text-muted">{t.lufs} LUFS</span>
              </span>
              <span className="line-clamp-2 block text-[10px] leading-snug text-muted">{busy === t.id ? "Rendering and measuring…" : t.hint.split(": ")[1]}</span>
              {busy === t.id && <Loader2 className="absolute right-2 bottom-2 animate-spin text-brand-strong" />}
              {aiPick && !on && <span className="absolute -top-1.5 right-1.5 rounded-full bg-vocals px-1.5 text-[9px] font-bold text-white">AI pick</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">{error}</p>}
      {shown && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5 text-[11px]">
          <LoudnessMeter result={shown} />
          <div className="grid grid-cols-3 gap-1.5 text-center tabular-nums">
            {[
              // The unit goes with the name: beside the numbers it wrapped onto a line of its own on a phone.
              { label: "Loudness, LUFS", before: `${shown.before.lufs.toFixed(1)}`, after: `${shown.after.lufs.toFixed(1)}` },
              { label: "Peak, dB", before: `${shown.before.peakDb.toFixed(1)}`, after: `${shown.after.peakDb.toFixed(1)}` },
              { label: "Punch (crest), dB", before: `${shown.before.crestDb.toFixed(1)}`, after: `${shown.after.crestDb.toFixed(1)}` },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-background/60 px-1 py-1">
                <p className="text-[9.5px] text-muted">{m.label}</p>
                <p className="font-mono text-[10.5px]">
                  {m.before} → <span className="font-bold">{m.after}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] leading-snug text-muted">
            Measured on its loudest 20 seconds (aimed a dB over {shown.target.lufs}, so the whole song lands near it): {shown.notes.join(", ")}.
            {shown.short ? " It stops short of the target: any louder and the limiter would squash it." : ""}
          </p>
        </div>
      )}
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold">
          <span>Presets, by ear</span>
          <ChevronDown className="text-muted group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2 min-[480px]:grid-cols-3 lg:grid-cols-2">
          {MASTER_PRESETS.filter((p) => p.id !== "off").map((p) => {
            const on = current?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  keepWhatsPlaying();
                  startNewStep();
                  useStudioStore.getState().setMaster({ gain: 0, ...(on ? MASTER_PRESETS[0].master : p.master) });
                  setResult(null);
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
      </details>
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
