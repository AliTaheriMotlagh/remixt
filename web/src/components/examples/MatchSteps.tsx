"use client";

import { Check, Ear, Grid3x3, Loader2, Music, Timer } from "lucide-react";
import { bpmLabel } from "@/lib/client/examplesLibrary";
import { driftPerBarMs, type PairAnalysis, type PairSettings, type PairSong } from "@/lib/client/examplesMatch";
import { PITCH_NAMES, keyFit, keyLabel, type MusicalKey } from "@/lib/client/musicKey";

// "What exactly happened?" — matching a vocal to a beat, one step at a
// time: what was measured, then each change the Studio makes, with a
// switch to hear the pair with and without it. Tempo and key are separate
// switches, so you can hear what each one fixes on its own.

export type Steps = { tempo: boolean; key: boolean };

/** How the result reads, by how well the pair fits once matched. */
const RESULT_TONE = {
  perfect: "bg-success/15 text-success",
  good: "bg-success/15 text-success",
  warn: "bg-amber-400/15 text-amber-400",
  bad: "bg-danger/15 text-danger",
} as const;

const FIT_WORDS = {
  same: "the same key — they already fit",
  relative: "relative keys — the same seven notes",
  neighbour: "neighbouring keys — six of seven notes shared",
  far: "two steps apart — some notes rub",
  clash: "clashing keys — notes sound wrong together",
} as const;

function StepSwitch({ on, onChange, label, busy }: { on: boolean; onChange: (on: boolean) => void; label: string; busy: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-success" : "bg-border"}`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-success shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}>
        {busy && <Loader2 className="animate-spin" />}
      </span>
    </button>
  );
}

