"use client";

import { memo, useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { startNewStep } from "@/lib/client/studioHistory";
import { DEFAULT_FX, MASTER_PRESETS, laneName, useStudioStore, type LaneFx, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import { masterPresetOf } from "./MasterPanel";

// The producer's mixing console: a channel strip per lane — its insert
// effects (each one a switch), pan, mute and solo, a fader and a level
// meter — and the master strip at the end. The lane inspector below goes
// deeper into whichever strip was clicked last.

// --- Meters --------------------------------------------------------------------------------

type MeterTarget = { bar: HTMLElement; peak: HTMLElement; clip: HTMLElement; source: () => AnalyserNode | null; shown: number; held: number; heldAt: number; clipAt: number };

const meters = new Set<MeterTarget>();
const buffers = new WeakMap<AnalyserNode, Float32Array<ArrayBuffer>>();
let frame = 0;

/** Bottom of the meter, in dBFS. */
const FLOOR_DB = -54;

/** dBFS → 0..1 up the meter (0 dB at the top). */
const meterPos = (db: number) => Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));

/** One loop draws every meter on screen: peak level, falling back slowly, with a held peak and a clip light. */
function tick(now: number) {
  for (const m of meters) {
    const analyser = m.source();
    let peak = 0;
    if (analyser) {
      let data = buffers.get(analyser);
      if (!data || data.length !== analyser.fftSize) {
        data = new Float32Array(analyser.fftSize);
        buffers.set(analyser, data);
      }
      analyser.getFloatTimeDomainData(data);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    const db = peak > 1e-5 ? 20 * Math.log10(peak) : -Infinity;
    const pos = meterPos(db);
    // Up at once, down at about 20 dB a second — how a DAW's meter moves.
    m.shown = Math.max(pos, m.shown - 0.006);
    if (pos >= m.held || now - m.heldAt > 1500) {
      m.held = pos;
      m.heldAt = now;
    }
    if (peak >= 0.999) m.clipAt = now;
    m.bar.style.transform = `scaleY(${m.shown})`;
    m.peak.style.bottom = `${m.held * 100}%`;
    m.peak.style.opacity = m.held > 0.02 ? "1" : "0";
    m.clip.style.opacity = now - m.clipAt < 1200 ? "1" : "0.15";
  }
  frame = meters.size ? requestAnimationFrame(tick) : 0;
}

function Meter({ source, className = "" }: { source: () => AnalyserNode | null; className?: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  const peak = useRef<HTMLSpanElement>(null);
  const clip = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });
  useEffect(() => {
    if (!bar.current || !peak.current || !clip.current) return;
    const target: MeterTarget = { bar: bar.current, peak: peak.current, clip: clip.current, source: () => sourceRef.current(), shown: 0, held: 0, heldAt: 0, clipAt: -Infinity };
    meters.add(target);
    if (!frame) frame = requestAnimationFrame(tick);
    return () => {
      meters.delete(target);
    };
  }, []);
  return (
    <div className={`relative w-2.5 overflow-hidden rounded-sm bg-black/50 ${className}`} aria-hidden>
      <span ref={clip} className="absolute inset-x-0 top-0 z-10 h-1 bg-danger opacity-15" />
      <span
        ref={bar}
        className="absolute inset-0 origin-bottom"
        style={{ transform: "scaleY(0)", background: "linear-gradient(to top, var(--success) 0%, var(--success) 62%, #facc15 80%, var(--danger) 100%)" }}
      />
      <span ref={peak} className="absolute inset-x-0 h-0.5 bg-foreground opacity-0" style={{ bottom: 0 }} />
    </div>
  );
}

// --- Fader ---------------------------------------------------------------------------------

/** Gain → 0..1 up the fader: a square-root taper, so 0 dB sits about four-fifths of the way up. */
const faderPos = (gain: number, max: number) => Math.sqrt(Math.max(0, gain) / max);
const faderGain = (pos: number, max: number) => max * Math.max(0, Math.min(1, pos)) ** 2;
const dbText = (gain: number) => (gain <= 0.0005 ? "−∞" : `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)}`);

