"use client";

import { renderMixdown } from "./mixdown";
import { MARK_BARS, MARK_BAR_WIDTH, MARK_GRADIENT, MARK_TILE_RADIUS } from "@/lib/brand";
import { clipLineAt, MAX_CLIP_SECONDS, type ClipLine } from "@/lib/clipLyrics";
import { CLIP_FONTS, CLIP_FORMATS, CREDIT_LABELS, ELEMENT_ORDER, type ClipDesign, type ClipElement, type ElementId } from "@/lib/clipDesign";

// A video of a stretch of the mix for Reels, TikTok, Shorts, Stories, X and
// YouTube, drawn from a ClipDesign (lib/clipDesign.ts): its shape, its
// background (a gradient, a colour or the user's photo) and every element
// where the user put it — the brand, the song's name, the artist, a
// visualizer moving with the music, the lyrics, a caption, the progress
// bar and the link. Drawn on a canvas and recorded in real time with
// MediaRecorder — so a 30 s clip takes 30 s to make — with the rendered mix
// as its soundtrack.
//
// The lyrics are always outlined in a colour that stands off them (and can
// sit on a plate), so they read over any background or photo.

const FPS = 30;
export { MAX_CLIP_SECONDS };
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** The best video format this browser can record: MP4 where it can (posts everywhere), else WebM. */
function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

export function canMakeClips() {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    !!pickMimeType()
  );
}

/** Whether this browser records MP4 (what Instagram wants); else it's WebM. */
export function recordsMp4() {
  return !!pickMimeType()?.startsWith("video/mp4");
}

/** Loudness per video frame, 0..1, so the visualizer can follow the music. */
function frameLevels(buffer: AudioBuffer) {
  const frames = Math.ceil(buffer.duration * FPS);
  const per = Math.floor(buffer.sampleRate / FPS);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const out = new Float32Array(frames);
  let top = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const from = f * per;
    const to = Math.min(left.length, from + per);
    for (let i = from; i < to; i += 4) sum += ((left[i] + right[i]) / 2) ** 2;
    out[f] = Math.sqrt(sum / Math.max(1, (to - from) / 4));
    top = Math.max(top, out[f]);
  }
  for (let f = 0; f < frames; f++) out[f] = top ? out[f] / top : 0;
  return out;
}

/** Frames of made-up loudness before the start of the preview's (see previewLevels). */
export const PREVIEW_LEAD = 120;

/**
 * Made-up loudness with a beat in it, for the preview before the mix is
 * rendered — so the visualizer looks alive while the clip is designed.
 * Starts PREVIEW_LEAD frames before the clip.
 */
export function previewLevels(seconds: number): Float32Array {
  const frames = Math.max(1, Math.ceil(seconds * FPS) + PREVIEW_LEAD + 30);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const beat = (f / FPS) * 2; // 120 bpm
    const kick = Math.exp(-((beat % 1) * 6));
    const wobble = 0.5 + 0.5 * Math.sin(f * 0.37) * Math.sin(f * 0.11);
    out[f] = Math.min(1, 0.25 + kick * 0.55 + wobble * 0.25);
  }
  return out;
}

// --- Drawing helpers ------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number };

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

/** A rounded rectangle path — a plain one where the browser has no roundRect (older Safari). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  else ctx.rect(x, y, w, h);
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/** "#rrggbb" at `alpha`. */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** How light a colour is, 0..1. */
function lightness(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** A colour that stands off `hex`: dark under light text, light under dark text. */
function standOff(hex: string, alpha: number) {
  return lightness(hex) > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
}

function font(el: ClipElement, size: number, weight?: number) {
  const f = CLIP_FONTS[el.font] ?? CLIP_FONTS.modern;
  return `${weight ?? f.weight} ${Math.round(size)}px ${f.family}`;
}

/** The Remixt mark (lib/brand.ts), drawn at `size` px with its top-left at x, y. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 512;
  const tile = ctx.createLinearGradient(x, y, x + size, y + size);
  tile.addColorStop(0, MARK_GRADIENT[0]);
  tile.addColorStop(0.55, MARK_GRADIENT[1]);
  tile.addColorStop(1, MARK_GRADIENT[2]);
  ctx.fillStyle = tile;
  pill(ctx, x, y, size, size, MARK_TILE_RADIUS * k);
  ctx.fillStyle = "#ffffff";
  for (const [bx, by, h] of MARK_BARS) {
    pill(ctx, x + bx * k, y + by * k, MARK_BAR_WIDTH * k, h * k, (MARK_BAR_WIDTH / 2) * k);
  }
}

/** A plate behind a block of text, so it reads over anything. */
function drawPlate(ctx: CanvasRenderingContext2D, box: Box, color: string, pad: number) {
  ctx.save();
  ctx.fillStyle = lightness(color) > 0.5 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.72)";
  pill(ctx, box.x - pad, box.y - pad * 0.6, box.w + pad * 2, box.h + pad * 1.2, pad * 0.9);
  ctx.restore();
}

