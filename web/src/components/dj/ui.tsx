"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Runs `cb` every animation frame while `active`. */
export function useRaf(cb: (t: number) => void, active = true) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** A level meter whose fill is moved straight on the element each frame. */
export function LevelMeter({
  read,
  label,
  className = "h-24 w-2.5",
  horizontal = false,
}: {
  read: () => number;
  label: string;
  className?: string;
  horizontal?: boolean;
}) {
  const cover = useRef<HTMLDivElement>(null);
  useRaf(() => {
    const el = cover.current;
    if (!el) return;
    const v = Math.min(1, Math.sqrt(Math.max(0, read())) * 1.05);
    if (horizontal) el.style.width = `${(1 - v) * 100}%`;
    else el.style.height = `${(1 - v) * 100}%`;
  });
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden rounded-sm bg-black/40 ${className}`}
      style={{
        backgroundImage: horizontal
          ? "linear-gradient(90deg, #22c55e 0%, #22c55e 65%, #f59e0b 82%, #ef4444 100%)"
          : "linear-gradient(0deg, #22c55e 0%, #22c55e 65%, #f59e0b 82%, #ef4444 100%)",
      }}
    >
      <div ref={cover} className={`absolute bg-surface ${horizontal ? "inset-y-0 right-0" : "inset-x-0 top-0"}`} style={horizontal ? { width: "100%" } : { height: "100%" }} />
    </div>
  );
}

/**
 * A button that acts while held (nudge, cue, a siren): works with mouse,
 * touch and the keyboard (Space/Enter), and always lets go, even if the
 * finger slides off.
 */
export function HoldButton({
  onDown,
  onUp,
  children,
  className = "",
  label,
  title,
  litClass = "bg-brand text-white",
  idleClass = "bg-surface-raised hover:bg-surface-hover",
  disabled,
}: {
  onDown: () => void;
  onUp: () => void;
  children: ReactNode;
  className?: string;
  label: string;
  title?: string;
  litClass?: string;
  idleClass?: string;
  disabled?: boolean;
}) {
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const down = () => {
    if (heldRef.current) return;
    heldRef.current = true;
    setHeld(true);
    onDown();
  };
  const up = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setHeld(false);
    onUp();
  };
  // If the button disappears while held, release.
  const upRef = useRef(up);
  useEffect(() => {
    upRef.current = up;
  });
  useEffect(() => () => upRef.current(), []);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={title}
      aria-pressed={held}
      className={`select-none touch-none rounded-lg font-semibold transition-colors disabled:opacity-40 ${held ? litClass : idleClass} ${className}`}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          down();
        }
      }}
      onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === " " || e.key === "Enter") up();
      }}
      onBlur={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** A labelled slider with a readout. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  className = "",
  center,
  accent = "accent-brand",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  className?: string;
  /** Double-click (or double-tap the readout) returns to this value. */
  center?: number;
  accent?: string;
}) {
  return (
    <label className={`flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ${className}`}>
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-[11px] normal-case tabular-nums text-foreground">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => center !== undefined && onChange(center)}
        className={`w-full ${accent}`}
      />
    </label>
  );
}

export function Toggle({
  pressed,
  onClick,
  children,
  label,
  className = "",
  litClass = "bg-brand text-white",
  title,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  litClass?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`select-none rounded-lg px-2 text-xs font-bold transition-colors disabled:opacity-40 ${
        pressed ? litClass : "bg-surface-raised text-muted hover:bg-surface-hover hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A rotary knob, as on a mixer: drag up/down (or sideways) to turn, double
 * click/tap to return to `center`, arrow keys step. Pointer capture keeps it
 * turning if the finger slides off. `data-dj` makes it a lesson target.
 */
export function Knob({
  label,
  value,
  min,
  max,
  onChange,
  format,
  center,
  size = 44,
  color = "var(--brand-strong)",
  dj,
  step,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  center?: number;
  size?: number;
  color?: string;
  dj?: string;
  step?: number;
  disabled?: boolean;
}) {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const lastTap = useRef(0);
  const span = max - min;
  const frac = span > 0 ? (value - min) / span : 0;
  const angle = -135 + frac * 270;
  const zero = center !== undefined ? -135 + ((center - min) / span) * 270 : -135;
  const r = size / 2 - 4;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return `${size / 2 + r * Math.cos(rad)} ${size / 2 + r * Math.sin(rad)}`;
    };
    const [s, e] = a0 < a1 ? [a0, a1] : [a1, a0];
    return `M ${p(s)} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${p(e)}`;
  };
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const keyStep = step ?? span / 40;
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5" data-dj={dj}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        title={`${label}: ${format(value)}${center !== undefined ? " (double-click to reset)" : ""}`}
        className={`relative touch-none select-none rounded-full focus-visible:outline-2 focus-visible:outline-brand ${disabled ? "opacity-40" : "cursor-ns-resize"}`}
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, x: e.clientX, v: value };
          const now = performance.now();
          if (now - lastTap.current < 300 && center !== undefined) set(center);
          lastTap.current = now;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const px = d.y - e.clientY + (e.clientX - d.x) * 0.6;
          const fine = e.shiftKey ? 0.25 : 1;
          let v = d.v + (px / 160) * span * fine;
          // A soft click at the centre, like a detented knob.
          if (center !== undefined && Math.abs(v - center) < span * 0.025) v = center;
          set(v);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => center !== undefined && set(center)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") set(value + keyStep);
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(value - keyStep);
          else if (e.key === "Home" && center !== undefined) set(center);
          else return;
          e.preventDefault();
        }}
      >
        <svg width={size} height={size} aria-hidden className="absolute inset-0">
          <path d={arc(-135, 135)} stroke="rgba(255,255,255,0.12)" strokeWidth={3} fill="none" strokeLinecap="round" />
          {Math.abs(angle - zero) > 0.5 && <path d={arc(zero, angle)} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />}
        </svg>
        <div className="absolute inset-[7px] rounded-full border border-white/10 bg-gradient-to-b from-[#2b2b36] to-[#15151c] shadow-inner" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="absolute left-1/2 top-[3px] h-[35%] w-[2px] -translate-x-1/2 rounded-full bg-white/85" />
        </div>
      </div>
      <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-[9px] tabular-nums leading-none text-foreground/80">{format(value)}</span>
    </div>
  );
}

