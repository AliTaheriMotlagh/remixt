"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { audioEngine, PlaybackBlockedError } from "@/lib/client/audioEngine";
import { exportMixdown, getExportFormat, setExportFormat, type ExportFormat } from "@/lib/client/mixdown";
import { camelotCode, keyLabel } from "@/lib/client/musicKey";
import { lanesToPayload, projectToPayload } from "@/lib/client/remixLanes";
import { beatLength, effectiveKey, referenceLane, useStudioStore } from "@/lib/client/studioStore";
import { redo, startNewStep, undo, useStudioHistory } from "@/lib/client/studioHistory";
import { markDraftClean } from "@/lib/client/studioDraft";
import { useStudioView } from "@/lib/client/studioView";
import type { User } from "@/lib/auth";
import TagInput from "./TagInput";
import SocialClipButton from "./studio/SocialClipButton";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Bars and beats, the way a DAW counts: 1.1 is the very start. */
function formatBars(seconds: number, bpm: number) {
  const beat = beatLength(bpm);
  const beats = Math.floor(seconds / beat + 1e-6);
  return `${Math.floor(beats / 4) + 1}.${(beats % 4) + 1}`;
}

/** A button with a small panel under it (a sheet on phones), closed by tapping outside or Esc. */
function Popover({
  label,
  title,
  active,
  align = "left",
  children,
  className = "",
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={title}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
          open || active ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
        } ${className}`}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div
            className={`popover-sheet absolute top-full z-50 mt-2 w-72 rounded-xl border border-border bg-surface-raised p-3 shadow-2xl shadow-black/40 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

/** Clock, bar counter and progress bar — the only parts of the transport that follow playback. */
function TransportPosition({ empty }: { empty: boolean }) {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const setLoop = useStudioStore((s) => s.setLoop);
  const hasLoop = loopEnd > loopStart;

  return (
    // On larger screens the arrangement's ruler is the seek bar and shows the
    // loop, so only the counter stays here; phones get the bar and loop chip.
    <div className="flex min-w-0 items-center gap-3 max-sm:order-last max-sm:w-full sm:mr-auto">
      <div className="flex shrink-0 flex-col items-start rounded-lg bg-background px-2.5 py-1 font-mono leading-none tabular-nums">
        <span className="text-base font-semibold text-foreground">{formatBars(playhead, projectBpm)}</span>
        <span className="mt-0.5 text-[10px] text-muted">
          {formatTime(playhead)} / {formatTime(duration)}
        </span>
      </div>
      <div
        className="-my-2 min-w-[80px] flex-1 cursor-pointer py-2 sm:hidden"
        onClick={(e) => {
          if (empty) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audioEngine.seek(((e.clientX - rect.left) / rect.width) * duration);
        }}
        title="Click to seek"
      >
        <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-raised">
          {hasLoop && duration > 0 && (
            <div
              className={`absolute inset-y-0 ${loopEnabled ? "bg-brand/40" : "bg-surface-hover"}`}
              style={{ left: `${(loopStart / duration) * 100}%`, width: `${((loopEnd - loopStart) / duration) * 100}%` }}
            />
          )}
          <div
            className="relative h-full bg-gradient-to-r from-vocals to-beat"
            style={{ width: duration > 0 ? `${(playhead / duration) * 100}%` : "0%" }}
          />
        </div>
      </div>
      {loopEnabled && hasLoop && (
        <button
          onClick={() => setLoop({ enabled: false })}
          className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-brand bg-brand/15 px-2 text-[11px] font-medium hover:border-danger sm:hidden"
          title="Playback repeats this region — click to turn the loop off (L)"
        >
          🔁 <span className="font-mono tabular-nums max-sm:hidden">{formatTime(loopStart)}–{formatTime(loopEnd)}</span>
          <span className="text-muted">✕</span>
        </button>
      )}
    </div>
  );
}

/** Project tempo: type it, tap it, or fit every lane to it. */
function TempoControl() {
  const lanes = useStudioStore((s) => s.lanes);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const setProjectBpm = useStudioStore((s) => s.setProjectBpm);
  const matchAllToBpm = useStudioStore((s) => s.matchAllToBpm);
  const resetAllTempo = useStudioStore((s) => s.resetAllTempo);
  const taps = useRef<number[]>([]);
  const stretched = lanes.some((l) => Math.abs(l.tempoRatio - 1) > 0.001);

  function tap() {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t < 2000);
    const next = [...recent, now].slice(-6);
    taps.current = next;
    if (next.length >= 2) {
      const gaps = next.slice(1).map((t, i) => t - next[i]);
      const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (average > 0) setProjectBpm(Math.round((60000 / average) * 10) / 10);
    }
  }

  return (
    <Popover
      title="Project tempo — the grid, snap, metronome and synced delays follow it"
      label={
        <>
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{projectBpm.toFixed(1)}</span>
          <span className="text-[10px] uppercase">bpm</span>
        </>
      }
    >
      {() => (
        <div className="flex flex-col gap-3 text-xs">
          <label className="flex items-center gap-2 text-muted">
            Tempo
            <input
              type="number"
              min={20}
              max={300}
              step={0.1}
              value={projectBpm}
              onChange={(e) => setProjectBpm(Number(e.target.value))}
              className="input !w-24 !py-1 text-sm"
            />
            BPM
            <button onClick={tap} className="ml-auto rounded-lg border border-border px-3 py-1.5 font-medium hover:border-brand" title="Tap in time to set the tempo">
              Tap
            </button>
          </label>
          <button
            onClick={() => {
              startNewStep();
              matchAllToBpm(projectBpm);
            }}
            disabled={!lanes.some((l) => l.bpm)}
            className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
          >
            Fit every lane to {projectBpm.toFixed(1)} BPM
          </button>
          {stretched && (
            <button onClick={resetAllTempo} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground">
              Back to every lane&apos;s own tempo
            </button>
          )}
          <ul className="flex flex-col gap-0.5 text-[11px] text-muted">
            {lanes.map((l) => (
              <li key={l.laneId} className="flex justify-between gap-2">
                <span className="truncate">{l.trackTitle}</span>
                <span className="shrink-0 font-mono">{l.bpm ? (l.bpm * l.tempoRatio).toFixed(1) : "?"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}

/** Project key (from the reference lane) and every lane's, with one-tap matching. */
function KeyControl() {
  const lanes = useStudioStore((s) => s.lanes);
  const matchAllKeys = useStudioStore((s) => s.matchAllKeys);
  const reference = referenceLane(lanes, (l) => !!l.musicalKey);
  const key = reference ? effectiveKey(reference) : null;
  return (
    <Popover
      title="Project key"
      label={
        <>
          <span className="text-sm font-semibold text-foreground">{key ? keyLabel(key) : "…"}</span>
          {key && <span className="font-mono text-[10px]">{camelotCode(key)}</span>}
        </>
      }
    >
      {() => (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-muted">
            {reference ? (
              <>
                Set by “{reference.trackTitle}”. Matching shifts the other lanes&apos; pitch into its notes — every shift costs a
                little sound quality, so only do it when they clash.
              </>
            ) : (
              "Detecting keys…"
            )}
          </p>
          <ul className="flex flex-col gap-0.5 text-[11px] text-muted">
            {lanes.map((l) => {
              const k = effectiveKey(l);
              return (
                <li key={l.laneId} className="flex justify-between gap-2">
                  <span className="truncate">{l.trackTitle}</span>
                  <span className="shrink-0 font-mono">
                    {k ? `${keyLabel(k)} · ${camelotCode(k)}` : "…"}
                    {l.pitchSemitones ? ` (${l.pitchSemitones > 0 ? "+" : ""}${l.pitchSemitones})` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => {
              startNewStep();
              matchAllKeys();
            }}
            disabled={lanes.filter((l) => l.musicalKey).length < 2}
            className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
          >
            Match every lane to {key ? keyLabel(key) : "the project key"}
          </button>
        </div>
      )}
    </Popover>
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
  const aiOpen = useStudioView((s) => s.aiOpen);
  const setAiOpen = useStudioView((s) => s.setAiOpen);

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
  useKeepScreenOn("export", exportStage !== null);
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
  const toggle = (on: boolean) =>
    `flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
      on ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
    }`;

  return (
    // On phones the backdrop blur is left off: it would trap the social-clip
    // sheet (position: fixed) inside this bar. While the save form is open
    // it scrolls away rather than covering the screen.
    <div
      className={`sticky top-[var(--header-h)] z-40 rounded-xl border border-border bg-surface shadow-lg shadow-black/20 sm:bg-surface/95 sm:backdrop-blur-md ${
        showSave ? "max-sm:static" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={handlePlayPause}
            disabled={empty}
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-brand text-lg text-white shadow-[0_0_20px_-6px_var(--brand)] transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
            title="Stop and return to the start (Esc)"
            aria-label="Stop"
          >
            ■
          </button>
        </div>

        <TransportPosition empty={empty} />

        {/* From sm up these sit inline (display: contents); on phones they're a row of their own. */}
        <div
          className={`${showTools ? "flex" : "hidden"} w-full flex-wrap items-center gap-1.5 border-t border-border pt-2.5 max-sm:order-last sm:contents`}
        >
          {!empty && (
            <div className="flex items-center gap-1.5">
              <TempoControl />
              <KeyControl />
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setLoop({ enabled: !loopEnabled, start: hasLoop ? loopStart : 0, end: hasLoop ? loopEnd : Math.min(duration, 16) })
              }
              disabled={empty}
              className={toggle(loopEnabled)}
              title={hasLoop ? `Loop ${formatTime(loopStart)}–${formatTime(loopEnd)} (L)` : "Loop — or drag across the ruler to pick a region (L)"}
              aria-pressed={loopEnabled}
            >
              🔁<span className="xl:inline hidden">Loop</span>
            </button>
            {!viewing && (
              <>
                <button onClick={toggleMetronome} className={toggle(metronome)} title="Metronome (K)" aria-pressed={metronome}>
                  🥁
                </button>
                <button onClick={toggleSnap} className={toggle(snapToGrid)} title="Snap to the beat (N)" aria-pressed={snapToGrid}>
                  ⌗<span className="xl:inline hidden">Snap</span>
                </button>
              </>
            )}
          </div>
          {hasXfade && (
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted" title="Crossfader between side A and side B lanes (double-click to centre)">
              A
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={crossfader}
                onChange={(e) => setCrossfader(Number(e.target.value))}
                onDoubleClick={() => setCrossfader(0.5)}
                className="h-1.5 w-20 accent-beat"
                aria-label="Crossfader"
              />
              B
            </label>
          )}
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted max-sm:min-w-[9rem] max-sm:flex-1" title="Master level (+ / −)">
            Out
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              onDoubleClick={() => setMasterVolume(1)}
              className="h-1.5 w-16 accent-brand max-sm:flex-1"
              aria-label="Master level"
            />
          </label>
          <Popover
            align="right"
            title="Export the mix as an audio file"
            label={exportStage ?? <>⤓ <span>Export</span></>}
            active={exportStage !== null}
          >
            {(close) => (
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex gap-1">
                  {(["mp3", "wav"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFormat(f);
                        setExportFormat(f);
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 font-medium ${format === f ? "border-brand bg-brand/15" : "border-border text-muted"}`}
                    >
                      {f === "mp3" ? "MP3 · small" : "WAV · lossless"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    close();
                    void handleExport("full");
                  }}
                  disabled={empty || exportStage !== null}
                  className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
                >
                  Export the whole mix
                </button>
                <button
                  onClick={() => {
                    close();
                    void handleExport("loop");
                  }}
                  disabled={empty || !hasLoop || exportStage !== null}
                  className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40"
                  title={hasLoop ? undefined : "Set a loop on the ruler first"}
                >
                  Export just the loop
                </button>
                {!viewing && (
                  <button
                    onClick={() => {
                      close();
                      if (window.confirm("Clear the Studio? Undo can bring it back.")) {
                        audioEngine.stop();
                        startNewStep();
                        clearLanes();
                      }
                    }}
                    disabled={empty}
                    className="mt-1 border-t border-border pt-2 text-left text-muted hover:text-danger disabled:opacity-40"
                  >
                    Clear the Studio…
                  </button>
                )}
              </div>
            )}
          </Popover>
          <SocialClipButton
            title={title.trim() || defaultTitle || "Untitled remix"}
            artist={artistName ?? user?.artist_name ?? "Remixt"}
            remixId={savedId ?? (viewing ? remixId : null)}
          />
        </div>

        <div className="flex items-center gap-1 max-sm:ml-auto">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
            title="Undo (⌘/Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
            title="Redo (⇧⌘Z / Ctrl+Y)"
            aria-label="Redo"
          >
            ↷
          </button>
          <button
            onClick={() => setShowTools((v) => !v)}
            aria-expanded={showTools}
            aria-label="More controls"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors sm:hidden ${
              showTools ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted"
            }`}
          >
            ⋯
          </button>
        </div>

        {!viewing && (
          <button
            onClick={() => setAiOpen(!aiOpen)}
            disabled={empty}
            aria-pressed={aiOpen}
            aria-label="AI producer"
            className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white transition-all disabled:opacity-40 max-sm:px-2.5 ${
              aiOpen ? "bg-brand ring-2 ring-brand-strong" : "bg-gradient-to-r from-brand to-vocals shadow-[0_0_18px_-6px_var(--vocals)] hover:brightness-110"
            }`}
            title="AI producer — ideas from a remixer, a sound engineer and a beatmaker (I)"
          >
            ✨ <span className="max-sm:hidden">AI</span>
          </button>
        )}

        <button
          onClick={() => setShowSave((v) => !v)}
          disabled={empty}
          aria-expanded={showSave}
          className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 sm:px-3.5"
        >
          <span className="sm:hidden">Save</span>
          <span className="hidden sm:inline">{remixId ? "Save as new remix" : "Save remix"}</span>
        </button>
      </div>

      {playError && <p className="border-t border-border px-4 py-2 text-sm text-danger">{playError}</p>}
      {exportError && <p className="border-t border-border px-4 py-2 text-sm text-danger">{exportError}</p>}

      {showSave && (
        <div className="border-t border-border p-4">
          {!user ? (
            <p className="text-sm text-muted">
              <button onClick={() => router.push("/login?next=/studio")} className="font-medium text-brand-strong hover:underline">
                Log in
              </button>{" "}
              to save this remix under your artist name. You can still export it without an account.
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
              <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name your remix" className="input" />
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
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="accent-brand" />
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
