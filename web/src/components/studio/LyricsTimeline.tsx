"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { mixEnvelope } from "@/lib/client/lyricsSources";
import { useStudioStore } from "@/lib/client/studioStore";
import { beatSeconds, isSung, lineAt, retimeLine, type LyricLine } from "@/lib/lyrics";

// The song as a strip that scrolls under a fixed playhead: the mix's
// waveform, bar lines, each lyric line where it's sung (drag one to move
// it — with ripple, the lines after it come along), and the take — drawn
// in as it's sung, or laid over the beat to check. One canvas redrawn from the playhead, so it costs no React
// renders while the song plays.

import type { TimelineTake } from "@/lib/client/lyricsStore";
export type { TimelineTake };

type Props = {
  lines?: LyricLine[];
  /** Lets lines be dragged to a new time. */
  onMoveLine?: (index: number, time: number) => void;
  /** Dragging a line moves the lines after it too (shown while dragging). */
  ripple?: boolean;
  /** A line tapped on the strip (its mark), e.g. to edit its timing. */
  onSelectLine?: (index: number) => void;
  /** The line being edited, drawn picked out. */
  selected?: number | null;
  /** How much of the song shows: 1 ≈ 11 s across a phone, more zooms in (ZOOM_MIN–ZOOM_MAX). */
  zoom?: number;
  /**
   * Makes the strip zoomable: − / + on it, pinch, Ctrl/⌘ + scroll (and a
   * sideways scroll moves through the song). Called with the new zoom.
   */
  onZoom?: (zoom: number) => void;
  take?: TimelineTake | null;
  /** Tapping or dragging the strip moves the playhead (not while recording). */
  seekable?: boolean;
  height?: number;
  className?: string;
};

const LABEL_ROW = 18;
const GRAB = 12;

