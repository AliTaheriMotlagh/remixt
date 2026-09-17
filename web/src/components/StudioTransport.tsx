"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { audioEngine } from "@/lib/client/audioEngine";
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
}: {
  user: User | null;
  remixId: string | null;
}) {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const lanes = useStudioStore((s) => s.lanes);
  const clearLanes = useStudioStore((s) => s.clearLanes);

  const [showSave, setShowSave] = useState(false);
  const [title, setTitle] = useState("");
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const router = useRouter();

  async function handlePlayPause() {
    if (lanes.length === 0) return;
    if (isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.play();
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
      const res = await fetch("/api/remixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          published: publish,
          lanes: lanes.map((l) => ({
            stemId: l.stemId,
            volume: l.volume,
            muted: l.muted,
            offsetSeconds: 0,
            pitchSemitones: l.pitchSemitones,
            tempoRatio: l.tempoRatio,
          })),
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

  return (
    <div className="sticky top-16 z-40 rounded-xl border border-border bg-surface/95 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <button
          onClick={handlePlayPause}
          disabled={lanes.length === 0}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-lg text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <div className="font-mono text-sm text-muted tabular-nums">
          {formatTime(playhead)} / {formatTime(duration)}
        </div>

        <div className="h-2 flex-1 min-w-[120px] overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full bg-gradient-to-r from-vocals to-beat"
            style={{ width: duration > 0 ? `${(playhead / duration) * 100}%` : "0%" }}
          />
        </div>

        <button
          onClick={() => {
            audioEngine.pause();
            clearLanes();
          }}
          disabled={lanes.length === 0}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          Clear
        </button>

        <button
          onClick={() => setShowSave((v) => !v)}
          disabled={lanes.length === 0}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          {remixId ? "Save as new remix" : "Save remix"}
        </button>
      </div>

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
              to save this remix under your artist name.
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
