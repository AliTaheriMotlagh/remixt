"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenterHorizontal,
  ArrowLeft,
  Check,
  Clapperboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Minus,
  Music2,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Share2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { fileSafeName } from "@/lib/client/audioTags";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { canShareFile, downloadFile, linksLeaveApp, saveFile } from "@/lib/client/saveFile";
import {
  drawClipPreview,
  drawClipThumb,
  previewLevels,
  recordsMp4,
  type Box,
  type ClipContent,
  type Photo,
} from "@/lib/client/socialClip";
import { useClipJob } from "@/lib/client/clipJob";
import { groupPeaks, laneCredits } from "@/lib/client/clipSources";
import { rankFor } from "@/lib/client/lyricsFollow";
import { mixArtPicture } from "@/lib/client/mixArt";
import { mixPeaks } from "@/lib/client/mixPeaks";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { sungAt } from "@/lib/client/vocalTime";
import {
  applyTemplate,
  clampScale,
  CLIP_FONTS,
  CLIP_FORMAT_ORDER,
  CLIP_FORMATS,
  CLIP_TEMPLATES,
  defaultDesign,
  ELEMENT_INFO,
  ELEMENT_ORDER,
  forStorage,
  layoutFor,
  LYRICS_STYLES,
  readDesign,
  resetPlace,
  setElement,
  snapPosition,
  VISUALIZER_STYLES,
  withWords,
  type ClipDesign,
  type ClipElement,
  type ClipFont,
  type ClipFormat,
  type ElementId,
} from "@/lib/clipDesign";
import { clampRange, clipLyrics, clipParts, defaultPart, lineRange, MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, type ClipPart, type Places } from "@/lib/clipLyrics";
import { formatClock, isSung, sectionsOf } from "@/lib/lyrics";
import { shortPath } from "@/lib/shareLinks";
import { togglePlay } from "./LyricsPanel";

// The clip editor: a video of a part of the song for Reels, TikTok,
// Shorts, Stories, X or YouTube, made full screen like a video editor.
//
//   - The video in the middle is the real thing, drawn as it will be. Tap
//     anything on it (the title, the lyrics, the visualizer…) to pick it,
//     drag it anywhere (it snaps to the middle), pull its corner or pinch
//     to resize it; double-tap words to type over them.
//   - Part: which stretch of the song (the loop, a section, line to line,
//     a dragged range), heard with the preview following it.
//   - Design: a ready-made look, the shape (9:16, 4:5, 1:1, 16:9), the
//     background (gradient, colour or your photo, dimmed and blurred).
//   - Edit: every element — shown or hidden, its words, font, colours,
//     size, a backing plate so it reads over anything, its style.
//   - Undo and Redo for every change; the look is kept for the next clip.
//
// Making it records in real time, in the background (clipJob.ts): the
// editor can be closed meanwhile, and the clip button says how far it is.
// Then it's shared straight to an app (the share sheet: Instagram, TikTok,
// X, WhatsApp…), saved, or posted with a ready caption.

type Range = { start: number; end: number };
type Tab = "part" | "design" | "edit";

const DESIGN_KEY = "remixt.clip.design";

function loadDesign(): ClipDesign {
  try {
    const raw = localStorage.getItem(DESIGN_KEY);
    return (raw && readDesign(JSON.parse(raw))) || defaultDesign();
  } catch {
    return defaultDesign();
  }
}

function keepDesign(design: ClipDesign) {
  try {
    localStorage.setItem(DESIGN_KEY, JSON.stringify(forStorage(design)));
  } catch {
    // Private mode or full storage: the look is just not remembered.
  }
}

// --- Undo / redo for the design -------------------------------------------------------

type History = { past: ClipDesign[]; present: ClipDesign; future: ClipDesign[] };
const MAX_STEPS = 80;

