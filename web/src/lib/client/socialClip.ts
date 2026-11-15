"use client";

import { renderMixdown } from "./mixdown";
import { MARK_BARS, MARK_BAR_WIDTH, MARK_GRADIENT, MARK_TILE_RADIUS } from "@/lib/brand";
import { clipLineAt, MAX_CLIP_SECONDS, type ClipLine } from "@/lib/clipLyrics";

// A vertical (9:16) video of a stretch of the mix, for Reels, TikTok,
// Shorts and Stories: the title and artist over the Remixt gradient, a
// waveform that moves with the music, a progress bar and the link. Drawn
// on a canvas and recorded in real time with MediaRecorder — so a 30 s
// clip takes 30 s to make — with the rendered mix as its soundtrack. With
// timed lyrics, the words are sung across the middle, karaoke-style: the
// line being sung fills in with colour (right to left for Persian), the
// next one waits under it.

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
export { MAX_CLIP_SECONDS };
const SANS = "system-ui, -apple-system, 'Segoe UI', Tahoma, 'Vazirmatn', sans-serif";
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

/** The best video format this browser can record: MP4 where it can (posts everywhere), else WebM. */
function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
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

/** Loudness per video frame, 0..1, so the bars can follow the music. */
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
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

/** A rounded bar — plain rectangles where the browser has no roundRect (older Safari). */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

/** The Remixt mark (lib/brand.ts), drawn straight onto the canvas at `size` px with its top-left at x, y. */
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

export type ClipLook = {
  title: string;
  artist: string;
  link: string;
  /** The words to show, timed from the clip's start; none for the title-and-bars look. */
  lyrics?: ClipLine[];
};

