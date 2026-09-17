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

      const barCount = Math.min(peaks.length, Math.max(24, Math.floor(width / 3)));
      const step = peaks.length / barCount;
      const barWidth = Math.max(1.5, width / barCount - 1);
      const mid = height / 2;
      const progressX = width * progress;

      for (let i = 0; i < barCount; i++) {
        const peak = peaks[Math.floor(i * step)] ?? 0;
        const barHeight = Math.max(2, peak * (height - 6));
        const x = (i / barCount) * width;
        ctx.fillStyle = x <= progressX && progressColor ? progressColor : color;
        ctx.fillRect(x, mid - barHeight / 2, barWidth, barHeight);
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