function useDesignHistory(initial: () => ClipDesign) {
  const [h, setH] = useState<History>(() => ({ past: [], present: initial(), future: [] }));
  /** A change: `record` makes it a step of its own (a drag records once, when it starts — see checkpoint). */
  const set = useCallback((next: ClipDesign | ((d: ClipDesign) => ClipDesign), record = true) => {
    setH((cur) => {
      const value = typeof next === "function" ? next(cur.present) : next;
      if (value === cur.present) return cur;
      return record
        ? { past: [...cur.past, cur.present].slice(-MAX_STEPS), present: value, future: [] }
        : { ...cur, present: value };
    });
  }, []);
  /** Marks where a drag or a slider starts, so it undoes in one step. */
  const checkpoint = useCallback(() => {
    setH((cur) => ({ past: [...cur.past, cur.present].slice(-MAX_STEPS), present: cur.present, future: [] }));
  }, []);
  const undo = useCallback(() => {
    setH((cur) => (cur.past.length ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] } : cur));
  }, []);
  const redo = useCallback(() => {
    setH((cur) => (cur.future.length ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) } : cur));
  }, []);
  return { design: h.present, set, checkpoint, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

// --- Small controls -------------------------------------------------------------------

const SWATCHES = ["#ffffff", "#e5e5f0", "#111827", "#000000", "#f472b6", "#ec4899", "#a78bfa", "#22d3ee", "#06b6d4", "#34d399", "#facc15", "#ffd166", "#fb923c", "#f87171"];

const GRADIENTS: [string, string, string][] = [
  ["#1b0b24", "#0a0a0f", "#04202a"],
  ["#ff6a3d", "#c2185b", "#3a0d4a"],
  ["#021b33", "#06406b", "#0aa2c0"],
  ["#0f172a", "#111827", "#1e1b4b"],
  ["#14532d", "#0f766e", "#0c4a6e"],
  ["#4c1d95", "#be185d", "#f59e0b"],
  ["#111111", "#2b2b2b", "#111111"],
  ["#fde68a", "#fca5a5", "#c4b5fd"],
];

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A real on/off switch — big enough for a thumb, with the state said in words. */
function Switch({ on, onChange, label, hint, disabled = false }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-vocals/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on && !disabled ? "bg-vocals" : "bg-surface-hover"}`} aria-hidden>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on && !disabled ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-border bg-background/60 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
            value === o.id ? "bg-vocals text-white shadow" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full border-2 transition-transform active:scale-90 ${value.toLowerCase() === c ? "border-vocals ring-2 ring-vocals/40" : "border-white/15"}`}
            style={{ background: c }}
            aria-label={`${label}: ${c}`}
          />
        ))}
        <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border text-muted" title="Any colour">
          <Plus className="h-3.5 w-3.5" />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label}: any colour`} />
        </label>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onStart,
  onChange,
  shown,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onStart: () => void;
  onChange: (v: number) => void;
  shown: string;
}) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 min-w-0 flex-1 accent-[var(--vocals)]"
      />
      <span className="w-10 shrink-0 text-right tabular-nums text-muted">{shown}</span>
    </label>
  );
}

/** One waveform row as a filled shape (mirrored about its middle), drawn across the bar. */
function WaveRow({ peaks, className }: { peaks: number[]; className: string }) {
  const path = useMemo(() => {
    if (!peaks.length || !peaks.some((p) => p > 0)) return "";
    const n = peaks.length;
    const top = peaks.map((p, i) => `${((i + 0.5) / n) * 100},${50 - Math.max(0.04, p) * 46}`);
    const bottom = peaks.map((p, i) => `${((i + 0.5) / n) * 100},${50 + Math.max(0.04, p) * 46}`).reverse();
    return `M0,50 L${top.join(" L")} L100,50 L${bottom.join(" L")} Z`;
  }, [peaks]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`h-full w-full ${className}`} aria-hidden>
      {path ? <path d={path} fill="currentColor" /> : <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

type Band = { name: string; start: number; end: number };

/**
 * The song as a bar: the song's parts (verse, chorus…) across the top, the
 * vocals' and the beat's waveforms under them, the chosen part
 * highlighted with its edges and middle draggable, the sung lines as ticks.
 */
function RangeBar({
  range,
  duration,
  ticks,
  shape,
  bands,
  onChange,
}: {
  range: Range;
  duration: number;
  ticks: number[];
  shape: { vocals: number[]; beat: number[] };
  bands: Band[];
  onChange: (range: Range) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "start" | "end" | "move"; x: number; range: Range } | null>(null);
  const playhead = useStudioStore((s) => Math.round(s.playhead * 4) / 4);
  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / duration) * 100}%`;

  const down = (mode: "start" | "end" | "move", e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, range };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const width = bar.current?.clientWidth ?? 0;
    if (!d || !width) return;
    const delta = ((e.clientX - d.x) / width) * duration;
    if (d.mode === "move") onChange(clampRange(d.range.start + delta, d.range.end + delta, duration));
    else if (d.mode === "start") onChange(clampRange(Math.min(d.range.end - MIN_CLIP_SECONDS, d.range.start + delta), d.range.end, duration));
    else onChange(clampRange(d.range.start, Math.max(d.range.start + MIN_CLIP_SECONDS, d.range.end + delta), duration));
  };
  const up = () => (drag.current = null);
  const jump = (e: ReactPointerEvent) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box) return;
    const at = ((e.clientX - box.left) / box.width) * duration;
    const length = range.end - range.start;
    onChange(clampRange(at - length / 2, at + length / 2, duration));
  };

  return (
    <div
      ref={bar}
      onPointerDown={jump}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative h-[5.5rem] touch-none select-none overflow-hidden rounded-xl bg-background"
      aria-label="The part of the song in the clip"
    >
      {/* The song's parts, from the timed lyrics */}
      <div className="absolute inset-x-0 top-0 h-4" aria-hidden>
        {bands.map((b, i) => (
          <span
            key={i}
            className={`absolute top-0 flex h-4 items-center overflow-hidden whitespace-nowrap border-l border-background px-1 text-[9px] font-semibold uppercase leading-none tracking-wide ${i % 2 ? "bg-surface-hover text-muted" : "bg-surface-raised text-foreground/80"}`}
            style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})` }}
            title={b.name}
          >
            {b.name}
          </span>
        ))}
      </div>
      {/* The vocals over the beat */}
      <div className="absolute inset-x-0 bottom-0 top-4 flex flex-col" aria-hidden>
        <div className="relative min-h-0 flex-1">
          <WaveRow peaks={shape.vocals} className="text-vocals/55" />
          <span className="absolute left-1 top-0.5 text-[9px] font-semibold text-vocals">Vocals</span>
        </div>
        <div className="relative min-h-0 flex-1 border-t border-border/60">
          <WaveRow peaks={shape.beat} className="text-beat/55" />
          <span className="absolute left-1 top-0.5 text-[9px] font-semibold text-beat">Beat</span>
        </div>
      </div>
      {ticks.map((t, i) => (
        <span key={i} className="absolute bottom-1.5 top-5 w-px bg-vocals/40" style={{ left: pct(t) }} aria-hidden />
      ))}
      <span className="absolute bottom-0 top-0 w-0.5 bg-foreground/60" style={{ left: pct(playhead) }} aria-hidden />
      <div
        onPointerDown={(e) => down("move", e)}
        className="absolute bottom-0 top-0 cursor-grab rounded-lg border-2 border-vocals bg-vocals/25 active:cursor-grabbing"
        style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }}
        role="presentation"
      >
        {(["start", "end"] as const).map((edge) => (
          <span
            key={edge}
            onPointerDown={(e) => down(edge, e)}
            className={`absolute bottom-0 top-0 flex w-5 cursor-ew-resize items-center justify-center ${edge === "start" ? "-left-2.5" : "-right-2.5"}`}
            aria-hidden
          >
            <span className="h-7 w-1.5 rounded-full bg-vocals shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Nudge({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  const button = "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:border-vocals hover:text-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-11 text-[11px] text-muted">{label}</span>
      <button onClick={() => onChange(-1)} className={button} aria-label={`${label} a second earlier`}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-11 text-center text-xs font-semibold tabular-nums">{formatClock(value)}</span>
      <button onClick={() => onChange(1)} className={button} aria-label={`${label} a second later`}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** A ready-made look, drawn as it would come out. */
function TemplateThumb({ design, content, onPick, label }: { design: ClipDesign; content: ClipContent; onPick: () => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawClipThumb(canvas.current, design, content, 0.14);
  }, [design, content]);
  return (
    <button onClick={onPick} className="group flex min-w-0 flex-col items-center gap-1" title={`The ${label} look`}>
      <canvas ref={canvas} className="w-full rounded-lg border-2 border-transparent bg-black shadow transition-all group-hover:border-vocals group-active:scale-95" />
      <span className="text-[11px] font-semibold text-muted group-hover:text-foreground">{label}</span>
    </button>
  );
}

// --- The editor -----------------------------------------------------------------------

type Drag =
  | { kind: "move"; id: ElementId; px: number; py: number; x: number; y: number }
  | { kind: "scale"; id: ElementId; cx: number; cy: number; dist: number; scale: number }
  | { kind: "pinch"; id: ElementId; dist: number; scale: number };

export default function ClipDialog({ title, artist, remixId, me }: { title: string; artist: string; remixId: string | null; me: string }) {
  const ask = useStudioView((s) => s.clip);
  const closeClip = useStudioView((s) => s.closeClip);
  const duration = useStudioStore((s) => s.duration);
  const lanes = useStudioStore((s) => s.lanes);
  const lines = useLyrics((s) => s.lines);
  const sheet = useLyrics(activeSheet);

  // Where each line is sung on the edited vocal — every copy of it — so a clip of the second chorus still has its words.
  const places = useMemo<Places | undefined>(() => (sheet ? (t: number) => sungAt(lanes, t, rankFor(sheet)) : undefined), [lanes, sheet]);

  // --- The part ---
  const peaks = useMemo(() => (ask ? mixPeaks(lanes, duration, 600) : []), [ask, lanes, duration]);
  const shape = useMemo(() => (ask ? groupPeaks(lanes, duration, 240) : { vocals: [], beat: [] }), [ask, lanes, duration]);
  const parts = useMemo<ClipPart[]>(() => {
    const s = useStudioStore.getState();
    const found = clipParts({ lines, loop: { enabled: s.loopEnabled, start: s.loopStart, end: s.loopEnd }, playhead: s.playhead, duration, peaks });
    if (ask?.part) found.unshift({ id: "asked", label: ask.part.label, kind: "custom", ...clampRange(ask.part.start, ask.part.end, duration) });
    return found;
  }, [ask, lines, duration, peaks]);
  const bands = useMemo<Band[]>(
    () =>
      sectionsOf(lines)
        .filter((x) => x.start !== null)
        .map((x) => {
          const part = parts.find((p) => p.id === `section-${x.index}`);
          return { name: x.name, start: part?.start ?? x.start!, end: part?.end ?? x.end ?? x.start! + 8 };
        }),
    [lines, parts]
  );

  const [partId, setPartId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>({ start: 0, end: 0 });
  const [askId, setAskId] = useState<number | null>(null);
  const sungLines = useMemo(() => lines.map((l, i) => ({ l, i })).filter(({ l }) => l.time !== null && isSung(l)), [lines]);
  const [fromLine, setFromLine] = useState<number | null>(null);
  const [toLine, setToLine] = useState<number | null>(null);
  const words = useMemo(() => clipLyrics(lines, range.start, range.end, places), [lines, range, places]);
  const length = range.end - range.start;

  // --- The look ---
  const history = useDesignHistory(loadDesign);
  const { design, set, checkpoint } = history;
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [selected, setSelected] = useState<ElementId | null>(null);

  const songTitle = ((/^untitled/i.test(title) && sheet?.title) || title).trim() || "Untitled";
  const songArtist = (sheet?.artist && /^untitled/i.test(title) ? sheet.artist : artist).trim();
  const link = `${typeof window === "undefined" ? "" : window.location.host}${remixId ? shortPath(remixId) : ""}`;

  // The clip being made (or made) in the background.
  const job = useClipJob();
  const working = job.stage !== null;
  const clip = job.result;

  // A fresh ask (opened again, or on another take) starts on its part, with this song's words and credits —
  // or, while a clip is being made or waits to be shared, on that clip's part and look.
  if (ask && ask.id !== askId) {
    setAskId(ask.id);
    setFromLine(null);
    setToLine(null);
    setSelected(null);
    const made = (working || clip) && !ask.part ? job.made : null;
    if (made) {
      setPartId(parts.find((p) => p.start === made.range.start && p.end === made.range.end)?.id ?? null);
      setRange(made.range);
      set(made.design, false);
    } else {
      const first = ask.part ? parts[0] : defaultPart(parts, useStudioStore.getState().playhead);
      setPartId(first?.id ?? null);
      setRange(first ? { start: first.start, end: first.end } : clampRange(0, 30, duration));
      const credits = laneCredits(lanes, me);
      // Words and credits are this song's: what an earlier clip said is cleared first (the caption is the user's own and stays).
      set((d) => withWords(forStorage(d), { title: songTitle, artist: songArtist, link, ...credits }), false);
    }
  }

  const content = useMemo<ClipContent>(
    () => ({ lyrics: design.elements.lyrics.visible && words.length ? words : undefined, photo }),
    [design.elements.lyrics.visible, words, photo]
  );
  const thumbContent = useMemo<ClipContent>(() => ({ lyrics: words.length ? words : [{ start: 0.6, end: 4, wipe: 2, text: "Your words here" }], photo }), [words, photo]);

  // The look is kept for the next clip (a moment after the last change).
  useEffect(() => {
    const timer = setTimeout(() => keepDesign(design), 400);
    return () => clearTimeout(timer);
  }, [design]);

  // A new clip starts with the songs' artwork behind it: the vocal's and the beat's cover — one picture when
  // they're the same song, side by side (or a grid) when they're not. It can go on a card instead, or "Your photo" replaces it.
  const opened = !!ask;
  useEffect(() => {
    if (!opened || photo) return;
    let cancelled = false;
    void mixArtPicture(useStudioStore.getState().lanes).then((art) => {
      if (cancelled || !art) return;
      setPhoto((current) => current ?? art);
      set((d) => (d.elements.photo.visible || d.background.kind === "photo" ? d : { ...d, background: { ...d.background, kind: "photo" } }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [opened]);

  // --- Making it ---
  const [photoError, setPhotoError] = useState<string | null>(null);
  const error = photoError ?? job.error;
  const [notice, setNotice] = useState<string | null>(null);
  const [hearing, setHearing] = useState(false);
  const [previewT, setPreviewT] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  // A new part starts the preview on its first sung words.
  const stillT = useMemo(() => {
    const first = words.find((l) => l.start >= 0) ?? words[0];
    return first ? Math.max(0, first.start + first.wipe * 0.5) : Math.min(1.5, length / 3);
  }, [words, length]);
  const [stillFor, setStillFor] = useState<string>("");
  const rangeKey = `${range.start}-${range.end}`;
  if (stillFor !== rangeKey) {
    setStillFor(rangeKey);
    setPreviewT(stillT);
  }

  // --- The stage: the video drawn at the size that fits, and where each element is on it ---
  const area = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ask, clip]);
  const { width: W, height: H } = CLIP_FORMATS[design.format];
  const fitScale = areaSize.w && areaSize.h ? Math.min((areaSize.w - 24) / W, (areaSize.h - 24) / H) : 0;
  const shownW = Math.max(0, W * fitScale);
  const shownH = Math.max(0, H * fitScale);

  const boxes = useRef<Partial<Record<ElementId, Box | null>>>({});
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const levels = useMemo(() => previewLevels(Math.max(MIN_CLIP_SECONDS, length)), [length]);

  const redraw = useCallback(
    (t: number) => {
      if (!canvas.current || working || clip) return;
      boxes.current = drawClipPreview(canvas.current, design, content, t, length, levels);
      const box = selected ? (boxes.current[selected] ?? null) : null;
      setSelBox((cur) =>
        cur && box && Math.abs(cur.x - box.x) < 1 && Math.abs(cur.y - box.y) < 1 && Math.abs(cur.w - box.w) < 1 && Math.abs(cur.h - box.h) < 1 ? cur : box
      );
    },
    [design, content, length, levels, selected, working, clip]
  );

  useEffect(() => {
    if (!ask) return;
    redraw(previewT);
  }, [ask, redraw, previewT, shownW]);

  // While the part is heard, the preview follows the Studio.
  useEffect(() => {
    if (!hearing) return;
    return useStudioStore.subscribe((s, prev) => {
      if (s.playhead === prev.playhead) return;
      const t = s.playhead - range.start;
      if (t >= 0 && t <= length) setPreviewT(t);
      if (s.isPlaying && s.playhead >= range.end) {
        void togglePlay();
        setHearing(false);
      }
    });
  }, [hearing, range, length]);

  // --- Picking and moving elements on the stage ---
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef<{ id: ElementId; at: number } | null>(null);
  const textInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const toFrame = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  /**
   * What's under a tap: the top element it's right on, else — a finger is
   * bigger than a small element — the nearest one it's close to.
   */
  const hit = (x: number, y: number): ElementId | null => {
    const pad = 24 / Math.max(0.05, fitScale);
    let near: { id: ElementId; d: number } | null = null;
    for (const id of [...ELEMENT_ORDER].reverse()) {
      const b = boxes.current[id];
      if (!b || !design.elements[id].visible) continue;
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
      const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
      if (dx === 0 && dy === 0) return id;
      const d = Math.hypot(dx, dy);
      if (d <= pad && (!near || d < near.d)) near = { id, d };
    }
    return near?.id ?? null;
  };

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (working || clip) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // Two fingers: pinch the picked element.
    if (pointers.current.size === 2 && selected) {
      const [a, b] = [...pointers.current.values()];
      checkpoint();
      drag.current = { kind: "pinch", id: selected, dist: Math.hypot(a.x - b.x, a.y - b.y), scale: design.elements[selected].scale };
      return;
    }
    const p = toFrame(e);
    const id = hit(p.x, p.y);
    setSelected(id);
    // Its settings come up beside it.
    if (id) setTab("edit");
    if (!id) {
      drag.current = null;
      return;
    }
    // A second tap on words: type over them.
    const now = Date.now();
    if (ELEMENT_INFO[id].text && lastTap.current?.id === id && now - lastTap.current.at < 350) {
      setTab("edit");
      requestAnimationFrame(() => textInput.current?.focus());
    }
    lastTap.current = { id, at: now };
    checkpoint();
    drag.current = { kind: "move", id, px: p.x, py: p.y, x: design.elements[id].x, y: design.elements[id].y };
  };

  const onStageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const scale = clampScale((d.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, d.dist));
      set((des) => setElement(des, d.id, { scale }), false);
      return;
    }
    const p = toFrame(e);
    if (d.kind === "scale") {
      const scale = clampScale((d.scale * Math.hypot(p.x - d.cx, p.y - d.cy)) / Math.max(1, d.dist));
      set((des) => setElement(des, d.id, { scale }), false);
      return;
    }
    const snapped = snapPosition(d.x + (p.x - d.px) / W, d.y + (p.y - d.py) / H);
    setGuides({ x: snapped.snapX, y: snapped.snapY });
    set((des) => setElement(des, d.id, { x: snapped.x, y: snapped.y }), false);
  };

  const onStageUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      drag.current = null;
      setGuides({ x: false, y: false });
    }
  };

  const onHandleDown = (e: ReactPointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const el = design.elements[selected];
    const cx = el.x * W;
    const cy = el.y * H;
    const p = toFrame(e);
    checkpoint();
    drag.current = { kind: "scale", id: selected, cx, cy, dist: Math.hypot(p.x - cx, p.y - cy), scale: el.scale };
  };

  const photoFor = useRef<"background" | "card">("background");
  const photoInput = useRef<HTMLInputElement>(null);

  // The looks, drawn with this clip's words and photo — not again for every move of a drag.
  const lookKey = JSON.stringify([
    design.format,
    design.background,
    ELEMENT_ORDER.map((id) => {
      const e = design.elements[id];
      return [e.visible, e.text, e.font, e.style, e.color, e.accent, e.plate];
    }),
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawn when the look changes, not its positions
  const looks = useMemo(() => CLIP_TEMPLATES.map((t) => ({ t, design: applyTemplate(design, t) })), [lookKey]);

  // --- Keys: undo/redo, nudge, hide (the Studio's own shortcuts stand aside while this is open) ---
  const { undo, redo } = history;
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        if (typing) return;
        e.preventDefault();
        if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        return;
      }
      if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const el = design.elements[selected];
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        set((des) => setElement(des, selected, { x: Math.min(0.98, Math.max(0.02, el.x + dx)), y: Math.min(0.98, Math.max(0.02, el.y + dy)) }));
        return;
      }
      if (selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        set((des) => setElement(des, selected, { visible: false }));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, selected, design, set, undo, redo]);

  if (!ask) return null;

  // --- Actions ---
  // The photo picker (one hidden input; a pick goes to the background or the card).
  function pickPhoto(target: "background" | "card") {
    photoFor.current = target;
    photoInput.current?.click();
  }
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const image = await loadPhoto(file);
      setPhoto(image);
      if (photoFor.current === "background") set((d) => ({ ...d, background: { ...d.background, kind: "photo" } }));
      else {
        set((d) => setElement(d, "photo", { visible: true }));
        setSelected("photo");
      }
    } catch {
      setPhotoError("That picture couldn't be opened — try a JPG or PNG.");
    }
  }

  /** The songs' own artwork (their covers, or pictures drawn from them) as the photo — behind everything, or as the card. */
  async function takeArtwork(target: "background" | "card") {
    const art = await mixArtPicture(useStudioStore.getState().lanes);
    if (!art) {
      setPhotoError("No songs in the mix to take artwork from.");
      return;
    }
    setPhotoError(null);
    setPhoto(art);
    if (target === "background") set((d) => ({ ...d, background: { ...d.background, kind: "photo" } }));
    else {
      set((d) => setElement(d, "photo", { visible: true }));
      setSelected("photo");
    }
  }

  const pick = (part: ClipPart) => {
    setPartId(part.id);
    setRange({ start: part.start, end: part.end });
    setFromLine(null);
    setToLine(null);
  };
  const custom = (next: Range) => {
    setPartId(null);
    setRange(next);
  };
  const pickLines = (from: number | null, to: number | null) => {
    setFromLine(from);
    setToLine(to);
    if (from === null) return;
    const next = lineRange(lines, from, to ?? from, duration);
    if (next) custom(next);
  };

  function hear() {
    if (hearing) {
      if (useStudioStore.getState().isPlaying) void togglePlay();
      setHearing(false);
      return;
    }
    const from = previewT > 0.2 && previewT < length - 0.5 ? range.start + previewT : range.start;
    audioEngine.seek(from);
    if (!useStudioStore.getState().isPlaying) void togglePlay();
    setHearing(true);
  }

  function stopHearing() {
    if (hearing && useStudioStore.getState().isPlaying) void togglePlay();
    setHearing(false);
  }

  /** Closes the editor. A clip being made carries on (the clip button shows how far); a finished one waits there. */
  function close() {
    stopHearing();
    setPhotoError(null);
    setNotice(null);
    if (job.error) job.dismiss();
    closeClip();
  }

  /** Done with the finished clip: forgotten, and the editor closed. */
  function done() {
    job.dismiss();
    close();
  }

  function make() {
    // Made inside the tap, or iOS won't let it play the soundtrack.
    const audioContext = new AudioContext();
    void audioContext.resume();
    stopHearing();
    setSelected(null);
    setPhotoError(null);
    setNotice(null);
    void job.start({ audioContext, range, design, content });
  }

  const fileName = () => `${fileSafeName(`${design.elements.artist.text || songArtist} - ${design.elements.title.text || songTitle}`)}.${clip?.clip.extension ?? "mp4"}`;
  const clipFile = () => (clip ? new File([clip.clip.blob], fileName(), { type: clip.clip.blob.type }) : null);
  const credited = design.elements.vocalBy.text.trim() && design.elements.beatBy.text.trim() ? `${design.elements.vocalBy.text.trim()} × ${design.elements.beatBy.text.trim()}` : "";
  const byLine = credited || design.elements.artist.text || songArtist;
  const caption = `${design.elements.title.text || songTitle}${byLine ? ` — ${byLine}` : ""} 🎧 remixed on Remixt${remixId ? ` ${location.protocol}//${link}` : ""} #remix #remixt`;

  async function shareTo(where: "any" | "save" | "x" | "instagram" | "tiktok" | "youtube" | "whatsapp") {
    const file = clipFile();
    if (!file) return;
    setNotice(null);
    if (where === "save") {
      const outcome = await saveFile(file, { share: false });
      setNotice(outcome === "unavailable" ? "Use Share to keep it — the installed app saves through the share sheet." : outcome === "downloaded" ? "Saved to your downloads." : null);
      return;
    }
    // Where files can be shared (phones), the share sheet sends the video straight into the app.
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file] });
        if (where !== "any") setNotice(`Pick ${({ x: "X", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", whatsapp: "WhatsApp" } as const)[where]} in the share sheet — the caption is copied, paste it in.`);
        void navigator.clipboard?.writeText(caption).catch(() => {});
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    if (where === "any") {
      const outcome = await saveFile(file, { share: false });
      if (outcome === "downloaded") setNotice("Saved — this browser can't hand videos to apps, so post it from your downloads.");
      return;
    }
    // A computer: save the video, then open the app's upload page with the caption ready.
    if (!linksLeaveApp()) downloadFile(file, file.name);
    void navigator.clipboard?.writeText(caption).catch(() => {});
    const pages = {
      x: `https://x.com/intent/post?text=${encodeURIComponent(caption)}`,
      instagram: "https://www.instagram.com/",
      tiktok: "https://www.tiktok.com/upload",
      youtube: "https://www.youtube.com/upload",
      whatsapp: `https://wa.me/?text=${encodeURIComponent(caption)}`,
    } as const;
    window.open(pages[where], "_blank", "noopener");
    setNotice("The video is saved and the caption copied — attach the video in the tab that opened.");
  }

  // --- What's shown ---
  const ticks = sungLines.map(({ l }) => l.time!);
  const hasTimedWords = sungLines.length > 0;
  const sections = sectionsOf(lines).filter((s) => s.start !== null).length;
  const chip = (on: boolean) =>
    `flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
      on ? "border-vocals bg-vocals text-white shadow-[0_6px_18px_-8px_var(--vocals)]" : "border-border text-muted hover:border-vocals hover:text-foreground"
    }`;
  const el = selected ? design.elements[selected] : null;
  const update = (patch: Partial<ClipElement>, record = true) => selected && set((d) => setElement(d, selected, patch), record);
  const lyricsNote = words.length
    ? `${words.length} line${words.length === 1 ? "" : "s"} sung in this part`
    : hasTimedWords
      ? "No lyrics are sung in this part — pick another part to show them"
      : lines.some(isSung)
        ? "The lyrics aren't timed yet — time them in the Lyrics panel to put them on the video"
        : "No lyrics open — find or write some in the Lyrics panel to put them on the video";

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "part", label: "Part", icon: <Scissors className="h-4 w-4" /> },
    { id: "design", label: "Design", icon: <Palette className="h-4 w-4" /> },
    { id: "edit", label: "Edit", icon: <Layers className="h-4 w-4" /> },
  ];

  const partPanel = (
    <div className="flex flex-col gap-5">
      <Section title="Which part of the song" aside={<span className="text-xs font-semibold tabular-nums">{formatClock(range.start)}–{formatClock(range.end)} · {Math.round(length)} s</span>}>
        <div className="flex flex-wrap gap-1.5">
          {parts.map((p) => (
            <button key={p.id} onClick={() => pick(p)} aria-pressed={partId === p.id} className={chip(partId === p.id)}>
              <span dir="auto" className="max-w-[10rem] truncate">
                {p.label}
              </span>
              <span className="font-normal tabular-nums opacity-70">{Math.round(p.end - p.start)} s</span>
            </button>
          ))}
          {partId === null && <span className={chip(true)}>Your own part</span>}
        </div>
        {!sections && <p className="text-[11px] text-muted">Time the lyrics to pick the song&apos;s parts (verse, chorus…) here.</p>}
      </Section>
      <Section title="Fine tune">
        <RangeBar range={range} duration={Math.max(1, duration)} ticks={ticks} shape={shape} bands={bands} onChange={custom} />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Nudge label="Starts" value={range.start} onChange={(d) => custom(clampRange(Math.min(range.end - MIN_CLIP_SECONDS, range.start + d), range.end, duration))} />
          <Nudge label="Ends" value={range.end} onChange={(d) => custom(clampRange(range.start, Math.max(range.start + MIN_CLIP_SECONDS, range.end + d), duration))} />
        </div>
        {hasTimedWords && (
          <div className="grid grid-cols-1 gap-2">
            {(["from", "to"] as const).map((edge) => (
              <label key={edge} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-muted">{edge === "from" ? "From line" : "To line"}</span>
                <select
                  value={(edge === "from" ? fromLine : toLine) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (edge === "from") pickLines(v, toLine !== null && v !== null && toLine < v ? v : toLine);
                    else pickLines(fromLine ?? v, v);
                  }}
                  dir="auto"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs max-lg:text-base"
                >
                  <option value="">{edge === "from" ? "Pick a line…" : "Same line"}</option>
                  {sungLines
                    .filter(({ i }) => edge === "from" || fromLine === null || i >= fromLine)
                    .map(({ l, i }) => (
                      <option key={i} value={i}>
                        {formatClock(l.time!)} · {l.text.slice(0, 48)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">From {MIN_CLIP_SECONDS} s up to {MAX_CLIP_SECONDS} s — what Reels, Shorts and Stories take in one go.</p>
      </Section>
    </div>
  );

  const bg = design.background;
  const designPanel = (
    <div className="flex flex-col gap-5">
      <Section title="Shape">
        <div className="grid grid-cols-4 gap-1.5">
          {CLIP_FORMAT_ORDER.map((f) => (
            <FormatButton key={f} format={f} on={design.format === f} onPick={() => set((d) => layoutFor(d, f))} />
          ))}
        </div>
        <p className="text-[11px] text-muted">{CLIP_FORMATS[design.format].hint}</p>
      </Section>
      <Section title="Looks">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-3">
          {looks.map(({ t, design: look }) => (
            <TemplateThumb key={t.id} label={t.label} design={look} content={thumbContent} onPick={() => set((d) => applyTemplate(d, t))} />
          ))}
        </div>
      </Section>
      <Section title="Background">
        <Segmented
          label="Background"
          value={bg.kind}
          onChange={(kind) => (kind === "photo" && !photo ? void takeArtwork("background") : set((d) => ({ ...d, background: { ...d.background, kind } })))}
          options={[
            { id: "gradient", label: "Gradient" },
            { id: "solid", label: "Colour" },
            { id: "photo", label: "Picture" },
          ]}
        />
        {bg.kind === "gradient" && (
          <div className="grid grid-cols-8 gap-1.5">
            {GRADIENTS.map((g) => (
              <button
                key={g.join()}
                onClick={() => set((d) => ({ ...d, background: { ...d.background, colors: g } }))}
                className={`aspect-square rounded-lg border-2 ${bg.colors.join() === g.join() ? "border-vocals" : "border-white/10"}`}
                style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]}, ${g[2]})` }}
                aria-label="Gradient"
              />
            ))}
          </div>
        )}
        {bg.kind === "solid" && <ColorRow label="Colour" value={bg.colors[0]} onChange={(c) => set((d) => ({ ...d, background: { ...d.background, colors: [c, c, c] } }))} />}
        {bg.kind === "photo" && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void takeArtwork("background")} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold text-muted hover:border-vocals hover:text-foreground">
                <Music2 className="h-4 w-4" /> Song artwork
              </button>
              <button onClick={() => pickPhoto("background")} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-semibold text-muted hover:border-vocals hover:text-foreground">
                <ImagePlus className="h-4 w-4" /> Your photo
              </button>
            </div>
            <Slider label="Darken" value={bg.dim} min={0} max={0.85} step={0.05} onStart={checkpoint} onChange={(v) => set((d) => ({ ...d, background: { ...d.background, dim: v } }), false)} shown={`${Math.round(bg.dim * 100)}%`} />
            <Slider label="Blur" value={bg.blur} min={0} max={40} step={1} onStart={checkpoint} onChange={(v) => set((d) => ({ ...d, background: { ...d.background, blur: v } }), false)} shown={`${bg.blur}`} />
          </div>
        )}
        <Switch on={bg.glow} onChange={(glow) => set((d) => ({ ...d, background: { ...d.background, glow } }))} label="Glow with the beat" hint="A soft light behind the visualizer that pulses with the music" />
      </Section>
      <Section title="Photo">
        <Switch
          on={design.elements.photo.visible && !!photo}
          onChange={(on) => (on && !photo ? pickPhoto("card") : set((d) => setElement(d, "photo", { visible: on })))}
          label="Show a picture card"
          hint={photo ? "The picture as a square on the video — drag it where you want it" : "The songs' artwork, or a photo of your own, as a square on the video"}
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void takeArtwork("card")} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold text-muted hover:border-vocals hover:text-foreground">
            <Music2 className="h-4 w-4" /> Song artwork
          </button>
          <button onClick={() => pickPhoto("card")} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-semibold text-muted hover:border-vocals hover:text-foreground">
            <ImagePlus className="h-4 w-4" /> Your photo
          </button>
        </div>
      </Section>
    </div>
  );

  const editPanel = (
    <div className="flex flex-col gap-5">
      {el && selected ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground" aria-label="Back to every element">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{ELEMENT_INFO[selected].label}</h3>
            <button onClick={() => set((d) => setElement(d, selected, { x: 0.5 }))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground" title="Centre it across" aria-label="Centre it across">
              <AlignCenterHorizontal className="h-4 w-4" />
            </button>
            <button onClick={() => set((d) => resetPlace(d, selected))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground" title="Put it back where it started, at its usual size" aria-label="Reset its place and size">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                set((d) => setElement(d, selected, { visible: false }));
                setSelected(null);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:border-danger/60 hover:text-danger"
              title="Take it off the video"
              aria-label="Hide it"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {selected === "lyrics" && <p className={`rounded-xl px-3 py-2 text-xs ${words.length ? "bg-vocals/10 text-foreground" : "bg-beat/10 text-beat"}`}>{lyricsNote}</p>}

          {ELEMENT_INFO[selected].text && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted">Words</span>
              {selected === "caption" ? (
                <textarea
                  ref={(n) => {
                    textInput.current = n;
                  }}
                  value={el.text}
                  onFocus={checkpoint}
                  onChange={(e) => update({ text: e.target.value.slice(0, 120) }, false)}
                  dir="auto"
                  rows={2}
                  placeholder="New remix out now 🔥"
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm max-lg:text-base"
                />
              ) : (
                <input
                  ref={(n) => {
                    textInput.current = n;
                  }}
                  value={el.text}
                  onFocus={checkpoint}
                  onChange={(e) => update({ text: e.target.value.slice(0, 120) }, false)}
                  dir="auto"
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm max-lg:text-base"
                />
              )}
              {selected === "link" && !remixId && <span className="text-[11px] text-muted">Save the remix first to put its short link here.</span>}
            </label>
          )}

          {selected === "lyrics" && (
            <Segmented label="Lyrics style" value={(el.style || "karaoke") as string} onChange={(style) => update({ style })} options={LYRICS_STYLES.map((s) => ({ id: s.id, label: s.label, title: s.hint }))} />
          )}
          {selected === "visualizer" && (
            <Segmented label="Visualizer style" value={(el.style || "bars") as string} onChange={(style) => update({ style })} options={VISUALIZER_STYLES.map((s) => ({ id: s.id, label: s.label }))} />
          )}

          {(ELEMENT_INFO[selected].text || selected === "lyrics") && (
            <Segmented<ClipFont>
              label="Font"
              value={el.font}
              onChange={(font) => update({ font })}
              options={(Object.keys(CLIP_FONTS) as ClipFont[]).map((f) => ({
                id: f,
                label: <span style={{ fontFamily: CLIP_FONTS[f].family, fontWeight: CLIP_FONTS[f].weight }}>{CLIP_FONTS[f].label}</span>,
              }))}
            />
          )}

          <Slider label="Size" value={el.scale} min={0.35} max={3} step={0.05} onStart={checkpoint} onChange={(scale) => update({ scale }, false)} shown={`${Math.round(el.scale * 100)}%`} />

          {selected !== "photo" && <ColorRow label={selected === "lyrics" ? "Words" : selected === "visualizer" || selected === "progress" ? "Colour, start" : "Colour"} value={el.color} onChange={(color) => update({ color })} />}
          {(selected === "lyrics" || selected === "visualizer" || selected === "progress") && (
            <ColorRow label={selected === "lyrics" ? "Sung part (highlight)" : "Colour, end"} value={el.accent} onChange={(accent) => update({ accent })} />
          )}

          {(ELEMENT_INFO[selected].text || selected === "lyrics" || selected === "brand") && (
            <Switch on={el.plate} onChange={(plate) => update({ plate })} label="Backing plate" hint="A soft plate behind it, so it reads clearly over any background or photo" />
          )}
        </>
      ) : (
        <>
          <p className="rounded-xl bg-background/60 px-3 py-2.5 text-xs text-muted">
            <span className="font-semibold text-foreground">Tap anything on the video</span> to change it — drag to move, pull the corner or pinch to resize, tap twice to type.
          </p>
          <Section title="On the video">
            <ul className="flex flex-col gap-1.5">
              {[...ELEMENT_ORDER].reverse().map((id) => {
                const item = design.elements[id];
                const missing = id === "photo" && !photo;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-xl border border-border bg-background/60 pl-3 pr-1.5">
                    <button
                      onClick={() => {
                        if (missing) return pickPhoto("card");
                        if (!item.visible) set((d) => setElement(d, id, { visible: true }));
                        setSelected(id);
                      }}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left text-sm"
                    >
                      <ElementIcon id={id} />
                      <span className={`min-w-0 flex-1 truncate ${item.visible && !missing ? "font-semibold" : "text-muted"}`}>
                        {ELEMENT_INFO[id].label}
                        {ELEMENT_INFO[id].text && item.text && <span className="ml-1.5 font-normal text-muted" dir="auto">· {item.text}</span>}
                        {id === "lyrics" && !words.length && <span className="ml-1.5 font-normal text-beat">· none in this part</span>}
                      </span>
                    </button>
                    <button
                      onClick={() => (missing ? pickPhoto("card") : set((d) => setElement(d, id, { visible: !item.visible })))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.visible && !missing ? "text-foreground" : "text-muted"} hover:bg-surface-hover`}
                      aria-label={item.visible && !missing ? `Hide ${ELEMENT_INFO[id].label}` : `Show ${ELEMENT_INFO[id].label}`}
                      aria-pressed={item.visible && !missing}
                    >
                      {item.visible && !missing ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
          {!words.length && <p className="text-[11px] text-muted">Lyrics: {lyricsNote.toLowerCase()}.</p>}
        </>
      )}
    </div>
  );

  // --- The page ---
  const handle = selBox && !working && !clip ? { x: selBox.x * fitScale, y: selBox.y * fitScale, w: selBox.w * fitScale, h: selBox.h * fitScale } : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clip editor"
      className="touch-targets fixed inset-0 z-[80] flex flex-col bg-background text-foreground"
      style={{ animation: "sheet-in 0.18s ease-out", paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0]).finally(() => (e.target.value = ""))} />

      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-4">
        <button onClick={close} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-foreground" aria-label={working ? "Close — the clip keeps recording" : "Close the clip editor"} title={working ? "Close — the clip keeps recording; the clip button shows how far it is" : undefined}>
          <X className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-vocals to-brand text-white max-sm:hidden">
            <Clapperboard className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold leading-tight">{clip ? "Your clip" : "Clip editor"}</h2>
            <p className="truncate text-[11px] text-muted">
              {CLIP_FORMATS[design.format].label} · {Math.round(length)} s{clip ? "" : ` · ${CLIP_FORMATS[design.format].hint}`}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {!clip && !working && (
            <>
              <button onClick={undo} disabled={!history.canUndo} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30" title="Undo (⌘Z)" aria-label="Undo">
                <Undo2 className="h-[18px] w-[18px]" />
              </button>
              <button onClick={redo} disabled={!history.canRedo} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30" title="Redo (⇧⌘Z)" aria-label="Redo">
                <Redo2 className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={make}
                disabled={length < MIN_CLIP_SECONDS || duration <= 0}
                className="ml-1 flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-vocals to-brand px-4 text-sm font-bold text-white shadow-lg shadow-vocals/25 hover:opacity-95 disabled:opacity-40"
              >
                <Clapperboard className="h-4 w-4" /> Export
              </button>
            </>
          )}
          {clip && (
            <button onClick={job.dismiss} className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row short:flex-row">
        {/* The video */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={area} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_70%)]">
            {clip ? (
              <video src={clip.url} controls playsInline autoPlay loop className="max-h-full max-w-full rounded-xl bg-black shadow-2xl" style={{ width: shownW || undefined, height: shownH || undefined }} />
            ) : (
              <div
                className="relative touch-none select-none active:cursor-grabbing"
                style={{ width: shownW, height: shownH }}
                onPointerDown={onStageDown}
                onPointerMove={onStageMove}
                onPointerUp={onStageUp}
                onPointerCancel={onStageUp}
              >
                {working && job.canvas ? (
                  <MountCanvas canvas={job.canvas} />
                ) : (
                  <canvas ref={canvas} className="block h-full w-full rounded-xl bg-black shadow-2xl ring-1 ring-white/10" aria-label="The clip — tap something on it to change it" />
                )}
                {guides.x && <span className="pointer-events-none absolute bottom-0 top-0 w-px bg-vocals" style={{ left: shownW / 2 }} aria-hidden />}
                {guides.y && <span className="pointer-events-none absolute left-0 right-0 h-px bg-vocals" style={{ top: shownH / 2 }} aria-hidden />}
                {handle && (
                  <div className="pointer-events-none absolute rounded-md border-2 border-vocals shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: handle.x - 6, top: handle.y - 6, width: handle.w + 12, height: handle.h + 12 }} aria-hidden>
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-vocals px-1.5 py-0.5 text-[10px] font-bold text-white">{selected && ELEMENT_INFO[selected].label}</span>
                    <span
                      onPointerDown={onHandleDown}
                      className="pointer-events-auto absolute -bottom-3 -right-3 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-vocals shadow-lg"
                      aria-label="Drag to resize"
                    />
                  </div>
                )}
                {working && (
                  <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/75 p-3 text-white backdrop-blur" role="status">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{job.stage?.label}</span>
                      <span className="tabular-nums">{Math.round((job.stage?.fraction ?? 0) * 100)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full bg-gradient-to-r from-vocals to-beat transition-[width]" style={{ width: `${(job.stage?.fraction ?? 0) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-white/70">Records in real time. You can close this and keep working — leaving the page pauses it.</span>
                      <button onClick={job.cancel} className="rounded-lg border border-white/30 px-2.5 py-1 text-[11px] font-semibold hover:border-danger hover:text-danger">
                        Stop
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Hear it, and scrub through the part */}
          {!clip && !working && (
            <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
              <button onClick={hear} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vocals text-white shadow-lg shadow-vocals/30" aria-label={hearing ? "Stop" : "Hear this part"} title="Plays this part in the Studio — the video follows it">
                {hearing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, length)}
                step={0.05}
                value={Math.min(previewT, length)}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setPreviewT(t);
                  if (hearing) audioEngine.seek(range.start + t);
                }}
                className="h-2 min-w-0 flex-1 accent-[var(--vocals)]"
                aria-label="Where in the part the preview is"
              />
              <span className="w-[5.5rem] shrink-0 text-right text-xs tabular-nums text-muted">
                {formatClock(previewT)} / {formatClock(length)}
              </span>
            </div>
          )}
        </div>

        {/* The panel */}
        <aside className="flex min-h-0 shrink-0 flex-col border-border bg-surface max-lg:h-[46dvh] max-lg:border-t lg:w-[24rem] lg:border-l short:!h-auto short:w-[22rem] short:border-l short:border-t-0 xl:w-[26rem]">
          {clip ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">Ready to post</p>
                  <p className="text-[11px] text-muted">
                    {clip.clip.extension.toUpperCase()} · {Math.round(length)} s · {CLIP_FORMATS[design.format].width}×{CLIP_FORMATS[design.format].height}
                  </p>
                </div>
              </div>
              <button onClick={() => void shareTo("any")} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-vocals to-brand text-sm font-bold text-white shadow-lg shadow-vocals/25">
                <Share2 className="h-4 w-4" /> Share to an app
              </button>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["instagram", "Instagram"],
                    ["tiktok", "TikTok"],
                    ["x", "X"],
                    ["youtube", "YouTube"],
                    ["whatsapp", "WhatsApp"],
                    ["save", "Save video"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} onClick={() => void shareTo(id)} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/60 text-xs font-semibold hover:border-vocals">
                    {id === "save" && <Download className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
              {notice && <p className="rounded-xl bg-vocals/10 px-3 py-2 text-xs">{notice}</p>}
              <Section title="Caption">
                <div className="flex items-start gap-2 rounded-xl border border-border bg-background/60 p-3">
                  <p dir="auto" className="min-w-0 flex-1 text-xs leading-relaxed">
                    {caption}
                  </p>
                  <button onClick={() => void navigator.clipboard?.writeText(caption).then(() => setNotice("Caption copied."))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label="Copy the caption">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </Section>
              {clip.clip.extension === "webm" && <p className="text-[11px] text-muted">This browser records WebM. TikTok, X and YouTube take it; for Instagram, Safari or a recent Chrome make MP4.</p>}
              <div className="mt-auto flex gap-2">
                <button onClick={job.dismiss} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-muted hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Keep editing
                </button>
                <button onClick={done} className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border text-xs font-semibold text-muted hover:text-foreground">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Clip editor" className="flex shrink-0 gap-1 border-b border-border p-1.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    disabled={working}
                    className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                      tab === t.id ? "bg-surface-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${working ? "pointer-events-none opacity-50" : ""}`}>
                {tab === "part" ? partPanel : tab === "design" ? designPanel : editPanel}
                {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
                {!recordsMp4() && tab === "design" && <p className="mt-4 text-[11px] text-muted">This browser records WebM video. For Instagram, Safari or a recent Chrome make MP4.</p>}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
}

/** The clip job's own canvas (what it records), shown where the preview was while it records. */
function MountCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={holder} className="h-full w-full" aria-label="The clip, as it records" />;
}

function FormatButton({ format, on, onPick }: { format: ClipFormat; on: boolean; onPick: () => void }) {
  const { label, width, height } = CLIP_FORMATS[format];
  const k = 26 / Math.max(width, height);
  return (
    <button
      onClick={onPick}
      aria-pressed={on}
      className={`flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-[11px] font-semibold transition-colors ${on ? "border-vocals bg-vocals/10 text-foreground" : "border-border text-muted hover:text-foreground"}`}
      title={CLIP_FORMATS[format].hint}
    >
      <span className={`rounded-[3px] border-2 ${on ? "border-vocals" : "border-current"}`} style={{ width: width * k, height: height * k }} aria-hidden />
      {label}
    </button>
  );
}

function ElementIcon({ id }: { id: ElementId }) {
  const cls = "h-4 w-4 shrink-0 text-muted";
  if (id === "photo") return <ImagePlus className={cls} />;
  if (ELEMENT_INFO[id].text || id === "lyrics") return <Type className={cls} />;
  if (id === "brand") return <Clapperboard className={cls} />;
  return <Layers className={cls} />;
}

/** The user's picture, ready to draw (shrunk: a 12-megapixel photo is far more than a 1080p frame needs). */
async function loadPhoto(file: File): Promise<Photo> {
  const MAX = 2160;
  if (typeof createImageBitmap === "function") {
    const full = await createImageBitmap(file);
    const k = Math.min(1, MAX / Math.max(full.width, full.height));
    if (k >= 1) return { image: full, width: full.width, height: full.height };
    const small = await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k), resizeQuality: "high" }).catch(() => null);
    if (small) {
      full.close();
      return { image: small, width: small.width, height: small.height };
    }
    return { image: full, width: full.width, height: full.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