/**
 * Lines of text centred on cx, cy, outlined so they read over anything (and
 * on a plate, if asked). Returns the box they take.
 */
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  cx: number,
  cy: number,
  size: number,
  el: ClipElement,
  { outline = true, weight, lineHeight = 1.2 }: { outline?: boolean; weight?: number; lineHeight?: number } = {}
): Box {
  ctx.save();
  ctx.font = font(el, size, weight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = size * lineHeight;
  const widths = rows.map((r) => ctx.measureText(r).width);
  const w = Math.max(1, ...widths);
  const h = rows.length * step;
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  if (el.plate) drawPlate(ctx, box, el.color, size * 0.45);
  rows.forEach((row, i) => {
    const y = box.y + step * (i + 0.5);
    ctx.direction = RTL.test(row) ? "rtl" : "ltr";
    if (outline && !el.plate) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeStyle = standOff(el.color, 0.5);
      ctx.strokeText(row, cx, y);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(row, cx, y);
  });
  ctx.restore();
  return box;
}

// --- Elements -------------------------------------------------------------------

type Frame = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  levels: Float32Array;
  frame: number;
  t: number;
  progress: number;
  /** Frames of `levels` before the clip's start (the preview has some, so its visualizer is full from the first frame). */
  lead: number;
};

const level = (f: Frame, frame: number) => {
  const i = frame + f.lead;
  return i >= 0 ? (f.levels[Math.min(f.levels.length - 1, i)] ?? 0) : 0;
};

