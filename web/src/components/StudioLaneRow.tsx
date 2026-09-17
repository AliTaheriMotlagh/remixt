"use client";

import { useRef, useState } from "react";
import Waveform from "./Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";

export default function StudioLaneRow({ lane }: { lane: StudioLane }) {
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.duration);
  const isRendering = useStudioStore((s) => s.renderingLaneIds.has(lane.laneId));
  const removeLane = useStudioStore((s) => s.removeLane);
  const setVolume = useStudioStore((s) => s.setVolume);
  const toggleMute = useStudioStore((s) => s.toggleMute);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const setPitchSemitones = useStudioStore((s) => s.setPitchSemitones);

  const [pitchDraft, setPitchDraft] = useState(lane.pitchSemitones);
  const [lastSeenPitch, setLastSeenPitch] = useState(lane.pitchSemitones);
  const pitchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the slider in sync if pitch changes from outside this component
  // (loading a remix, "reset tempo", etc.) — adjusted during render rather
  // than in an Effect, per React's state-reset-on-prop-change pattern.
  if (lane.pitchSemitones !== lastSeenPitch) {
    setLastSeenPitch(lane.pitchSemitones);
    setPitchDraft(lane.pitchSemitones);
  }

  function handlePitchChange(value: number) {
    setPitchDraft(value);
    if (pitchDebounce.current) clearTimeout(pitchDebounce.current);
    pitchDebounce.current = setTimeout(() => {
      setPitchSemitones(lane.laneId, value);
    }, 150);
  }

  const accent = lane.kind === "vocals" ? "var(--vocals)" : "var(--beat)";
  const progress = duration > 0 ? playhead / duration : 0;
  const effectiveBpm = lane.bpm ? lane.bpm * lane.tempoRatio : null;
  const isMatched = Math.abs(lane.tempoRatio - 1) > 0.001;

  function handleSeek(fraction: number) {
    audioEngine.seek(fraction * duration);
  }

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex w-48 shrink-0 flex-col justify-between gap-2 border-r border-border pr-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ background: accent }}
            >
              {lane.kind === "vocals" ? "Vocals" : "Beat"}
            </span>
            {lane.bpm && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  isMatched
                    ? "bg-success/15 text-success"
                    : "bg-surface-raised text-muted"
                }`}
                title={isMatched ? `Matched from ${lane.bpm} BPM` : "Detected BPM"}
              >
                {effectiveBpm ? effectiveBpm.toFixed(1) : lane.bpm} BPM
              </span>
            )}
            {isRendering && (
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-brand-strong" />
            )}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium">{lane.trackTitle}</p>
          <p className="truncate text-xs text-muted">{lane.artistName}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => toggleMute(lane.laneId)}
            className={`h-6 w-6 rounded text-[11px] font-bold transition-colors ${
              lane.muted
                ? "bg-danger text-white"
                : "bg-surface-raised text-muted hover:text-foreground"
            }`}
            title="Mute"
          >
            M
          </button>
          <button
            onClick={() => toggleSolo(lane.laneId)}
            className={`h-6 w-6 rounded text-[11px] font-bold transition-colors ${
              lane.solo
                ? "bg-success text-white"
                : "bg-surface-raised text-muted hover:text-foreground"
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
            title="Volume"
          />
          <button
            onClick={() => removeLane(lane.laneId)}
            className="h-6 w-6 shrink-0 rounded text-xs text-muted hover:bg-danger/15 hover:text-danger"
            title="Remove"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-9 shrink-0 text-[10px] text-muted" title="Pitch (semitones)">
            Pitch
          </span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={pitchDraft}
            onChange={(e) => handlePitchChange(Number(e.target.value))}
            className="h-1.5 flex-1 accent-brand-strong"
          />
          <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted">
            {pitchDraft > 0 ? `+${pitchDraft}` : pitchDraft}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <Waveform
          peaks={lane.peaks}
          color={`${accent}40`}
          progressColor={accent}
          progress={progress}
          height={68}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
