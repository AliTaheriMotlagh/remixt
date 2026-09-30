"use client";

import { useMemo, useRef, useState } from "react";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import Waveform from "./Waveform";
import LaneFxPanel from "./LaneFxPanel";
import LaneMatchPanel from "./LaneMatchPanel";
import AutomationLane from "./studio/AutomationLane";
import KeyHelper from "./studio/KeyHelper";
import TapTempo from "./studio/TapTempo";
import { audioEngine } from "@/lib/client/audioEngine";
import { cutSilences } from "@/lib/client/autoMatch";
import { exportLane } from "@/lib/client/mixdown";
import { previewPlayer } from "@/lib/client/previewPlayer";
import { ALL_KEYS, camelotCode, keyId, keyLabel, parseKeyId } from "@/lib/client/musicKey";
import {
  beatLength,
  clipSpan,
  clipStart,
  clipsOf,
  effectiveKey,
  referenceLane,
  useStudioStore,
  viewDuration,
  type LaneClip,
  type StudioLane,
} from "@/lib/client/studioStore";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

function formatOffset(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = (abs % 60).toFixed(2).padStart(5, "0");
  return `${sign}${m}:${s}`;
}

/**
 * The parts of a lane that follow the playhead. They subscribe to it on
 * their own, so playback re-renders these few elements each frame rather
 * than the whole lane with all its controls.
 */
function LaneWaveform({ lane, accent }: { lane: StudioLane; accent: string }) {
  const playhead = useStudioStore((s) => s.playhead);
  const progress =
    lane.duration > 0
      ? Math.min(1, Math.max(0, (playhead - lane.offsetSeconds) / lane.duration))
      : 0;
  return (
    <Waveform
      peaks={lane.peaks}
      color={`${accent}99`}
      progressColor={accent}
      progress={progress}
      height={66}
    />
  );
}

/** The slice of the lane's waveform one clip plays. Drawn once, no progress. */
function ClipWaveform({ lane, clip, accent }: { lane: StudioLane; clip: LaneClip; accent: string }) {
  const { peaks: all, originalDuration } = lane;
  const peaks = useMemo(() => {
    if (!all.length || !(originalDuration > 0)) return [];
    const from = Math.floor((clip.from / originalDuration) * all.length);
    const to = Math.ceil((clip.to / originalDuration) * all.length);
    return all.slice(from, Math.max(from + 1, to));
  }, [all, originalDuration, clip.from, clip.to]);
  return <Waveform peaks={peaks} color={`${accent}cc`} height={66} />;
}

type DragMode = "move" | "trim-start" | "trim-end";

function LanePlayhead({ span }: { span: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-px bg-foreground/70"
      style={{ left: `${(playhead / span) * 100}%` }}
    />
  );
}

