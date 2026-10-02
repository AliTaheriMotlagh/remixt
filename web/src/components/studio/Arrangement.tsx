"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import Waveform from "../Waveform";
import AutomationLane from "./AutomationLane";
import { openMenu, useLongPress } from "./ContextMenu";
import { clipMenu, laneMenu, rulerMenu, selectForMenu, trackMenu } from "./studioMenus";
import * as commands from "@/lib/client/clipCommands";
import {
  clipEnd,
  clipId,
  clipSpan,
  clipStart,
  clipsOf,
  duplicateClips,
  liveRefs,
  moveClips,
  sameRef,
  type ClipRef,
} from "@/lib/client/clipEdit";
import { audioEngine } from "@/lib/client/audioEngine";
import { camelotCode, keyLabel } from "@/lib/client/musicKey";
import { startNewStep } from "@/lib/client/studioHistory";
import {
  beatLength,
  effectiveKey,
  getAudibleLaneIds,
  useStudioStore,
  viewDuration,
  type LaneClip,
  type StudioLane,
} from "@/lib/client/studioStore";
import { MAX_ZOOM, useStudioView } from "@/lib/client/studioView";

// The arrangement: a column of compact lane headers beside one shared,
// zoomable timeline — ruler on top, every lane's clips below, one playhead
// through all of them. Clips are picked like in any DAW: click, Shift/⌘
// click to add, drag across empty space to lasso, Alt-drag to copy;
// right-click (or long-press) for everything else. Pinch or ⌘/Ctrl-scroll
// zooms.

const RULER_H = "h-9";
const LANE_H = "h-[4.25rem] sm:h-[4.75rem]";
const AUTO_H = "h-[5.75rem]";
const HEADER_W = "w-[7.5rem] sm:w-44 lg:w-52";