function drawBackground(f: Frame, design: ClipDesign, photo: Photo | null) {
  const { ctx, W, H } = f;
  const bg = design.background;
  const [a, b, c] = bg.colors;
  if (bg.kind === "photo" && photo) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    // Covers the frame, cut to fit.
    const k = Math.max(W / photo.width, H / photo.height) * (bg.blur > 0 ? 1.08 : 1);
    const w = photo.width * k;
    const h = photo.height * k;
    ctx.save();
    if (bg.blur > 0 && canFilter(ctx)) ctx.filter = `blur(${Math.round(bg.blur * (W / 1080))}px)`;
    ctx.drawImage(photo.image, (W - w) / 2, (H - h) / 2, w, h);
    ctx.restore();
    if (bg.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (bg.kind === "solid") {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(0.5, b);
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (bg.glow) {
    const v = design.elements.visualizer;
    const at = level(f, f.frame);
    const cx = v.x * W;
    const cy = v.y * H;
    const r = Math.max(W, H) * (0.35 + at * 0.12);
    const glow = ctx.createRadialGradient(cx, cy, 30, cx, cy, r);
    glow.addColorStop(0, rgba(v.color, 0.22 + at * 0.28));
    glow.addColorStop(0.6, rgba(v.accent, 0.07));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
}

let filterWorks: boolean | null = null;
/** Safari only recently draws canvas filters: without them the photo just isn't blurred. */
function canFilter(ctx: CanvasRenderingContext2D) {
  if (filterWorks === null) {
    const before = ctx.filter;
    try {
      ctx.filter = "blur(1px)";
      filterWorks = ctx.filter === "blur(1px)";
    } catch {
      filterWorks = false;
    }
    ctx.filter = before ?? "none";
  }
  return filterWorks;
}

function drawBrand(f: Frame, el: ClipElement): Box {
  const { ctx, W, H } = f;
  const s = el.scale;
  const mark = 96 * s;
  ctx.save();
  ctx.font = font(el, 62 * s, 800);
  const word = "Remixt";
  const tw = ctx.measureText(word).width;
  const gap = 22 * s;
  const w = mark + gap + tw;
  const x = el.x * W - w / 2;
  const y = el.y * H - mark / 2;
  if (el.plate) drawPlate(ctx, { x, y, w, h: mark }, el.color, 22 * s);
  drawMark(ctx, x, y, mark);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.fillStyle = el.color;
  ctx.fillText(word, x + mark + gap, y + mark / 2 + 2 * s);
  ctx.restore();
  return { x, y, w, h: mark };
}

function drawWords(f: Frame, el: ClipElement, size: number, maxLines: number, widthShare: number): Box | null {
  const { ctx, W, H } = f;
  const text = el.text.trim();
  if (!text) return null;
  ctx.save();
  ctx.font = font(el, size);
  const rows = wrapText(ctx, text, Math.min(W * widthShare, 1500), maxLines);
  ctx.restore();
  return drawTextBlock(ctx, rows, el.x * W, el.y * H, size, el);
}

/** A credit: a small label ("VOCALS") in the element's second colour, over a name. */
function drawCredit(f: Frame, el: ClipElement, label: string): Box | null {
  const { ctx, W, H } = f;
  const text = el.text.trim();
  if (!text) return null;
  const size = 38 * el.scale;
  const small = size * 0.5;
  ctx.save();
  ctx.font = font(el, size);
  const rows = wrapText(ctx, text, Math.min(W * 0.42, 900), 1);
  ctx.restore();
  const cx = el.x * W;
  const cy = el.y * H;
  // The name sits a little low, the label above it: the pair is centred on the element's place.
  const name = drawTextBlock(ctx, rows, cx, cy + small * 0.62, size, el);
  ctx.save();
  ctx.font = font(el, small, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const spaced = label.split("").join("\u200a");
  const labelY = name.y - small * 0.75;
  const labelW = ctx.measureText(spaced).width;
  if (!el.plate) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, small * 0.12);
    ctx.strokeStyle = standOff(el.accent, 0.45);
    ctx.strokeText(spaced, cx, labelY);
  }
  ctx.fillStyle = el.accent;
  ctx.fillText(spaced, cx, labelY);
  ctx.restore();
  const w = Math.max(name.w, labelW);
  const top = labelY - small * 0.6;
  return { x: cx - w / 2, y: top, w, h: name.y + name.h - top };
}

function drawVisualizer(f: Frame, el: ClipElement): Box {
  const { ctx, W, H, frame } = f;
  const s = el.scale;
  const cx = el.x * W;
  const cy = el.y * H;
  const width = Math.min(W * 0.84, 1500) * s;
  const height = 300 * s;
  const left = cx - width / 2;
  const paint = ctx.createLinearGradient(left, 0, left + width, 0);
  paint.addColorStop(0, el.color);
  paint.addColorStop(1, el.accent);
  ctx.save();
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  if (el.style === "circle") {
    const radius = 120 * s * (1 + level(f, frame) * 0.12);
    const count = 72;
    const reach = 150 * s;
    const ring = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ring.addColorStop(0, el.color);
    ring.addColorStop(1, el.accent);
    ctx.strokeStyle = ring;
    ctx.lineCap = "round";
    ctx.lineWidth = 9 * s;
    for (let i = 0; i < count; i++) {
      // Mirrored round the ring, so it's balanced left and right.
      const k = i < count / 2 ? i : count - i;
      const v = level(f, frame - k * 2);
      const len = 12 * s + v * reach;
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.lineTo(cx + Math.cos(a) * (radius + len), cy + Math.sin(a) * (radius + len));
      ctx.stroke();
    }
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 14 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const r = radius + reach;
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }
  if (el.style === "wave") {
    const points = 64;
    const step = width / (points - 1);
    ctx.lineWidth = 6 * s;
    ctx.lineJoin = "round";
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const v = level(f, frame - (points - 1 - i));
        const y = cy - side * (8 * s + v * (height / 2 - 10 * s)) * Math.sin((i / (points - 1)) * Math.PI);
        if (i === 0) ctx.moveTo(left, y);
        else ctx.lineTo(left + i * step, y);
      }
      ctx.globalAlpha = side === 1 ? 1 : 0.45;
      ctx.stroke();
    }
    ctx.restore();
    return { x: left, y: cy - height / 2, w: width, h: height };
  }
  const bars = 48;
  const barWidth = Math.max(4, (width / bars) * 0.55);
  const gap = (width - bars * barWidth) / (bars - 1);
  for (let i = 0; i < bars; i++) {
    const source =
      el.style === "mirror"
        ? frame - Math.abs(i - (bars - 1) / 2) * 1.6 // ripples out from the middle
        : frame - (bars - 1 - i) * 2; // scrolling right to left
    const v = level(f, Math.round(source));
    const h = 18 * s + v * (height - 18 * s);
    pill(ctx, left + i * (barWidth + gap), cy - h / 2, barWidth, h, barWidth / 2);
  }
  ctx.restore();
  return { x: left, y: cy - height / 2, w: width, h: height };
}

