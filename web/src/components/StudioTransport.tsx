"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { audioEngine, PlaybackBlockedError } from "@/lib/client/audioEngine";
import { exportMixdown, getExportFormat, setExportFormat, type ExportFormat } from "@/lib/client/mixdown";
import { lanesToPayload, projectToPayload } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import { redo, undo, useStudioHistory } from "@/lib/client/studioHistory";
import { markDraftClean } from "@/lib/client/studioDraft";
import type { User } from "@/lib/auth";
import TagInput from "./TagInput";
import SocialClipButton from "./studio/SocialClipButton";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Clock and progress bar — the only parts of the transport that follow playback. */
function TransportPosition({ empty }: { empty: boolean }) {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const hasLoop = loopEnd > loopStart;

  return (
    // Its own full-width row on phones; inline with the buttons from sm up.
    <div className="flex items-center gap-3 max-sm:order-last max-sm:w-full sm:contents">
      <div className="shrink-0 font-mono text-sm text-muted tabular-nums">
        {formatTime(playhead)} / {formatTime(duration)}
      </div>

      {/* A thin bar with a taller invisible hit area, so it's easy to tap. */}
      <div
        className="-my-2 min-w-[120px] flex-1 cursor-pointer py-2"
        onClick={(e) => {
          if (empty) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audioEngine.seek(((e.clientX - rect.left) / rect.width) * duration);
        }}
        title="Click to seek"
      >
        <div className="group relative h-2 overflow-hidden rounded-full bg-surface-raised">
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
      </div>
    </div>
  );
}