function StepCard({ n, icon: StepIcon, title, on, children, control }: { n: number; icon: typeof Timer; title: string; on: boolean | null; children: React.ReactNode; control?: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-xl border p-3 transition-colors ${on === false ? "border-danger/30 bg-danger/5" : on ? "border-success/40 bg-success/5" : "border-border bg-background/40"}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${on === false ? "bg-surface-raised text-muted" : "bg-success text-white"}`}>
        {on === false ? n : <Check />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold">
            <StepIcon className="text-brand-strong" /> {title}
          </p>
          {control}
        </div>
        <div className="mt-1 text-xs text-muted">{children}</div>
      </div>
    </li>
  );
}

/** Tempos as bars: how fast each one goes, and — matched — the one they meet at. */
function TempoBars({ vocal, beat, a, on }: { vocal: PairSong; beat: PairSong; a: PairAnalysis; on: boolean }) {
  const vocalNow = on ? a.targetBpm : a.reading;
  const beatNow = on ? a.targetBpm : beat.bpm;
  const top = Math.max(a.reading, beat.bpm, a.targetBpm) * 1.05;
  const row = (label: string, from: number, to: number, color: string) => (
    <div className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2">
      <span className="text-[11px] font-semibold" style={{ color }}>
        {label}
      </span>
      <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-raised">
        <span className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(from / top) * 100}%`, background: color }} />
        <span className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${(to / top) * 100}%`, background: color }} />
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-foreground">{bpmLabel(to)} BPM</span>
    </div>
  );
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {row("Vocal", a.reading, vocalNow, "var(--vocals)")}
      {row("Beat", beat.bpm, beatNow, "var(--beat)")}
      {a.readingNote !== "as written" && (
        <p className="text-[10px]">
          {vocal.title} is {bpmLabel(vocal.bpm)} BPM, counted as {bpmLabel(a.reading)} ({a.readingNote}) — the closest way to read it against the beat.
        </p>
      )}
    </div>
  );
}

/** The twelve notes, with the vocal's key (before and after the shift) and the beat's marked on them. */
function KeyStrip({ from, to, beat, on }: { from: MusicalKey; to: MusicalKey; beat: MusicalKey; on: boolean }) {
  const vocalAt = on ? to.tonic : from.tonic;
  return (
    <div className="mt-2">
      <div className="grid grid-cols-12 gap-0.5" role="img" aria-label={`Vocal on ${PITCH_NAMES[vocalAt]}, beat on ${PITCH_NAMES[beat.tonic]}`}>
        {PITCH_NAMES.map((name, i) => {
          const isVocal = i === vocalAt;
          const wasVocal = on && i === from.tonic && from.tonic !== to.tonic;
          const isBeat = i === beat.tonic;
          return (
            <span
              key={name}
              className={`flex h-9 flex-col items-center justify-end rounded-sm pb-0.5 text-[9px] font-semibold ${name.length > 1 ? "bg-black/50 text-muted" : "bg-surface-raised text-foreground/80"}`}
              style={{
                boxShadow: isVocal ? "inset 0 -4px 0 var(--vocals)" : wasVocal ? "inset 0 -4px 0 color-mix(in srgb, var(--vocals) 35%, transparent)" : undefined,
                outline: isBeat ? "2px solid var(--beat)" : undefined,
                outlineOffset: -2,
              }}
            >
              {name}
            </span>
          );
        })}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[10px]">
        <span>
          <span className="mr-1 inline-block h-1.5 w-3 rounded-full bg-vocals align-middle" />
          vocal&apos;s home note{on && from.tonic !== to.tonic ? ` (was ${PITCH_NAMES[from.tonic]})` : ""}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border-2 border-beat align-middle" />
          beat&apos;s home note
        </span>
      </p>
    </div>
  );
}

export default function MatchSteps({
  vocal,
  beat,
  settings,
  analysis: a,
  steps,
  onSteps,
  rendering,
}: {
  vocal: PairSong;
  beat: PairSong;
  settings: PairSettings;
  analysis: PairAnalysis;
  steps: Steps;
  onSteps: (steps: Steps) => void;
  /** Steps whose audio is being rendered right now. */
  rendering: boolean;
}) {
  const drift = driftPerBarMs(vocal, beat, a);
  const raw = !steps.tempo && !steps.key;
  const all = steps.tempo && steps.key;
  const keyNow = steps.key ? a.shiftedKey : vocal.key;
  const fitNow = keyFit(keyNow, beat.key);
  const pct = (r: number) => `${Math.abs((r - 1) * 100).toFixed(1)}% ${r > 1 ? "faster" : "slower"}`;
  const who = settings.mode === "beat" ? "The beat keeps its speed" : settings.mode === "vocal" ? "The vocal keeps its speed" : "They meet in the middle";

  return (
    <section aria-label="What happened, step by step" className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">What happened, step by step</h3>
          <p className="text-xs text-muted">Switch each step off to hear what it fixes — the audio follows.</p>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-border text-xs font-semibold" role="group" aria-label="All steps">
          <button type="button" aria-pressed={raw} onClick={() => onSteps({ tempo: false, key: false })} className={`min-h-9 px-3 ${raw ? "bg-danger/25 text-foreground" : "text-muted hover:bg-surface-hover"}`}>
            All off (raw)
          </button>
          <button type="button" aria-pressed={all} onClick={() => onSteps({ tempo: true, key: true })} className={`min-h-9 px-3 ${all ? "bg-success/25 text-foreground" : "text-muted hover:bg-surface-hover"}`}>
            All on (matched)
          </button>
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        <StepCard n={1} icon={Ear} title="Listened to both" on={null}>
          <span className="block">
            <span className="font-semibold text-vocals">Vocal</span> — {vocal.title}: {bpmLabel(vocal.bpm)} BPM, {keyLabel(vocal.key)} ({vocal.camelot})
          </span>
          <span className="block">
            <span className="font-semibold text-beat">Beat</span> — {beat.title}: {bpmLabel(beat.bpm)} BPM, {keyLabel(beat.key)} ({beat.camelot})
          </span>
          <span className="mt-1 block">
            Unmatched they&apos;re {Math.abs(a.rawGapBpm).toFixed(0)} BPM apart ({a.rawGapPct.toFixed(0)}%), in {FIT_WORDS[a.rawKeyFit]}.
          </span>
        </StepCard>
        <StepCard
          n={2}
          icon={Timer}
          title="Same speed"
          on={steps.tempo}
          control={<StepSwitch on={steps.tempo} busy={rendering} onChange={(tempo) => onSteps({ ...steps, tempo })} label={`Match the tempo: ${steps.tempo ? "on" : "off"}`} />}
        >
          {steps.tempo ? (
            <>
              {who}: both now play at <span className="font-semibold text-foreground">{a.targetBpm.toFixed(1)} BPM</span>. The vocal is {Math.abs(a.vocalRatio - 1) < 0.0005 ? "untouched" : pct(a.vocalRatio)}, the beat{" "}
              {Math.abs(a.beatRatio - 1) < 0.0005 ? "untouched" : pct(a.beatRatio)} — stretched in time, so neither one&apos;s pitch changes.
            </>
          ) : (
            <>
              Off: each plays at its own speed, so they slip apart by about <span className="font-semibold text-foreground">{drift.toFixed(0)} ms every bar</span> —{" "}
              {((drift * a.loopBars) / 1000).toFixed(1)} s off after {a.loopBars} bars. That&apos;s the &ldquo;train wreck&rdquo; sound.
            </>
          )}
          <TempoBars vocal={vocal} beat={beat} a={a} on={steps.tempo} />
        </StepCard>
        <StepCard
          n={3}
          icon={Music}
          title="Same key"
          on={a.semitones === 0 ? null : steps.key}
          control={a.semitones === 0 ? undefined : <StepSwitch on={steps.key} busy={rendering} onChange={(key) => onSteps({ ...steps, key })} label={`Match the key: ${steps.key ? "on" : "off"}`} />}
        >
          {a.semitones === 0 ? (
            <>No shift needed: {keyLabel(vocal.key)} over {keyLabel(beat.key)} is {FIT_WORDS[a.rawKeyFit]}.</>
          ) : steps.key ? (
            <>
              The vocal moved {a.semitones > 0 ? "up" : "down"} <span className="font-semibold text-foreground">{Math.abs(a.semitones)} semitone{Math.abs(a.semitones) === 1 ? "" : "s"}</span>: {keyLabel(vocal.key)} → {keyLabel(a.shiftedKey)}. Every note moves by the
              same step, so the melody stays the same — now {FIT_WORDS[fitNow]}.
            </>
          ) : (
            <>
              Off: the vocal stays in {keyLabel(vocal.key)} over the beat&apos;s {keyLabel(beat.key)} — {FIT_WORDS[fitNow]}.
            </>
          )}
          <KeyStrip from={vocal.key} to={a.shiftedKey} beat={beat.key} on={steps.key} />
        </StepCard>
        <StepCard n={4} icon={Grid3x3} title="Lined up on the bars" on={null}>
          Both loops start on the first beat of a bar, so when the speeds match, the vocal&apos;s lines land right where the beat&apos;s bars begin. The grid below shows it: {steps.tempo ? "every sung bar on a bar line" : "the vocal sliding off the grid, because the speeds don't match"}.
        </StepCard>
      </ol>
      <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${all ? RESULT_TONE[a.overall.level] : raw ? "bg-danger/15 text-danger" : "bg-amber-400/15 text-amber-400"}`}>
        {all
          ? `Result: both at ${a.targetBpm.toFixed(1)} BPM, in ${keyLabel(a.shiftedKey)}. ${a.overall.title}${
              a.overall.level === "warn" || a.overall.level === "bad" ? ` — ${(a.tempoVerdict.level === a.overall.level ? a.tempoVerdict : a.keyVerdict).title.toLowerCase()}` : ""
            }.`
          : raw
            ? "Result: nothing matched — this is the two songs as they are."
            : steps.tempo
              ? "Result: in time, but not in key — listen for notes that rub."
              : "Result: in key, but not in time — the vocal drifts off the beat."}
      </p>
    </section>
  );
}