export type Photo = { image: CanvasImageSource; width: number; height: number };

function drawPhoto(f: Frame, el: ClipElement, photo: Photo | null): Box | null {
  if (!photo) return null;
  const { ctx, W, H } = f;
  const size = 520 * el.scale * (1 + level(f, f.frame) * 0.025);
  const x = el.x * W - size / 2;
  const y = el.y * H - size / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 50 * el.scale;
  ctx.shadowOffsetY = 18 * el.scale;
  ctx.fillStyle = "#000";
  pill(ctx, x, y, size, size, 36 * el.scale);
  ctx.shadowColor = "transparent";
  roundRect(ctx, x, y, size, size, 36 * el.scale);
  ctx.clip();
  const k = Math.max(size / photo.width, size / photo.height);
  ctx.drawImage(photo.image, x + (size - photo.width * k) / 2, y + (size - photo.height * k) / 2, photo.width * k, photo.height * k);
  ctx.restore();
  return { x, y, w: size, h: size };
}

function drawProgress(f: Frame, el: ClipElement): Box {
  const { ctx, W, H } = f;
  const width = Math.min(W * 0.78, 1500) * el.scale;
  const h = 12 * el.scale;
  const x = el.x * W - width / 2;
  const y = el.y * H - h / 2;
  ctx.save();
  // The track: light under a light bar (on a dark background), dark under a dark one.
  ctx.fillStyle = lightness(el.color) > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)";
  pill(ctx, x, y, width, h, h / 2);
  const fill = ctx.createLinearGradient(x, 0, x + width, 0);
  fill.addColorStop(0, el.color);
  fill.addColorStop(1, el.accent);
  ctx.fillStyle = fill;
  pill(ctx, x, y, Math.max(h, width * f.progress), h, h / 2);
  ctx.restore();
  // Taller than the bar, so it can be picked with a finger.
  return { x, y: y - 22 * el.scale, w: width, h: h + 44 * el.scale };
}

// --- Lyrics ---------------------------------------------------------------------------

/** How big the words are sung, at scale 1. */
const LYRIC_SIZE = 84;

function lyricWidth(f: Frame, el: ClipElement) {
  return Math.min(f.W * 0.88, 1500) / Math.max(0.6, el.scale);
}

/** Where the lyrics sit, whatever's being sung — the same box every frame, so it can be picked and dragged. */
function lyricsBox(f: Frame, el: ClipElement): Box {
  const size = LYRIC_SIZE * el.scale;
  const w = lyricWidth(f, el) * el.scale;
  const h = size * 1.2 * 3 + size * 1.4;
  return { x: el.x * f.W - w / 2, y: el.y * f.H - h / 2, w, h };
}

/** The sung part of `rows` in the accent colour, over the first `fill` (0..1) of their width. */
function fillSung(ctx: CanvasRenderingContext2D, rows: string[], cx: number, top: number, step: number, size: number, fill: number, el: ClipElement) {
  const widths = rows.map((r) => ctx.measureText(r).width);
  let left = widths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, fill));
  rows.forEach((row, i) => {
    const w = widths[i];
    const filled = Math.min(w, left);
    left -= filled;
    if (filled <= 0) return;
    const rtl = RTL.test(row);
    const y = top + step * (i + 0.5);
    const x0 = cx - w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rtl ? x0 + w - filled : x0, y - size * 0.75, filled, size * 1.5);
    ctx.clip();
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.fillStyle = el.accent;
    ctx.fillText(row, cx, y);
    ctx.restore();
  });
}

