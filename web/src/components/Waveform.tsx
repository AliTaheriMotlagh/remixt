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

export default function Waveform({
  peaks,
  progress = 0,
  color,
  progressColor,
  height = 56,
  onSeek,
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const draw = () => {
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

      const base = resolveColor(color, container);
      const played = progressColor ? resolveColor(progressColor, container) : base;

      const barCount = Math.min(peaks.length, Math.max(24, Math.floor(width / 3)));
      const step = peaks.length / barCount;
      const barWidth = Math.max(1.5, width / barCount - 1);
      const radius = Math.min(barWidth / 2, 1.5);
      const mid = height / 2;
      const progressX = width * progress;

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
        const x = (i / barCount) * width;
        ctx.fillStyle = x <= progressX && progressColor ? played : base;
        ctx.beginPath();
        ctx.roundRect(x, mid - barHeight / 2, barWidth, barHeight, radius);
        ctx.fill();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, progress, color, progressColor, height]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(1, Math.max(0, fraction)));
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`relative w-full ${onSeek ? "cursor-pointer" : ""} ${className ?? ""}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
