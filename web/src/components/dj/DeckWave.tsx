"use client";

import { useEffect, useRef } from "react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { PEAK_RATE, type LoadedTrack } from "@/lib/client/dj/djTracks";
import { STEM_SLOTS, type DeckId, type DeckState, type StemSlot } from "@/lib/client/dj/djTypes";
import { beatSeconds, fmtTime } from "@/lib/client/dj/djMath";
import { END_WARNING_SEC, HOT_CUE_COLORS, HOT_CUE_LABELS, fmtClock } from "@/lib/client/dj/djControls";
import { BAND_RATE } from "@/lib/client/dj/djWaveform";
import { useRaf } from "./ui";

export type WaveMode = "bands" | "stems";
export const ZOOMS = [2, 4, 8, 16, 32];

const HEAD = 0.35; // playhead position across the width
const STEM_COLOR: Record<StemSlot, string> = { chords: "#60a5fa", bass: "#84cc16", drums: "#f59e0b", vocal: "#ec4899", beat: "#06b6d4" };
const DRAW_ORDER: StemSlot[] = ["beat", "chords", "bass", "drums", "vocal"];
/** Club-software "3-band" colours: lows blue, mids amber, highs white. */
const BAND_COLOR = { low: "#1d6bff", mid: "#f5a524", high: "#f4f4f8" };

function killedSlot(d: DeckState, s: StemSlot) {
  return s === "beat" ? d.stems.drums && d.stems.bass && d.stems.chords : d.stems[s];
}

/** Max of each band over the stems not killed, across slices [from, to). */
function bandsAt(track: LoadedTrack, d: DeckState, from: number, to: number, out: { low: number; mid: number; high: number }) {
  out.low = out.mid = out.high = 0;
  const bands = track.bands;
  if (!bands) return out;
  for (const s of STEM_SLOTS) {
    const b = bands[s];
    if (!b || killedSlot(d, s)) continue;
    const n = b.low.length;
    let l = 0, m = 0, h = 0;
    for (let i = Math.max(0, from); i < Math.min(n, Math.max(from + 1, to)); i++) {
      if (b.low[i] > l) l = b.low[i];
      if (b.mid[i] > m) m = b.mid[i];
      if (b.high[i] > h) h = b.high[i];
    }
    out.low += l;
    out.mid += m;
    out.high += h;
  }
  return out;
}

/**
 * The scrolling waveform for one deck. "bands" colours it by frequency
 * (club-software style); "stems" layers the stems in their colours. Killed
 * stems drop out either way. Beat grid with red bar lines and numbers,
 * phrase lines, the loop, the cue and hot cues, the slip ghost, and a red
 * flash in the last 30 s. Drawn straight to a canvas every frame, off React.
 * Drag it while stopped to scrub.
 */