/**
 * A vertical fader (channel fader or tempo fader). `invert` puts the
 * minimum at the top (a tempo fader: down is faster). `detent` snaps the
 * centre. Drag anywhere on the track; keyboard arrows; double-click resets.
 */
export function VFader({
  label,
  value,
  min,
  max,
  onChange,
  format,
  height = 140,
  invert = false,
  center,
  detent = 0,
  dj,
  className = "",
  capColor = "#d4d4dc",
  disabled,
  step,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  height?: number;
  invert?: boolean;
  center?: number;
  /** Snap to `center` within this fraction of the travel. */
  detent?: number;
  dj?: string;
  className?: string;
  capColor?: string;
  disabled?: boolean;
  step?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<{ offset: number } | null>(null);
  const span = max - min;
  const frac = span > 0 ? (value - min) / span : 0;
  const pos = invert ? frac : 1 - frac; // 0 = top
  const fromY = (clientY: number, offset = 0) => {
    const el = track.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    let p = (clientY - offset - r.top) / r.height;
    p = Math.min(1, Math.max(0, p));
    let v = min + (invert ? p : 1 - p) * span;
    if (center !== undefined && detent > 0 && Math.abs(v - center) < span * detent) v = center;
    return v;
  };
  const keyStep = step ?? span / 50;
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`} data-dj={dj}>
      <div
        ref={track}
        role="slider"
        aria-orientation="vertical"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        className={`relative w-10 touch-none select-none rounded-md focus-visible:outline-2 focus-visible:outline-brand ${disabled ? "opacity-40" : "cursor-ns-resize"}`}
        style={{ height }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const capY = r.top + pos * r.height;
          // Grabbing the cap keeps its offset; tapping the track jumps there.
          grab.current = { offset: Math.abs(e.clientY - capY) < 16 ? e.clientY - capY : 0 };
          if (!grab.current.offset) onChange(fromY(e.clientY));
        }}
        onPointerMove={(e) => {
          if (!grab.current) return;
          onChange(fromY(e.clientY, grab.current.offset));
        }}
        onPointerUp={() => (grab.current = null)}
        onPointerCancel={() => (grab.current = null)}
        onDoubleClick={() => center !== undefined && onChange(center)}
        onKeyDown={(e) => {
          if (disabled) return;
          const up = invert ? -1 : 1;
          if (e.key === "ArrowUp") onChange(Math.min(max, Math.max(min, value + up * keyStep)));
          else if (e.key === "ArrowDown") onChange(Math.min(max, Math.max(min, value - up * keyStep)));
          else if (e.key === "Home" && center !== undefined) onChange(center);
          else return;
          e.preventDefault();
        }}
      >
        <div className="absolute inset-y-1 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-black/60 shadow-inner" />
        {center !== undefined && (
          <div className="absolute left-1 right-1 h-px bg-white/40" style={{ top: `${(invert ? (center - min) / span : 1 - (center - min) / span) * 100}%` }} />
        )}
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} className="absolute left-0 h-px w-1.5 bg-white/20" style={{ top: `${t * 100}%` }} />
        ))}
        <div
          className="absolute left-1/2 h-5 w-9 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-black/50 shadow-md"
          style={{ top: `${pos * 100}%`, background: `linear-gradient(180deg, ${capColor}, #6b6b78)` }}
        >
          <div className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-black/70" />
        </div>
      </div>
      <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted">{label}</span>
      <span className="font-mono text-[10px] tabular-nums leading-none">{format(value)}</span>
    </div>
  );
}

/**
 * A segmented VU meter on a dB scale, drawn each frame off React: green,
 * amber, red segments, a peak-hold marker and a latched clip LED.
 */
export function VuMeter({ read, label, height = 120, segments = 15, className = "" }: { read: () => number; label: string; height?: number; segments?: number; className?: string }) {
  const segs = useRef<(HTMLDivElement | null)[]>([]);
  const clip = useRef<HTMLDivElement>(null);
  const state = useRef({ level: 0, hold: 0, holdAge: 0, clipAge: Infinity, t: 0 });
  useRaf((t) => {
    const s = state.current;
    const dt = s.t ? Math.min(0.1, (t - s.t) / 1000) : 0.016;
    s.t = t;
    const p = Math.max(0, read());
    s.level = p > s.level ? p : s.level * Math.exp(-dt / 0.3) + p * (1 - Math.exp(-dt / 0.3));
    s.holdAge += dt;
    if (p >= s.hold) {
      s.hold = p;
      s.holdAge = 0;
    } else if (s.holdAge > 1.5) s.hold = Math.max(s.level, s.hold - dt * 0.6);
    s.clipAge = p >= 0.985 ? 0 : s.clipAge + dt;
    const toFrac = (v: number) => (v <= 0 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(v) + 48) / 48)));
    const lit = toFrac(s.level) * segments;
    const holdSeg = Math.min(segments - 1, Math.floor(toFrac(s.hold) * segments - 0.001));
    segs.current.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = i < lit || (i === holdSeg && s.hold > 0.004) ? "1" : "0.14";
    });
    if (clip.current) clip.current.style.opacity = s.clipAge < 1 ? "1" : "0.18";
  });
  return (
    <div role="img" aria-label={label} className={`flex flex-col items-center gap-0.5 ${className}`}>
      <div ref={clip} className="size-2 rounded-full bg-danger" title="Clip" style={{ opacity: 0.18 }} />
      <div className="flex flex-col-reverse gap-px rounded-sm bg-black/50 p-px" style={{ height }}>
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              segs.current[i] = el;
            }}
            className="w-2 flex-1 rounded-[1px]"
            style={{ background: i >= segments - 2 ? "#ef4444" : i >= segments - 5 ? "#f59e0b" : "#22c55e", opacity: 0.14 }}
          />
        ))}
      </div>
    </div>
  );
}

/** A small section heading used across the console. */
export function PanelLabel({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{children}</p>;
}
