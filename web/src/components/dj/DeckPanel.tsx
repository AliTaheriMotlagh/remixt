"use client";

import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, Pause, Play, Power, RotateCcw } from "lucide-react";
import type { DemoStem } from "@/lib/client/demoSongDefs";
import { SAMPLE_KINDS, type DjEngine } from "@/lib/client/dj/djEngine";
import { effBpm, effectiveKey } from "@/lib/client/dj/djMath";
import type { DeckId, DeckState } from "@/lib/client/dj/djTypes";
import { HOT_CUE_COLORS, HOT_CUE_LABELS, JUMP_SIZES, LOOP_SIZES, barBeat, loopLabel, rangeLabel } from "@/lib/client/dj/djControls";
import type { LoadStage } from "@/lib/client/dj/djLibraryTracks";
import type { GearProfile, PadMode } from "@/lib/client/dj/gear";
import type { ScenarioRules } from "@/lib/client/dj/scenarios";
import { camelotCode, keyLabel } from "@/lib/client/musicKey";
import JogWheel from "./JogWheel";
import { HoldButton, Toggle, VFader, useRaf } from "./ui";

const STEM_BUTTONS: { stem: DemoStem; label: string; lit: string; hint: string }[] = [
  { stem: "vocal", label: "Vocals", lit: "bg-vocals text-white", hint: "Kill the vocals: instant instrumental" },
  { stem: "drums", label: "Drums", lit: "bg-drums text-black", hint: "Kill the drums: a drumless breakdown" },
  { stem: "bass", label: "Bass", lit: "bg-bass text-black", hint: "Kill the bass line" },
  { stem: "chords", label: "Melody", lit: "bg-other text-black", hint: "Kill the keys, pads and everything else" },
];

const PAD_MODE_LABEL: Record<PadMode, string> = { hotcue: "Hot cue", roll: "Roll", sampler: "Sampler", jump: "Jump" };
const ROLLS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
const PAD_JUMPS = [-16, -8, -4, -1, 1, 4, 8, 16];

const sign = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

/** Live bar.beat counter, updated off React. */
function BarCounter({ engine, id }: { engine: DjEngine; id: DeckId }) {
  const el = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    const t = engine.deckTrack(id)?.info;
    if (!el.current) return;
    if (!t) {
      el.current.textContent = "—";
      return;
    }
    const { bar, beat } = barBeat(t, engine.deckPosition(id));
    el.current.textContent = `${bar}.${beat}`;
  });
  return <span ref={el} className="font-mono text-lg font-bold tabular-nums leading-none" />;
}

/** One performance pad: press / hold / long-press, with mouse, touch and keyboard. */
function Pad({
  color,
  lit,
  label,
  title,
  onDown,
  onUp,
  onLong,
  disabled,
  children,
}: {
  color: string;
  lit: boolean;
  label: string;
  title: string;
  onDown: () => void;
  onUp?: () => void;
  onLong?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [down, setDown] = useState(false);
  const start = (e?: RPointerEvent<HTMLButtonElement>) => {
    if (disabled || held.current) return;
    if (e) {
      if (e.button === 2 && onLong) {
        e.preventDefault();
        onLong();
        return;
      }
      if (e.button !== 0) return;
      if (e.shiftKey && onLong) {
        onLong();
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    held.current = true;
    setDown(true);
    onDown();
    if (onLong) timer.current = setTimeout(() => {
      timer.current = null;
      onLong();
    }, 700);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!held.current) return;
    held.current = false;
    setDown(false);
    onUp?.();
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      className="relative min-h-11 select-none touch-none rounded-md border text-[11px] font-bold transition-[filter,transform] active:scale-95 disabled:opacity-35"
      style={{
        borderColor: color,
        background: lit ? color : `${color}22`,
        color: lit ? "#000" : color,
        filter: down ? "brightness(1.35)" : undefined,
        boxShadow: lit ? `0 0 10px ${color}66` : undefined,
      }}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
        if ((e.key === "Delete" || e.key === "Backspace") && onLong) onLong();
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") end();
      }}
      onBlur={end}
    >
      {children}
    </button>
  );
}

