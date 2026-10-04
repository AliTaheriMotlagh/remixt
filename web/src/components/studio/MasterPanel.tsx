"use client";

import { startNewStep } from "@/lib/client/studioHistory";
import { DEFAULT_MASTER, MASTER_PRESETS, useStudioStore, type MasterFx } from "@/lib/client/studioStore";

// The master bus, in the transport's "Master" popover: one-tap mastering
// presets, then the three knobs behind them — low, high and glue. It all
// sits in front of the fader and the safety limiter, and goes into
// exports too. Each preset tap is one undo step; a slider drag is one.

const same = (a: MasterFx, b: MasterFx) => Math.abs(a.low - b.low) < 0.05 && Math.abs(a.high - b.high) < 0.05 && Math.abs(a.glue - b.glue) < 0.01;

/** Which preset the master is on, if any. */
export function masterPresetOf(master: MasterFx) {
  return MASTER_PRESETS.find((p) => same(p.master, master)) ?? null;
}

export function isMastered(master: MasterFx) {
  return !same(master, DEFAULT_MASTER);
}

function Slider({ label, value, min, max, step, format, onChange, reset }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; reset: number }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(reset)}
        className="h-1.5 min-w-0 flex-1 accent-brand"
        aria-label={label}
      />
      <span className="w-14 text-right font-mono tabular-nums">{format(value)}</span>
    </label>
  );
}

export default function MasterPanel() {
  const master = useStudioStore((s) => s.master);
  const setMaster = useStudioStore((s) => s.setMaster);
  const preset = masterPresetOf(master);
  const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <p className="font-semibold">Master</p>
        <p className="text-[11px] text-muted">The finishing touch on the whole mix — heard live and in exports.</p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MASTER_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              startNewStep();
              setMaster(p.master);
            }}
            title={p.hint}
            aria-pressed={preset?.id === p.id}
            className={`rounded-lg border px-2 py-1.5 font-medium ${preset?.id === p.id ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Slider label="Low" value={master.low} min={-6} max={6} step={0.5} format={db} reset={0} onChange={(low) => setMaster({ low })} />
      <Slider label="High" value={master.high} min={-6} max={6} step={0.5} format={db} reset={0} onChange={(high) => setMaster({ high })} />
      <Slider label="Glue" value={master.glue} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} reset={0} onChange={(glue) => setMaster({ glue })} />
      <p className="text-[10px] text-muted">{preset ? preset.hint : "Custom"} · double-click a slider to reset it</p>
    </div>
  );
}