function cssColor(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;

/** Pixels a second at this width and zoom. */
function pixelsPerSecond(width: number, zoom: number) {
  return Math.min(110, Math.max(45, width / 11)) * Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export default function LyricsTimeline({
  lines = [],
  onMoveLine,
  ripple = false,
  onSelectLine,
  selected = null,
  zoom = 1,
  onZoom,
  take = null,
  seekable = true,
  height = 84,
  className = "",
}: Props) {
  const lanes = useStudioStore((s) => s.lanes);
  const bpm = useStudioStore((s) => s.projectBpm);
  // Worked out again only when what it draws changes — not for every step of a fader drag or a lane renamed.
  const shape = lanes
    .map((l) => `${l.laneId}|${l.offsetSeconds}|${l.tempoRatio}|${l.muted}|${l.solo}|${Math.round(l.volume * 10)}|${l.peaks.length}|${l.clips ? JSON.stringify(l.clips) : ""}`)
    .join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `shape` stands for the parts of `lanes` it reads
  const env = useMemo(() => mixEnvelope(lanes), [shape]);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // What the draw reads, kept current without re-subscribing.
  const state = useRef({ lines, take, bpm, env, seekable, onMoveLine, ripple, onSelectLine, selected, zoom, onZoom });
  useLayoutEffect(() => {
    state.current = { lines, take, bpm, env, seekable, onMoveLine, ripple, onSelectLine, selected, zoom, onZoom };
  });
  /** The singing so far in a take being recorded: [time, level] pairs. */
  const live = useRef<{ start: number; points: [number, number][] }>({ start: -1, points: [] });
  /** A line being dragged, and where to. */
  const drag = useRef<{ index: number; time: number } | null>(null);
  const draw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    const container = box.current;
    if (!el || !container) return;
    let colors: Record<string, string> = {};
    const readColors = () => {
      colors = {
        fg: cssColor(container, "--foreground", "#eee"),
        muted: cssColor(container, "--muted", "#888"),
        vocals: cssColor(container, "--vocals", "#e5487f"),
        brand: cssColor(container, "--brand", "#7c5cff"),
        border: cssColor(container, "--border", "#333"),
      };
    };
    readColors();

    draw.current = () => {
      const { lines, take, bpm, env, ripple, selected, zoom } = state.current;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      // Hidden (the other booth tab, or the booth closed): nothing to draw.
      if (width === 0) return;
      const h = height;
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(h * dpr);
        el.style.width = `${width}px`;
        el.style.height = `${h}px`;
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, h);
      const playhead = useStudioStore.getState().playhead;
      const pps = pixelsPerSecond(width, zoom);
      const headX = Math.round(width * 0.3);
      const t0 = playhead - headX / pps;
      const t1 = t0 + width / pps;
      const xOf = (t: number) => (t - t0) * pps;
      const waveTop = LABEL_ROW + 2;
      const mid = waveTop + (h - waveTop) / 2;
      const half = (h - waveTop) / 2 - 2;

      // Bars, numbered.
      const bar = beatSeconds(bpm) * 4;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "top";
      for (let n = Math.max(0, Math.floor(t0 / bar)); n * bar <= t1; n++) {
        const x = Math.round(xOf(n * bar)) + 0.5;
        ctx.fillStyle = colors.border;
        ctx.fillRect(x, waveTop, 1, h - waveTop);
        if (pps * bar > 28) {
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = colors.muted;
          ctx.fillText(String(n + 1), x + 3, waveTop + 2);
          ctx.globalAlpha = 1;
        }
      }

      // The mix, faint.
      ctx.fillStyle = colors.muted;
      ctx.globalAlpha = 0.35;
      for (let x = 0; x < width; x += 3) {
        const i = Math.floor((t0 + x / pps - env.start) / env.step);
        const v = i >= 0 && i < env.values.length ? env.values[i] : 0;
        if (v <= 0.01) continue;
        const bh = Math.max(1, v * half);
        ctx.fillRect(x, mid - bh, 2, bh * 2);
      }
      ctx.globalAlpha = 1;

      // The take: drawn in as it's sung, or laid over the beat.
      if (take) {
        ctx.fillStyle = colors.vocals;
        if ("level" in take) {
          const rec = live.current;
          if (rec.start !== take.start) live.current = { start: take.start, points: [] };
          const pts = live.current.points;
          const last = pts[pts.length - 1];
          if (playhead >= take.start && (!last || playhead > last[0] + 0.01)) pts.push([playhead, Math.min(1, take.level() * 1.6)]);
          for (const [t, v] of pts) {
            if (t < t0 || t > t1) continue;
            const bh = Math.max(1, v * half);
            ctx.fillRect(xOf(t), mid - bh, Math.max(1.5, pps / 60), bh * 2);
          }
        } else if (take.peaks.length) {
          const per = take.duration / take.peaks.length;
          for (let x = Math.max(0, xOf(take.start)); x < Math.min(width, xOf(take.start + take.duration)); x += 3) {
            const v = take.peaks[Math.floor((t0 + x / pps - take.start) / per)] ?? 0;
            const bh = Math.max(1, v * half);
            ctx.fillRect(x, mid - bh, 2, bh * 2);
          }
        }
      }

      // Lyric lines: a mark where each starts, its words along the top.
      // While dragging, drawn as it will land (with the lines after it, under ripple).
      const shown = drag.current ? retimeLine(lines, drag.current.index, drag.current.time, { ripple }) : lines;
      const current = lineAt(shown, playhead);
      const timed = shown.map((l, i) => ({ l, i })).filter(({ l }) => isSung(l) && l.time !== null);
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      for (let k = 0; k < timed.length; k++) {
        const { l, i } = timed[k];
        const x = xOf(l.time!);
        const nextX = k + 1 < timed.length ? xOf(timed[k + 1].l.time!) : width + 200;
        if (nextX < 0 || x > width) continue;
        const active = i === current;
        const dragging = drag.current?.index === i;
        const picked = i === selected;
        // Under ripple, the lines after the one being dragged move with it.
        const carried = !!drag.current && ripple && i > drag.current.index;
        ctx.fillStyle = active || dragging || picked ? colors.vocals : carried ? colors.brand : colors.fg;
        ctx.globalAlpha = active || dragging || picked ? 1 : carried ? 0.7 : 0.45;
        ctx.fillRect(Math.round(x), 0, dragging || picked ? 2 : 1, h);
        // A handle to grab.
        ctx.beginPath();
        ctx.arc(x, LABEL_ROW / 2, dragging || picked ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = active ? 1 : 0.7;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 7, 0, Math.max(0, nextX - x - 10), LABEL_ROW);
        ctx.clip();
        ctx.fillStyle = active ? colors.fg : colors.muted;
        ctx.fillText(l.text, x + 8, LABEL_ROW / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // The playhead.
      ctx.fillStyle = take && "level" in take ? colors.vocals : colors.brand;
      ctx.fillRect(headX - 1, 0, 2, h);
    };

    // One draw a frame at most, however many changes land in it (the playhead, a fader dragged, a lane loading).
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        draw.current();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    const unsubscribe = useStudioStore.subscribe((s, prev) => {
      if (s.playhead !== prev.playhead || s.lanes !== prev.lanes) schedule();
    });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => {
      readColors();
      draw.current();
    };
    scheme.addEventListener?.("change", recolor);
    const themeWatch = new MutationObserver(recolor);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    draw.current();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      ro.disconnect();
      unsubscribe();
      scheme.removeEventListener?.("change", recolor);
      themeWatch.disconnect();
    };
  }, [height]);

  // A change of lines, take or mix redraws even while paused.
  useEffect(() => {
    draw.current();
  }, [lines, take, env, bpm, selected, zoom, ripple]);

  // Grabbing a line moves it; grabbing anywhere else scrubs the song; two fingers zoom.
  const gesture = useRef<{ kind: "line" | "scrub"; x: number; playhead: number; moved: boolean; pointer: number } | null>(null);
  /** Fingers on the strip, for a pinch. */
  const touches = useRef(new Map<number, number>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // Ctrl/⌘ + scroll (and a trackpad's pinch, which arrives as that) zooms; a sideways scroll moves through the song.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const { onZoom, zoom, seekable } = state.current;
      if (!onZoom) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        onZoom(clampZoom(zoom * Math.exp(-event.deltaY * 0.01)));
      } else if (seekable && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5) {
        event.preventDefault();
        const pps = pixelsPerSecond(el.clientWidth, zoom);
        audioEngine.seek(Math.max(0, useStudioStore.getState().playhead + event.deltaX / pps));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function geometry() {
    const width = box.current?.clientWidth ?? 0;
    const pps = pixelsPerSecond(width, state.current.zoom);
    const headX = Math.round(width * 0.3);
    const t0 = useStudioStore.getState().playhead - headX / pps;
    return { pps, t0 };
  }

  function onPointerDown(event: React.PointerEvent) {
    touches.current.set(event.pointerId, event.clientX);
    if (touches.current.size === 2 && state.current.onZoom) {
      // A second finger: a pinch, not a drag — whatever the first started is dropped.
      const [a, b] = [...touches.current.values()];
      pinch.current = { distance: Math.max(20, Math.abs(a - b)), zoom: state.current.zoom };
      gesture.current = null;
      drag.current = null;
      draw.current();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const { pps, t0 } = geometry();
    const { lines, onMoveLine, seekable } = state.current;
    if (onMoveLine) {
      let nearest = -1;
      let best = GRAB;
      lines.forEach((l, i) => {
        if (l.time === null || !isSung(l)) return;
        const d = Math.abs((l.time - t0) * pps - x);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      if (nearest >= 0) {
        drag.current = { index: nearest, time: lines[nearest].time! };
        gesture.current = { kind: "line", x, playhead: 0, moved: false, pointer: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
        draw.current();
        return;
      }
    }
    if (!seekable) return;
    gesture.current = { kind: "scrub", x, playhead: useStudioStore.getState().playhead, moved: false, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, event.clientX);
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      state.current.onZoom?.(clampZoom(pinch.current.zoom * (Math.max(20, Math.abs(a - b)) / pinch.current.distance)));
      return;
    }
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (Math.abs(x - g.x) > 3) g.moved = true;
    const { pps, t0 } = geometry();
    if (g.kind === "line" && drag.current) {
      drag.current = { ...drag.current, time: Math.max(0, Math.round((t0 + x / pps) * 100) / 100) };
      draw.current();
    } else if (g.kind === "scrub" && g.moved) {
      // Dragging the strip moves the song under the playhead, like tape.
      audioEngine.seek(Math.max(0, g.playhead - (x - g.x) / pps));
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    touches.current.delete(event.pointerId);
    if (pinch.current) {
      if (touches.current.size === 0) pinch.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.pointer !== event.pointerId) return;
    if (g.kind === "line" && drag.current) {
      const moved = drag.current;
      drag.current = null;
      if (g.moved) state.current.onMoveLine?.(moved.index, moved.time);
      else {
        audioEngine.seek(moved.time);
        state.current.onSelectLine?.(moved.index);
      }
      draw.current();
      return;
    }
    if (g.kind === "scrub" && !g.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const { pps, t0 } = geometry();
      audioEngine.seek(Math.max(0, t0 + (event.clientX - rect.left) / pps));
    }
  }

  return (
    <div
      ref={box}
      className={`relative touch-none select-none overflow-hidden rounded-xl border border-border/60 bg-background/60 ${seekable || onMoveLine ? "cursor-pointer" : ""} ${className}`}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(event) => {
        touches.current.delete(event.pointerId);
        if (touches.current.size === 0) pinch.current = null;
        gesture.current = null;
        drag.current = null;
        draw.current();
      }}
      role="img"
      aria-label={
        onMoveLine
          ? `The song's waveform with your lyric lines — drag a line's mark to move it${ripple ? " (the lines after it follow)" : ""}, tap it to edit its timing`
          : "The song's waveform with your lyrics"
      }
    >
      <canvas ref={canvas} className="block" />
      {onZoom && (
        // On the strip itself, so what it changes is right there.
        <div
          className="absolute bottom-1.5 end-1.5 flex items-center overflow-hidden rounded-lg border border-border/70 bg-surface/90 shadow-sm backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
          role="group"
          aria-label="Waveform zoom"
        >
          <button
            onClick={() => onZoom(clampZoom(zoom / 1.5))}
            disabled={zoom <= ZOOM_MIN}
            className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground disabled:opacity-30 max-lg:h-9 max-lg:w-9"
            aria-label="Zoom out — see more of the song"
            title="Zoom out — see more of the song (or pinch, or Ctrl/⌘ + scroll)"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onZoom(1)}
            onDoubleClick={() => onZoom(1)}
            className="h-8 min-w-10 px-1 text-[11px] font-semibold tabular-nums text-muted hover:text-foreground max-lg:h-9"
            title="Back to normal zoom"
            aria-label={`Zoom ${zoom}×, tap to reset`}
          >
            {zoom >= 1 ? `${Math.round(zoom * 10) / 10}×` : `${Math.round(zoom * 100) / 100}×`}
          </button>
          <button
            onClick={() => onZoom(clampZoom(zoom * 1.5))}
            disabled={zoom >= ZOOM_MAX}
            className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground disabled:opacity-30 max-lg:h-9 max-lg:w-9"
            aria-label="Zoom in — see the timing closer up"
            title="Zoom in — see the timing closer up (or pinch, or Ctrl/⌘ + scroll)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