/** Whether the press that opened a context menu was a finger (we open our own on long-press). */
let lastPointerType = "mouse";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The lane's whole waveform, coloured as far as the playhead has got. */
function WholeWaveform({ lane, accent, height }: { lane: StudioLane; accent: string; height: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  const progress = lane.duration > 0 ? Math.min(1, Math.max(0, (playhead - lane.offsetSeconds) / lane.duration)) : 0;
  return <Waveform peaks={lane.peaks} color={`${accent}88`} progressColor={accent} progress={progress} height={height} />;
}

/** The slice of the stem's waveform one clip plays (mirrored when it plays backwards). */
function ClipWaveform({ lane, clip, accent, height }: { lane: StudioLane; clip: LaneClip; accent: string; height: number }) {
  const { peaks: all, originalDuration } = lane;
  const peaks = useMemo(() => {
    if (!all.length || !(originalDuration > 0)) return [];
    const from = Math.floor((clip.from / originalDuration) * all.length);
    const to = Math.ceil((clip.to / originalDuration) * all.length);
    const slice = all.slice(from, Math.max(from + 1, to));
    return clip.reverse ? slice.reverse() : slice;
  }, [all, originalDuration, clip.from, clip.to, clip.reverse]);
  return <Waveform peaks={peaks} color={`${accent}cc`} height={height} />;
}

type ClipHandlers = {
  onClipPointerDown: (e: React.PointerEvent, lane: StudioLane, clip: LaneClip, mode: "move" | "trim-start" | "trim-end") => void;
  onClipContextMenu: (e: React.MouseEvent, lane: StudioLane, clip: LaneClip) => void;
  onTrackContextMenu: (e: React.MouseEvent, lane: StudioLane) => void;
};

function LaneTrack({
  lane,
  span,
  pxPerSecond,
  audible,
  handlers,
}: {
  lane: StudioLane;
  span: number;
  pxPerSecond: number;
  audible: boolean;
  handlers: ClipHandlers;
}) {
  const selectedClips = useStudioStore((s) => s.selectedClips);
  const selected = useMemo(
    () => new Set(selectedClips.filter((r) => r.laneId === lane.laneId).map((r) => r.clipId)),
    [selectedClips, lane.laneId]
  );
  const accent = kindColor(lane.kind);
  const clips = clipsOf(lane);
  const arranged = !!lane.clips?.length;
  const waveHeight = 46;

  return (
    <div
      data-lane-track={lane.laneId}
      onContextMenu={(e) => handlers.onTrackContextMenu(e, lane)}
      className={`relative ${LANE_H} border-b border-border/70`}
    >
      {clips.map((clip, i) => {
        const id = clipId(clip);
        const isSelected = selected.has(id);
        const widthPx = (clipSpan(clip) / lane.tempoRatio) * pxPerSecond;
        const stretch = clip.stretch ?? 1;
        return (
          <div
            key={id === "whole" ? `whole-${i}` : id}
            data-clip-lane={lane.laneId}
            data-clip-id={id}
            onPointerDown={(e) => handlers.onClipPointerDown(e, lane, clip, "move")}
            onContextMenu={(e) => handlers.onClipContextMenu(e, lane, clip)}
            className={`group absolute inset-y-1 cursor-grab touch-pan-y overflow-hidden rounded-md border transition-[box-shadow,opacity] active:cursor-grabbing ${
              isSelected ? "z-10 shadow-[0_0_0_2px_var(--foreground)]" : "hover:shadow-[0_0_0_1px_var(--foreground)]"
            } ${audible ? "" : "opacity-40"}`}
            style={{
              left: `${(clipStart(lane, clip) / span) * 100}%`,
              width: `${(clipSpan(clip) / lane.tempoRatio / span) * 100}%`,
              borderColor: `color-mix(in srgb, ${accent} ${isSelected ? 100 : 60}%, transparent)`,
              background: `color-mix(in srgb, ${accent} ${isSelected ? 30 : 13}%, var(--background))`,
            }}
          >
            {widthPx > 44 && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex h-4 items-center gap-1 truncate px-1.5 text-[9.5px] font-semibold leading-none"
                style={{ background: `color-mix(in srgb, ${accent} ${isSelected ? 55 : 28}%, transparent)` }}
              >
                <span className="truncate">{arranged ? `${i + 1}` : lane.trackTitle}</span>
                {clip.reverse && <span title="Plays backwards">⟲</span>}
                {Math.abs(stretch - 1) > 0.05 && <span>{stretch < 1 ? `${(1 / stretch).toFixed(stretch === 0.5 ? 0 : 1)}× slow` : `${stretch.toFixed(1)}×`}</span>}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0.5">
              {arranged ? (
                <ClipWaveform lane={lane} clip={clip} accent={accent} height={waveHeight} />
              ) : (
                <WholeWaveform lane={lane} accent={accent} height={waveHeight} />
              )}
            </div>
            <div
              onPointerDown={(e) => handlers.onClipPointerDown(e, lane, clip, "trim-start")}
              className="absolute inset-y-0 left-0 z-[2] w-2 cursor-ew-resize touch-none opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:w-3.5 pointer-coarse:opacity-100"
              title="Drag to trim the start"
            >
              <span className="absolute inset-y-2 left-0.5 w-1 rounded-full bg-foreground/60" />
            </div>
            <div
              onPointerDown={(e) => handlers.onClipPointerDown(e, lane, clip, "trim-end")}
              className="absolute inset-y-0 right-0 z-[2] w-2 cursor-ew-resize touch-none opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:w-3.5 pointer-coarse:opacity-100"
              title="Drag to trim the end"
            >
              <span className="absolute inset-y-2 right-0.5 w-1 rounded-full bg-foreground/60" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LaneHeader({ lane, focused }: { lane: StudioLane; focused: boolean }) {
  const toggleMute = useStudioStore((s) => s.toggleMute);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const setVolume = useStudioStore((s) => s.setVolume);
  const isRendering = useStudioStore((s) => s.renderingLaneIds.has(lane.laneId));
  const automation = useStudioView((s) => s.automationLanes.includes(lane.laneId));
  const accent = kindColor(lane.kind);
  const key = effectiveKey(lane);
  const bpm = lane.bpm ? lane.bpm * lane.tempoRatio : null;
  const longPress = useLongPress((x, y) => openMenu(x, y, laneMenu(lane), lane.trackTitle));

  function select(e: React.MouseEvent) {
    const store = useStudioStore.getState();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      store.toggleLaneSelected(lane.laneId);
    } else {
      store.setLaneSelection([lane.laneId]);
    }
  }

  return (
    <div
      {...longPress}
      onClick={select}
      onDoubleClick={() => commands.selectLaneClips(lane.laneId)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (lastPointerType === "touch") return;
        useStudioStore.getState().setLaneSelection([lane.laneId]);
        openMenu(e.clientX, e.clientY, laneMenu(lane), lane.trackTitle);
      }}
      className={`group relative flex ${LANE_H} cursor-default items-stretch gap-1 border-b border-border/70 pr-1 pl-2.5 transition-colors ${
        focused ? "bg-brand/12" : "hover:bg-surface-hover/60"
      }`}
      title="Click to select · double-click to select its clips · right-click for options"
    >
      <span
        className={`absolute inset-y-1.5 left-0 rounded-r transition-all ${focused ? "w-1.5" : "w-1"}`}
        style={{ background: accent }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className="flex items-center gap-1 truncate text-[12.5px] font-medium leading-tight" title={lane.trackTitle}>
          {isRendering && <span className="h-1.5 w-1.5 shrink-0 animate-pulse-glow rounded-full bg-brand-strong" title="Re-rendering pitch/tempo" />}
          <span className="truncate">{lane.trackTitle}</span>
        </p>
        <p className="truncate text-[10px] leading-tight text-muted">
          <span style={{ color: accent }}>{kindLabel(lane.kind)}</span>
          {bpm && <span className="max-sm:hidden"> · {bpm.toFixed(1)}</span>}
          {key && (
            <span className="max-sm:hidden" title={keyLabel(key)}>
              {" "}
              · {camelotCode(key)}
            </span>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => toggleMute(lane.laneId)}
            aria-pressed={lane.muted}
            aria-label="Mute"
            title="Mute (M)"
            className={`h-5 w-5 shrink-0 rounded text-[10px] font-bold transition-colors pointer-coarse:h-7 pointer-coarse:w-7 ${
              lane.muted ? "bg-drums text-black" : "bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            M
          </button>
          <button
            onClick={() => toggleSolo(lane.laneId)}
            aria-pressed={lane.solo}
            aria-label="Solo"
            title="Solo (S)"
            className={`h-5 w-5 shrink-0 rounded text-[10px] font-bold transition-colors pointer-coarse:h-7 pointer-coarse:w-7 ${
              lane.solo ? "bg-success text-black" : "bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            S
          </button>
          {automation && <span className="text-[10px] text-brand-strong max-sm:hidden" title="Automation shown">〰</span>}
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={lane.volume}
            onChange={(e) => setVolume(lane.laneId, Number(e.target.value))}
            onDoubleClick={() => setVolume(lane.laneId, 1)}
            className="h-1 min-w-0 flex-1 max-sm:hidden"
            style={{ accentColor: accent }}
            title={`Volume ${Math.round(lane.volume * 100)}% · double-click for 100%`}
            aria-label="Volume"
          />
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          useStudioStore.getState().setLaneSelection([lane.laneId]);
          const rect = e.currentTarget.getBoundingClientRect();
          openMenu(rect.right, rect.top, laneMenu(lane), lane.trackTitle);
        }}
        className="flex w-6 shrink-0 items-center justify-center self-center rounded text-muted transition-colors hover:bg-surface-raised hover:text-foreground pointer-coarse:h-9 pointer-coarse:w-7"
        aria-label={`Options for ${lane.trackTitle}`}
        title="Lane options"
      >
        ⋯
      </button>
    </div>
  );
}

function Ruler({ span, pxPerSecond, contentRef }: { span: number; pxPerSecond: number; contentRef: React.RefObject<HTMLDivElement | null> }) {
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const markers = useStudioStore((s) => s.markers);
  const snapToGrid = useStudioStore((s) => s.snapToGrid);
  const setLoop = useStudioStore((s) => s.setLoop);
  const drag = useRef<{ time: number; x: number; looping: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const barPx = bar * pxPerSecond;
  const barCount = Math.ceil(span / bar);
  // Label every bar when there's room, else every 2nd, 4th, 8th…
  let labelEvery = 1;
  while (barPx * labelEvery < 34) labelEvery *= 2;

  function timeAt(clientX: number, snap = snapToGrid) {
    const rect = contentRef.current!.getBoundingClientRect();
    const seconds = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * span;
    return snap ? Math.round(seconds / beat) * beat : seconds;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    lastPointerType = e.pointerType;
    if (e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const time = timeAt(x);
    drag.current = {
      time,
      x,
      looping: false,
      timer:
        e.pointerType === "touch"
          ? setTimeout(() => {
              drag.current = null;
              openMenu(x, y, rulerMenu(timeAt(x, false)), "Timeline");
            }, 480)
          : null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.looping && Math.abs(e.clientX - d.x) < 10) return;
    if (d.timer) clearTimeout(d.timer);
    d.timer = null;
    const time = timeAt(e.clientX);
    if (Math.abs(time - d.time) < beat / 2) return;
    d.looping = true;
    setLoop({ enabled: true, start: Math.min(d.time, time), end: Math.max(d.time, time) });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    if (!d.looping) audioEngine.seek(timeAt(e.clientX));
  }

  const showLoop = loopEnd > loopStart;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (drag.current?.timer) clearTimeout(drag.current.timer);
        drag.current = null;
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lastPointerType === "touch") return;
        openMenu(e.clientX, e.clientY, rulerMenu(timeAt(e.clientX, false)), "Timeline");
      }}
      className={`relative ${RULER_H} cursor-pointer touch-pan-y border-b border-border bg-surface-raised/60`}
      title="Click to move the playhead · drag to set a loop · right-click for more"
    >
      {showLoop && (
        <div
          className={`absolute inset-y-0 border-x-2 ${loopEnabled ? "border-brand-strong bg-brand/30" : "border-muted/50 bg-foreground/5"}`}
          style={{ left: `${(loopStart / span) * 100}%`, width: `${((loopEnd - loopStart) / span) * 100}%` }}
        />
      )}
      {markers.map((m) => (
        <div
          key={m.id}
          className="pointer-events-none absolute bottom-0 h-2 border-l-2 border-beat bg-beat/25"
          style={{ left: `${(m.start / span) * 100}%`, width: `${((m.end - m.start) / span) * 100}%` }}
          title={m.label}
        >
          {(m.end - m.start) * pxPerSecond > 40 && (
            <span className="absolute -top-3 left-0.5 truncate text-[9px] font-semibold text-beat">{m.label}</span>
          )}
        </div>
      ))}
      {Array.from({ length: barCount }, (_, i) =>
        i % labelEvery === 0 ? (
          <div key={i} className="pointer-events-none absolute inset-y-0 border-l border-muted/40" style={{ left: `${((i * bar) / span) * 100}%` }}>
            <span className="absolute top-0.5 left-1 font-mono text-[10px] text-muted">{i + 1}</span>
          </div>
        ) : null
      )}
      {barPx > 60 &&
        Array.from({ length: barCount * 4 }, (_, i) =>
          i % 4 ? (
            <div
              key={`b${i}`}
              className="pointer-events-none absolute bottom-0 h-1.5 border-l border-muted/30"
              style={{ left: `${((i * beat) / span) * 100}%` }}
            />
          ) : null
        )}
    </div>
  );
}

/** The playhead line through the ruler and every lane; keeps itself in view while playing zoomed in. */
function Playhead({ span, scrollerRef }: { span: number; scrollerRef: React.RefObject<HTMLDivElement | null> }) {
  const playhead = useStudioStore((s) => s.playhead);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const zoom = useStudioView((s) => s.zoom);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !isPlaying || zoom <= 1) return;
    const x = (playhead / span) * el.scrollWidth;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth * 0.9) el.scrollLeft = x - el.clientWidth * 0.1;
  }, [playhead, isPlaying, zoom, span, scrollerRef]);
  return (
    <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-foreground shadow-[0_0_6px_var(--foreground)]" style={{ left: `${(playhead / span) * 100}%` }}>
      <span className="absolute -top-px -left-[5px] h-0 w-0 border-x-[5.5px] border-t-[7px] border-x-transparent border-t-foreground" />
    </div>
  );
}

/** Named sections ("chorus 0:42–1:05"): tap one to loop it; save the loop as one. */
function Sections() {
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
  if (!markers.length && !hasLoop) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2 text-[11px]">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Sections</span>
      {markers.map((m, i) => {
        const active = loopEnabled && Math.abs(m.start - loopStart) < 0.01 && Math.abs(m.end - loopEnd) < 0.01;
        return (
          <span key={m.id} className={`flex items-center overflow-hidden rounded-full border ${active ? "border-brand bg-brand/20" : "border-border bg-background"}`}>
            <button
              onClick={() => {
                setLoop({ enabled: true, start: m.start, end: m.end });
                audioEngine.seek(m.start);
              }}
              onDoubleClick={() => {
                const label = window.prompt("Name this section", m.label)?.trim();
                if (label) updateMarker(m.id, { label: label.slice(0, 40) });
              }}
              className="py-0.5 pr-1.5 pl-2.5"
              title={`${formatTime(m.start)}–${formatTime(m.end)} · tap to loop it · double-click to rename`}
            >
              <span className="mr-1 text-muted">{i + 1}</span>
              {m.label}
            </button>
            <button onClick={() => removeMarker(m.id)} className="px-1.5 py-0.5 text-muted hover:text-danger" aria-label={`Remove section ${m.label}`}>
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
    </div>
  );
}

/** Clip actions for what's selected — the same as the right-click menu, one tap away. */
function SelectionBar() {
  const lanes = useStudioStore((s) => s.lanes);
  const selectedClips = useStudioStore((s) => s.selectedClips);
  const multiSelect = useStudioView((s) => s.multiSelect);
  const setMultiSelect = useStudioView((s) => s.setMultiSelect);
  const count = useMemo(() => liveRefs(lanes, selectedClips).length, [lanes, selectedClips]);

  const action = "flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground pointer-coarse:h-9 pointer-coarse:px-2.5";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin" role="toolbar" aria-label="Clip tools">
      <button
        onClick={() => setMultiSelect(!multiSelect)}
        aria-pressed={multiSelect}
        className={`${action} hidden shrink-0 pointer-coarse:flex ${multiSelect ? "!bg-brand/20 !text-foreground" : ""}`}
        title="Tap clips to add them to the selection"
      >
        ☑ Select
      </button>
      {count === 0 ? (
        <span className="truncate px-2 text-[11px] text-muted">
          <span className="pointer-coarse:hidden">Click a clip · drag across empty space to select several · right-click for options</span>
          <span className="hidden pointer-coarse:inline">Tap a clip to select · long-press for options</span>
        </span>
      ) : (
        <>
          <span className="shrink-0 rounded-md bg-brand/20 px-2 py-1 text-[11px] font-semibold text-foreground">
            {count} clip{count === 1 ? "" : "s"}
          </span>
          <button onClick={() => commands.splitAt()} className={action} title="Split at the playhead (X)">
            ✂<span className="max-md:hidden">Split</span>
          </button>
          <button onClick={() => commands.duplicate()} className={action} title="Duplicate (⌘/Ctrl D)">
            ⊕<span className="max-md:hidden">Duplicate</span>
          </button>
          <button onClick={() => commands.duplicate(3)} className={action} title="Repeat ×4">
            ×4
          </button>
          <button onClick={commands.reverse} className={action} title="Reverse (R)">
            ⟲<span className="max-md:hidden">Reverse</span>
          </button>
          <button onClick={() => commands.quantize("beat")} className={action} title="Snap starts to the beat (Q)">
            ⌗<span className="max-md:hidden">Quantize</span>
          </button>
          <button onClick={commands.loopSelection} className={action} title="Loop and play the selection (⇧L)">
            🔁<span className="max-md:hidden">Loop</span>
          </button>
          <button onClick={commands.copy} className={action} title="Copy (⌘/Ctrl C)">
            ⧉
          </button>
          <button onClick={() => commands.paste()} className={action} title="Paste at the playhead (⌘/Ctrl V)">
            📋
          </button>
          <button onClick={commands.remove} className={`${action} hover:!text-danger`} title="Delete (⌫)">
            🗑
          </button>
          <button onClick={commands.clearSelection} className={action} title="Deselect (Esc)">
            ✕
          </button>
        </>
      )}
    </div>
  );
}

type Gesture =
  | {
      kind: "clip";
      mode: "move" | "trim-start" | "trim-end";
      laneId: string;
      clipId: string;
      ref: ClipRef;
      startX: number;
      startY: number;
      contentWidth: number;
      startPosition: number;
      base: StudioLane[];
      refs: ClipRef[];
      alt: boolean;
      duplicated: boolean;
      moved: boolean;
      narrowOnClick: boolean;
      timer: ReturnType<typeof setTimeout> | null;
      touch: boolean;
    }
  | {
      kind: "marquee";
      startX: number;
      startY: number;
      base: ClipRef[];
      moved: boolean;
      touch: boolean;
      timer: ReturnType<typeof setTimeout> | null;
      laneId: string | null;
    };

export default function Arrangement() {
  const lanes = useStudioStore((s) => s.lanes);
  const projectDuration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const selectedLaneIds = useStudioStore((s) => s.selectedLaneIds);
  const zoom = useStudioView((s) => s.zoom);
  const setZoom = useStudioView((s) => s.setZoom);
  const automationLanes = useStudioView((s) => s.automationLanes);
  const toggleAutomation = useStudioView((s) => s.toggleAutomation);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const zoomAnchor = useRef<{ time: number; x: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const span = viewDuration(projectDuration, projectBpm);
  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const contentWidth = viewportWidth * zoom;
  const pxPerSecond = contentWidth / span;
  const audible = getAudibleLaneIds(lanes);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth || 800));
    observer.observe(el);
    return () => observer.disconnect();
  }, [lanes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a zoom, put the moment that was under the pointer back under it.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const anchor = zoomAnchor.current;
    if (!el || !anchor) return;
    zoomAnchor.current = null;
    el.scrollLeft = (anchor.time / span) * el.scrollWidth - anchor.x;
  }, [zoom, span]);

  function zoomTo(next: number, clientX?: number) {
    const el = scrollerRef.current;
    if (!el) return setZoom(next);
    const rect = el.getBoundingClientRect();
    const x = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    zoomAnchor.current = { time: ((el.scrollLeft + x) / el.scrollWidth) * span, x };
    setZoom(next);
  }

  // ⌘/Ctrl + scroll (and a trackpad pinch, which arrives as one) zooms.
  // Two fingers on a touch screen pinch-zoom the same way.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const current = useStudioView.getState().zoom;
      zoomTo(current * Math.exp(-e.deltaY * 0.01), e.clientX);
    };
    let pinch: { distance: number; zoom: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { distance: distance(e.touches), zoom: useStudioView.getState().zoom };
      // A second finger means a pinch, not a clip drag or a lasso.
      if (gesture.current?.timer) clearTimeout(gesture.current.timer);
      gesture.current = null;
      setMarquee(null);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      zoomTo(pinch.zoom * (distance(e.touches) / pinch.distance), mid);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [lanes.length > 0, span]); // eslint-disable-line react-hooks/exhaustive-deps

  function timeAt(clientX: number) {
    const rect = contentRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * span;
  }

  function snapDelta(seconds: number) {
    return useStudioStore.getState().snapToGrid ? Math.round(seconds / beat) * beat : seconds;
  }

  const handlers: ClipHandlers = {
    onClipPointerDown(e, lane, clip, mode) {
      lastPointerType = e.pointerType;
      if (e.button !== 0) return;
      e.stopPropagation();
      const store = useStudioStore.getState();
      const ref = { laneId: lane.laneId, clipId: clipId(clip) };
      const live = liveRefs(store.lanes, store.selectedClips);
      const inSelection = live.some((r) => sameRef(r, ref));
      const additive = e.shiftKey || e.metaKey || e.ctrlKey || useStudioView.getState().multiSelect;
      let refs = live;
      if (additive) {
        refs = inSelection ? live.filter((r) => !sameRef(r, ref)) : [...live, ref];
        store.setClipSelection(refs);
        if (inSelection) return;
      } else if (!inSelection) {
        refs = [ref];
        store.setClipSelection(refs);
      }
      if (!store.selectedLaneIds.includes(lane.laneId) || store.selectedLaneIds.length > 1) store.setLaneSelection([lane.laneId]);
      const x = e.clientX;
      const y = e.clientY;
      const touch = e.pointerType === "touch";
      gesture.current = {
        kind: "clip",
        mode,
        laneId: lane.laneId,
        clipId: ref.clipId,
        ref,
        startX: x,
        startY: y,
        contentWidth: contentRef.current?.clientWidth ?? contentWidth,
        startPosition: mode === "trim-end" ? clipEnd(lane, clip) : clipStart(lane, clip),
        base: store.lanes,
        refs: mode === "move" ? refs : [ref],
        alt: e.altKey,
        duplicated: false,
        moved: false,
        narrowOnClick: !additive && inSelection && live.length > 1,
        touch,
        timer: touch
          ? setTimeout(() => {
              gesture.current = null;
              selectForMenu(ref);
              navigator.vibrate?.(10);
              openMenu(x, y, clipMenu(lane, ref, timeAt(x)), lane.trackTitle);
            }, 480)
          : null,
      };
      startNewStep();
      contentRef.current?.setPointerCapture(e.pointerId);
    },
    onClipContextMenu(e, lane, clip) {
      e.preventDefault();
      e.stopPropagation();
      if (lastPointerType === "touch") return;
      const ref = { laneId: lane.laneId, clipId: clipId(clip) };
      selectForMenu(ref);
      openMenu(e.clientX, e.clientY, clipMenu(lane, ref, timeAt(e.clientX)), lane.trackTitle);
    },
    onTrackContextMenu(e, lane) {
      e.preventDefault();
      if (lastPointerType === "touch") return;
      useStudioStore.getState().setLaneSelection([lane.laneId]);
      openMenu(e.clientX, e.clientY, trackMenu(lane, timeAt(e.clientX)), lane.trackTitle);
    },
  };

  function onContentPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    lastPointerType = e.pointerType;
    if (e.button !== 0) return;
    const touch = e.pointerType === "touch";
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const store = useStudioStore.getState();
    const x = e.clientX;
    const y = e.clientY;
    const laneId = (e.target as HTMLElement).closest<HTMLElement>("[data-lane-track]")?.dataset.laneTrack ?? null;
    gesture.current = {
      kind: "marquee",
      startX: x,
      startY: y,
      base: additive ? liveRefs(store.lanes, store.selectedClips) : [],
      moved: false,
      touch,
      laneId,
      timer:
        touch && laneId
          ? setTimeout(() => {
              gesture.current = null;
              const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
              if (!lane) return;
              navigator.vibrate?.(10);
              openMenu(x, y, trackMenu(lane, timeAt(x)), lane.trackTitle);
            }, 480)
          : null,
    };
    // A finger on empty space scrolls; only a mouse or pen lassos.
    if (!touch) e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onContentPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < (g.touch ? 8 : 3)) return;
      g.moved = true;
      if (g.timer) clearTimeout(g.timer);
      g.timer = null;
    }
    const store = useStudioStore.getState();

    if (g.kind === "marquee") {
      if (g.touch) return;
      const content = contentRef.current!;
      const rect = content.getBoundingClientRect();
      const left = Math.min(g.startX, e.clientX);
      const top = Math.min(g.startY, e.clientY);
      const right = Math.max(g.startX, e.clientX);
      const bottom = Math.max(g.startY, e.clientY);
      setMarquee({ left: left - rect.left, top: top - rect.top, width: right - left, height: bottom - top });
      const hits: ClipRef[] = [];
      for (const el of content.querySelectorAll<HTMLElement>("[data-clip-id]")) {
        const r = el.getBoundingClientRect();
        if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom) {
          hits.push({ laneId: el.dataset.clipLane!, clipId: el.dataset.clipId! });
        }
      }
      store.setClipSelection([...g.base, ...hits.filter((h) => !g.base.some((b) => sameRef(b, h)))]);
      return;
    }

    const delta = (dx / g.contentWidth) * span;
    if (g.mode === "move") {
      if (g.alt && !g.duplicated) {
        // Alt-drag: leave the originals, drag copies.
        const copies = duplicateClips(g.base, g.refs, { inPlace: true });
        g.base = copies.lanes;
        g.refs = copies.selection;
        g.duplicated = true;
      }
      const result = moveClips(g.base, g.refs, snapDelta(delta));
      const refs = g.refs;
      store.editClips(() => ({ lanes: result.lanes, selection: refs }));
    } else {
      const lane = store.lanes.find((l) => l.laneId === g.laneId);
      if (!lane) return;
      const clips = clipsOf(lane);
      let index = clips.findIndex((c) => clipId(c) === g.clipId);
      if (index < 0 && clips.length === 1) index = 0;
      if (index < 0) return;
      store.trimClip(g.laneId, index, g.mode === "trim-start" ? "start" : "end", g.startPosition + delta);
      // Trimming a whole take turns it into a clip with an id of its own.
      const after = useStudioStore.getState().lanes.find((l) => l.laneId === g.laneId);
      const trimmed = after && clipsOf(after)[index];
      if (trimmed && clipId(trimmed) !== g.clipId) {
        g.clipId = clipId(trimmed);
        useStudioStore.getState().setClipSelection([{ laneId: g.laneId, clipId: g.clipId }]);
      }
    }
  }

  function onContentPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (g.moved) {
      startNewStep();
      return;
    }
    const store = useStudioStore.getState();
    if (g.kind === "clip") {
      if (g.narrowOnClick) store.setClipSelection([g.ref]);
      audioEngine.seek(timeAt(e.clientX));
      return;
    }
    // A click on empty space: deselect, and move the playhead there.
    if (!(e.shiftKey || e.metaKey || e.ctrlKey) && !useStudioView.getState().multiSelect) store.setClipSelection([]);
    if (g.laneId) store.setLaneSelection([g.laneId]);
    audioEngine.seek(timeAt(e.clientX));
  }

  if (lanes.length === 0) return null;

  const barPx = bar * pxPerSecond;
  const grid =
    barPx > 56
      ? `repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 85%, transparent) 0 1px, transparent 1px ${(bar / span) * 100}%), repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 35%, transparent) 0 1px, transparent 1px ${(beat / span) * 100}%)`
      : `repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 85%, transparent) 0 1px, transparent 1px ${(bar / span) * 100}%)`;

  const zoomButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30 pointer-coarse:h-9 pointer-coarse:w-9";

  return (
    <section
      aria-label="Arrangement"
      className="overflow-hidden rounded-xl border border-border bg-surface select-none [-webkit-touch-callout:none]"
    >
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        <SelectionBar />
        <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l border-border pl-1.5">
          <button onClick={() => zoomTo(zoom / 1.6)} disabled={zoom <= 1} className={zoomButton} aria-label="Zoom out" title="Zoom out (⌘/Ctrl-scroll or pinch)">
            −
          </button>
          <button
            onClick={() => zoomTo(1)}
            disabled={zoom <= 1}
            className="h-7 rounded-md px-1.5 font-mono text-[10px] text-muted tabular-nums transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-60 pointer-coarse:h-9"
            title="Fit the whole song (Z)"
          >
            {zoom <= 1 ? "fit" : `${zoom.toFixed(zoom < 10 ? 1 : 0)}×`}
          </button>
          <button onClick={() => zoomTo(zoom * 1.6)} disabled={zoom >= MAX_ZOOM} className={zoomButton} aria-label="Zoom in" title="Zoom in (⌘/Ctrl-scroll or pinch)">
            +
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Lane headers: never scroll sideways. */}
        <div className={`${HEADER_W} shrink-0 border-r border-border bg-surface`}>
          <div className={`${RULER_H} flex items-center justify-between border-b border-border bg-surface-raised/60 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted`}>
            <span>{lanes.length} lane{lanes.length === 1 ? "" : "s"}</span>
            <span className="font-mono normal-case">{projectBpm.toFixed(0)} bpm</span>
          </div>
          {lanes.map((lane) => (
            <div key={lane.laneId}>
              <LaneHeader lane={lane} focused={selectedLaneIds.includes(lane.laneId)} />
              {automationLanes.includes(lane.laneId) && (
                <div className={`${AUTO_H} flex flex-col justify-center gap-1 border-b border-border/70 bg-background/40 px-2.5 text-[11px]`}>
                  <span className="font-medium text-muted">〰 Automation</span>
                  <button
                    onClick={() => toggleAutomation(lane.laneId)}
                    className="w-fit rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:text-foreground"
                  >
                    hide
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* The timeline: ruler and tracks, zoomed and scrolled together. */}
        <div ref={scrollerRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
          <div
            ref={contentRef}
            onPointerDown={onContentPointerDown}
            onPointerMove={onContentPointerMove}
            onPointerUp={onContentPointerUp}
            onPointerCancel={() => {
              if (gesture.current?.timer) clearTimeout(gesture.current.timer);
              gesture.current = null;
              setMarquee(null);
            }}
            className="relative"
            style={{ width: zoom > 1 ? contentWidth : "100%" }}
          >
            <Ruler span={span} pxPerSecond={pxPerSecond} contentRef={contentRef} />
            <div style={{ backgroundImage: grid }}>
              {lanes.map((lane) => (
                <div key={lane.laneId}>
                  <LaneTrack lane={lane} span={span} pxPerSecond={pxPerSecond} audible={audible.has(lane.laneId)} handlers={handlers} />
                  {automationLanes.includes(lane.laneId) && (
                    <div className={`${AUTO_H} border-b border-border/70 bg-background/40 px-0.5`} onPointerDown={(e) => e.stopPropagation()}>
                      <AutomationLane lane={lane} span={span} accent={kindColor(lane.kind)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {loopEnabled && loopEnd > loopStart && (
              <div
                className="pointer-events-none absolute inset-y-0 border-x border-brand-strong/60 bg-brand/[0.06]"
                style={{ left: `${(loopStart / span) * 100}%`, width: `${((loopEnd - loopStart) / span) * 100}%` }}
              />
            )}
            <Playhead span={span} scrollerRef={scrollerRef} />
            {marquee && (
              <div
                className="pointer-events-none absolute z-30 rounded-sm border border-brand-strong bg-brand/15"
                style={marquee}
              />
            )}
          </div>
        </div>
      </div>
      <Sections />
    </section>
  );
}