function drawLyrics(f: Frame, el: ClipElement, lyrics: ClipLine[] | undefined): Box {
  const box = lyricsBox(f, el);
  if (!lyrics?.length) return box;
  const { ctx, t } = f;
  const size = LYRIC_SIZE * el.scale;
  const step = size * 1.2;
  const cx = el.x * f.W;
  const cy = el.y * f.H;
  const maxWidth = lyricWidth(f, el) * el.scale;
  const { current, next } = clipLineAt(lyrics, t);
  const style = el.style === "lines" || el.style === "words" ? el.style : "karaoke";

  ctx.save();
  ctx.font = font(el, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const rowsOf = (text: string, lines = 3) => wrapText(ctx, text, maxWidth, lines);
  const fadeOf = (line: ClipLine) => Math.max(0, Math.min(1, (t - line.start + 0.2) / 0.25, (line.end - t) / 0.3));

  // The plate sits behind the whole block, so it doesn't jump with each line.
  if (el.plate && (current || next)) drawPlate(ctx, { x: box.x, y: box.y + size * 0.2, w: box.w, h: box.h - size * 0.4 }, el.color, size * 0.3);

  const outline = (row: string, x: number, y: number) => {
    if (el.plate) return;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.11);
    ctx.strokeStyle = standOff(el.color, 0.6);
    ctx.strokeText(row, x, y);
  };

  if (current) {
    const rows = rowsOf(current.text);
    const top = cy - size * 0.5 - (rows.length * step) / 2;
    const fill = (t - current.start) / Math.max(0.3, current.wipe);
    ctx.globalAlpha = fadeOf(current);
    if (style === "words") {
      // Each word appears as it's sung, popping in.
      const all = current.text.split(/\s+/).filter(Boolean);
      const shown = Math.max(1, Math.ceil(Math.max(0, Math.min(1, fill)) * all.length + 0.0001));
      const sungRows = rowsOf(all.slice(0, shown).join(" "));
      sungRows.forEach((row, i) => {
        const y = top + step * (i + 0.5);
        ctx.direction = RTL.test(row) ? "rtl" : "ltr";
        const lastRow = i === sungRows.length - 1;
        const pop = lastRow ? Math.min(1, ((fill * all.length) % 1) * 4 + 0.6) : 1;
        ctx.save();
        if (lastRow && pop < 1) {
          ctx.translate(cx, y);
          ctx.scale(pop, pop);
          ctx.translate(-cx, -y);
        }
        outline(row, cx, y);
        ctx.fillStyle = el.color;
        ctx.fillText(row, cx, y);
        ctx.restore();
      });
    } else {
      rows.forEach((row, i) => {
        const y = top + step * (i + 0.5);
        ctx.direction = RTL.test(row) ? "rtl" : "ltr";
        outline(row, cx, y);
        ctx.fillStyle = style === "lines" ? el.accent : el.color;
        ctx.fillText(row, cx, y);
      });
      if (style === "karaoke") fillSung(ctx, rows, cx, top, step, size, fill, el);
    }
    // The previous line, dim above (Lines style).
    if (style === "lines") {
      const before = [...lyrics].reverse().find((l) => l.start < current.start && l.end <= current.start + 0.01);
      if (before && t - before.end < 4) {
        ctx.globalAlpha = 0.35;
        ctx.font = font(el, size * 0.62, 600);
        const row = rowsOf(before.text, 1)[0] ?? "";
        const y = top - size * 0.75;
        ctx.direction = RTL.test(row) ? "rtl" : "ltr";
        outline(row, cx, y);
        ctx.fillStyle = el.color;
        ctx.fillText(row, cx, y);
        ctx.font = font(el, size);
      }
    }
    if (next && next.start - t < 8) {
      ctx.globalAlpha = Math.min(0.6, Math.max(0, (8 - (next.start - t)) / 2));
      ctx.font = font(el, size * 0.62, 600);
      const nextRows = wrapText(ctx, next.text, maxWidth, 2);
      nextRows.forEach((row, i) => {
        const y = top + rows.length * step + size * 0.75 + i * size * 0.75;
        ctx.direction = RTL.test(row) ? "rtl" : "ltr";
        outline(row, cx, y);
        ctx.fillStyle = el.color;
        ctx.fillText(row, cx, y);
      });
    }
  } else if (next) {
    // Before the first words (or in a gap): the next line, and a count of the seconds to it.
    const wait = next.start - t;
    if (wait < 6) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = el.accent;
      ctx.font = font(el, size * 0.5, 800);
      ctx.direction = "ltr";
      ctx.fillText("●".repeat(Math.max(1, Math.min(4, Math.ceil(wait)))), cx, cy - size * 0.9);
    }
    if (wait < 8) {
      ctx.globalAlpha = Math.min(0.75, Math.max(0, (8 - wait) / 2));
      ctx.font = font(el, size * 0.7, 600);
      wrapText(ctx, next.text, maxWidth, 2).forEach((row, i) => {
        const y = cy + i * size * 0.85;
        ctx.direction = RTL.test(row) ? "rtl" : "ltr";
        outline(row, cx, y);
        ctx.fillStyle = el.color;
        ctx.fillText(row, cx, y);
      });
    }
  }
  ctx.restore();
  return box;
}

