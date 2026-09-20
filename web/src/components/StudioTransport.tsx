"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { audioEngine } from "@/lib/client/audioEngine";
import { exportMixdown } from "@/lib/client/mixdown";
import { lanesToPayload } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import type { User } from "@/lib/auth";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StudioTransport({
  user,
  remixId,
  defaultTitle,
}: {
  user: User | null;
  remixId: string | null;
  defaultTitle?: string;
}) {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const lanes = useStudioStore((s) => s.lanes);
  const masterVolume = useStudioStore((s) => s.masterVolume);
  const metronome = useStudioStore((s) => s.metronome);
  const snapToGrid = useStudioStore((s) => s.snapToGrid);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const clearLanes = useStudioStore((s) => s.clearLanes);
  const setMasterVolume = useStudioStore((s) => s.setMasterVolume);
  const toggleMetronome = useStudioStore((s) => s.toggleMetronome);
  const toggleSnap = useStudioStore((s) => s.toggleSnap);
  const setLoop = useStudioStore((s) => s.setLoop);

  const [showSave, setShowSave] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const router = useRouter();

  const hasLoop = loopEnd > loopStart;

  async function handlePlayPause() {
    if (lanes.length === 0) return;
    if (isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.play();
    }
  }

  async function handleExport(range: "full" | "loop") {
    setExportError(null);
    setExportStage("Preparing…");
    try {
      await exportMixdown(title.trim() || defaultTitle || "remixt-mix", {
        range,
        onProgress: setExportStage,
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExportStage(null);
    }
  }

  async function handleSave() {
    if (!user) {
      router.push("/login?next=/studio");
      return;
    }
    if (!title.trim()) {
      setSaveError("Give your remix a title");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const state = useStudioStore.getState();
      const res = await fetch("/api/remixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          published: publish,
          lanes: lanesToPayload(lanes),
          project: {
            projectBpm: state.projectBpm,
            masterVolume: state.masterVolume,
            loopEnabled: state.loopEnabled,
            loopStart: state.loopStart,
            loopEnd: state.loopEnd,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Could not save remix");
        return;
      }
      setSavedId(data.id);
    } finally {
      setSaving(false);
    }
  }

  const empty = lanes.length === 0;

  return (
    <div className="sticky top-16 z-40 rounded-xl border border-border bg-surface/95 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={handlePlayPause}
          disabled={empty}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-lg text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          title={isPlaying ? "Pause (space)" : "Play (space)"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button
          onClick={() => audioEngine.stop()}
          disabled={empty}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-sm text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
          title="Stop and return to the start (Esc)"
        >
          ■
        </button>

        <div className="font-mono text-sm text-muted tabular-nums">
          {formatTime(playhead)} / {formatTime(duration)}
        </div>

        <div
          className="group relative h-2 flex-1 min-w-[120px] cursor-pointer overflow-hidden rounded-full bg-surface-raised"
          onClick={(e) => {
            if (empty) return;
            const rect = e.currentTarget.getBoundingClientRect();
            audioEngine.seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
          title="Click to seek"
        >
          {hasLoop && duration > 0 && (
            <div
              className={`absolute inset-y-0 ${loopEnabled ? "bg-brand/30" : "bg-surface-hover"}`}
              style={{
                left: `${(loopStart / duration) * 100}%`,
                width: `${((loopEnd - loopStart) / duration) * 100}%`,
              }}
            />
          )}
          <div
            className="relative h-full bg-gradient-to-r from-vocals to-beat"
            style={{ width: duration > 0 ? `${(playhead / duration) * 100}%` : "0%" }}
          />
        </div>

        <button
          onClick={() => setLoop({ enabled: !loopEnabled, start: hasLoop ? loopStart : 0, end: hasLoop ? loopEnd : Math.min(duration, 16) })}
          disabled={empty}
          className={`rounded-lg border px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${
            loopEnabled ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
          }`}
          title="Loop the region marked on the timeline (L)"
        >
          🔁
        </button>

        <button
          onClick={toggleMetronome}
          className={`rounded-lg border px-2.5 py-2 text-sm transition-colors ${
            metronome ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
          }`}
          title="Metronome click at the project tempo"
        >
          🥁
        </button>

        <button
          onClick={toggleSnap}
          className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
            snapToGrid ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
          }`}
          title="Snap lane starts and loop points to the beat grid"
        >
          Snap
        </button>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted" title="Master level">
          Master
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="h-1.5 w-20 accent-brand"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("full")}
            disabled={empty || exportStage !== null}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-40"
            title="Bounce the mix to a WAV file"
          >
            {exportStage ?? "Export WAV"}
          </button>
          {hasLoop && loopEnabled && (
            <button
              onClick={() => handleExport("loop")}
              disabled={empty || exportStage !== null}
              className="rounded-lg border border-border px-2.5 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
              title="Export only the looped region"
            >
              Loop only
            </button>
          )}
        </div>

        <button
          onClick={() => {
            audioEngine.stop();
            clearLanes();
          }}
          disabled={empty}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          Clear
        </button>

        <button
          onClick={() => setShowSave((v) => !v)}
          disabled={empty}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          {remixId ? "Save as new remix" : "Save remix"}
        </button>
      </div>

      {exportError && (
        <p className="border-t border-border px-4 py-2 text-sm text-danger">{exportError}</p>
      )}

      {showSave && (
        <div className="border-t border-border p-4">
          {!user ? (
            <p className="text-sm text-muted">
              <button
                onClick={() => router.push("/login?next=/studio")}
                className="font-medium text-brand-strong hover:underline"
              >
                Log in
              </button>{" "}
              to save this remix under your artist name. You can still export a WAV without an account.
            </p>
          ) : savedId ? (
            <p className="text-sm text-success">
              Saved! View it on{" "}
              <a href={`/remixes/${savedId}`} className="font-medium underline">
                your remix page
              </a>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-1 min-w-[180px] flex-col gap-1">
                <span className="text-xs font-medium text-muted">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Name your remix"
                  className="input"
                />
              </label>
              <label className="flex items-center gap-2 pb-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                  className="accent-brand"
                />
                Publish publicly
              </label>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
              >
                {saving ? "Saving…" : "Confirm save"}
              </button>
              {saveError && <p className="text-sm text-danger">{saveError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
