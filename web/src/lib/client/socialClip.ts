"use client";

import { renderMixdown } from "./mixdown";

// A vertical (9:16) video of a stretch of the mix, for Reels, TikTok,
// Shorts and Stories: the title and artist over the Remixt gradient, a
// waveform that moves with the music, a progress bar and the link. Drawn
// on a canvas and recorded in real time with MediaRecorder — so a 30 s
// clip takes 30 s to make — with the rendered mix as its soundtrack.

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
export const MAX_CLIP_SECONDS = 60;

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

function drawFrame(
  ctx: CanvasRenderingContext2D,
  { title, artist, link, levels, frame, progress }: {
    title: string;
    artist: string;
    link: string;
    levels: Float32Array;
    frame: number;
    progress: number;
  }
) {
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

  // Bars: the last couple of seconds of loudness, scrolling right to left.
  const bars = 48;
  const barWidth = 14;
  const gap = (WIDTH - 160 - bars * barWidth) / (bars - 1);
  const mid = HEIGHT * 0.45;
  const bar = ctx.createLinearGradient(80, 0, WIDTH - 80, 0);
  bar.addColorStop(0, "#ec4899");
  bar.addColorStop(1, "#06b6d4");
  ctx.fillStyle = bar;
  for (let i = 0; i < bars; i++) {
    const source = frame - (bars - 1 - i) * 2;
    const v = source >= 0 ? (levels[source] ?? 0) : 0;
    const h = 24 + v * 520;
    const x = 80 + i * (barWidth + gap);
    pill(ctx, x, mid - h / 2, barWidth, h, barWidth / 2);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px system-ui, -apple-system, Segoe UI, sans-serif";
  const lines = wrapText(ctx, title, WIDTH - 160, 3);
  lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, 1180 + i * 110));
  ctx.fillStyle = "#c4c4d4";
  ctx.font = "56px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(`remix by ${artist}`, WIDTH / 2, 1180 + lines.length * 110 + 30);

  // Progress.
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  pill(ctx, 120, 1620, WIDTH - 240, 12, 6);
  ctx.fillStyle = bar;
  pill(ctx, 120, 1620, Math.max(12, (WIDTH - 240) * progress), 12, 6);

  // Brand and link.
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Remixt", WIDTH / 2, 230);
  ctx.fillStyle = "#a1a1b5";
  ctx.font = "40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("made on Remixt — remix any song", WIDTH / 2, 295);
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
  onProgress,
  signal,
}: {
  audioContext: AudioContext;
  start: number;
  end: number;
  title: string;
  artist: string;
  link: string;
  onProgress: (stage: string, fraction: number) => void;
  signal: AbortSignal;
}): Promise<SocialClip> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("This browser can't record video — try Chrome or Safari");

  onProgress("Rendering the mix…", 0);
  const mix = await renderMixdown({ span: { start, end }, tailSeconds: 0 });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const levels = frameLevels(mix);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const draw = canvas.getContext("2d")!;
  drawFrame(draw, { title, artist, link, levels, frame: 0, progress: 0 });

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
      drawFrame(draw, { title, artist, link, levels, frame: Math.floor(elapsed * FPS), progress });
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
