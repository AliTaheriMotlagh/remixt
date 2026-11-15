"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Copy,
  Layers2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Waveform from "../../Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { isTakeLane } from "@/lib/client/lyricsSources";
import { useLyrics } from "@/lib/client/lyricsStore";
import { keyLabel, transposeKey } from "@/lib/client/musicKey";
import { startNewStep } from "@/lib/client/studioHistory";
import {
  clipSpan,
  clipStart,
  clipsOf,
  DEFAULT_FX,
  DELAY_DIVISIONS,
  laneName,
  useStudioStore,
  type DelayDivision,
  type LaneFx,
  type StudioLane,
} from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { doubleTake, groupOf } from "@/lib/client/vocalLanes";
import { MAX_CLIP_SECONDS } from "@/lib/clipLyrics";
import { beatSeconds, formatClock, isSung, sectionsOf } from "@/lib/lyrics";
import { kindLabel } from "@/lib/stemKinds";
import { Meter } from "../MixerConsole";
import { useCanMakeClips } from "../SocialClipButton";

// The Vocalist studio's tracks: every lane of the mix on one timeline, a
// DAW's arrangement cut down to what a singer needs. Above the lanes the
// song's parts and its lyrics, line by line, in time; each lane's header
// has its on/off, solo and level; tap a lane to open everything else under
// the timeline — pan, pitch, timing, tone, space, dynamics, fades — and to
// double, duplicate, clip or delete it. Drag the selected lane to move it
// in time (a take sung late, a beat that comes in a bar early).

const ROW = 56;
const COLORS = { beat: "var(--beat)", guide: "var(--brand)", voice: "var(--vocals)" } as const;
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];

const MAX_GAIN = 1.5;
const toPos = (gain: number) => Math.sqrt(Math.max(0, gain) / MAX_GAIN);
const toGain = (pos: number) => MAX_GAIN * Math.max(0, Math.min(1, pos)) ** 2;
const dbText = (gain: number) => (gain <= 0.0005 ? "−∞" : `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)} dB`);

function colorOf(lane: StudioLane) {
  return COLORS[groupOf(lane)];
}

/** "Take 2", "Song · Drums": a take by its own name, a song's line with its part. */
function titleOf(lane: StudioLane) {
  return isTakeLane(lane) ? laneName(lane) : `${laneName(lane)} · ${kindLabel(lane.kind)}`;
}

/** Seconds between ruler marks: about one every 70 px. */
function tickStep(pxPerSecond: number) {
  return [1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pxPerSecond >= 70) ?? 120;
}

/** The playhead, over every row — the only thing here that moves every frame. */
function Playhead({ duration }: { duration: number }) {
  const left = useStudioStore((s) => Math.round((s.playhead / duration) * 10000) / 100);
  return <span className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-foreground shadow-[0_0_6px_var(--foreground)]" style={{ left: `${Math.min(100, left)}%` }} aria-hidden />;
}

/** The element's width, kept up to date as it's resized (for spacing the ruler's marks). */
function useWidth(ref: React.RefObject<HTMLDivElement | null>, mounted: boolean) {
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || 600));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, mounted]);
  return width;
}

/** Keeps the playhead in view while it plays, zoomed in. */
function useFollowPlayhead(scroller: React.RefObject<HTMLDivElement | null>, duration: number, zoom: number) {
  useEffect(() => {
    if (zoom <= 1) return;
    return useStudioStore.subscribe((s, prev) => {
      const el = scroller.current;
      if (!el || !s.isPlaying || s.playhead === prev.playhead) return;
      const x = (s.playhead / duration) * el.scrollWidth;
      if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 48) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25);
    });
  }, [scroller, duration, zoom]);
}