/** A vertical fader: drag it (or the track), arrow keys nudge it, double-click puts it back to 0 dB. */
function Fader({ value, max = 1.5, onChange, color, label }: { value: number; max?: number; onChange: (gain: number) => void; color: string; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startY: number; startPos: number } | null>(null);
  const pos = faderPos(value, max);
  const unity = faderPos(1, max);

  const at = (clientY: number) => {
    const rect = track.current!.getBoundingClientRect();
    return 1 - (clientY - rect.top) / rect.height;
  };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={`${dbText(value)} dB`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startNewStep();
        const onThumb = (e.target as HTMLElement).dataset.thumb === "1";
        // Grabbing the thumb moves it from where it is; clicking the track jumps there.
        const start = onThumb ? pos : at(e.clientY);
        drag.current = { id: e.pointerId, startY: e.clientY, startPos: start };
        if (!onThumb) onChange(faderGain(start, max));
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const height = track.current!.getBoundingClientRect().height;
        // Shift for fine moves.
        const scale = e.shiftKey ? 0.2 : 1;
        onChange(faderGain(d.startPos - ((e.clientY - d.startY) / height) * scale, max));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => {
        startNewStep();
        onChange(1);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.01 : 0.04;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(faderGain(pos + step, max));
        else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(faderGain(pos - step, max));
        else if (e.key === "Home") onChange(1);
        else return;
        e.preventDefault();
      }}
      className="relative h-full w-7 cursor-ns-resize touch-none"
    >
      <span className="absolute inset-y-1 left-1/2 w-1 -translate-x-1/2 rounded-full bg-black/50" aria-hidden />
      <span className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full" style={{ bottom: 4, height: `calc(${pos * 100}% - 4px)`, background: color, opacity: 0.6 }} aria-hidden />
      {/* 0 dB */}
      <span className="absolute left-0 h-px w-full bg-muted/60" style={{ bottom: `${unity * 100}%` }} aria-hidden />
      <span
        data-thumb="1"
        className="absolute left-1/2 h-4 w-6 -translate-x-1/2 translate-y-1/2 cursor-grab rounded-[3px] border border-white/30 bg-gradient-to-b from-zinc-300 to-zinc-500 shadow-md active:cursor-grabbing"
        style={{ bottom: `${pos * 100}%` }}
      >
        <span className="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-black/60" />
      </span>
    </div>
  );
}

// --- Inserts -------------------------------------------------------------------------------

type Insert = {
  id: string;
  label: string;
  title: string;
  on: (fx: LaneFx) => boolean;
  /** What switching it on sets, for a lane of this kind. */
  enable: (lane: StudioLane) => Partial<LaneFx>;
  /** What switching it off sets. */
  disable: Partial<LaneFx>;
};

const INSERTS: Insert[] = [
  { id: "hp", label: "HP", title: "High-pass filter — cuts rumble below", on: (fx) => fx.highpass > 20, enable: (l) => ({ highpass: l.kind === "vocals" ? 110 : l.kind === "bass" ? 30 : 40 }), disable: { highpass: DEFAULT_FX.highpass } },
  { id: "eq", label: "EQ", title: "3-band EQ — low, mid, high", on: (fx) => fx.eqLow !== 0 || fx.eqMid !== 0 || fx.eqHigh !== 0, enable: (l) => (l.kind === "vocals" ? { eqMid: 1.5, eqHigh: 2.5 } : { eqLow: 2, eqHigh: 1 }), disable: { eqLow: 0, eqMid: 0, eqHigh: 0 } },
  { id: "drv", label: "DRV", title: "Drive — saturation", on: (fx) => fx.drive > 0, enable: () => ({ drive: 0.2 }), disable: { drive: 0 } },
  { id: "cmp", label: "CMP", title: "Compressor — evens the level out", on: (fx) => fx.compress, enable: () => ({ compress: true }), disable: { compress: false } },
  { id: "lp", label: "LP", title: "Low-pass filter — softens the top", on: (fx) => fx.lowpass < 20000, enable: () => ({ lowpass: 9000 }), disable: { lowpass: DEFAULT_FX.lowpass } },
  { id: "wid", label: "WID", title: "Stereo width — Haas doubler", on: (fx) => fx.width > 0, enable: () => ({ width: 0.4 }), disable: { width: 0 } },
  { id: "dck", label: "DCK", title: "Ducking — dips under the vocal", on: (fx) => fx.duck > 0, enable: () => ({ duck: 0.3 }), disable: { duck: 0 } },
  { id: "rev", label: "REV", title: "Reverb send", on: (fx) => fx.reverb > 0, enable: () => ({ reverb: 0.2 }), disable: { reverb: 0 } },
  { id: "dly", label: "DLY", title: "Delay send (synced to the tempo)", on: (fx) => fx.delay > 0, enable: () => ({ delay: 0.2 }), disable: { delay: 0 } },
];

