"use client";

import { useEffect, useRef } from "react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import type { DeckId } from "@/lib/client/dj/djTypes";
import { useRaf } from "./ui";

/** 33⅓ rpm: one turn of the platter is 1.8 s of music. */
const SEC_PER_REV = 1.8;
/** Ring spin speed (turns per second) that gives a full pitch bend. */
const FULL_BEND_RPS = 0.9;

/**
 * A jog wheel / platter. Its rotation follows the deck's playhead (so it
 * spins at the playback speed, and with the hand while scratching).
 *
 *  - Playing, outer ring (or anywhere in CDJ mode): turning bends the
 *    pitch for as long as it moves: the nudge.
 *  - Playing in vinyl mode, the top of the platter: grabs the record (scratch).
 *  - Stopped: turning searches through the track (audibly where possible).
 *
 * Works with mouse, touch and pen (pointer capture), and the mouse wheel.
 */
export default function JogWheel({
  engine,
  id,
  vinyl,
  style,
  accent,
  disabled,
  dj,
}: {
  engine: DjEngine;
  id: DeckId;
  vinyl: boolean;
  style: "cdj" | "controller" | "vinyl";
  accent: string;
  disabled?: boolean;
  dj?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const spin = useRef<HTMLDivElement>(null);
  const touch = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "scratch" | "bend"; angle: number; last: number; cx: number; cy: number; vel: number } | null>(null);

  useRaf(() => {
    const pos = engine.deckPosition(id);
    if (spin.current) spin.current.style.transform = `rotate(${((pos / SEC_PER_REV) * 360) % 360}deg)`;
    const d = drag.current;
    // A ring that stops moving lets the pitch bend go.
    if (d?.mode === "bend" && performance.now() - d.last > 70 && d.vel !== 0) {
      d.vel = 0;
      engine.setBend(id, 0);
    }
  });

  // The mouse wheel nudges (playing) or searches (stopped); needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el || disabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = engine.deckState(id);
      if (!st.track) return;
      const delta = (e.deltaY || e.deltaX) / 100;
      if (st.playing && !st.scratching) {
        engine.setBend(id, Math.max(-1, Math.min(1, -delta)));
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => engine.setBend(id, 0), 120);
      } else engine.seek(id, st.position - delta * 0.08);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [engine, id, disabled]);

  const angleOf = (x: number, y: number, cx: number, cy: number) => Math.atan2(y - cy, x - cx);

  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (touch.current) touch.current.style.opacity = "0";
    if (!d) return;
    if (d.mode === "scratch") engine.scratchEnd(id);
    else engine.setBend(id, 0);
  };

  const ring =
    style === "vinyl"
      ? "bg-[repeating-radial-gradient(circle,#111_0px,#111_2px,#1d1d1d_3px,#111_4px)]"
      : style === "controller"
        ? "bg-gradient-to-br from-[#2a2a33] to-[#101014]"
        : "bg-gradient-to-br from-[#34343e] to-[#0e0e12]";

  return (
    <div
      ref={box}
      data-dj={dj}
      role="application"
      aria-label={`Deck ${id} jog wheel: drag the outer ring to nudge, ${vinyl ? "the middle to scratch" : "anywhere to nudge"}; stopped, turn to search`}
      className={`relative aspect-square w-full touch-none select-none rounded-full border-4 border-[#3a3a46] shadow-[inset_0_2px_10px_rgba(0,0,0,0.8),0_4px_14px_rgba(0,0,0,0.5)] ${disabled ? "opacity-40" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        const st = engine.deckState(id);
        if (!st.track) return;
        engine.unlock();
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy) / (r.width / 2);
        const onTop = dist < 0.68;
        const mode: "scratch" | "bend" = !st.playing || (vinyl && onTop) ? "scratch" : "bend";
        drag.current = { mode, angle: angleOf(e.clientX, e.clientY, cx, cy), last: performance.now(), cx, cy, vel: 0 };
        if (mode === "scratch") engine.scratchStart(id);
        if (touch.current) touch.current.style.opacity = mode === "scratch" ? "1" : "0.5";
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const a = angleOf(e.clientX, e.clientY, d.cx, d.cy);
        let delta = a - d.angle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        d.angle = a;
        const now = performance.now();
        const dt = Math.max(1, now - d.last) / 1000;
        d.last = now;
        const turns = delta / (2 * Math.PI);
        if (d.mode === "scratch") engine.scratchMove(id, turns * SEC_PER_REV);
        else {
          const rps = turns / dt;
          d.vel = d.vel * 0.6 + rps * 0.4;
          engine.setBend(id, Math.max(-1, Math.min(1, d.vel / FULL_BEND_RPS)));
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={spin} className={`absolute inset-0 rounded-full ${ring}`}>
        {/* The strobe dots / marker that show it turning. */}
        <div className="absolute left-1/2 top-[4%] h-[12%] w-[3px] -translate-x-1/2 rounded-full" style={{ background: accent }} />
        {style !== "vinyl" &&
          Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="absolute left-1/2 top-1/2 h-[46%] w-px origin-top bg-white/[0.06]" style={{ transform: `rotate(${i * 15}deg)` }} />
          ))}
      </div>
      {/* The centre: a label on vinyl, a display on a player. */}
      <div
        className={`pointer-events-none absolute inset-[32%] flex items-center justify-center rounded-full border border-black/50 text-[10px] font-black ${style === "vinyl" ? "text-black" : "text-white/80"}`}
        style={{ background: style === "vinyl" ? accent : "radial-gradient(circle,#1b1b23,#09090c)" }}
      >
        {id}
      </div>
      <div ref={touch} className="pointer-events-none absolute inset-[18%] rounded-full ring-2 ring-white/60 transition-opacity" style={{ opacity: 0 }} />
    </div>
  );
}
