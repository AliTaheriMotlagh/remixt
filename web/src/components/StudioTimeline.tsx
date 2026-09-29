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
/** Follows playback on its own, so the ruler's grid isn't re-rendered every frame. */
function RulerPlayhead({ duration }: { duration: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground"
      style={{ left: `${(playhead / duration) * 100}%` }}
    >
      <span className="absolute -top-0 -left-[3px] h-1.5 w-1.5 rounded-full bg-foreground" />
    </div>
  );
}

/**
 * Named sections ("chorus 0:42–1:05"): save the loop region as one, then
 * tap a section to loop it and jump there. Exports of "the loop" follow.
 */
function Sections({ duration }: { duration: number }) {
  const markers = useStudioStore((s) => s.markers);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const addMarker = useStudioStore((s) => s.addMarker);
  const updateMarker = useStudioStore((s) => s.updateMarker);
  const removeMarker = useStudioStore((s) => s.removeMarker);
  const setLoop = useStudioStore((s) => s.setLoop);
  const hasLoop = loopEnd > loopStart;
  const saved = markers.some((m) => Math.abs(m.start - loopStart) < 0.01 && Math.abs(m.end - loopEnd) < 0.01);

  function jump(start: number, end: number) {
    setLoop({ enabled: true, start, end });
    audioEngine.seek(start);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      {markers.map((m, i) => {
        const active = loopEnabled && Math.abs(m.start - loopStart) < 0.01 && Math.abs(m.end - loopEnd) < 0.01;
        return (
          <span
            key={m.id}
            className={`flex items-center overflow-hidden rounded-full border ${
              active ? "border-brand bg-brand/20" : "border-border bg-background"
            }`}
          >
            <button
              onClick={() => jump(m.start, m.end)}
              onDoubleClick={() => {
                const label = window.prompt("Name this section", m.label)?.trim();
                if (label) updateMarker(m.id, { label: label.slice(0, 40) });
              }}
              className="py-0.5 pl-2.5 pr-1.5"
              title={`${formatTime(m.start)}–${formatTime(m.end)} · tap to loop it · double-click to rename`}
            >
              <span className="mr-1 text-muted">{i + 1}</span>
              {m.label}
            </button>
            <button
              onClick={() => removeMarker(m.id)}
              className="px-1.5 py-0.5 text-muted hover:text-danger"
              aria-label={`Remove section ${m.label}`}
            >
              ✕
            </button>
          </span>
        );
      })}
      {hasLoop && !saved && (
        <button
          onClick={() => {
            const label = window.prompt("Name this section (e.g. chorus, drop, verse 2)", `Section ${markers.length + 1}`);
            if (label?.trim()) addMarker({ label: label.trim().slice(0, 40), start: loopStart, end: loopEnd });
          }}
          className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-muted hover:border-brand hover:text-foreground"
        >
          ★ save loop as a section
        </button>
      )}
      {markers.length === 0 && !hasLoop && duration > 0 && (
        <span className="text-muted">Drag across the ruler to mark a loop, then save it as a section.</span>
      )}
    </div>
  );
}

export default function StudioTimeline() {
  const projectDuration = useStudioStore((s) => s.duration);
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
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted">
        <span className="shrink-0">Timeline · {projectBpm.toFixed(1)} BPM</span>
        <span className="truncate">
          {snapToGrid ? "Snap: beat" : "Snap: off"}
          <span className="hidden sm:inline"> · drag here to set a loop</span>
        </span>
      </div>
      <div
        ref={ref}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
        // Sideways drags mark the loop; up and down still scroll the page.
        className="relative h-10 cursor-pointer touch-pan-y select-none overflow-hidden rounded-lg bg-background"
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

        <RulerPlayhead duration={duration} />

        <span className="pointer-events-none absolute bottom-0.5 right-1.5 font-mono text-[9px] text-muted">
          {formatTime(duration)}
        </span>
      </div>
      <Sections duration={duration} />
    </div>
  );
}