/** One deck: display, jog wheel and tempo fader, transport, pads, loops, beat jump and stem kills, shaped by the gear. */
export default function DeckPanel({
  engine,
  id,
  deck,
  gear,
  rules,
  onLoad,
  onSync,
  accent,
  syncNote,
  loading,
}: {
  engine: DjEngine;
  id: DeckId;
  deck: DeckState;
  gear: GearProfile;
  rules?: ScenarioRules;
  onLoad: () => void;
  onSync: () => void;
  accent: string;
  syncNote: string | null;
  loading: LoadStage | null;
}) {
  const [padMode, setPadMode] = useState<PadMode>(gear.padModes[0] ?? "hotcue");
  const [jump, setJump] = useState(2); // index into JUMP_SIZES
  const [loopSize, setLoopSize] = useState(4); // index into LOOP_SIZES (4 beats)
  const t = deck.track;
  const key = effectiveKey(deck);
  const bpm = effBpm(deck);
  const loaded = !!t;
  const two = t?.layout === "two";
  const tt = gear.turntable;
  const syncOff = !gear.sync || rules?.noSync;
  const hideBpm = rules?.hideBpm;
  const mode: PadMode = gear.padModes.includes(padMode) ? padMode : (gear.padModes[0] ?? "hotcue");
  const pads = gear.hotCues > 0 ? (gear.id === "touch" ? 4 : 8) : 0;
  const ls = LOOP_SIZES[loopSize];
  const js = JUMP_SIZES[jump];

  return (
    <section
      aria-label={`Deck ${id}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-surface p-2.5 sm:p-3"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <header className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-black" style={{ background: accent }} aria-hidden>
          {id}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{t ? t.title : loading ? "Loading…" : "Empty deck"}</p>
          <p className="truncate text-[11px] text-muted">
            {t ? `${t.artist} · ${t.source === "library" ? "Library" : t.genre}${two ? " · 2 stems" : ""}` : "Load a track to begin"}
          </p>
        </div>
        <button type="button" onClick={onLoad} data-dj={`${id}-load`} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-surface-hover">
          <FolderOpen /> Load
        </button>
      </header>

      {loading && (
        <div role="status" className="rounded-lg bg-background/60 p-2 text-[11px]">
          <p className="flex items-center gap-1.5 font-semibold">
            <Loader2 className="animate-spin" /> {loading.text}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 text-center" data-dj={`${id}-display`}>
        <div className="min-w-0 rounded-lg bg-black/40 p-1.5">
          <p className="truncate font-mono text-base font-bold tabular-nums leading-none sm:text-lg">{loaded && !hideBpm ? bpm.toFixed(2) : "—"}</p>
          <p className="truncate text-[9px] uppercase tracking-wide text-muted">BPM{loaded && !hideBpm && ` ${t!.bpm.toFixed(1)}`}</p>
        </div>
        <div className="min-w-0 rounded-lg bg-black/40 p-1.5">
          <p className="font-mono text-base font-bold leading-none sm:text-lg">{key ? camelotCode(key.key) : "—"}</p>
          <p className="truncate text-[9px] uppercase tracking-wide text-muted" title={deck.keyLock ? "Key lock on: the key stays put" : "Effective key: the tempo fader shifts pitch"}>
            {key ? `${keyLabel(key.key)}${key.cents ? ` ${key.cents > 0 ? "+" : ""}${key.cents}¢` : ""}` : "Key"}
          </p>
        </div>
        <div className="min-w-0 rounded-lg bg-black/40 p-1.5">
          <p className="font-mono text-base font-bold tabular-nums leading-none sm:text-lg">{hideBpm ? "—" : `${sign(deck.tempoPct, 2)}`}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted">{rangeLabel(deck.tempoRange)}</p>
        </div>
        <div className="min-w-0 rounded-lg bg-black/40 p-1.5">
          <BarCounter engine={engine} id={id} />
          <p className="text-[9px] uppercase tracking-wide text-muted">Bar.beat</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="mx-auto w-full max-w-[220px]">
          <JogWheel engine={engine} id={id} vinyl={deck.vinyl} style={gear.platter} accent={accent} disabled={!loaded} dj={`${id}-jog`} />
          <div className="mt-1.5 flex flex-wrap justify-center gap-1">
            {!tt && (
              <Toggle pressed={deck.vinyl} onClick={() => engine.setVinyl(id, !deck.vinyl)} label={`Vinyl mode on deck ${id}`} title="VINYL: touching the top of the jog scratches. Off: the jog only nudges (CDJ mode)." className="min-h-8">
                VINYL
              </Toggle>
            )}
            {gear.slip && (
              <Toggle pressed={deck.slip} onClick={() => engine.setSlip(id, !deck.slip)} label={`Slip mode on deck ${id}`} title="SLIP: loops, scratches and held hot cues keep the track running underneath; letting go rejoins it." className="min-h-8" litClass="bg-drums text-black">
                SLIP
              </Toggle>
            )}
            {gear.quantize && (
              <span data-dj={`${id}-quantize`}>
                <Toggle pressed={deck.quantize} disabled={rules?.noQuantize} onClick={() => engine.setQuantize(id, !deck.quantize)} label={`Quantize on deck ${id}`} title="QUANTIZE: cues, loops and hot cues snap to the beat grid" className="min-h-8" litClass="bg-danger text-white">
                  Q
                </Toggle>
              </span>
            )}
            {gear.keyLock && (
              <span data-dj={`${id}-keylock`}>
                <Toggle
                  pressed={deck.keyLock}
                  disabled={!engine.jsVoicesSupported}
                  onClick={() => engine.setKeyLock(id, !deck.keyLock)}
                  label={`Key lock on deck ${id}`}
                  title={engine.jsVoicesSupported ? "KEY LOCK (master tempo): the tempo changes, the pitch doesn't" : "Key lock needs a browser with ScriptProcessor support"}
                  className="min-h-8"
                  litClass="bg-beat text-black"
                >
                  KEY
                </Toggle>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1" data-dj={`${id}-tempo`}>
          <VFader
            label="Tempo"
            value={deck.tempoPct}
            min={-deck.tempoRange}
            max={deck.tempoRange}
            invert
            center={0}
            detent={0.025}
            height={150}
            step={deck.tempoRange >= 50 ? 0.5 : 0.05}
            onChange={(v) => engine.setTempoPct(id, Math.round(v * 100) / 100)}
            format={(v) => (hideBpm ? "" : `${sign(v, 2)}%`)}
            capColor="#e5e7eb"
          />
          <div className={`size-1.5 rounded-full ${deck.tempoPct === 0 ? "bg-success" : "bg-white/15"}`} title="Tempo at 0 %" aria-hidden />
          <button type="button" onClick={() => engine.setTempoPct(id, 0)} aria-label="Reset tempo to 0%" title="Reset tempo" className="flex size-8 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover">
            <RotateCcw />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label={`Tempo range deck ${id}`} data-dj={`${id}-range`}>
        <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Range</span>
        {gear.tempoRanges.map((r) => (
          <Toggle key={r} pressed={deck.tempoRange === r} onClick={() => engine.setTempoRange(id, r)} label={`Tempo range ${rangeLabel(r)}`} className="min-h-8 flex-1 px-1">
            {rangeLabel(r)}
          </Toggle>
        ))}
      </div>

      {tt ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-dj={`${id}-play`}
            onClick={() => (deck.playing ? engine.brake(id, 0.6) : engine.play(id, undefined, 0.35))}
            disabled={!loaded}
            aria-label={deck.playing ? `Stop deck ${id}'s motor` : `Start deck ${id}'s motor`}
            aria-pressed={deck.playing}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-bold disabled:opacity-40 ${deck.playing ? "bg-success text-black" : "bg-brand text-white hover:bg-brand-strong"}`}
          >
            <Power /> {deck.playing ? "STOP" : "START"}
          </button>
          <div data-dj={`${id}-cue`} className="flex">
            <HoldButton
              label={`Cue deck ${id}`}
              title="Back to the cue mark (vinyl DJs mark it with a sticker)"
              onDown={() => engine.cueDown(id)}
              onUp={() => engine.cueUp(id)}
              disabled={!loaded}
              litClass="bg-drums text-black"
              className="min-h-12 flex-1 text-sm"
            >
              CUE
            </HoldButton>
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${syncOff ? "grid-cols-2" : "grid-cols-[1fr_1.4fr_1fr]"}`}>
          <div data-dj={`${id}-cue`} className="flex">
            <HoldButton
              label={`Cue deck ${id}: tap to return to the cue point, hold to preview`}
              title="CUE: while playing, jumps back to the cue and stops. While stopped, sets the cue here; hold to preview."
              onDown={() => engine.cueDown(id)}
              onUp={() => engine.cueUp(id)}
              disabled={!loaded}
              litClass="bg-drums text-black"
              className="min-h-12 flex-1 text-sm"
            >
              CUE
            </HoldButton>
          </div>
          <button
            type="button"
            data-dj={`${id}-play`}
            onClick={() => engine.togglePlay(id)}
            disabled={!loaded}
            aria-label={deck.playing ? `Pause deck ${id}` : `Play deck ${id}`}
            aria-pressed={deck.playing}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 ${deck.playing ? "bg-success text-black" : "bg-brand text-white hover:bg-brand-strong"}`}
          >
            {deck.playing ? <Pause /> : <Play />} {deck.playing ? "PAUSE" : "PLAY"}
          </button>
          {!syncOff && (
            <button
              type="button"
              data-dj={`${id}-sync`}
              onClick={onSync}
              disabled={!loaded}
              aria-label={`Sync deck ${id} to the other deck`}
              title="SYNC: match the other deck's tempo (within the range) and line the beats up"
              className="min-h-12 rounded-lg bg-surface-raised text-sm font-bold hover:bg-surface-hover disabled:opacity-40"
            >
              SYNC
            </button>
          )}
        </div>
      )}
      {syncNote && <p className="-mt-1 text-[11px] text-drums">{syncNote}</p>}

      {(pads > 0 || gear.padModes.includes("sampler")) && (
        <div data-dj={`${id}-pads`}>
          {gear.padModes.length > 1 && (
            <div className="mb-1 flex gap-1" role="tablist" aria-label={`Pad mode deck ${id}`}>
              {gear.padModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setPadMode(m)}
                  className={`min-h-8 flex-1 rounded-md px-1 text-[10px] font-bold uppercase ${mode === m ? "bg-foreground text-background" : "bg-surface-raised text-muted"}`}
                >
                  {PAD_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          <div className={`grid gap-1 ${pads === 4 && mode === "hotcue" ? "grid-cols-4" : "grid-cols-4"}`}>
            {mode === "hotcue" &&
              Array.from({ length: pads }, (_, i) => {
                const set = deck.hotCues[i] !== null && deck.hotCues[i] !== undefined;
                return (
                  <Pad
                    key={i}
                    color={HOT_CUE_COLORS[i]}
                    lit={set}
                    disabled={!loaded}
                    label={`Hot cue ${HOT_CUE_LABELS[i]} on deck ${id}${set ? ": jump (hold 0.7 s, shift-click or right-click to delete)" : ": set"}`}
                    title={set ? "Jump. Hold, shift-click or right-click to delete." : "Set a hot cue here"}
                    onDown={() => engine.hotCueDown(id, i)}
                    onUp={() => engine.hotCueUp(id, i)}
                    onLong={set ? () => engine.clearHotCue(id, i) : undefined}
                  >
                    {HOT_CUE_LABELS[i]}
                  </Pad>
                );
              })}
            {mode === "roll" &&
              ROLLS.map((b) => (
                <Pad key={b} color="#8b5cf6" lit={false} disabled={!loaded || !deck.playing} label={`Loop roll ${loopLabel(b)} beat, hold`} title="Hold to roll, release to rejoin" onDown={() => engine.rollStart(id, b)} onUp={() => engine.rollEnd(id)}>
                  {loopLabel(b)}
                </Pad>
              ))}
            {mode === "sampler" &&
              SAMPLE_KINDS.slice(0, 8).map((s) => (
                <Pad key={s.kind} color="#06b6d4" lit={false} label={`Sampler: ${s.label}`} title={`Play the ${s.label.toLowerCase()} sample`} onDown={() => engine.sample(s.kind)}>
                  {s.label}
                </Pad>
              ))}
            {mode === "jump" &&
              PAD_JUMPS.map((n) => (
                <Pad key={n} color="#f59e0b" lit={false} disabled={!loaded} label={`Beat jump ${n > 0 ? "forward" : "back"} ${Math.abs(n)}`} title="Beat jump" onDown={() => engine.jumpBeats(id, n)}>
                  {n > 0 ? `+${n}` : n}
                </Pad>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1" role="group" aria-label={`Loop deck ${id}`}>
        <div className="flex items-center gap-1" data-dj={`${id}-loops`}>
          <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">{tt ? "DVS loop" : "Loop"}</span>
          {[1, 2, 4, 8].map((b) => (
            <Toggle
              key={b}
              pressed={deck.loop.active && deck.loop.beats === b}
              onClick={() => engine.loopBeats(id, b)}
              label={`Loop ${b} beat${b === 1 ? "" : "s"}`}
              disabled={!loaded}
              className="min-h-9 flex-1 px-1"
              litClass="bg-success text-black"
            >
              {b}
            </Toggle>
          ))}
          <Toggle
            pressed={deck.loop.active && deck.loop.beats === ls && ![1, 2, 4, 8].includes(ls)}
            onClick={() => engine.loopBeats(id, ls)}
            label={`Loop ${loopLabel(ls)} beats (the size you chose)`}
            disabled={!loaded}
            className="min-h-9 flex-1 px-1"
            litClass="bg-success text-black"
          >
            {loopLabel(ls)}
          </Toggle>
        </div>
        <div className="flex items-center gap-1" data-dj={`${id}-loopsize`}>
          <span className="w-10 shrink-0" aria-hidden />
          <button type="button" disabled={!loaded} onClick={() => (deck.loop.active ? engine.resizeLoop(id, 0.5) : setLoopSize((i) => Math.max(0, i - 1)))} aria-label="Loop half" title="Loop ½×: halve the loop (or the auto-loop size)" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            ½×
          </button>
          <button type="button" disabled={!loaded} onClick={() => (deck.loop.active ? engine.resizeLoop(id, 2) : setLoopSize((i) => Math.min(LOOP_SIZES.length - 1, i + 1)))} aria-label="Loop double" title="Loop 2×: double the loop (or the auto-loop size)" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            2×
          </button>
          <button type="button" disabled={!loaded} onClick={() => engine.loopInPoint(id)} aria-label="Set loop in" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            IN
          </button>
          <button type="button" disabled={!loaded} onClick={() => engine.loopOutPoint(id)} aria-label="Set loop out" className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40">
            OUT
          </button>
          <button
            type="button"
            disabled={!loaded || (!deck.loop.active && deck.loop.end <= deck.loop.start)}
            onClick={() => (deck.loop.active ? engine.loopExit(id) : engine.reloop(id))}
            aria-label={deck.loop.active ? "Exit loop" : "Reloop"}
            className="min-h-9 flex-1 rounded-md bg-surface-raised text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-40"
          >
            {deck.loop.active ? "EXIT" : "RELOOP"}
          </button>
        </div>
      </div>

      {gear.beatJump && (
        <div className="flex items-center gap-1" role="group" aria-label={`Beat jump deck ${id}`}>
          <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Jump</span>
          <button type="button" disabled={!loaded} onClick={() => engine.jumpBeats(id, -js)} aria-label={`Jump back ${js} beats`} className="flex min-h-9 flex-1 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover disabled:opacity-40">
            <ChevronLeft />
          </button>
          <button type="button" onClick={() => setJump((j) => (j + 1) % JUMP_SIZES.length)} aria-label={`Beat jump size ${js} beats: tap to change`} className="min-h-9 w-16 rounded-md bg-black/40 font-mono text-xs font-bold">
            {js} {js === 1 ? "beat" : "bts"}
          </button>
          <button type="button" disabled={!loaded} onClick={() => engine.jumpBeats(id, js)} aria-label={`Jump forward ${js} beats`} className="flex min-h-9 flex-1 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover disabled:opacity-40">
            <ChevronRight />
          </button>
        </div>
      )}

      {gear.stemKills && (
        <div data-dj={`${id}-stems`}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Stems <span className="font-normal normal-case tracking-normal">(lit = muted)</span>
          </p>
          {two ? (
            <div className="grid grid-cols-2 gap-1" role="group" aria-label={`Stem kills for deck ${id}`}>
              <Toggle pressed={deck.stems.vocal} onClick={() => engine.setStemKill(id, "vocal", !deck.stems.vocal)} label={`Kill vocals on deck ${id}`} litClass="bg-vocals text-white line-through" className="min-h-10" disabled={!loaded}>
                Vocals
              </Toggle>
              <Toggle
                pressed={deck.stems.drums && deck.stems.bass && deck.stems.chords}
                onClick={() => engine.setBeatKill(id, !(deck.stems.drums && deck.stems.bass && deck.stems.chords))}
                label={`Kill the beat on deck ${id}`}
                title="This song is split into vocals and beat: the beat is drums, bass and melody together"
                litClass="bg-beat text-black line-through"
                className="min-h-10"
                disabled={!loaded}
              >
                Beat
              </Toggle>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Stem kills for deck ${id}`}>
              {STEM_BUTTONS.map((s) => (
                <Toggle key={s.stem} pressed={deck.stems[s.stem]} onClick={() => engine.setStemKill(id, s.stem, !deck.stems[s.stem])} label={`Kill ${s.label} on deck ${id}`} title={s.hint} litClass={`${s.lit} line-through`} className="min-h-10 px-1" disabled={!loaded}>
                  {s.label}
                </Toggle>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