export default function DeckWave({
  engine,
  id,
  track,
  height = 88,
  span = 8,
  mode = "bands",
  accent,
}: {
  engine: DjEngine;
  id: DeckId;
  track: LoadedTrack | null;
  height?: number;
  /** Seconds across the width (real time). */
  span?: number;
  mode?: WaveMode;
  accent?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 300, dpr: 1 });
  const scrub = useRef<{ x: number; pos: number } | null>(null);
  const tmp = useRef({ low: 0, mid: 0, high: 0 });

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

  useRaf((now) => {
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
    const info = track.info;
    const pxPerSec = w / span; // per real second
    // Scale by the deck's speed, so two matched decks' beats are the same distance apart on screen.
    const srcPerPx = Math.max(0.05, d.rate) / pxPerSec;
    const beat = beatSeconds(info);
    const remaining = info.duration - pos;

    // Last 30 s: the background flashes, as players warn of the end.
    if (remaining <= END_WARNING_SEC && remaining > 0.05 && !d.loop.active && Math.floor(now / 500) % 2 === 0) {
      g.fillStyle = "rgba(239,68,68,0.16)";
      g.fillRect(0, 0, w, height);
    }

    // Loop region
    if (d.loop.active || d.loop.end > d.loop.start) {
      const x0 = headX + (d.loop.start - pos) / srcPerPx;
      const x1 = headX + (d.loop.end - pos) / srcPerPx;
      g.fillStyle = d.loop.active ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)";
      g.fillRect(x0, 0, Math.max(2, x1 - x0), height);
    }

    const step = 2;
    if (mode === "bands" && track.bands) {
      const o = tmp.current;
      const scale = (height - 6) * 0.55;
      for (let x = 0; x < w; x += step) {
        const t0 = pos + (x - headX) * srcPerPx;
        const t1 = t0 + step * srcPerPx;
        if (t1 < 0 || t0 >= info.duration) continue;
        bandsAt(track, d, Math.floor(t0 * BAND_RATE), Math.ceil(t1 * BAND_RATE), o);
        const played = t0 < pos;
        const a = played ? 0.55 : 1;
        const hl = Math.min(mid, Math.max(0.5, o.low * scale * 1.2));
        const hm = Math.min(mid, Math.max(0, o.mid * scale));
        const hh = Math.min(mid, Math.max(0, o.high * scale * 1.6));
        g.globalAlpha = a;
        g.fillStyle = BAND_COLOR.low;
        g.fillRect(x, mid - hl, step - 0.4, hl * 2);
        g.fillStyle = BAND_COLOR.mid;
        g.fillRect(x, mid - hm * 0.85, step - 0.4, hm * 1.7);
        g.fillStyle = BAND_COLOR.high;
        g.fillRect(x, mid - hh * 0.5, step - 0.4, hh);
      }
      g.globalAlpha = 1;
    } else {
      for (const stem of DRAW_ORDER) {
        const peaks = track.peaks[stem];
        if (!peaks) continue;
        g.fillStyle = STEM_COLOR[stem];
        g.globalAlpha = killedSlot(d, stem) ? 0.07 : 0.62;
        for (let x = 0; x < w; x += step) {
          const t = pos + (x - headX) * srcPerPx;
          if (t < 0 || t >= info.duration) continue;
          const p = peaks[Math.min(peaks.length - 1, Math.floor(t * PEAK_RATE))];
          const h = Math.max(1, p * (height - 6) * 1.15);
          g.fillRect(x, mid - h / 2, step - 0.5, h);
        }
      }
      g.globalAlpha = 1;
    }

    // Beat grid: white beats, red bar lines (the "1"), thicker phrase lines every 8 bars.
    const first = Math.floor((pos - headX * srcPerPx - info.firstBeat) / beat);
    const last = Math.ceil((pos + (w - headX) * srcPerPx - info.firstBeat) / beat);
    const dense = beat / srcPerPx < 5;
    g.font = "10px sans-serif";
    g.textAlign = "left";
    for (let k = first; k <= last; k++) {
      const t = info.firstBeat + k * beat;
      const x = headX + (t - pos) / srcPerPx;
      if (x < 0 || x > w || t < 0) continue;
      const bar = k % 4 === 0;
      const phrase = k % 32 === 0;
      if (!bar && dense) continue;
      g.fillStyle = phrase ? "rgba(239,68,68,0.95)" : bar ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.22)";
      g.fillRect(x, 0, phrase ? 2 : 1, bar ? height : height * 0.18);
      if (!bar) g.fillRect(x, height * 0.82, 1, height * 0.18);
      if (bar && (!dense || k % 16 === 0)) {
        g.fillStyle = "rgba(255,255,255,0.8)";
        g.fillText(String(Math.floor(k / 4) + 1), x + 3, 10);
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
    // Hot cues
    d.hotCues.forEach((h, i) => {
      if (h === null) return;
      const x = headX + (h - pos) / srcPerPx;
      if (x < -12 || x > w + 2) return;
      g.fillStyle = HOT_CUE_COLORS[i];
      g.fillRect(x, 0, 1.5, height);
      g.fillRect(x, 0, 11, 11);
      g.fillStyle = "#000";
      g.font = "bold 9px sans-serif";
      g.fillText(HOT_CUE_LABELS[i], x + 2, 9);
    });

    // Slip: where the track really is.
    if (d.slipPosition !== null) {
      const sx = headX + (d.slipPosition - pos) / srcPerPx;
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(sx, 0);
      g.lineTo(sx, height);
      g.stroke();
      g.setLineDash([]);
    }

    // Playhead
    g.fillStyle = d.scratching ? "#f59e0b" : "#fff";
    g.fillRect(headX - 1, 0, 2, height);
    if (accent) {
      g.fillStyle = accent;
      g.fillRect(0, 0, 3, height);
    }
  });

  return (
    <div
      ref={box}
      className="relative w-full touch-none overflow-hidden rounded-lg border border-border bg-black/50"
      style={{ height }}
      onPointerDown={(e) => {
        if (!track || e.button !== 0) return;
        const st = engine.deckState(id);
        if (st.playing) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        scrub.current = { x: e.clientX, pos: st.position };
      }}
      onPointerMove={(e) => {
        const s = scrub.current;
        if (!s || !track) return;
        const srcPerPx = span / size.current.w;
        engine.seek(id, s.pos - (e.clientX - s.x) * srcPerPx);
      }}
      onPointerUp={() => (scrub.current = null)}
      onPointerCancel={() => (scrub.current = null)}
    >
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={track ? `Deck ${id} waveform: ${track.info.title}, scrolling with the beat grid` : `Deck ${id} is empty`}
      />
    </div>
  );
}

/**
 * The whole track in a strip, coloured by frequency: the played part is
 * dimmed, sections, hot cues and the cue are marked, and the last 30 s
 * flash. Tap or drag to jump (needle search; a needle drop on turntables).
 */