export default function StudioTransport({
  user,
  remixId,
  defaultTitle,
  viewing = false,
  artistName,
}: {
  user: User | null;
  remixId: string | null;
  defaultTitle?: string;
  /** On a remix's own page (rather than the Studio): `remixId` is the remix being played. */
  viewing?: boolean;
  /** Who made the remix being played, for the social clip (default: you). */
  artistName?: string;
}) {
  const isPlaying = useStudioStore((s) => s.isPlaying);
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
  const crossfader = useStudioStore((s) => s.crossfader);
  const setCrossfader = useStudioStore((s) => s.setCrossfader);
  const hasXfade = useStudioStore((s) => s.lanes.some((l) => l.xfade));

  const canUndo = useStudioHistory((h) => h.past.length > 0);
  const canRedo = useStudioHistory((h) => h.future.length > 0);
  const [starting, setStarting] = useState(false);
  const playAttempt = useRef(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  // Phones: the less-used controls fold away so the sticky bar stays short.
  const [showTools, setShowTools] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [publish, setPublish] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const challenge = useStudioStore((s) => s.challenge);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Read after mount: the server has no idea what this browser picked.
  const [exportFormat, setFormat] = useState<ExportFormat | null>(null);
  const format = exportFormat ?? "mp3";
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
  useEffect(() => setFormat(getExportFormat()), []);
  const router = useRouter();

  const hasLoop = loopEnd > loopStart;

  async function handlePlayPause() {
    if (lanes.length === 0) return;
    if (isPlaying || starting) {
      // A tap while it's still loading cancels, rather than being ignored
      // until a slow download on a phone finishes.
      playAttempt.current++;
      audioEngine.pause();
      setStarting(false);
      return;
    }
    // Play waits for any lane still loading or re-rendering its
    // pitch/tempo; say so rather than look like the click did nothing.
    const attempt = ++playAttempt.current;
    setStarting(true);
    setPlayError(null);
    try {
      await audioEngine.play();
    } catch (error) {
      if (attempt !== playAttempt.current) return;
      setPlayError(
        error instanceof PlaybackBlockedError
          ? error.message
          : // Usually a stem that didn't download — easy on a flaky mobile
            // connection. Tapping play again retries it.
            "Couldn't load the audio. Check your connection and tap play again."
      );
    } finally {
      if (attempt === playAttempt.current) setStarting(false);
    }
  }

  async function handleExport(range: "full" | "loop") {
    setExportError(null);
    setExportStage("Preparing…");
    try {
      await exportMixdown(title.trim() || defaultTitle || "remixt-mix", {
        range,
        format,
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
          tags,
          parentId: state.sourceRemix?.id ?? null,
          challengeId: state.challenge?.id ?? null,
          lanes: lanesToPayload(lanes),
          project: projectToPayload(state),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Could not save remix");
        return;
      }
      setSavedId(data.id);
      // It's on the server now; the local copy is only for unsaved work.
      markDraftClean({ discard: true });
    } finally {
      setSaving(false);
    }
  }

  const empty = lanes.length === 0;

  return (
    // On phones the backdrop blur is left off: it would trap the social-clip
    // sheet (position: fixed) inside this bar. While the save form is open
    // it scrolls away rather than covering the screen.
    <div
      className={`sticky top-[var(--header-h)] z-40 rounded-xl border border-border bg-surface sm:bg-surface/95 sm:backdrop-blur-md ${
        showSave ? "max-sm:static" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <button
          onClick={handlePlayPause}
          disabled={empty}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-brand text-lg text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          title={starting ? "Preparing the audio… (tap to cancel)" : isPlaying ? "Pause (space)" : "Play (space)"}
          aria-label={starting ? "Cancel" : isPlaying ? "Pause" : "Play"}
          aria-busy={starting}
        >
          {starting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : isPlaying ? (
            "⏸"
          ) : (
            "▶"
          )}
        </button>

        <button
          onClick={() => audioEngine.stop()}
          disabled={empty}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-sm text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40 sm:h-9 sm:w-9"
          title="Stop and return to the start (Esc)"
          aria-label="Stop"
        >
          ■
        </button>

        <TransportPosition empty={empty} />

        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="h-10 rounded-lg border border-border px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40 sm:h-auto sm:px-2.5 sm:py-2"
            title="Undo (⌘/Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="h-10 rounded-lg border border-border px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40 sm:h-auto sm:px-2.5 sm:py-2"
            title="Redo (⇧⌘Z / Ctrl+Y)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <button
          onClick={() => setShowTools((v) => !v)}
          aria-expanded={showTools}
          aria-label="More controls"
          className={`h-10 rounded-lg border px-3 text-sm transition-colors sm:hidden ${
            showTools ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted"
          }`}
        >
          ⋯
        </button>

        {/* From sm up these sit inline (display: contents); on phones they're a row of their own. */}
        <div
          className={`${
            showTools ? "flex" : "hidden"
          } w-full flex-wrap items-center gap-2 border-t border-border pt-3 max-sm:order-last sm:contents`}
        >
          <button
            onClick={() => setLoop({ enabled: !loopEnabled, start: hasLoop ? loopStart : 0, end: hasLoop ? loopEnd : Math.min(duration, 16) })}
            disabled={empty}
            className={`rounded-lg border px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${
              loopEnabled ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
            title="Loop the region marked on the timeline (L)"
            aria-label="Loop"
            aria-pressed={loopEnabled}
          >
            🔁
          </button>

          <button
            onClick={toggleMetronome}
            className={`rounded-lg border px-2.5 py-2 text-sm transition-colors ${
              metronome ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
            title="Metronome click at the project tempo"
            aria-label="Metronome"
            aria-pressed={metronome}
          >
            🥁
          </button>

          <button
            onClick={toggleSnap}
            className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
              snapToGrid ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
            title="Snap lane starts and loop points to the beat grid"
            aria-pressed={snapToGrid}
          >
            Snap
          </button>

          {hasXfade && (
            <label
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
              title="Crossfader: slide between the lanes on side A and side B (double-click to centre)"
            >
              A
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={crossfader}
                onChange={(e) => setCrossfader(Number(e.target.value))}
                onDoubleClick={() => setCrossfader(0.5)}
                className="h-1.5 w-24 accent-beat"
                aria-label="Crossfader"
              />
              B
            </label>
          )}

          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted max-sm:min-w-[10rem] max-sm:flex-1" title="Master level">
            Master
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              className="h-1.5 w-20 accent-brand max-sm:flex-1"
              aria-label="Master level"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("full")}
              disabled={empty || exportStage !== null}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-40"
              title={format === "mp3" ? "Bounce the mix to an MP3 (256 kbps) — small, good for sharing" : "Bounce the mix to a lossless WAV file"}
            >
              {exportStage ?? `Export ${format.toUpperCase()}`}
            </button>
            <select
              value={format}
              onChange={(e) => {
                const next = e.target.value as ExportFormat;
                setFormat(next);
                setExportFormat(next);
              }}
              disabled={exportStage !== null}
              className="rounded-lg border border-border bg-surface px-1.5 py-2 text-xs text-muted"
              aria-label="Export format"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
            <SocialClipButton
              title={title.trim() || defaultTitle || "Untitled remix"}
              artist={artistName ?? user?.artist_name ?? "Remixt"}
              remixId={savedId ?? (viewing ? remixId : null)}
            />
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
        </div>

        <button
          onClick={() => setShowSave((v) => !v)}
          disabled={empty}
          aria-expanded={showSave}
          className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40 max-sm:ml-auto sm:h-auto sm:py-2"
        >
          <span className="sm:hidden">{remixId ? "Save new" : "Save"}</span>
          <span className="hidden sm:inline">{remixId ? "Save as new remix" : "Save remix"}</span>
        </button>
      </div>

      {playError && (
        <p className="border-t border-border px-4 py-2 text-sm text-danger">{playError}</p>
      )}

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
              <div className="flex w-full flex-col gap-1">
                <span className="text-xs font-medium text-muted">Tags — genre and mood, so people can find it</span>
                <TagInput value={tags} onChange={setTags} compact />
              </div>
              {challenge && (
                <p className="w-full rounded-lg bg-beat/15 px-3 py-2 text-xs">
                  🏁 This will be entered in the challenge “{challenge.title}”
                  {publish ? "." : " once you publish it."}
                </p>
              )}
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