/**
 * What each switched-off insert was set to, so switching it back on brings
 * the same sound back — for this visit (it's how the person is working,
 * not part of the mix).
 */
const bypassed = new Map<string, Partial<LaneFx>>();

function toggleInsert(lane: StudioLane, insert: Insert) {
  const key = `${lane.laneId}:${insert.id}`;
  startNewStep();
  if (insert.on(lane.fx)) {
    bypassed.set(key, Object.fromEntries(Object.keys(insert.disable).map((k) => [k, lane.fx[k as keyof LaneFx]])) as Partial<LaneFx>);
    useStudioStore.getState().setFx(lane.laneId, insert.disable);
  } else {
    useStudioStore.getState().setFx(lane.laneId, bypassed.get(key) ?? insert.enable(lane));
    bypassed.delete(key);
  }
}

function panText(pan: number) {
  if (Math.abs(pan) < 0.02) return "C";
  return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
}

// --- Strips --------------------------------------------------------------------------------

const ChannelStrip = memo(function ChannelStrip({ lane, selected }: { lane: StudioLane; selected: boolean }) {
  const color = kindColor(lane.kind);
  const store = useStudioStore.getState;
  const select = () => store().setLaneSelection([lane.laneId]);
  return (
    <div
      onPointerDown={select}
      className={`flex w-[5.5rem] shrink-0 flex-col items-stretch gap-1.5 rounded-xl border p-1.5 transition-colors ${selected ? "border-brand bg-brand/10" : "border-border bg-background/40"}`}
      aria-label={`${laneName(lane)} channel`}
      role="group"
    >
      <div className="h-1 rounded-full" style={{ background: color }} />
      <p className="truncate text-center text-[11px] font-semibold leading-tight" title={laneName(lane)}>
        {laneName(lane)}
      </p>
      <p className="-mt-1 text-center text-[9px] font-semibold uppercase tracking-wide" style={{ color }}>
        {kindLabel(lane.kind)}
      </p>
      <div className="grid grid-cols-3 gap-0.5" role="group" aria-label="Inserts">
        {INSERTS.map((insert) => {
          const on = insert.on(lane.fx);
          return (
            <button
              key={insert.id}
              onClick={() => toggleInsert(lane, insert)}
              aria-pressed={on}
              title={`${insert.title} — ${on ? "on (click to bypass)" : "off (click to switch on)"}`}
              className={`rounded-[3px] py-0.5 font-mono text-[8.5px] font-bold leading-tight transition-colors ${on ? "text-black" : "bg-surface-raised text-muted hover:text-foreground"}`}
              style={on ? { background: color } : undefined}
            >
              {insert.label}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => {
          select();
          useStudioView.getState().openInspector("fx");
        }}
        className="rounded-md border border-border py-0.5 text-[10px] text-muted hover:border-brand hover:text-foreground"
        title="Open this lane's effects"
      >
        <SlidersHorizontal /> FX
      </button>
      <label className="flex flex-col items-center gap-0.5" title="Pan — double-click to centre">
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={lane.fx.pan}
          onPointerDown={() => startNewStep()}
          onChange={(e) => store().setFx(lane.laneId, { pan: Number(e.target.value) })}
          onDoubleClick={() => store().setFx(lane.laneId, { pan: 0 })}
          className="h-1 w-full"
          style={{ accentColor: color }}
          aria-label={`${laneName(lane)} pan`}
        />
        <span className="font-mono text-[9px] text-muted">{panText(lane.fx.pan)}</span>
      </label>
      <div className="flex justify-center gap-1">
        <button
          onClick={() => (startNewStep(), store().toggleMute(lane.laneId))}
          aria-pressed={lane.muted}
          className={`h-6 w-7 rounded text-[10px] font-bold ${lane.muted ? "bg-drums text-black" : "bg-surface-raised text-muted hover:text-foreground"}`}
          aria-label="Mute"
          title="Mute"
        >
          M
        </button>
        <button
          onClick={() => store().toggleSolo(lane.laneId)}
          aria-pressed={lane.solo}
          className={`h-6 w-7 rounded text-[10px] font-bold ${lane.solo ? "bg-success text-black" : "bg-surface-raised text-muted hover:text-foreground"}`}
          aria-label="Solo"
          title="Solo"
        >
          S
        </button>
      </div>
      <div className="flex h-44 justify-center gap-1.5">
        <Fader value={lane.volume} onChange={(v) => store().setVolume(lane.laneId, Math.round(v * 1000) / 1000)} color={color} label={`${laneName(lane)} level`} />
        <Meter source={() => audioEngine.getLaneMeter(lane.laneId)} className="h-full" />
      </div>
      <p className="text-center font-mono text-[10px] text-muted tabular-nums">{dbText(lane.volume)} dB</p>
    </div>
  );
});

function MasterStrip() {
  const masterVolume = useStudioStore((s) => s.masterVolume);
  const master = useStudioStore((s) => s.master);
  const preset = masterPresetOf(master);
  return (
    <div className="flex w-[6.5rem] shrink-0 flex-col items-stretch gap-1.5 rounded-xl border border-brand/50 bg-brand/5 p-1.5" role="group" aria-label="Master channel">
      <div className="h-1 rounded-full bg-gradient-to-r from-brand to-vocals" />
      <p className="text-center text-[11px] font-bold">Master</p>
      <label className="flex flex-col gap-0.5 text-[9px] text-muted">
        Mastering
        <select
          value={preset?.id ?? "custom"}
          onChange={(e) => {
            const next = MASTER_PRESETS.find((p) => p.id === e.target.value);
            if (!next) return;
            startNewStep();
            useStudioStore.getState().setMaster(next.master);
          }}
          className="input !px-1 !py-0.5 text-[10px]"
          aria-label="Mastering preset"
        >
          {!preset && <option value="custom">Custom</option>}
          {MASTER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-center text-[9px] leading-tight text-muted">Low {master.low > 0 ? "+" : ""}{master.low} · High {master.high > 0 ? "+" : ""}{master.high} · Glue {Math.round(master.glue * 100)}%</p>
      <div className="mt-auto flex h-44 justify-center gap-1.5">
        <Fader value={masterVolume} onChange={(v) => useStudioStore.getState().setMasterVolume(Math.round(v * 1000) / 1000)} color="var(--brand)" label="Master level" />
        <Meter source={() => audioEngine.getAnalyser()} className="h-full" />
      </div>
      <p className="text-center font-mono text-[10px] text-muted tabular-nums">{dbText(masterVolume)} dB</p>
    </div>
  );
}

export default function MixerConsole() {
  const lanes = useStudioStore((s) => s.lanes);
  const selected = useStudioStore((s) => s.selectedLaneIds);
  return (
    <section aria-label="Mixer" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted">
        <span>
          {lanes.length} channel{lanes.length === 1 ? "" : "s"} · click an insert to switch it on or off · double-click a fader for 0 dB · Shift-drag for fine moves
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto p-2 scrollbar-thin">
        {lanes.map((lane) => (
          <ChannelStrip key={lane.laneId} lane={lane} selected={selected.includes(lane.laneId)} />
        ))}
        <div className="w-px shrink-0 self-stretch bg-border" aria-hidden />
        <MasterStrip />
      </div>
    </section>
  );
}