// --- A frame ----------------------------------------------------------------------

export type ClipContent = {
  /** The words to show, timed from the clip's start (none: the lyrics element shows nothing). */
  lyrics?: ClipLine[];
  /** The user's photo, for the background or the photo element. */
  photo?: Photo | null;
};

/**
 * One frame of the clip, `t` seconds in: every visible element of `design`
 * where it was put. Returns where each one was drawn (null: nothing to
 * draw), so the editor can let them be picked and moved.
 */
export function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  design: ClipDesign,
  content: ClipContent,
  { levels, t, progress, lead = 0 }: { levels: Float32Array; t: number; progress: number; lead?: number }
): Partial<Record<ElementId, Box | null>> {
  const { width: W, height: H } = CLIP_FORMATS[design.format];
  const f: Frame = { ctx, W, H, levels, frame: Math.floor(t * FPS), t, progress, lead };
  const photo = content.photo ?? null;
  ctx.save();
  ctx.textAlign = "center";
  drawBackground(f, design, photo);
  const boxes: Partial<Record<ElementId, Box | null>> = {};
  const e = design.elements;
  for (const id of ELEMENT_ORDER) {
    const el = e[id];
    if (!el.visible) continue;
    const s = el.scale;
    switch (id) {
      case "brand":
        boxes.brand = drawBrand(f, el);
        break;
      case "title":
        boxes.title = drawWords(f, el, 76 * s, 2, 0.86);
        break;
      case "artist":
        boxes.artist = drawWords(f, el, 44 * s, 1, 0.8);
        break;
      case "vocalBy":
      case "beatBy":
        boxes[id] = drawCredit(f, el, CREDIT_LABELS[id]);
        break;
      case "caption":
        boxes.caption = drawWords(f, el, 52 * s, 3, 0.8);
        break;
      case "link":
        boxes.link = drawWords(f, el, 40 * s, 1, 0.9);
        break;
      case "visualizer":
        boxes.visualizer = drawVisualizer(f, el);
        break;
      case "photo":
        boxes.photo = drawPhoto(f, el, photo);
        break;
      case "lyrics":
        boxes.lyrics = drawLyrics(f, el, content.lyrics);
        break;
      case "progress":
        boxes.progress = drawProgress(f, el);
        break;
    }
  }
  ctx.restore();
  return boxes;
}

