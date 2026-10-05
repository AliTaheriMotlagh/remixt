"use client";

import { useEffect, useRef } from "react";

/**
 * A static waveform from peaks, with an optional moving playhead. The
 * playhead is moved straight on the element every frame, so playing doesn't
 * re-render React.
 */
export default function Wave({
  peaks,
  color,
  height = 56,
  dim = false,
  fraction,
  label,
}: {
  peaks: Float32Array;
  color: string;
  height?: number;
  dim?: boolean;
  /** Returns 0..1 while playing; null hides the playhead. */
  fraction?: (() => number) | null;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.floor(height * dpr);
      const g = el.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, w, height);
      g.fillStyle = color;
      g.globalAlpha = dim ? 0.25 : 0.9;
      const mid = height / 2;
      const bars = Math.min(peaks.length, Math.floor(w / 2));
      const per = peaks.length / bars;
      for (let i = 0; i < bars; i++) {
        let max = 0;
        for (let k = Math.floor(i * per); k < Math.floor((i + 1) * per); k++) max = Math.max(max, peaks[k]);
        const h = Math.max(1, Math.min(1, max * 1.1) * (height - 2));
        g.fillRect((i / bars) * w, mid - h / 2, Math.max(1, w / bars - 0.5), h);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, color, height, dim]);

  useEffect(() => {
    const h = head.current;
    if (!h) return;
    if (!fraction) {
      h.style.display = "none";
      return;
    }
    h.style.display = "block";
    let raf = 0;
    const tick = () => {
      h.style.left = `${Math.min(1, Math.max(0, fraction())) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fraction]);

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-md bg-background/60" style={{ height }} role="img" aria-label={label ?? "Waveform"}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div ref={head} className="pointer-events-none absolute inset-y-0 hidden w-0.5 bg-white/90" />
    </div>
  );
}