/** A lane on the timeline: its clips with their waveform; the selected one can be dragged in time. */
function LaneRow({ lane, duration, selected, onSelect, width }: { lane: StudioLane; duration: number; selected: boolean; onSelect: () => void; width: () => number }) {
  const drag = useRef<{ x: number; offset: number; moved: boolean } | null>(null);
  const color = colorOf(lane);
  const solo = useStudioStore((s) => s.lanes.some((l) => l.solo));
  const dim = lane.muted || (solo && !lane.solo);
  const n = lane.peaks.length;

  const down = (e: ReactPointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, offset: lane.offsetSeconds, moved: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) startNewStep();
    d.moved = true;
    const store = useStudioStore.getState();
    let to = Math.max(0, d.offset + (dx / width()) * duration);
    // Snapped to the beat with the grid on; hold Alt for free movement.
    if (store.snapToGrid && !e.altKey) {
      const beat = beatSeconds(store.projectBpm);
      const snapped = Math.round(to / beat) * beat;
      if (Math.abs(snapped - to) < beat * 0.2) to = snapped;
    }
    store.setOffset(lane.laneId, Math.round(to * 1000) / 1000);
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      e.stopPropagation();
      useStudioView.getState().notify(`${titleOf(lane)} starts at ${formatClock(useStudioStore.getState().lanes.find((l) => l.laneId === lane.laneId)?.offsetSeconds ?? 0)}`);
    }
  };

  return (
    <div className={`relative border-b border-border/50 ${selected ? "bg-foreground/[0.04]" : ""}`} style={{ height: ROW }}>
      {clipsOf(lane).map((clip, i) => {
        const start = clipStart(lane, clip);
        const length = clipSpan(clip) / (lane.tempoRatio || 1);
        const from = lane.originalDuration > 0 ? Math.floor((clip.from / lane.originalDuration) * n) : 0;
        const to = lane.originalDuration > 0 ? Math.ceil((clip.to / lane.originalDuration) * n) : n;
        return (
          <div
            key={clip.id ?? i}
            onPointerDown={(e) => {
              if (!selected) {
                e.stopPropagation();
                onSelect();
              } else down(e);
            }}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => (drag.current = null)}
            className={`absolute bottom-1 top-1 overflow-hidden rounded-md border transition-opacity ${selected ? "cursor-grab touch-none border-foreground/70 active:cursor-grabbing" : "cursor-pointer border-transparent"} ${dim || clip.muted ? "opacity-35" : ""}`}
            style={{ left: `${(start / duration) * 100}%`, width: `${(length / duration) * 100}%`, background: `color-mix(in srgb, ${color} 22%, transparent)` }}
            title={selected ? "Drag to move it in time" : `Select ${titleOf(lane)}`}
          >
            <Waveform peaks={lane.peaks.slice(from, to)} color={color} height={ROW - 10} className="pointer-events-none" />
            {clip.label && <span className="absolute left-1 top-0.5 rounded bg-black/40 px-1 text-[9px] font-semibold text-white">{clip.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A lane's header beside its row: name, on/off, solo, level and meter. */
function LaneHeader({ lane, selected, onSelect }: { lane: StudioLane; selected: boolean; onSelect: () => void }) {
  const toggleMute = useStudioStore((s) => s.toggleMute);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const setVolume = useStudioStore((s) => s.setVolume);
  const name = titleOf(lane);
  const small = "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold max-lg:h-7 max-lg:w-7";
  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer flex-col justify-center gap-1 border-b border-border/50 pe-2 ps-0 ${selected ? "bg-vocals/10" : "hover:bg-foreground/[0.03]"}`}
      style={{ height: ROW, boxShadow: `inset 3px 0 0 ${colorOf(lane)}` }}
      aria-current={selected || undefined}
    >
      <p dir="auto" className={`truncate ps-2.5 text-xs font-semibold ${lane.muted ? "text-muted line-through" : ""}`} title={name}>
        {name}
      </p>
      <div className="flex items-center gap-1 ps-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => toggleMute(lane.laneId)}
          aria-pressed={lane.muted}
          className={`${small} ${lane.muted ? "bg-danger text-white" : "border border-border text-muted hover:text-foreground"}`}
          aria-label={lane.muted ? `Unmute ${name}` : `Mute ${name}`}
          title={lane.muted ? "Unmute" : "Mute"}
        >
          M
        </button>
        <button
          onClick={() => toggleSolo(lane.laneId)}
          aria-pressed={lane.solo}
          className={`${small} ${lane.solo ? "bg-beat text-white" : "border border-border text-muted hover:text-foreground"}`}
          aria-label={`Solo ${name}`}
          title="Solo"
        >
          S
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={toPos(lane.volume)}
          onChange={(e) => setVolume(lane.laneId, toGain(Number(e.target.value)))}
          onDoubleClick={() => setVolume(lane.laneId, 1)}
          aria-label={`${name} level`}
          aria-valuetext={dbText(lane.volume)}
          title={`${dbText(lane.volume)} · double-click for 0 dB`}
          className="h-1.5 min-w-0 flex-1 cursor-pointer max-sm:hidden"
          style={{ accentColor: colorOf(lane) }}
        />
        <Meter source={() => audioEngine.getLaneMeter(lane.laneId)} className="h-5 shrink-0" />
      </div>
    </div>
  );
}

/** A labelled slider with its value. */
function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  text,
  onChange,
  reset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  text: string;
  onChange: (value: number) => void;
  reset?: number;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
        title={reset !== undefined ? "Double-click to reset" : undefined}
        className="h-2 min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: "var(--vocals)" }}
      />
      <span className="w-14 shrink-0 text-right tabular-nums text-muted">{text}</span>
    </label>
  );
}

function Group({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
/** Low cut on a log scale: 0..1 ↔ 20..800 Hz. */
const cutToPos = (hz: number) => Math.log(Math.max(20, hz) / 20) / Math.log(40);
const posToCut = (pos: number) => Math.round(20 * 40 ** pos);

/** Everything about the selected lane. */
function LaneControls({ lane, onDeleted }: { lane: StudioLane; onDeleted: () => void }) {
  const store = useStudioStore.getState();
  const bpm = useStudioStore((s) => s.projectBpm);
  const index = useStudioStore((s) => s.lanes.findIndex((l) => l.laneId === lane.laneId));
  const count = useStudioStore((s) => s.lanes.length);
  const canClip = useCanMakeClips();
  const [renaming, setRenaming] = useState<string | null>(null);
  const take = isTakeLane(lane);
  const fx = lane.fx;
  const set = (patch: Partial<LaneFx>) => store.setFx(lane.laneId, patch);
  const key = lane.musicalKey ? transposeKey(lane.musicalKey, lane.pitchSemitones) : null;
  const beat = beatSeconds(bpm);
  const [start, end] = (() => {
    const clips = clipsOf(lane);
    const s = Math.min(...clips.map((c) => clipStart(lane, c)));
    const e = Math.max(...clips.map((c) => clipStart(lane, c) + clipSpan(c) / (lane.tempoRatio || 1)));
    return [s, e];
  })();
  const action = "flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted transition-colors hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10";
  const step = "flex h-8 min-w-8 items-center justify-center rounded-lg border border-border px-2 text-[11px] font-semibold tabular-nums text-muted hover:border-vocals hover:text-foreground max-lg:h-10 max-lg:min-w-10";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-3" style={{ borderColor: `color-mix(in srgb, ${colorOf(lane)} 45%, transparent)` }}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(lane) }} aria-hidden />
        {renaming !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              store.renameLane(lane.laneId, renaming.trim().slice(0, 120));
              setRenaming(null);
            }}
            className="min-w-0 flex-1 basis-48"
          >
            <input
              autoFocus
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
              dir="auto"
              aria-label="Lane name"
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm max-lg:text-base"
            />
          </form>
        ) : (
          <button onClick={() => setRenaming(laneName(lane))} className="group flex min-w-0 flex-1 basis-48 items-center gap-1.5 text-left" title="Rename">
            <span className="min-w-0">
              <span dir="auto" className="block truncate text-sm font-bold">
                {laneName(lane)}
              </span>
              <span className="block text-[11px] text-muted">
                {take ? "Your take" : kindLabel(lane.kind)} · {formatClock(start)}–{formatClock(end)}
                {key ? ` · ${keyLabel(key)}` : ""}
              </span>
            </span>
            <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => store.toggleMute(lane.laneId)} aria-pressed={lane.muted} className={action} title={lane.muted ? "Unmute" : "Mute"}>
            {lane.muted ? <VolumeX className="text-danger" /> : <Volume2 />} {lane.muted ? "Off" : "On"}
          </button>
          {take && (
            <button onClick={() => doubleTake(lane)} className={action} title="Double this take: a copy a touch late, the two spread left and right — a fuller voice">
              <Layers2 /> Double
            </button>
          )}
          {take && canClip && (
            <button
              onClick={() => useStudioView.getState().openClip({ start, end: Math.min(end, start + MAX_CLIP_SECONDS), label: laneName(lane) })}
              className={action}
              title="Make a video clip of this take"
            >
              <Clapperboard /> Clip
            </button>
          )}
          <button
            onClick={() => {
              startNewStep();
              store.duplicateLane(lane.laneId);
            }}
            className={action}
            title="Duplicate this lane"
            aria-label="Duplicate"
          >
            <Copy />
          </button>
          <button onClick={() => store.moveLane(lane.laneId, -1)} disabled={index <= 0} className={action} aria-label="Move up" title="Move up">
            <ArrowUp />
          </button>
          <button onClick={() => store.moveLane(lane.laneId, 1)} disabled={index >= count - 1} className={action} aria-label="Move down" title="Move down">
            <ArrowDown />
          </button>
          <button
            onClick={() => {
              startNewStep();
              store.removeLane(lane.laneId);
              onDeleted();
              useStudioView.getState().notify(`Deleted ${titleOf(lane)} — ⌘Z (undo) brings it back`);
            }}
            className={`${action} hover:!border-danger hover:!text-danger`}
            aria-label="Delete"
            title="Delete — Undo brings it back"
          >
            <Trash2 />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Group title="Level & place">
          <Slider label="Level" value={toPos(lane.volume)} min={0} max={1} step={0.005} text={dbText(lane.volume)} onChange={(p) => store.setVolume(lane.laneId, toGain(p))} reset={toPos(1)} />
          <Slider
            label="Pan"
            value={fx.pan}
            min={-1}
            max={1}
            text={Math.abs(fx.pan) < 0.02 ? "Centre" : `${Math.round(Math.abs(fx.pan) * 100)} ${fx.pan < 0 ? "L" : "R"}`}
            onChange={(pan) => set({ pan: Math.abs(pan) < 0.03 ? 0 : pan })}
            reset={0}
          />
          <Slider label="Width" value={fx.width} min={0} max={1} text={pct(fx.width)} onChange={(width) => set({ width })} reset={0} />
        </Group>

        <Group
          title="Pitch & timing"
          action={
            (lane.pitchSemitones !== 0 || Math.abs(lane.offsetSeconds) > 0) && (
              <span className="text-[11px] tabular-nums text-muted">starts {lane.offsetSeconds.toFixed(3)} s</span>
            )
          }
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted">Pitch</span>
            <button onClick={() => store.setPitchSemitones(lane.laneId, Math.max(-12, lane.pitchSemitones - 1))} className={step} aria-label="A semitone down">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-24 text-center font-semibold tabular-nums">
              {lane.pitchSemitones > 0 ? "+" : ""}
              {lane.pitchSemitones} st{key ? ` · ${keyLabel(key)}` : ""}
            </span>
            <button onClick={() => store.setPitchSemitones(lane.laneId, Math.min(12, lane.pitchSemitones + 1))} className={step} aria-label="A semitone up">
              <Plus className="h-3.5 w-3.5" />
            </button>
            {lane.pitchSemitones !== 0 && (
              <button onClick={() => store.setPitchSemitones(lane.laneId, 0)} className="text-[11px] text-muted underline-offset-2 hover:underline">
                reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="w-20 shrink-0 text-muted" title="Move the lane earlier or later — a take that's late, a beat a bar off">
              Timing
            </span>
            {[
              [-beat, "−1 beat"],
              [-0.05, "−50 ms"],
              [-0.01, "−10"],
              [0.01, "+10"],
              [0.05, "+50 ms"],
              [beat, "+1 beat"],
            ].map(([delta, label]) => (
              <button
                key={label as string}
                onClick={() => {
                  startNewStep();
                  store.nudgeOffset(lane.laneId, delta as number);
                }}
                className={step}
                title={`Move ${(delta as number) < 0 ? "earlier" : "later"} by ${label}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Group>

        <Group title="Tone (EQ)" action={<ResetButton onClick={() => set({ highpass: DEFAULT_FX.highpass, lowpass: DEFAULT_FX.lowpass, eqLow: 0, eqMid: 0, eqHigh: 0 })} />}>
          <Slider label="Low cut" value={cutToPos(fx.highpass)} min={0} max={1} text={fx.highpass <= 21 ? "Off" : `${fx.highpass} Hz`} onChange={(p) => set({ highpass: posToCut(p) })} reset={0} />
          <Slider label="Bass" value={fx.eqLow} min={-12} max={12} step={0.5} text={db(fx.eqLow)} onChange={(eqLow) => set({ eqLow })} reset={0} />
          <Slider label="Body" value={fx.eqMid} min={-12} max={12} step={0.5} text={db(fx.eqMid)} onChange={(eqMid) => set({ eqMid })} reset={0} />
          <Slider label="Air" value={fx.eqHigh} min={-12} max={12} step={0.5} text={db(fx.eqHigh)} onChange={(eqHigh) => set({ eqHigh })} reset={0} />
        </Group>

        <Group title="Space" action={<ResetButton onClick={() => set({ reverb: 0, delay: 0, reverbSize: DEFAULT_FX.reverbSize, delayFeedback: DEFAULT_FX.delayFeedback })} />}>
          <Slider label="Reverb" value={fx.reverb} min={0} max={1} text={pct(fx.reverb)} onChange={(reverb) => set({ reverb })} reset={0} />
          <Slider label="Room size" value={fx.reverbSize} min={0.5} max={6} step={0.1} text={`${fx.reverbSize.toFixed(1)} s`} onChange={(reverbSize) => set({ reverbSize })} reset={DEFAULT_FX.reverbSize} />
          <Slider label="Echo" value={fx.delay} min={0} max={1} text={pct(fx.delay)} onChange={(delay) => set({ delay })} reset={0} />
          <div className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted">Echo time</span>
            <select
              value={fx.delayDivision}
              onChange={(e) => set({ delayDivision: e.target.value as DelayDivision })}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs max-lg:h-10 max-lg:text-base"
            >
              {DELAY_DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <Slider label="Repeats" value={fx.delayFeedback} min={0} max={0.85} text={pct(fx.delayFeedback / 0.85)} onChange={(delayFeedback) => set({ delayFeedback })} reset={DEFAULT_FX.delayFeedback} />
        </Group>

        <Group title="Dynamics">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={fx.compress} onChange={(e) => set({ compress: e.target.checked })} className="h-4 w-4" style={{ accentColor: "var(--vocals)" }} />
            <span>Compressor — evens out loud and quiet words</span>
          </label>
          <Slider label="Warmth" value={fx.drive} min={0} max={1} text={pct(fx.drive)} onChange={(drive) => set({ drive })} reset={0} />
          {lane.kind !== "vocals" && (
            <Slider label="Duck" value={fx.duck} min={0} max={1} text={fx.duck ? pct(fx.duck) : "Off"} onChange={(duck) => set({ duck })} reset={0} />
          )}
          {lane.kind !== "vocals" && <p className="text-[11px] text-muted">Duck dips this lane while the vocals are loud, so the words come through.</p>}
        </Group>

        <Group title="Fades">
          <Slider label="Fade in" value={fx.fadeIn} min={0} max={8} step={0.1} text={fx.fadeIn ? `${fx.fadeIn.toFixed(1)} s` : "None"} onChange={(fadeIn) => set({ fadeIn })} reset={0} />
          <Slider label="Fade out" value={fx.fadeOut} min={0} max={8} step={0.1} text={fx.fadeOut ? `${fx.fadeOut.toFixed(1)} s` : "None"} onChange={(fadeOut) => set({ fadeOut })} reset={0} />
          <button
            onClick={() => {
              startNewStep();
              set({ ...DEFAULT_FX });
            }}
            className="mt-1 flex h-8 items-center gap-1.5 self-start rounded-lg border border-border px-3 text-[11px] font-semibold text-muted hover:text-foreground max-lg:h-10"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset all the sound
          </button>
        </Group>
      </div>
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline">
      reset
    </button>
  );
}

export default function VocalTracks() {
  const lanes = useStudioStore((s) => s.lanes);
  const songLength = useStudioStore((s) => s.duration);
  const loopOn = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const lines = useLyrics((s) => s.lines);
  const selectedLine = useLyrics((s) => s.selectedLine);
  const [zoom, setZoom] = useState(1);
  const [showWords, setShowWords] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const viewWidth = useWidth(scroller, lanes.length > 0);
  const duration = Math.max(1, songLength);
  useFollowPlayhead(scroller, duration, zoom);

  const selected = lanes.find((l) => l.laneId === picked) ?? lanes.find(isTakeLane) ?? lanes[0] ?? null;
  const sections = useMemo(() => sectionsOf(lines).filter((s) => s.start !== null), [lines]);
  const timed = useMemo(
    () =>
      lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.time !== null && isSung(l))
        .map(({ l, i }, k, all) => ({ i, text: l.text, start: l.time!, end: Math.min(all[k + 1]?.l.time ?? Infinity, l.time! + 6) })),
    [lines]
  );
  const width = () => scroller.current?.scrollWidth ?? 1;
  const pxPerSecond = (viewWidth * zoom) / duration;
  const every = tickStep(pxPerSecond);
  const ticks = Array.from({ length: Math.floor(duration / every) + 1 }, (_, i) => i * every);

  const seekAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    audioEngine.seek(Math.max(0, Math.min(duration, ((e.clientX - box.left) / box.width) * duration)));
  };

  if (lanes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm font-semibold">No tracks yet</p>
        <p className="max-w-xs text-xs text-muted">Add a beat (or a whole song) to sing over — its lines and your takes show here, each with its own controls.</p>
        <button onClick={() => useStudioView.getState().showLibrary("beat")} className="mt-1 flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90">
          <Plus /> Add a beat
        </button>
      </div>
    );
  }

  const tool = "flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted transition-colors hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10";
  const at = ZOOMS.indexOf(zoom);
  const header = "w-32 sm:w-56";
  const hasWords = showWords && timed.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">
          {lanes.length} track{lanes.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        {timed.length > 0 && (
          <button onClick={() => setShowWords((v) => !v)} aria-pressed={showWords} className={`${tool} ${showWords ? "border-vocals/60 text-foreground" : ""}`} title="The lyrics, line by line, above the tracks">
            <ScrollText /> Lyrics
          </button>
        )}
        <button onClick={() => setZoom(ZOOMS[Math.max(0, at - 1)])} disabled={at <= 0} className={tool} aria-label="Zoom out">
          <ZoomOut />
        </button>
        <span className="w-9 text-center text-[11px] tabular-nums text-muted">{zoom}×</span>
        <button onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, at + 1)])} disabled={at >= ZOOMS.length - 1} className={tool} aria-label="Zoom in">
          <ZoomIn />
        </button>
        <button onClick={() => useStudioView.getState().showLibrary()} className={tool} title="Add a beat, a vocal or a whole song">
          <Plus /> Add
        </button>
      </div>

      <div className="flex overflow-hidden rounded-xl border border-border bg-background/50">
        {/* Headers: fixed while the timeline scrolls beside them. */}
        <div className={`${header} shrink-0 border-e border-border`}>
          <div className="flex h-6 items-center border-b border-border/50 px-2 text-[10px] text-muted">Parts</div>
          {hasWords && <div className="flex h-9 items-center gap-1 border-b border-border/50 px-2 text-[11px] font-semibold text-vocals"><ScrollText className="h-3.5 w-3.5" /> Lyrics</div>}
          {lanes.map((lane) => (
            <LaneHeader key={lane.laneId} lane={lane} selected={lane.laneId === selected?.laneId} onSelect={() => setPicked(lane.laneId)} />
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
            {/* Ruler: time marks and the song's parts; tap to go there. */}
            <div onPointerDown={seekAt} className="relative h-6 cursor-pointer border-b border-border/50 text-[10px] text-muted" title="Tap to go there">
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-s border-border/60 ps-1 tabular-nums" style={{ left: `${(t / duration) * 100}%` }}>
                  {formatClock(t)}
                </span>
              ))}
              {sections.map((s) => (
                <span
                  key={s.index}
                  dir="auto"
                  className="absolute bottom-0.5 z-10 max-w-28 truncate rounded bg-vocals/20 px-1 text-[9px] font-bold uppercase tracking-wide text-vocals"
                  style={{ left: `${(s.start! / duration) * 100}%` }}
                >
                  {s.name}
                </span>
              ))}
            </div>
            {hasWords && (
              <div className="relative h-9 border-b border-border/50">
                {timed.map((w) => (
                  <button
                    key={w.i}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      useLyrics.getState().selectLine(w.i, "stage");
                      audioEngine.seek(Math.max(0, w.start - 0.5));
                    }}
                    dir="auto"
                    className={`absolute bottom-1 top-1 overflow-hidden truncate rounded px-1 text-start text-[10px] leading-7 ${
                      selectedLine === w.i ? "bg-vocals text-white" : "bg-vocals/15 text-foreground/80 hover:bg-vocals/30"
                    }`}
                    style={{ left: `${(w.start / duration) * 100}%`, width: `max(4px, calc(${((w.end - w.start) / duration) * 100}% - 2px))` }}
                    title={`${formatClock(w.start)} · ${w.text}`}
                  >
                    {w.text}
                  </button>
                ))}
              </div>
            )}
            <div onPointerDown={seekAt} className="relative">
              {lanes.map((lane) => (
                <LaneRow key={lane.laneId} lane={lane} duration={duration} selected={lane.laneId === selected?.laneId} onSelect={() => setPicked(lane.laneId)} width={width} />
              ))}
            </div>
            {loopOn && loopEnd > loopStart && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 z-10 border-x border-vocals/60 bg-vocals/10"
                style={{ left: `${(loopStart / duration) * 100}%`, width: `${((loopEnd - loopStart) / duration) * 100}%` }}
                aria-hidden
              />
            )}
            <Playhead duration={duration} />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted max-sm:hidden">Tap a track for all its controls · drag the selected one to move it in time (Alt for free movement) · tap the ruler to jump there</p>

      {selected && <LaneControls key={selected.laneId} lane={selected} onDeleted={() => setPicked(null)} />}
    </div>
  );
}