/** Sizes `canvas` for `design` (only when it changes — resizing clears it and costs). */
function fit(canvas: HTMLCanvasElement, design: ClipDesign, scale = 1) {
  const { width, height } = CLIP_FORMATS[design.format];
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

/** A still of the clip at `t` seconds in, before it's made (with made-up levels: the mix isn't rendered yet). */
export function drawClipPreview(
  canvas: HTMLCanvasElement,
  design: ClipDesign,
  content: ClipContent,
  t: number,
  length: number,
  levels: Float32Array = previewLevels(length)
) {
  fit(canvas, design);
  const ctx = canvas.getContext("2d");
  if (!ctx) return {};
  return drawClipFrame(ctx, design, content, { levels, t, progress: length > 0 ? Math.min(1, t / length) : 0, lead: PREVIEW_LEAD });
}

/** A small picture of a design (a template's thumbnail), `scale` of full size. */
export function drawClipThumb(canvas: HTMLCanvasElement, design: ClipDesign, content: ClipContent, scale: number) {
  fit(canvas, design, scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.scale(scale, scale);
  drawClipFrame(ctx, design, content, { levels: previewLevels(2), t: 1.2, progress: 0.4, lead: PREVIEW_LEAD });
  ctx.restore();
}

export type SocialClip = { blob: Blob; extension: "mp4" | "webm"; mimeType: string };

/**
 * Makes the clip. `audioContext` must be created (and resumed) inside the
 * tap that started this — iOS won't start it later.
 */
export async function makeSocialClip({
  audioContext,
  start,
  end,
  design,
  content,
  canvas: shown,
  onProgress,
  signal,
}: {
  audioContext: AudioContext;
  start: number;
  end: number;
  design: ClipDesign;
  content: ClipContent;
  /** Draw on this canvas (shown in the editor, so the video can be watched as it's made); else one of its own. */
  canvas?: HTMLCanvasElement;
  onProgress: (stage: string, fraction: number) => void;
  signal: AbortSignal;
}): Promise<SocialClip> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("This browser can't record video — try Chrome or Safari");

  onProgress("Rendering the mix…", 0);
  const mix = await renderMixdown({ span: { start, end }, tailSeconds: 0 });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const levels = frameLevels(mix);

  const canvas = shown ?? document.createElement("canvas");
  fit(canvas, design);
  const draw = canvas.getContext("2d")!;
  drawClipFrame(draw, design, content, { levels, t: 0, progress: 0 });

  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = mix;
  source.connect(destination);

  const { width, height } = CLIP_FORMATS[design.format];
  const video = canvas.captureStream(FPS);
  const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  // About 8 Mbps at 1080×1920 — what the apps re-encode from without visible loss.
  const bits = Math.round((width * height * FPS * 0.13) / 1000) * 1000;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bits, audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  recorder.start(1000);
  const startedAt = audioContext.currentTime + 0.1;
  source.start(startedAt);

  // A hidden page stops drawing frames (no animation frames) while the
  // sound would play on: the video would freeze and fall behind. So the
  // recording and the soundtrack wait together, and carry on together.
  // The clock is the AudioContext's, which stands still while suspended.
  const onVisibility = () => {
    if (document.hidden) {
      if (recorder.state === "recording") recorder.pause();
      void audioContext.suspend().catch(() => {});
    } else {
      void audioContext.resume().catch(() => {});
      if (recorder.state === "paused") recorder.resume();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  await new Promise<void>((resolve, reject) => {
    let raf = 0;
    // The frame loop runs on animation frames, which stop while hidden; a
    // timer notices a cancel then too.
    const watch = setInterval(() => {
      if (signal.aborted) {
        cancelAnimationFrame(raf);
        clearInterval(watch);
        reject(new DOMException("Cancelled", "AbortError"));
      }
    }, 250);
    const tick = () => {
      if (signal.aborted) {
        cancelAnimationFrame(raf);
        clearInterval(watch);
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const elapsed = Math.max(0, audioContext.currentTime - startedAt);
      const progress = Math.min(1, elapsed / mix.duration);
      drawClipFrame(draw, design, content, { levels, t: elapsed, progress });
      onProgress(audioContext.state === "suspended" ? "Paused — come back to this page to finish" : "Recording the video…", progress);
      if (elapsed >= mix.duration) {
        clearInterval(watch);
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }).finally(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      source.stop();
    } catch {
      // already ended
    }
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  });
  await stopped;

  return {
    blob: new Blob(chunks, { type: mimeType.split(";")[0] }),
    extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
    mimeType,
  };
}
