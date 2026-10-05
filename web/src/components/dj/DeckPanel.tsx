"use client";

import { FolderOpen, Pause, Play, RotateCcw } from "lucide-react";
import type { DemoStem } from "@/lib/client/demoSongDefs";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { effBpm, effectiveKey } from "@/lib/client/dj/djMath";
import type { DeckId, DeckState } from "@/lib/client/dj/djTypes";
import { camelotCode, keyLabel } from "@/lib/client/musicKey";
import { HoldButton, Slider, Toggle } from "./ui";

const STEM_BUTTONS: { stem: DemoStem; label: string; lit: string; hint: string }[] = [
  { stem: "vocal", label: "Vocals", lit: "bg-vocals text-white", hint: "Kill the vocals: instant instrumental" },
  { stem: "drums", label: "Drums", lit: "bg-drums text-black", hint: "Kill the drums: a drumless breakdown" },
  { stem: "bass", label: "Bass", lit: "bg-bass text-black", hint: "Kill the bass line" },
  { stem: "chords", label: "Other", lit: "bg-other text-black", hint: "Kill the keys, pads and everything else" },
];

const LOOPS = [0.5, 1, 2, 4, 8];
const RANGES = [8, 16, 50];

const sign = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

/** One deck's transport, loop, tempo and stem controls. */
export default function DeckPanel({
  engine,
  id,
  deck,
  onLoad,
  onSync,
  accent,
  syncNote,
}: {
  engine: DjEngine;
  id: DeckId;
  deck: DeckState;
  onLoad: () => void;
  onSync: () => void;
  accent: string;
  syncNote: string | null;
}) {
  const t = deck.track;
  const key = effectiveKey(deck);
  const bpm = effBpm(deck);
  const loaded = !!t;
  return (
    <section aria-label={`Deck ${id}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
      <header className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-black" style={{ background: accent }} aria-hidden>
          {id}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{t ? t.title : "Empty deck"}</p>
          <p className="truncate text-[11px] text-muted">{t ? `${t.artist} · ${t.genre}` : "Load a track to begin"}</p>
        </div>
        <button
          type="button"
          onClick={onLoad}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-surface-hover"
        >
          <FolderOpen /> Load
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 p-1.5">
          <p className="font-mono text-lg font-bold tabular-nums leading-none">{loaded ? bpm.toFixed(1) : "—"}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">BPM{loaded && ` (${t!.bpm})`}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-1.5">
          <p className="font-mono text-lg font-bold leading-none">{key ? camelotCode(key.key) : "—"}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted" title="Effective key: tempo changes shift pitch (no key lock)">
            {key ? `${keyLabel(key.key)}${key.cents ? ` ${key.cents > 0 ? "+" : ""}${key.cents}¢` : ""}` : "Key"}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 p-1.5">
          <p className="font-mono text-lg font-bold tabular-nums leading-none">{sign(deck.tempoPct)}%</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">Pitch</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-2">
        <HoldButton
          label={`Cue deck ${id}: tap to return to the cue point, hold to preview`}
          title="CUE: while playing, jumps back to the cue and stops. While stopped, hold to preview; release to return."
          onDown={() => engine.cueDown(id)}
          onUp={() => engine.cueUp(id)}
          disabled={!loaded}
          litClass="bg-drums text-black"
          className="min-h-12 text-sm"
        >
          CUE
        </HoldButton>
        <button
          type="button"
          onClick={() => engine.togglePlay(id)}
          disabled={!loaded}
          aria-label={deck.playing ? `Pause deck ${id}` : `Play deck ${id}`}
          aria-pressed={deck.playing}
          className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 ${deck.playing ? "bg-success text-black" : "bg-brand text-white hover:bg-brand-strong"}`}
        >
          {deck.playing ? <Pause /> : <Play />} {deck.playing ? "PAUSE" : "PLAY"}
        </button>
        <button
          type="button"
          onClick={onSync}
          disabled={!loaded}
          aria-label={`Sync deck ${id} to the other deck`}
          title="SYNC: match the other deck's tempo (within the pitch range) and line the beats up"
          className="min-h-12 rounded-lg bg-surface-raised text-sm font-bold hover:bg-surface-hover disabled:opacity-40"
        >
          SYNC
        </button>
      </div>
      {syncNote && <p className="-mt-1 text-[11px] text-drums">{syncNote}</p>}

      <div className="flex items-center gap-1" role="group" aria-label={`Jump deck ${id} by beats`}>
        <span className="mr-1 w-10 text-[10px] font-semibold uppercase tracking-wide text-muted">Jump</span>
        {[-8, -4, -1, 1, 4, 8].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!loaded}
            onClick={() => engine.jumpBeats(id, n)}
            aria-label={`Jump ${n > 0 ? "forward" : "back"} ${Math.abs(n)} beat${Math.abs(n) === 1 ? "" : "s"}`}
            className="min-h-9 flex-1 rounded-md bg-surface-raised text-xs font-semibold hover:bg-surface-hover disabled:opacity-40"
          >
            {n > 0 ? `+${n}` : n}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1" role="group" aria-label={`Loop deck ${id}`}>
        <div className="flex items-center gap-1">
          <span className="mr-1 w-10 text-[10px] font-semibold uppercase tracking-wide text-muted">Loop</span>
          {LOOPS.map((b) => (
            <Toggle
              key={b}
              pressed={deck.loop.active && deck.loop.beats === b}
              onClick={() => engine.loopBeats(id, b)}
              label={`Loop ${b === 0.5 ? "half a beat" : `${b} beat${b === 1 ? "" : "s"}`}`}
              disabled={!loaded}
              className="min-h-9 flex-1"
              litClass="bg-brand text-white"
            >
              {b === 0.5 ? "½" : b}
            </Toggle>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 w-10 shrink-0" aria-hidden />
          <button type="button" disabled={!loaded} onClick={() => engine.loopInPoint(id)} aria-label="Set loop in" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            LOOP IN
          </button>
          <button type="button" disabled={!loaded} onClick={() => engine.loopOutPoint(id)} aria-label="Set loop out" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            LOOP OUT
          </button>
          <button type="button" disabled={!loaded || !deck.loop.active} onClick={() => engine.loopExit(id)} aria-label="Exit loop" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            EXIT
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <Slider
            label={`Tempo ±${deck.tempoRange}%`}
            value={deck.tempoPct}
            min={-deck.tempoRange}
            max={deck.tempoRange}
            step={0.05}
            center={0}
            onChange={(v) => engine.setTempoPct(id, v)}
            format={(v) => `${sign(v, 2)}%`}
            className="flex-1"
          />
          <button type="button" onClick={() => engine.setTempoPct(id, 0)} aria-label="Reset tempo to 0%" title="Reset tempo" className="flex min-h-9 w-9 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover">
            <RotateCcw />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-10 text-[10px] font-semibold uppercase tracking-wide text-muted">Range</span>
          {RANGES.map((r) => (
            <Toggle key={r} pressed={deck.tempoRange === r} onClick={() => engine.setTempoRange(id, r)} label={`Tempo range plus or minus ${r} percent`} className="min-h-8 flex-1">
              ±{r}%
            </Toggle>
          ))}
          <HoldButton label={`Nudge deck ${id} slower`} title="Nudge −: slow down while held" onDown={() => engine.setBend(id, -1)} onUp={() => engine.setBend(id, 0)} className="min-h-9 w-12 text-sm" disabled={!loaded}>
            −
          </HoldButton>
          <HoldButton label={`Nudge deck ${id} faster`} title="Nudge +: speed up while held" onDown={() => engine.setBend(id, 1)} onUp={() => engine.setBend(id, 0)} className="min-h-9 w-12 text-sm" disabled={!loaded}>
            +
          </HoldButton>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Stem kills <span className="font-normal normal-case tracking-normal">(lit = muted)</span>
        </p>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Stem kills for deck ${id}`}>
          {STEM_BUTTONS.map((s) => (
            <Toggle key={s.stem} pressed={deck.stems[s.stem]} onClick={() => engine.setStemKill(id, s.stem, !deck.stems[s.stem])} label={`Kill ${s.label} on deck ${id}`} title={s.hint} litClass={`${s.lit} line-through`} className="min-h-10" disabled={!loaded}>
              {s.label}
            </Toggle>
          ))}
        </div>
      </div>
    </section>
  );
}
