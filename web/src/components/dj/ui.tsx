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