export default function StudioLaneRow({ lane }: { lane: StudioLane }) {
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
  const moveClip = useStudioStore((s) => s.moveClip);
  const trimClip = useStudioStore((s) => s.trimClip);
  const splitAt = useStudioStore((s) => s.splitAt);
  const deleteClip = useStudioStore((s) => s.deleteClip);
  const duplicateClip = useStudioStore((s) => s.duplicateClip);
  const clearClips = useStudioStore((s) => s.clearClips);
  const nudgeOffset = useStudioStore((s) => s.nudgeOffset);
  const matchLaneToProject = useStudioStore((s) => s.matchLaneToProject);
  const setLaneKey = useStudioStore((s) => s.setLaneKey);
  const matchLaneKey = useStudioStore((s) => s.matchLaneKey);
  const keyReference = useStudioStore((s) => referenceLane(s.lanes, (l) => !!l.musicalKey));
  const setLaneXfade = useStudioStore((s) => s.setLaneXfade);
  const setClipOptions = useStudioStore((s) => s.setClipOptions);
  const stutterAt = useStudioStore((s) => s.stutterAt);
  const addPad = useStudioStore((s) => s.addPad);
  const padCount = useStudioStore((s) => s.pads.length);
  const isSelected = useStudioStore((s) => s.selectedLaneIds.includes(lane.laneId));
  const groupSize = useStudioStore((s) => (s.selectedLaneIds.includes(lane.laneId) ? s.selectedLaneIds.length : 0));
  const toggleLaneSelected = useStudioStore((s) => s.toggleLaneSelected);
  const moveLanes = useStudioStore((s) => s.moveLanes);
  const setLaneOffsets = useStudioStore((s) => s.setLaneOffsets);

  const [showFx, setShowFx] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  // Phones: the lane shows its waveform and levels; the rest folds away.
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedClip, setSelectedClip] = useState<number | null>(null);
  const [cutting, setCutting] = useState(false);
  // Exporting this lane or cutting its silences.
  useKeepScreenOn("lane-work", exporting || cutting);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [pitchDraft, setPitchDraft] = useState(lane.pitchSemitones);
  const [lastSeenPitch, setLastSeenPitch] = useState(lane.pitchSemitones);
  const [tempoDraft, setTempoDraft] = useState(lane.tempoRatio);
  const [lastSeenTempo, setLastSeenTempo] = useState(lane.tempoRatio);
  const pitchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: DragMode;
    index: number;
    startX: number;
    /** Timeline position of what's being dragged (clip start, or the trimmed edge). */
    startPosition: number;
    width: number;
    span: number;
    moved: boolean;
    /** Where each lane of the selection started, when they're dragged as a group. */
    group: Record<string, number> | null;
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

  const accent = kindColor(lane.kind);
  const span = viewDuration(projectDuration, projectBpm);
  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const effectiveBpm = lane.bpm ? lane.bpm * lane.tempoRatio : null;
  const isStretched = Math.abs(lane.tempoRatio - 1) > 0.001;
  const soundingKey = effectiveKey(lane);
  const isReference = keyReference?.laneId === lane.laneId;

  function snap(seconds: number) {
    return snapToGrid ? Math.round(seconds / beat) * beat : seconds;
  }

  /** The lanes this lane moves with: the selection, when it's part of one. */
  function movingGroup(): string[] | null {
    const selection = useStudioStore.getState().selectedLaneIds;
    return selection.length > 1 && selection.includes(lane.laneId) ? selection : null;
  }

  /** Nudges this lane — or, when it's selected with others, the whole group. */
  function nudge(deltaSeconds: number) {
    const group = movingGroup();
    if (group) moveLanes(group, deltaSeconds);
    else nudgeOffset(lane.laneId, deltaSeconds);
  }

  /** Starts this lane at `seconds`, bringing the rest of its group along. */
  function startAt(seconds: number) {
    const group = movingGroup();
    if (group) moveLanes(group, seconds - lane.offsetSeconds);
    else setOffset(lane.laneId, seconds);
  }

  const clips = clipsOf(lane);
  const arranged = !!lane.clips?.length;
  const selected = arranged && selectedClip !== null && selectedClip < clips.length ? selectedClip : null;

  // Pointer-down lands on a clip or one of its edges; the move/up events
  // that follow bubble up to the track, which does the dragging.
  function handleDragStart(e: React.PointerEvent<HTMLDivElement>, mode: DragMode, index: number) {
    if (!trackRef.current) return;
    e.stopPropagation();
    const clip = clips[index];
    const start = clipStart(lane, clip);
    drag.current = {
      mode,
      index,
      startX: e.clientX,
      startPosition: mode === "trim-end" ? start + clipSpan(clip) / lane.tempoRatio : start,
      width: trackRef.current.clientWidth,
      span,
      moved: false,
      group: null,
    };
    // Grabbing any clip of a selected lane moves the whole selection.
    const group = mode === "move" ? movingGroup() : null;
    if (group) {
      const lanes = useStudioStore.getState().lanes.filter((l) => group.includes(l.laneId));
      drag.current.group = Object.fromEntries(lanes.map((l) => [l.laneId, l.offsetSeconds]));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < 3) return;
    state.moved = true;
    const deltaSeconds = (dx / state.width) * state.span;
    if (state.mode === "move") {
      // Snap the *movement* to whole beats rather than the absolute position,
      // so a clip that was lined up off-grid (AI Match puts each phrase at
      // its own spot in the bar) keeps its feel while it's dragged.
      if (state.group) {
        // Same shift for every lane, stopped where the earliest hits zero.
        const earliest = Math.min(...Object.values(state.group));
        const shift = Math.max(-earliest, snap(deltaSeconds));
        setLaneOffsets(Object.fromEntries(Object.entries(state.group).map(([id, start]) => [id, start + shift])));
        return;
      }
      const position = Math.max(0, state.startPosition + snap(deltaSeconds));
      if (arranged) moveClip(lane.laneId, state.index, position);
      else setOffset(lane.laneId, position);
    } else {
      // Trims follow the pointer exactly — cuts belong between words, not on the grid.
      trimClip(lane.laneId, state.index, state.mode === "trim-start" ? "start" : "end", state.startPosition + deltaSeconds);
    }
  }

  // The browser took the gesture over (the page scrolled): drop the drag
  // without treating it as a tap.
  function handleDragCancel() {
    drag.current = null;
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved && trackRef.current) {
      // A plain click selects the clip and seeks, the same as clicking the ruler.
      setSelectedClip(state.index);
      const rect = trackRef.current.getBoundingClientRect();
      audioEngine.seek(((e.clientX - rect.left) / rect.width) * span);
    }
  }

  function handleSplit() {
    const playhead = useStudioStore.getState().playhead;
    const done = splitAt(lane.laneId, playhead);
    setEditNote(done ? null : "Put the playhead over this lane's audio to split there");
  }

  function handleStutter(value: string) {
    const [beats, repeats] = value.split("x").map(Number);
    const playhead = useStudioStore.getState().playhead;
    const done = stutterAt(lane.laneId, playhead, beats, repeats);
    setSelectedClip(null);
    setEditNote(done ? null : "Put the playhead over this lane's audio to repeat from there");
  }

  function sendToPad(index: number | null) {
    const state = useStudioStore.getState();
    let from: number;
    let to: number;
    let reverse = false;
    let label: string;
    if (index !== null) {
      const clip = clips[index];
      ({ from, to } = clip);
      reverse = !!clip.reverse;
      label = `${lane.trackTitle.slice(0, 14)} #${index + 1}`;
    } else {
      // No clip picked: one bar of the stem from the playhead.
      const clip = clips.find((c) => {
        const start = clipStart(lane, c);
        return state.playhead >= start && state.playhead < start + clipSpan(c) / lane.tempoRatio;
      });
      if (!clip) {
        setEditNote("Put the playhead over this lane's audio (or select a clip) to make a pad");
        return;
      }
      from = clip.from + (state.playhead - clipStart(lane, clip)) * lane.tempoRatio * (clip.stretch ?? 1);
      to = Math.min(clip.to, from + beatLength(state.projectBpm) * 4 * lane.tempoRatio);
      label = `${lane.trackTitle.slice(0, 14)} bar`;
    }
    if (padCount >= 16) {
      setEditNote("All 16 pads are full — remove one first");
      return;
    }
    addPad({
      stemId: lane.stemId,
      kind: lane.kind,
      label,
      from,
      to,
      reverse,
      tempoRatio: lane.tempoRatio,
      pitchSemitones: lane.pitchSemitones,
    });
    setEditNote(null);
  }

  async function handleCutSilences() {
    setCutting(true);
    setEditNote(null);
    try {
      const count = await cutSilences(lane.laneId);
      setSelectedClip(null);
      setEditNote(count ? null : "Couldn't find any silences to cut");
    } catch {
      setEditNote("Couldn't analyse this lane");
    } finally {
      setCutting(false);
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
    <div
      id={`lane-${lane.laneId}`}
      className={`scroll-mt-40 rounded-xl border bg-surface p-3 transition-colors ${
        isSelected ? "border-brand ring-1 ring-brand/40" : "border-border"
      }`}
    >
      {/* Phones stack it — name, levels, waveform, then the controls — by
          dissolving the side column (display: contents) and ordering its
          parts; from md up it's the side column beside the track. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
        <div className="flex flex-col justify-between gap-2 max-md:contents md:w-56 md:shrink-0 md:border-r md:border-border md:pr-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => toggleLaneSelected(lane.laneId)}
                aria-pressed={isSelected}
                aria-label={isSelected ? "Deselect this lane" : "Select this lane to move it with others"}
                title={isSelected ? "Selected — moves with the other selected lanes" : "Select to move together with other lanes"}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold transition-colors pointer-coarse:h-8 pointer-coarse:w-8 pointer-coarse:rounded-lg ${
                  isSelected ? "border-brand bg-brand text-white" : "border-border text-transparent hover:border-brand"
                }`}
              >
                ✓
              </button>
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: accent }}
              >
                {kindLabel(lane.kind)}
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
              {soundingKey && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    lane.pitchSemitones !== 0 ? "bg-success/15 text-success" : "bg-surface-raised text-muted"
                  }`}
                  title={
                    lane.pitchSemitones !== 0
                      ? `Shifted from ${keyLabel(lane.musicalKey!)}`
                      : "Key of the source material"
                  }
                >
                  {keyLabel(soundingKey)} · {camelotCode(soundingKey)}
                </span>
              )}
              {isRendering && (
                <span
                  className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-brand-strong"
                  title="Re-rendering pitch/tempo"
                />
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className={`ml-auto rounded-lg border px-3 py-1 text-xs font-medium transition-colors md:hidden ${
                  expanded ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted"
                }`}
              >
                Controls {expanded ? "▾" : "▸"}
              </button>
            </div>
            <p className="mt-1.5 truncate text-sm font-medium" title={lane.trackTitle}>
              {lane.trackTitle}
            </p>
            <p className="truncate text-xs text-muted">{lane.artistName}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => toggleMute(lane.laneId)}
              className={`h-6 w-6 shrink-0 rounded text-[11px] font-bold transition-colors pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:rounded-lg pointer-coarse:text-xs ${
                lane.muted ? "bg-danger text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
              title="Mute"
              aria-label="Mute"
              aria-pressed={lane.muted}
            >
              M
            </button>
            <button
              onClick={() => toggleSolo(lane.laneId)}
              className={`h-6 w-6 shrink-0 rounded text-[11px] font-bold transition-colors pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:rounded-lg pointer-coarse:text-xs ${
                lane.solo ? "bg-success text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
              title="Solo"
              aria-label="Solo"
              aria-pressed={lane.solo}
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
              className="h-1.5 min-w-0 flex-1 accent-brand"
              title={`Volume — ${Math.round(lane.volume * 100)}%`}
              aria-label="Volume"
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
              className="h-6 w-6 shrink-0 rounded text-[10px] text-muted hover:bg-surface-raised hover:text-foreground pointer-coarse:h-9 pointer-coarse:w-9"
              title="Preview the original stem on its own"
              aria-label="Preview the original stem"
            >
              ▶
            </button>
          </div>

          <div className={`${expanded ? "flex" : "hidden"} flex-col gap-2 max-md:order-2 max-md:border-t max-md:border-border max-md:pt-3 md:contents`}>
            <div className="flex items-center gap-1.5">
              <span className="w-9 shrink-0 text-[10px] text-muted">Pitch</span>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitchDraft}
                onChange={(e) => handlePitchChange(Number(e.target.value))}
                className="h-1.5 min-w-0 flex-1 accent-brand-strong"
                title="Pitch in semitones — key-shift a vocal to fit the beat"
                aria-label="Pitch in semitones"
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
                className="h-1.5 min-w-0 flex-1 accent-brand-strong"
                title="Time-stretch without changing pitch"
                aria-label="Speed"
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
              <TapTempo
                onTempo={(bpm) => setLaneBpm(lane.laneId, Math.round((bpm / lane.tempoRatio) * 10) / 10)}
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

            <div className="flex items-center gap-1.5">
              <span className="w-9 shrink-0 text-[10px] text-muted" title="Source key — detected automatically, fix it if it's wrong">
                Key
              </span>
              <select
                value={lane.musicalKey ? keyId(lane.musicalKey) : ""}
                onChange={(e) => setLaneKey(lane.laneId, parseKeyId(e.target.value))}
                className="input !w-16 !px-1 !py-0.5 text-[11px]"
              >
                <option value="">{lane.musicalKey ? "—" : "…"}</option>
                {ALL_KEYS.map((key) => (
                  <option key={keyId(key)} value={keyId(key)}>
                    {keyLabel(key)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => matchLaneKey(lane.laneId)}
                disabled={!lane.musicalKey || !keyReference || isReference}
                className="flex-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-brand/60 hover:text-foreground disabled:opacity-40"
                title={
                  isReference
                    ? "This lane sets the project key"
                    : keyReference && effectiveKey(keyReference)
                      ? `Pitch-shift into ${keyLabel(effectiveKey(keyReference)!)} (from “${keyReference.trackTitle}”)`
                      : "Waiting for key detection"
                }
              >
                {isReference ? "Project key" : "Match"}
              </button>
              <button
                onClick={() => setShowKeys((v) => !v)}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  showKeys ? "border-brand text-foreground" : "border-border text-muted hover:text-foreground"
                }`}
                title="Every key this lane can be shifted to, and how each fits the project"
              >
                keys
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowAuto((v) => !v)}
                className={`flex-1 rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                  showAuto || lane.automation.volume?.length || lane.automation.filter?.length
                    ? "border-brand bg-brand/15 text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
                title="Draw volume and filter changes over the song"
              >
                〰 Auto {showAuto ? "▾" : "▸"}
              </button>
              <button
                onClick={() => setLaneXfade(lane.laneId, lane.xfade === null ? "a" : lane.xfade === "a" ? "b" : null)}
                className={`w-12 rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                  lane.xfade ? "border-beat bg-beat/15 text-foreground" : "border-border text-muted hover:text-foreground"
                }`}
                title="Put this lane on side A or B of the crossfader (in the transport) — e.g. two vocals to switch between"
              >
                {lane.xfade ? `Side ${lane.xfade.toUpperCase()}` : "A/B"}
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
                onClick={() => setShowMatch((v) => !v)}
                className={`flex-1 whitespace-nowrap rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                  showMatch
                    ? "border-brand bg-brand/15 text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
                title={`Match this ${lane.kind === "vocals" ? "vocal with a beat" : "beat with a vocal"} — choose tempo, structure and sound`}
              >
                🎚 Match {showMatch ? "▾" : "▸"}
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
                aria-label="Remove lane"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col max-md:order-1">
          <div
            className={`${expanded ? "flex" : "hidden"} mb-1 flex-wrap items-center gap-1 text-[10px] text-muted max-md:order-2 max-md:mt-2 md:flex`}
          >
            <span className="mr-0.5">
              Start
              {groupSize > 1 && <span className="ml-1 text-brand-strong">· moves {groupSize} lanes</span>}
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={Number(lane.offsetSeconds.toFixed(3))}
              onChange={(e) => setOffset(lane.laneId, Number(e.target.value))}
              className="input !w-20 !px-1.5 !py-0.5 text-[11px]"
              title="Where this lane starts on the timeline, in seconds"
            />
            <button onClick={() => nudge(-bar)} className="nudge" title="Back one bar">
              −bar
            </button>
            <button
              onClick={() => nudge(-2 * beat)}
              className="nudge"
              title="Back half a bar — when the phrasing lands on the 3 instead of the 1"
            >
              −½bar
            </button>
            <button onClick={() => nudge(-beat)} className="nudge" title="Back one beat">
              −beat
            </button>
            <button onClick={() => nudge(beat)} className="nudge" title="Forward one beat">
              +beat
            </button>
            <button
              onClick={() => nudge(2 * beat)}
              className="nudge"
              title="Forward half a bar — when the phrasing lands on the 3 instead of the 1"
            >
              +½bar
            </button>
            <button onClick={() => nudge(bar)} className="nudge" title="Forward one bar">
              +bar
            </button>
            <button
              onClick={() => startAt(snap(useStudioStore.getState().playhead))}
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

          <div
            className={`${expanded ? "flex" : "hidden"} mb-1 flex-wrap items-center gap-1 text-[10px] text-muted max-md:order-2 md:flex`}
          >
            <span className="mr-0.5">Edit</span>
            <button onClick={handleSplit} className="nudge" title="Cut the clip under the playhead in two">
              ✂ split at playhead
            </button>
            <button
              onClick={handleCutSilences}
              disabled={cutting}
              className="nudge disabled:opacity-40"
              title="Split at every silence and drop the gaps — each phrase stays where it is and becomes its own clip"
            >
              {cutting ? "listening…" : "cut silences"}
            </button>
            <select
              value=""
              onChange={(e) => e.target.value && handleStutter(e.target.value)}
              className="rounded border border-border bg-transparent px-1 py-0.5 text-[10px] text-muted hover:border-brand"
              title="Beat repeat: repeat the slice at the playhead, DJ-style"
            >
              <option value="">stutter…</option>
              <option value="0.25x8">1/16 × 8</option>
              <option value="0.5x4">1/8 × 4</option>
              <option value="0.5x8">1/8 × 8</option>
              <option value="1x4">1 beat × 4</option>
              <option value="2x2">½ bar × 2</option>
              <option value="4x2">1 bar × 2</option>
            </select>
            <button
              onClick={() => sendToPad(selected)}
              className="nudge"
              title={
                selected !== null
                  ? "Put the selected clip on a sample pad"
                  : "Put one bar from the playhead on a sample pad"
              }
            >
              → pad
            </button>
            {selected !== null && (
              <>
                <button
                  onClick={() =>
                    setClipOptions(lane.laneId, selected, {
                      reverse: !clips[selected].reverse,
                      stretch: clips[selected].stretch,
                    })
                  }
                  className={`nudge ${clips[selected].reverse ? "!border-brand !text-foreground" : ""}`}
                  title="Play the selected clip backwards"
                >
                  ⟲ reverse
                </button>
                <button
                  onClick={() => {
                    const clip = clips[selected];
                    const half = Math.abs((clip.stretch ?? 1) - 0.5) < 0.001;
                    setClipOptions(lane.laneId, selected, { reverse: clip.reverse, stretch: half ? 1 : 0.5 });
                  }}
                  className={`nudge ${Math.abs((clips[selected].stretch ?? 1) - 0.5) < 0.001 ? "!border-brand !text-foreground" : ""}`}
                  title="Half speed — the clip plays twice as long, same pitch"
                >
                  ½ speed
                </button>
                <button
                  onClick={() => duplicateClip(lane.laneId, selected)}
                  className="nudge"
                  title="Copy the selected clip and place the copy right after it"
                >
                  duplicate clip
                </button>
                <button
                  onClick={() => {
                    deleteClip(lane.laneId, selected);
                    setSelectedClip(null);
                  }}
                  disabled={clips.length < 2}
                  className="nudge hover:!text-danger disabled:opacity-40"
                  title="Delete the selected clip"
                >
                  delete clip
                </button>
              </>
            )}
            {arranged && (
              <>
                <span className="ml-1">
                  {clips.length} clip{clips.length === 1 ? "" : "s"}
                  {selected !== null && ` · #${selected + 1} selected`}
                </span>
                <button
                  onClick={() => {
                    clearClips(lane.laneId);
                    setSelectedClip(null);
                  }}
                  className="nudge"
                  title="Undo all the cuts: play the whole stem again, lined up on the first clip"
                >
                  whole take
                </button>
              </>
            )}
            {editNote && <span className="text-danger">{editNote}</span>}
          </div>

          <div
            ref={trackRef}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragCancel}
            className="relative h-[68px] overflow-hidden rounded-lg bg-background"
          >
            {/* Bar grid behind the clip, so a lane's start reads against the beat. */}
            {Array.from({ length: Math.ceil(span / bar) }, (_, i) => (
              <div
                key={i}
                className="absolute inset-y-0 w-px bg-border/60"
                style={{ left: `${((i * bar) / span) * 100}%` }}
              />
            ))}

            {clips.map((clip, i) => (
              <div
                key={i}
                onPointerDown={(e) => handleDragStart(e, "move", i)}
                className={`absolute inset-y-0 cursor-grab touch-pan-y overflow-hidden rounded-md border active:cursor-grabbing ${
                  selected === i ? "ring-2 ring-foreground/70" : ""
                }`}
                style={{
                  left: `${(clipStart(lane, clip) / span) * 100}%`,
                  width: `${(clipSpan(clip) / lane.tempoRatio / span) * 100}%`,
                  borderColor: accent,
                  background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                }}
                title={
                  arranged
                    ? "Drag to move this clip · drag an edge to trim · click to select and seek"
                    : "Drag to move this lane in time · drag an edge to trim · click to seek"
                }
              >
                {arranged ? (
                  <ClipWaveform lane={lane} clip={clip} accent={accent} />
                ) : (
                  <LaneWaveform lane={lane} accent={accent} />
                )}
                <div
                  onPointerDown={(e) => handleDragStart(e, "trim-start", i)}
                  className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize touch-none hover:bg-foreground/40 pointer-coarse:w-3 pointer-coarse:bg-foreground/15"
                  title="Drag to trim the start"
                />
                <div
                  onPointerDown={(e) => handleDragStart(e, "trim-end", i)}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize touch-none hover:bg-foreground/40 pointer-coarse:w-3 pointer-coarse:bg-foreground/15"
                  title="Drag to trim the end"
                />
              </div>
            ))}

            <LanePlayhead span={span} />
          </div>
        </div>
      </div>

      {showAuto && (
        // Lined up under the lane's track, so points sit under the audio they change.
        <div className="md:pl-[14.75rem]">
          <AutomationLane lane={lane} span={span} accent={accent} />
        </div>
      )}
      {showKeys && <KeyHelper lane={lane} />}
      {showFx && <LaneFxPanel lane={lane} />}
      {showMatch && <LaneMatchPanel lane={lane} />}
    </div>
  );
}
