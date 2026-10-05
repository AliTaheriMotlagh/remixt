"use client";

import { useEffect, useRef } from "react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { PEAK_RATE, type LoadedTrack } from "@/lib/client/dj/djTracks";
import type { DeckId } from "@/lib/client/dj/djTypes";
import { beatSeconds } from "@/lib/client/dj/djMath";
import { fmtTime } from "@/lib/client/dj/djMath";
import type { DemoStem } from "@/lib/client/demoSongDefs";
import { useRaf } from "./ui";

const SPAN = 7; // seconds on screen
const HEAD = 0.3; // playhead position across the width
const STEM_COLOR: Record<DemoStem, string> = {
  chords: "#60a5fa",
  bass: "#84cc16",
  drums: "#f59e0b",
  vocal: "#ec4899",
};
const DRAW_ORDER: DemoStem[] = ["chords", "bass", "drums", "vocal"];

/**
 * The scrolling waveform for one deck: the four stems layered in their
 * colours (killed stems drop out), the beat grid with bar numbers, the loop
 * and the cue point. Drawn straight to a canvas every frame, off React.
 */
export default function DeckWave({
  engine,
  id,
  track,
  height = 88,
}: {
  engine: DjEngine;
  id: DeckId;
  track: LoadedTrack | null;
  height?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 300, dpr: 1 });

  useEffect(() => {
    const wrap = box.current;
    const el = canvas.current;
    if (!wrap || !el) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      size.current = { w, dpr };
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.floor(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height]);

  useRaf(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    const { w, dpr } = size.current;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    const mid = height / 2;
    const headX = w * HEAD;

    if (!track) {
      g.fillStyle = "rgba(138,138,154,0.6)";
      g.font = "12px sans-serif";
      g.textAlign = "center";
      g.fillText(`Deck ${id}: load a track`, w / 2, mid + 4);
      return;
    }
    const d = engine.deckState(id);
    const pos = d.position;
    const rate = d.rate;
    const pxPerSec = w / SPAN; // per real second
    const srcPerPx = rate / pxPerSec;
    const beat = beatSeconds(track.info);

    // Loop region
    if (d.loop.active) {
      const x0 = headX + ((d.loop.start - pos) / srcPerPx);
      const x1 = headX + ((d.loop.end - pos) / srcPerPx);
      g.fillStyle = "rgba(139,92,246,0.22)";
      g.fillRect(x0, 0, Math.max(2, x1 - x0), height);
    }

    // Waveform columns, stems layered.
    const step = 2;
    for (const stem of DRAW_ORDER) {
      const peaks = track.peaks[stem];
      const killed = d.stems[stem];
      g.fillStyle = STEM_COLOR[stem];
      g.globalAlpha = killed ? 0.07 : 0.62;
      for (let x = 0; x < w; x += step) {
        const t = pos + (x - headX) * srcPerPx;
        if (t < 0 || t >= track.info.duration) continue;
        const p = peaks[Math.min(peaks.length - 1, Math.floor(t * PEAK_RATE))];
        const h = Math.max(1, p * (height - 6) * 1.15);
        g.fillRect(x, mid - h / 2, step - 0.5, h);
      }
    }
    g.globalAlpha = 1;

    // Beat grid
    const first = Math.max(0, Math.floor((pos - headX * srcPerPx) / beat));
    const last = Math.ceil((pos + (w - headX) * srcPerPx) / beat);
    g.font = "10px sans-serif";
    g.textAlign = "left";
    for (let k = first; k <= last; k++) {
      const x = headX + (k * beat - pos) / srcPerPx;
      if (x < 0 || x > w) continue;
      const bar = k % 4 === 0;
      g.fillStyle = bar ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)";
      g.fillRect(x, bar ? 0 : height * 0.7, 1, bar ? height : height * 0.3);
      if (bar) {
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillText(String(k / 4 + 1), x + 3, 10);
      }
    }

    // Cue point
    const cueX = headX + (d.cue - pos) / srcPerPx;
    if (cueX > -6 && cueX < w + 6) {
      g.fillStyle = "#f59e0b";
      g.beginPath();
      g.moveTo(cueX - 5, height);
      g.lineTo(cueX + 5, height);
      g.lineTo(cueX, height - 8);
      g.fill();
    }

    // Playhead
    g.fillStyle = "#fff";
    g.fillRect(headX - 1, 0, 2, height);
  });

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg border border-border bg-black/40" style={{ height }}>
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={track ? `Deck ${id} waveform: ${track.info.title}, scrolling with the beat grid` : `Deck ${id} is empty`}
      />
    </div>
  );
}

/** A thin whole-track strip; click or tap to jump. */
export function DeckOverview({ engine, id, track }: { engine: DjEngine; id: DeckId; track: LoadedTrack | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.floor(h * dpr);
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!track) return;
      const info = track.info;
      const bars = info.bars;
      for (const s of info.sections) {
        g.fillStyle = s.name === "chorus" ? "rgba(236,72,153,0.16)" : "rgba(255,255,255,0.04)";
        g.fillRect((s.startBar / bars) * w, 0, (s.bars / bars) * w, h);
      }
      g.fillStyle = "rgba(167,139,250,0.8)";
      const n = track.overview.length;
      for (let x = 0; x < w; x += 2) {
        const p = track.overview[Math.min(n - 1, Math.floor((x / w) * n))];
        const bh = Math.max(1, p * h);
        g.fillRect(x, (h - bh) / 2, 1.5, bh);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [track]);

  useRaf(() => {
    if (!track || !head.current) return;
    const pos = engine.deckPosition(id);
    head.current.style.left = `${(pos / track.info.duration) * 100}%`;
    if (time.current) time.current.textContent = `${fmtTime(pos)} / -${fmtTime(track.info.duration - pos)}`;
  });

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-6 flex-1 cursor-pointer overflow-hidden rounded bg-black/30 focus-visible:outline-2"
        role="slider"
        tabIndex={track ? 0 : -1}
        aria-label={`Deck ${id} position: arrow keys jump 4 seconds`}
        aria-valuemin={0}
        aria-valuemax={track ? Math.round(track.info.duration) : 0}
        aria-valuenow={0}
        aria-valuetext="Track position"
        onKeyDown={(e) => {
          if (!track) return;
          if (e.key === "ArrowRight") engine.seek(id, engine.deckPosition(id) + 4);
          else if (e.key === "ArrowLeft") engine.seek(id, engine.deckPosition(id) - 4);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (!track) return;
          const r = e.currentTarget.getBoundingClientRect();
          engine.seek(id, ((e.clientX - r.left) / r.width) * track.info.duration);
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
        <div ref={head} className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" />
      </div>
      <span ref={time} className="w-[5.5rem] shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
        0:00 / 0:00
      </span>
    </div>
  );
}
