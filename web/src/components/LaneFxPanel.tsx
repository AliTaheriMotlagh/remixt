"use client";

import {
  DEFAULT_FX,
  DELAY_DIVISIONS,
  FX_PRESETS,
  resolveDelayTime,
  useStudioStore,
  type LaneFx,
  type StudioLane,
} from "@/lib/client/studioStore";

function FxSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  accent,
  onChange,
  title,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  accent?: string;
  onChange: (value: number) => void;
  title?: string;
}) {
  return (
    <label className="flex flex-col gap-1" title={title}>
      <span className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted">
        {label}
        <span className="font-mono normal-case tabular-nums text-foreground/70">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full"
        style={{ accentColor: accent ?? "var(--brand)" }}
      />
    </label>
  );
}

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(2)}s`;

/** The per-lane effect rack, opened from the lane row's FX button. */
export default function LaneFxPanel({ lane }: { lane: StudioLane }) {
  const setFx = useStudioStore((s) => s.setFx);
  const applyPreset = useStudioStore((s) => s.applyPreset);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const fx = lane.fx;
  const accent = lane.kind === "vocals" ? "var(--vocals)" : "var(--beat)";

  const patch = (next: Partial<LaneFx>) => setFx(lane.laneId, next);
  const presets = FX_PRESETS.filter((p) => p.kind === "any" || p.kind === lane.kind);

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {lane.kind === "vocals" ? "Vocal presets" : "Beat presets"}
        </span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(lane.laneId, preset.id)}
            title={preset.hint}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-brand/60 hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => patch({ ...DEFAULT_FX })}
          className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:text-danger"
        >
          Reset FX
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <FxSlider
          label="Pan" value={fx.pan} min={-1} max={1} step={0.01} accent={accent}
          format={(v) =>
            Math.abs(v) < 0.01 ? "C" : `${v < 0 ? "L" : "R"}${Math.round(Math.abs(v) * 100)}`
          }
          onChange={(pan) => patch({ pan })}
          title="Position in the stereo field"
        />
        <FxSlider
          label="Width" value={fx.width} min={0} max={1} step={0.01} accent={accent}
          format={pct} onChange={(width) => patch({ width })}
          title="Haas doubler — widens the lane so a vocal sits around the beat"
        />
        <FxSlider
          label="High-pass" value={fx.highpass} min={20} max={1200} step={5}
          format={(v) => (v <= 20 ? "off" : `${hz(v)}Hz`)}
          onChange={(highpass) => patch({ highpass })}
          title="Cuts low rumble — separated vocals almost always want some"
        />
        <FxSlider
          label="Low-pass" value={fx.lowpass} min={800} max={20000} step={100}
          format={(v) => (v >= 20000 ? "off" : `${hz(v)}Hz`)}
          onChange={(lowpass) => patch({ lowpass })}
          title="Rolls off the top end"
        />

        <FxSlider
          label="EQ low" value={fx.eqLow} min={-12} max={12} step={0.5}
          format={db} onChange={(eqLow) => patch({ eqLow })} title="Low shelf at 220 Hz"
        />
        <FxSlider
          label="EQ mid" value={fx.eqMid} min={-12} max={12} step={0.5}
          format={db} onChange={(eqMid) => patch({ eqMid })} title="Peak at 1.4 kHz"
        />
        <FxSlider
          label="EQ high" value={fx.eqHigh} min={-12} max={12} step={0.5}
          format={db} onChange={(eqHigh) => patch({ eqHigh })} title="High shelf at 5.2 kHz"
        />
        <FxSlider
          label="Drive" value={fx.drive} min={0} max={1} step={0.01}
          format={pct} onChange={(drive) => patch({ drive })}
          title="Soft-clip saturation — warmth on beats, grit on vocals"
        />

        <FxSlider
          label="Reverb" value={fx.reverb} min={0} max={1} step={0.01} accent={accent}
          format={pct} onChange={(reverb) => patch({ reverb })} title="Send level into the reverb"
        />
        <FxSlider
          label="Room size" value={fx.reverbSize} min={0.3} max={6} step={0.1}
          format={secs} onChange={(reverbSize) => patch({ reverbSize })}
          title="Reverb decay time"
        />
        <FxSlider
          label="Delay" value={fx.delay} min={0} max={1} step={0.01} accent={accent}
          format={pct} onChange={(delay) => patch({ delay })} title="Send level into the delay"
        />
        <FxSlider
          label="Feedback" value={fx.delayFeedback} min={0} max={0.85} step={0.01}
          format={pct} onChange={(delayFeedback) => patch({ delayFeedback })}
          title="How many times the echo repeats"
        />

        <label className="flex flex-col gap-1" title="Echo time, locked to the project tempo">
          <span className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted">
            Delay time
            <span className="font-mono normal-case tabular-nums text-foreground/70">
              {(resolveDelayTime(fx, projectBpm) * 1000).toFixed(0)}ms
            </span>
          </span>
          <select
            value={fx.delayDivision}
            onChange={(e) => patch({ delayDivision: e.target.value as LaneFx["delayDivision"] })}
            className="input !py-1 text-xs"
          >
            {DELAY_DIVISIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id === "free" ? "Free" : `${d.label} note`}
              </option>
            ))}
          </select>
        </label>

        {fx.delayDivision === "free" && (
          <FxSlider
            label="Free time" value={fx.delayTime} min={0.02} max={2} step={0.01}
            format={(v) => `${(v * 1000).toFixed(0)}ms`}
            onChange={(delayTime) => patch({ delayTime })}
          />
        )}

        <FxSlider
          label="Fade in" value={fx.fadeIn} min={0} max={10} step={0.1}
          format={secs} onChange={(fadeIn) => patch({ fadeIn })}
          title="Ramps the lane up from silence when it starts"
        />
        <FxSlider
          label="Fade out" value={fx.fadeOut} min={0} max={10} step={0.1}
          format={secs} onChange={(fadeOut) => patch({ fadeOut })}
          title="Ramps the lane down into its final seconds"
        />

        <label
          className="flex items-center gap-2 self-end pb-1 text-xs"
          title="Evens out a vocal's loud and quiet lines so it sits on the beat"
        >
          <input
            type="checkbox"
            checked={fx.compress}
            onChange={(e) => patch({ compress: e.target.checked })}
            className="accent-brand"
          />
          Compressor
        </label>
      </div>
    </div>
  );
}
