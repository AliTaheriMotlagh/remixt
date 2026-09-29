"use client";

import { useEffect, useRef } from "react";

type WaveformProps = {
  peaks: number[];
  progress?: number; // 0..1
  color: string;
  progressColor?: string;
  height?: number;
  onSeek?: (fraction: number) => void;
  className?: string;
};

/**
 * Canvas can't read CSS custom properties, so a colour like `var(--vocals)`
 * — or `var(--vocals)55` with a hex alpha tacked on — is rejected by
 * `fillStyle` and the bars silently fall back to black. Resolve the
 * variable against the element first, then re-apply the alpha.
 */
function resolveColor(color: string, el: Element): string {
  const match = color.match(/^var\((--[\w-]+)\)([0-9a-f]{2})?$/i);
  if (!match) return color;
  const value = getComputedStyle(el).getPropertyValue(match[1]).trim();
  if (!value) return color;
  const alpha = match[2];
  if (!alpha) return value;
  if (/^#[0-9a-f]{6}$/i.test(value)) return `${value}${alpha}`;
  return value;
}

/** Draws the bars in one colour, sized to the container. */
function drawBars(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  peaks: number[],
  color: string,
  height: number
) {
  const dpr = window.devicePixelRatio || 1;
  const width = container.clientWidth;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (peaks.length === 0) return;

  const barCount = Math.min(peaks.length, Math.max(24, Math.floor(width / 3)));
  const step = peaks.length / barCount;
  const barWidth = Math.max(1.5, width / barCount - 1);
  const radius = Math.min(barWidth / 2, 1.5);
  const mid = height / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < barCount; i++) {
    // Take the loudest peak in each bar's slice rather than a single
    // sample, so transients don't disappear when the bars are wide.
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, peaks[j] ?? 0);
    // A gentle curve lifts the quiet passages so the shape reads at
    // small heights instead of collapsing to a flat line.
    const shaped = Math.pow(peak, 0.8);
    const barHeight = Math.max(2, shaped * (height - 4));
    ctx.roundRect((i / barCount) * width, mid - barHeight / 2, barWidth, barHeight, radius);
  }
  ctx.fill();
}

/**
 * The bars are drawn once (again only on resize or new data), in the base
 * colour and, on a second canvas, in the played colour. Progress just
 * moves a CSS clip over the second one — playback updates it every frame,
 * and redrawing the canvases that often made the Studio lag.
 */
export default function Waveform({
  peaks,
  progress = 0,
  color,
  progressColor,
  height = 56,
  onSeek,
  className,
}: WaveformProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastWidth = -1;
    const draw = () => {
      const width = container.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      if (baseRef.current) drawBars(baseRef.current, container, peaks, resolveColor(color, container), height);
      if (playedRef.current && progressColor) {
        drawBars(playedRef.current, container, peaks, resolveColor(progressColor, container), height);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, color, progressColor, height]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(1, Math.max(0, fraction)));
  }

  const hidden = (1 - Math.min(1, Math.max(0, progress))) * 100;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`relative w-full ${onSeek ? "cursor-pointer" : ""} ${className ?? ""}`}
      style={{ height }}
    >
      <canvas ref={baseRef} className="absolute inset-0" />
      {progressColor && (
        <canvas
          ref={playedRef}
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${hidden}% 0 0)` }}
        />
      )}
    </div>
  );
}