export function DeckOverview({ engine, id, track, label = "Needle search" }: { engine: DjEngine; id: DeckId; track: LoadedTrack | null; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const played = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const remain = useRef<HTMLSpanElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
      const barSec = 240 / info.bpm;
      for (const s of info.sections) {
        if (s.name !== "chorus") continue;
        g.fillStyle = "rgba(236,72,153,0.14)";
        g.fillRect(((info.firstBeat + s.startBar * barSec) / info.duration) * w, 0, ((s.bars * barSec) / info.duration) * w, h);
      }
      const bands = track.bands;
      if (bands) {
        const total = Math.ceil(info.duration * BAND_RATE);
        const o = { low: 0, mid: 0, high: 0 };
        const none = { stems: { drums: false, bass: false, chords: false, vocal: false } } as DeckState;
        for (let x = 0; x < w; x += 2) {
          bandsAt(track, none, Math.floor((x / w) * total), Math.ceil(((x + 2) / w) * total), o);
          const hl = Math.min(h / 2, o.low * h * 0.5);
          const hm = Math.min(h / 2, o.mid * h * 0.45);
          const hh = Math.min(h / 2, o.high * h * 0.7);
          g.fillStyle = BAND_COLOR.low;
          g.fillRect(x, h / 2 - hl, 1.6, hl * 2);
          g.fillStyle = BAND_COLOR.mid;
          g.fillRect(x, h / 2 - hm * 0.8, 1.6, hm * 1.6);
          g.fillStyle = BAND_COLOR.high;
          g.fillRect(x, h / 2 - hh * 0.4, 1.6, hh * 0.8);
        }
      } else {
        g.fillStyle = "rgba(167,139,250,0.8)";
        const n = track.overview.length;
        for (let x = 0; x < w; x += 2) {
          const p = track.overview[Math.min(n - 1, Math.floor((x / w) * n))];
          const bh = Math.max(1, p * h);
          g.fillRect(x, (h - bh) / 2, 1.5, bh);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [track]);

  useRaf((now) => {
    if (!track) return;
    const d = engine.deckState(id);
    const pct = (d.position / track.info.duration) * 100;
    if (head.current) head.current.style.left = `${pct}%`;
    if (played.current) played.current.style.width = `${pct}%`;
    const left = track.info.duration - d.position;
    if (time.current) time.current.textContent = fmtClock(d.position);
    if (remain.current) {
      remain.current.textContent = `-${fmtClock(left)}`;
      const warn = left <= END_WARNING_SEC && !d.loop.active && left > 0.05;
      remain.current.style.color = warn && Math.floor(now / 500) % 2 === 0 ? "#ef4444" : "";
      if (strip.current) strip.current.style.boxShadow = warn && Math.floor(now / 500) % 2 === 0 ? "inset 0 0 0 2px #ef4444" : "";
    }
    const m = marks.current;
    if (m) {
      const kids = m.children;
      for (let i = 0; i < kids.length; i++) {
        const el = kids[i] as HTMLElement;
        const v = i < d.hotCues.length ? d.hotCues[i] : d.cue;
        el.style.display = v === null || v === undefined ? "none" : "";
        if (v !== null && v !== undefined) el.style.left = `${(v / track.info.duration) * 100}%`;
      }
    }
  });

  const seekAt = (clientX: number, el: HTMLElement) => {
    if (!track) return;
    const r = el.getBoundingClientRect();
    engine.seek(id, Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * track.info.duration);
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-dj={`${id}-overview`}>
      <span ref={time} className="w-12 shrink-0 font-mono text-[10px] tabular-nums text-muted">
        0:00.0
      </span>
      <div
        ref={strip}
        className="relative h-7 min-w-0 flex-1 cursor-pointer touch-none overflow-hidden rounded bg-black/40 focus-visible:outline-2"
        role="slider"
        tabIndex={track ? 0 : -1}
        aria-label={`Deck ${id} position (${label}): arrow keys jump 4 seconds`}
        aria-valuemin={0}
        aria-valuemax={track ? Math.round(track.info.duration) : 0}
        aria-valuenow={0}
        aria-valuetext={track ? `${fmtTime(engine.deckPosition(id))} of ${fmtTime(track.info.duration)}` : "Empty"}
        onKeyDown={(e) => {
          if (!track) return;
          if (e.key === "ArrowRight") engine.seek(id, engine.deckPosition(id) + 4);
          else if (e.key === "ArrowLeft") engine.seek(id, engine.deckPosition(id) - 4);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (!track || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          seekAt(e.clientX, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (dragging.current) seekAt(e.clientX, e.currentTarget);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
        <div ref={played} className="pointer-events-none absolute inset-y-0 left-0 bg-black/55" style={{ width: 0 }} />
        <div ref={marks} className="pointer-events-none absolute inset-0" aria-hidden>
          {HOT_CUE_COLORS.map((c, i) => (
            <div key={i} className="absolute top-0 h-2 w-1" style={{ background: c, display: "none" }} />
          ))}
          <div className="absolute bottom-0 h-2 w-1 bg-drums" style={{ display: "none" }} />
        </div>
        <div ref={head} className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" />
      </div>
      <span ref={remain} className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
        -0:00.0
      </span>
    </div>
  );
}
