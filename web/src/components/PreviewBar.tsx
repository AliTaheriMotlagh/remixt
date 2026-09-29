"use client";

import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { kindColor, kindLabel } from "@/lib/stemKinds";

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

  const accent = kindColor(state.current.kind);

  return (
    <div
      data-previewbar
      className="fixed inset-x-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md"
      style={{
        // Sits on top of the phone tab bar; with no tab bar, clear of the home indicator.
        bottom: "var(--tabbar-h)",
        paddingBottom: "max(0px, calc(env(safe-area-inset-bottom) - var(--tabbar-h)))",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          onClick={() => previewPlayer.toggle(state.current!)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
          aria-label={state.playing ? "Pause preview" : "Resume preview"}
        >
          {state.playing ? "⏸" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{state.current.title}</span>
            <span className="hidden truncate text-xs text-muted sm:inline">
              {state.current.artist} · {kindLabel(state.current.kind).toLowerCase()}
            </span>
          </div>
          {/* A thin bar with a taller invisible hit area, so it's easy to tap. */}
          <div
            className="-my-1.5 cursor-pointer py-1.5"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              previewPlayer.seek((e.clientX - rect.left) / rect.width);
            }}
          >
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full"
                style={{ width: `${state.progress * 100}%`, background: accent }}
              />
            </div>
          </div>
        </div>

        <span className="hidden shrink-0 font-mono text-xs text-muted tabular-nums sm:inline">
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </span>

        <button
          onClick={() => previewPlayer.stop()}
          className="flex h-10 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors hover:border-danger hover:text-danger"
          aria-label="Stop preview"
        >
          ■<span className="ml-1 hidden sm:inline">Stop</span>
        </button>
      </div>
    </div>
  );
}
