"use client";

import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Whenever a stem preview is playing anywhere in the app, this bar is on
// screen with a stop button — previews can no longer get stranded with no
// way to silence them.
export default function PreviewBar() {
  const state = usePreviewState();

  if (!state.current) return null;

  const accent = state.current.kind === "vocals" ? "var(--vocals)" : "var(--beat)";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <button
          onClick={() => previewPlayer.toggle(state.current!)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
          aria-label={state.playing ? "Pause preview" : "Resume preview"}
        >
          {state.playing ? "⏸" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{state.current.title}</span>
            <span className="hidden truncate text-xs text-muted sm:inline">
              {state.current.artist} · {state.current.kind === "vocals" ? "vocals" : "beat"}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 cursor-pointer overflow-hidden rounded-full bg-surface-raised"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              previewPlayer.seek((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${state.progress * 100}%`, background: accent }}
            />
          </div>
        </div>

        <span className="hidden shrink-0 font-mono text-xs text-muted tabular-nums sm:inline">
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </span>

        <button
          onClick={() => previewPlayer.stop()}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger hover:text-danger"
        >
          ■ Stop
        </button>
      </div>
    </div>
  );
}