/** The words being sung, filling in with colour over `fill` (0..1) of their width, wrapped onto up to `maxLines`. */
function drawSungLine(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, fill: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${size}px ${SANS}`;
  const rtl = RTL.test(text);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "center";
  const rows = wrapText(ctx, text, WIDTH - 140, 3);
  const widths = rows.map((r) => ctx.measureText(r).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let left = total * Math.max(0, Math.min(1, fill));
  const lineHeight = size * 1.18;
  const top = y - ((rows.length - 1) * lineHeight) / 2;
  rows.forEach((row, i) => {
    const ry = top + i * lineHeight;
    const w = widths[i];
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(row, WIDTH / 2, ry);
    ctx.shadowBlur = 0;
    const filled = Math.min(w, left);
    left -= filled;
    if (filled <= 0) return;
    // The sung part in colour, from where the line starts reading.
    ctx.save();
    ctx.beginPath();
    const x0 = WIDTH / 2 - w / 2;
    ctx.rect(rtl ? x0 + w - filled : x0, ry - size, filled, size * 1.4);
    ctx.clip();
    const sung = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    sung.addColorStop(0, "#f472b6");
    sung.addColorStop(1, "#22d3ee");
    ctx.fillStyle = sung;
    ctx.fillText(row, WIDTH / 2, ry);
    ctx.restore();
  });
  ctx.restore();
  return rows.length * lineHeight;
}

/** The lyrics at `t` seconds into the clip: the line being sung, big, and the next under it. */
function drawLyrics(ctx: CanvasRenderingContext2D, lyrics: ClipLine[], t: number) {
  const { current, next } = clipLineAt(lyrics, t);
  const mid = HEIGHT * 0.6;
  if (current) {
    const fadeIn = Math.min(1, (t - current.start + 0.2) / 0.25);
    const fadeOut = Math.min(1, (current.end - t) / 0.3);
    const fill = (t - current.start) / Math.max(0.3, current.wipe);
    const height = drawSungLine(ctx, current.text, mid, 84, fill, Math.max(0, Math.min(fadeIn, fadeOut)));
    if (next) drawNextLine(ctx, next.text, mid + height / 2 + 70, next.start - t);
  } else if (next) {
    // Before the first words (or in a gap): the next line, and a count of the seconds to it.
    const wait = next.start - t;
    if (wait < 6) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(244,114,182,0.9)";
      ctx.font = `bold 44px ${SANS}`;
      ctx.fillText("●".repeat(Math.max(1, Math.min(4, Math.ceil(wait)))), WIDTH / 2, mid - 40);
      ctx.restore();
    }
    drawNextLine(ctx, next.text, mid + 40, wait);
  }
}

function drawNextLine(ctx: CanvasRenderingContext2D, text: string, y: number, wait: number) {
  if (wait > 8) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.6, Math.max(0, (8 - wait) / 2));
  ctx.font = `600 54px ${SANS}`;
  ctx.direction = RTL.test(text) ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = "#e5e5f0";
  const rows = wrapText(ctx, text, WIDTH - 180, 2);
  rows.forEach((row, i) => ctx.fillText(row, WIDTH / 2, y + i * 64));
  ctx.restore();
}

/** One frame of the clip, `t` seconds in. Exported to show a still preview before making it. */
export function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  { title, artist, link, lyrics, levels, t, progress }: ClipLook & { levels: Float32Array; t: number; progress: number }
) {
  const frame = Math.floor(t * FPS);
  const words = !!lyrics?.length;
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#1b0b24");
  bg.addColorStop(0.5, "#0a0a0f");
  bg.addColorStop(1, "#04202a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A soft glow that breathes with the music.
  const level = levels[Math.min(levels.length - 1, frame)] ?? 0;
  const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, 50, WIDTH / 2, HEIGHT * 0.45, 700 + level * 250);
  glow.addColorStop(0, `rgba(236, 72, 153, ${0.25 + level * 0.3})`);
  glow.addColorStop(0.6, "rgba(6, 182, 212, 0.08)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Bars: the last couple of seconds of loudness, scrolling right to left — smaller, higher up, with words to show.
  const bars = 48;
  const barWidth = 14;
  const gap = (WIDTH - 160 - bars * barWidth) / (bars - 1);
  const mid = words ? HEIGHT * 0.32 : HEIGHT * 0.45;
  const reach = words ? 300 : 520;
  const bar = ctx.createLinearGradient(80, 0, WIDTH - 80, 0);
  bar.addColorStop(0, "#ec4899");
  bar.addColorStop(1, "#06b6d4");
  ctx.fillStyle = bar;
  for (let i = 0; i < bars; i++) {
    const source = frame - (bars - 1 - i) * 2;
    const v = source >= 0 ? (levels[source] ?? 0) : 0;
    const h = 24 + v * reach;
    const x = 80 + i * (barWidth + gap);
    pill(ctx, x, mid - h / 2, barWidth, h, barWidth / 2);
  }

  ctx.textAlign = "center";
  if (words) {
    // The song's name small under the brand; the words get the middle.
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 58px ${SANS}`;
    ctx.direction = RTL.test(title) ? "rtl" : "ltr";
    ctx.fillText(wrapText(ctx, title, WIDTH - 200, 1)[0] ?? "", WIDTH / 2, 430);
    ctx.fillStyle = "#c4c4d4";
    ctx.font = `40px ${SANS}`;
    ctx.direction = RTL.test(artist) ? "rtl" : "ltr";
    ctx.fillText(artist, WIDTH / 2, 490);
    ctx.direction = "ltr";
    drawLyrics(ctx, lyrics!, t);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 96px ${SANS}`;
    ctx.direction = RTL.test(title) ? "rtl" : "ltr";
    const lines = wrapText(ctx, title, WIDTH - 160, 3);
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, 1180 + i * 110));
    ctx.fillStyle = "#c4c4d4";
    ctx.font = `56px ${SANS}`;
    ctx.direction = RTL.test(artist) ? "rtl" : "ltr";
    ctx.fillText(`remix by ${artist}`, WIDTH / 2, 1180 + lines.length * 110 + 30);
    ctx.direction = "ltr";
  }

  ctx.direction = "ltr";
  // Progress.
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  pill(ctx, 120, 1620, WIDTH - 240, 12, 6);
  ctx.fillStyle = bar;
  pill(ctx, 120, 1620, Math.max(12, (WIDTH - 240) * progress), 12, 6);

  // Brand and link.
  drawMark(ctx, WIDTH / 2 - 60, 70, 120);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Remixt", WIDTH / 2, 262);
  ctx.fillStyle = "#a1a1b5";
  ctx.font = "40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("made on Remixt — remix any song", WIDTH / 2, 327);
  ctx.fillStyle = "#e5e5f0";
  ctx.font = "44px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(link, WIDTH / 2, 1760);
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
  title,
  artist,
  link,
  lyrics,
  canvas: shown,
  onProgress,
  signal,
}: ClipLook & {
  audioContext: AudioContext;
  start: number;
  end: number;
  /** Draw on this canvas (shown in the dialog, so the video can be watched as it's made); else one of its own. */
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
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const draw = canvas.getContext("2d")!;
  const look = { title, artist, link, lyrics, levels };
  drawClipFrame(draw, { ...look, t: 0, progress: 0 });

  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = mix;
  source.connect(destination);

  const video = canvas.captureStream(FPS);
  const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  recorder.start(1000);
  const startedAt = audioContext.currentTime + 0.1;
  source.start(startedAt);

  await new Promise<void>((resolve, reject) => {
    let raf = 0;
    const tick = () => {
      if (signal.aborted) {
        cancelAnimationFrame(raf);
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const elapsed = Math.max(0, audioContext.currentTime - startedAt);
      const progress = Math.min(1, elapsed / mix.duration);
      drawClipFrame(draw, { ...look, t: elapsed, progress });
      onProgress("Recording the video…", progress);
      if (elapsed >= mix.duration) {
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }).finally(() => {
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

/** A still of the clip at `t` seconds in, before it's made (flat bars: the mix isn't rendered yet). */
export function drawClipPreview(canvas: HTMLCanvasElement, look: ClipLook, t: number, length: number) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawClipFrame(ctx, { ...look, levels: new Float32Array(0), t, progress: length > 0 ? Math.min(1, t / length) : 0 });
}
