"use client";

import { useRef } from "react";
import { audioEngine } from "@/lib/client/audioEngine";
import { beatLength, useStudioStore, viewDuration } from "@/lib/client/studioStore";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The project ruler: bar/beat grid at the project tempo, a draggable
 * playhead, and a loop region you set by dragging across the ruler.
 */
export default function StudioTimeline() {
  const projectDuration = useStudioStore((s) => s.duration);
  const playhead = useStudioStore((s) => s.playhead);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const snapToGrid = useStudioStore((s) => s.snapToGrid);
  const setLoop = useStudioStore((s) => s.setLoop);
  const ref = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

  if (projectDuration <= 0) return null;

  const duration = viewDuration(projectDuration, projectBpm);
  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const barCount = Math.ceil(duration / bar);
  // Thin the labels out on long projects so they stay readable.
  const labelEvery = Math.max(1, Math.ceil(barCount / 32));

  function timeAt(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    const fraction = (clientX - rect.left) / rect.width;
    const seconds = Math.max(0, Math.min(1, fraction)) * duration;
    if (!snapToGrid) return seconds;
    return Math.round(seconds / beat) * beat;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const time = timeAt(e.clientX);
    dragStart.current = time;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const time = timeAt(e.clientX);
    if (Math.abs(time - dragStart.current) < beat / 2) return;
    // Dragging across the ruler defines the loop region.
    setLoop({
      enabled: true,
      start: Math.min(dragStart.current, time),
      end: Math.max(dragStart.current, time),
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;
    const time = timeAt(e.clientX);
    // A click (rather than a drag) just moves the playhead.
    if (Math.abs(time - start) < beat / 2) audioEngine.seek(time);
  }

  const showLoop = loopEnd > loopStart;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
        <span>Timeline · {projectBpm.toFixed(1)} BPM</span>
        <span>
          {snapToGrid ? "Snap: beat" : "Snap: off"} · drag here to set a loop
        </span>
      </div>
      <div
        ref={ref}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-10 cursor-pointer select-none overflow-hidden rounded-lg bg-background"
      >
        {showLoop && (
          <div
            className={`absolute inset-y-0 border-x ${
              loopEnabled
                ? "border-brand-strong bg-brand/20"
                : "border-border bg-surface-raised/40"
            }`}
            style={{
              left: `${(loopStart / duration) * 100}%`,
              width: `${((loopEnd - loopStart) / duration) * 100}%`,
            }}
          />
        )}

        {Array.from({ length: barCount }, (_, i) => {
          const time = i * bar;
          const left = (time / duration) * 100;
          const labelled = i % labelEvery === 0;
          return (
            <div key={i}>
              <div
                className="absolute top-0 h-full w-px"
                style={{ left: `${left}%`, background: labelled ? "var(--border)" : "transparent" }}
              />
              {labelled && (
                <span
                  className="pointer-events-none absolute top-0.5 pl-1 font-mono text-[9px] text-muted"
                  style={{ left: `${left}%` }}
                >
                  {i + 1}
                </span>
              )}
            </div>
          );
        })}

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground"
          style={{ left: `${(playhead / duration) * 100}%` }}
        >
          <span className="absolute -top-0 -left-[3px] h-1.5 w-1.5 rounded-full bg-foreground" />
        </div>

        <span className="pointer-events-none absolute bottom-0.5 right-1.5 font-mono text-[9px] text-muted">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
