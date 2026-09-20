"use client";

import { useRef, useState } from "react";
import Waveform from "./Waveform";
import LaneFxPanel from "./LaneFxPanel";
import { audioEngine } from "@/lib/client/audioEngine";
import { exportLane } from "@/lib/client/mixdown";
import { previewPlayer } from "@/lib/client/previewPlayer";
import {
  beatLength,
  useStudioStore,
  viewDuration,
  type StudioLane,
} from "@/lib/client/studioStore";

function formatOffset(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = (abs % 60).toFixed(2).padStart(5, "0");
  return `${sign}${m}:${s}`;
}

export default function StudioLaneRow({ lane }: { lane: StudioLane }) {
  const playhead = useStudioStore((s) => s.playhead);
  const projectDuration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const snapToGrid = useStudioStore((s) => s.snapToGrid);
  const isRendering = useStudioStore((s) => s.renderingLaneIds.has(lane.laneId));
  const removeLane = useStudioStore((s) => s.removeLane);
  const duplicateLane = useStudioStore((s) => s.duplicateLane);
  const setVolume = useStudioStore((s) => s.setVolume);
  const toggleMute = useStudioStore((s) => s.toggleMute);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const setPitchSemitones = useStudioStore((s) => s.setPitchSemitones);
  const setTempoRatio = useStudioStore((s) => s.setTempoRatio);
  const setLaneBpm = useStudioStore((s) => s.setLaneBpm);
  const setOffset = useStudioStore((s) => s.setOffset);
  const nudgeOffset = useStudioStore((s) => s.nudgeOffset);
  const matchLaneToProject = useStudioStore((s) => s.matchLaneToProject);

  const [showFx, setShowFx] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pitchDraft, setPitchDraft] = useState(lane.pitchSemitones);
  const [lastSeenPitch, setLastSeenPitch] = useState(lane.pitchSemitones);
  const [tempoDraft, setTempoDraft] = useState(lane.tempoRatio);
  const [lastSeenTempo, setLastSeenTempo] = useState(lane.tempoRatio);
  const pitchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
    width: number;
    span: number;
    moved: boolean;
  } | null>(null);

  // Keep the sliders in sync if these change from outside this component
  // (loading a remix, "match all", "reset tempo") — adjusted during render
  // rather than in an Effect, per React's state-reset-on-prop-change pattern.
  if (lane.pitchSemitones !== lastSeenPitch) {
    setLastSeenPitch(lane.pitchSemitones);
    setPitchDraft(lane.pitchSemitones);
  }
  if (lane.tempoRatio !== lastSeenTempo) {
    setLastSeenTempo(lane.tempoRatio);
    setTempoDraft(lane.tempoRatio);
  }

  // Pitch and tempo both trigger an offline re-render of the lane's audio,
  // so they're committed on a debounce instead of on every slider tick.
  function handlePitchChange(value: number) {
    setPitchDraft(value);
    if (pitchDebounce.current) clearTimeout(pitchDebounce.current);
    pitchDebounce.current = setTimeout(() => {
      setPitchSemitones(lane.laneId, value);
    }, 150);
  }

  function handleTempoChange(value: number) {
    setTempoDraft(value);
    if (tempoDebounce.current) clearTimeout(tempoDebounce.current);
    tempoDebounce.current = setTimeout(() => {
      setTempoRatio(lane.laneId, value);
    }, 200);
  }

  const accent = lane.kind === "vocals" ? "var(--vocals)" : "var(--beat)";
  const span = viewDuration(projectDuration, projectBpm);
  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const effectiveBpm = lane.bpm ? lane.bpm * lane.tempoRatio : null;
  const isStretched = Math.abs(lane.tempoRatio - 1) > 0.001;
  const laneProgress =
    lane.duration > 0
      ? Math.min(1, Math.max(0, (playhead - lane.offsetSeconds) / lane.duration))
      : 0;

  function snap(seconds: number) {
    return snapToGrid ? Math.round(seconds / beat) * beat : seconds;
  }

  function handleClipPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!trackRef.current) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startOffset: lane.offsetSeconds,
      width: trackRef.current.clientWidth,
      span,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleClipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < 3) return;
    state.moved = true;
    const deltaSeconds = (dx / state.width) * state.span;
    setOffset(lane.laneId, Math.max(0, snap(state.startOffset + deltaSeconds)));
  }

  function handleClipPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved && trackRef.current) {
      // A plain click seeks, the same as clicking the ruler.
      const rect = trackRef.current.getBoundingClientRect();
      audioEngine.seek(((e.clientX - rect.left) / rect.width) * span);
    }
  }

  async function handleExportLane() {
    setExporting(true);
    try {
      await exportLane(lane, lane.trackTitle);
    } catch {
      // The button falls back to its idle state; the transport's export
      // surface reports errors in detail.
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-stretch gap-3">
        <div className="flex w-56 shrink-0 flex-col justify-between gap-2 border-r border-border pr-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: accent }}
              >
                {lane.kind === "vocals" ? "Vocals" : "Beat"}
              </span>
              {effectiveBpm && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    isStretched ? "bg-success/15 text-success" : "bg-surface-raised text-muted"
                  }`}
                  title={
                    isStretched
                      ? `Stretched from ${lane.bpm?.toFixed(1)} BPM`
                      : "Playing at its original tempo"
                  }
                >
                  {effectiveBpm.toFixed(1)} BPM
                </span>
              )}
              {isRendering && (
                <span
                  className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-brand-strong"
                  title="Re-rendering pitch/tempo"
                />
              )}
            </div>
            <p className="mt-1.5 truncate text-sm font-medium" title={lane.trackTitle}>
              {lane.trackTitle}
            </p>
            <p className="truncate text-xs text-muted">{lane.artistName}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => toggleMute(lane.laneId)}
              className={`h-6 w-6 rounded text-[11px] font-bold transition-colors ${
                lane.muted ? "bg-danger text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
              title="Mute"
            >
              M
            </button>
            <button
              onClick={() => toggleSolo(lane.laneId)}
              className={`h-6 w-6 rounded text-[11px] font-bold transition-colors ${
                lane.solo ? "bg-success text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
              title="Solo"
            >
              S
            </button>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={lane.volume}
              onChange={(e) => setVolume(lane.laneId, Number(e.target.value))}
              className="h-1.5 flex-1 accent-brand"
              title={`Volume — ${Math.round(lane.volume * 100)}%`}
            />
            <button
              onClick={() =>
                previewPlayer.toggle({
                  stemId: lane.stemId,
                  title: lane.trackTitle,
                  artist: lane.artistName,
                  kind: lane.kind,
                })
              }
              className="h-6 w-6 shrink-0 rounded text-[10px] text-muted hover:bg-surface-raised hover:text-foreground"
              title="Preview the original stem on its own"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[10px] text-muted">Pitch</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={pitchDraft}
              onChange={(e) => handlePitchChange(Number(e.target.value))}
              className="h-1.5 flex-1 accent-brand-strong"
              title="Pitch in semitones — key-shift a vocal to fit the beat"
            />
            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted">
              {pitchDraft > 0 ? `+${pitchDraft}` : pitchDraft}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[10px] text-muted">Speed</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.005}
              value={tempoDraft}
              onChange={(e) => handleTempoChange(Number(e.target.value))}
              className="h-1.5 flex-1 accent-brand-strong"
              title="Time-stretch without changing pitch"
            />
            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted">
              {tempoDraft.toFixed(2)}×
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[10px] text-muted" title="Source tempo — fix it if detection was wrong">
              BPM
            </span>
            <input
              type="number"
              min={20}
              max={300}
              step={0.1}
              value={lane.bpm ?? ""}
              placeholder="—"
              onChange={(e) => {
                const value = e.target.value;
                setLaneBpm(lane.laneId, value === "" ? null : Number(value));
              }}
              className="input !w-16 !px-1.5 !py-0.5 text-[11px]"
            />
            <button
              onClick={() => matchLaneToProject(lane.laneId)}
              disabled={!lane.bpm}
              className="flex-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-brand/60 hover:text-foreground disabled:opacity-40"
              title={`Time-stretch this lane to the project tempo (${projectBpm.toFixed(1)} BPM)`}
            >
              Match
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFx((v) => !v)}
              className={`flex-1 rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                showFx
                  ? "border-brand bg-brand/15 text-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
              title="Effects: EQ, filters, reverb, delay, drive, fades"
            >
              FX {showFx ? "▾" : "▸"}
            </button>
            <button
              onClick={() => duplicateLane(lane.laneId)}
              className="rounded border border-border px-1.5 py-1 text-[10px] text-muted transition-colors hover:text-foreground"
              title="Duplicate this lane"
            >
              ⧉
            </button>
            <button
              onClick={handleExportLane}
              disabled={exporting}
              className="rounded border border-border px-1.5 py-1 text-[10px] text-muted transition-colors hover:text-foreground disabled:opacity-40"
              title="Export this lane on its own as WAV"
            >
              {exporting ? "…" : "⤓"}
            </button>
            <button
              onClick={() => removeLane(lane.laneId)}
              className="rounded border border-border px-1.5 py-1 text-[10px] text-muted transition-colors hover:border-danger hover:text-danger"
              title="Remove lane"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-muted">
            <span className="mr-0.5">Start</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={Number(lane.offsetSeconds.toFixed(3))}
              onChange={(e) => setOffset(lane.laneId, Number(e.target.value))}
              className="input !w-20 !px-1.5 !py-0.5 text-[11px]"
              title="Where this lane starts on the timeline, in seconds"
            />
            <button onClick={() => nudgeOffset(lane.laneId, -bar)} className="nudge" title="Back one bar">
              −bar
            </button>
            <button onClick={() => nudgeOffset(lane.laneId, -beat)} className="nudge" title="Back one beat">
              −beat
            </button>
            <button onClick={() => nudgeOffset(lane.laneId, beat)} className="nudge" title="Forward one beat">
              +beat
            </button>
            <button onClick={() => nudgeOffset(lane.laneId, bar)} className="nudge" title="Forward one bar">
              +bar
            </button>
            <button
              onClick={() => setOffset(lane.laneId, snap(playhead))}
              className="nudge"
              title="Move this lane's start to the playhead"
            >
              to playhead
            </button>
            {lane.offsetSeconds > 0 && (
              <button onClick={() => setOffset(lane.laneId, 0)} className="nudge" title="Back to zero">
                reset
              </button>
            )}
            <span className="ml-auto font-mono tabular-nums">
              {formatOffset(lane.offsetSeconds)} → {formatOffset(lane.offsetSeconds + lane.duration)}
            </span>
          </div>

          <div ref={trackRef} className="relative h-[68px] overflow-hidden rounded-lg bg-background">
            {/* Bar grid behind the clip, so a lane's start reads against the beat. */}
            {Array.from({ length: Math.ceil(span / bar) }, (_, i) => (
              <div
                key={i}
                className="absolute inset-y-0 w-px bg-border/60"
                style={{ left: `${((i * bar) / span) * 100}%` }}
              />
            ))}

            <div
              onPointerDown={handleClipPointerDown}
              onPointerMove={handleClipPointerMove}
              onPointerUp={handleClipPointerUp}
              onPointerCancel={handleClipPointerUp}
              className="absolute inset-y-0 cursor-grab touch-none rounded-md border active:cursor-grabbing"
              style={{
                left: `${(lane.offsetSeconds / span) * 100}%`,
                width: `${(lane.duration / span) * 100}%`,
                borderColor: accent,
                background: `${accent}12`,
              }}
              title="Drag to move this lane in time · click to seek"
            >
              <Waveform
                peaks={lane.peaks}
                color={`${accent}55`}
                progressColor={accent}
                progress={laneProgress}
                height={66}
              />
            </div>

            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/70"
              style={{ left: `${(playhead / span) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {showFx && <LaneFxPanel lane={lane} />}
    </div>
  );
}
