"use client";

import * as clips from "@/lib/client/clipCommands";
import { WHOLE, clipId, clipsOf, liveRefs, sameRef, type ClipRef } from "@/lib/client/clipEdit";
import { audioEngine } from "@/lib/client/audioEngine";
import { exportLane } from "@/lib/client/mixdown";
import { previewPlayer } from "@/lib/client/previewPlayer";
import { startNewStep } from "@/lib/client/studioHistory";
import { beatLength, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView, type InspectorTab } from "@/lib/client/studioView";
import type { MenuItem } from "./ContextMenu";

// What the right-click (long-press) menu offers, depending on what's under
// the pointer: a clip, a lane's header, empty space in a lane, the ruler.

const mod = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘" : "Ctrl+";

const STUTTERS = [
  { label: "1/16×8", beats: 0.25, repeats: 8 },
  { label: "1/8×4", beats: 0.5, repeats: 4 },
  { label: "1/8×8", beats: 0.5, repeats: 8 },
  { label: "1 beat×4", beats: 1, repeats: 4 },
  { label: "½ bar×2", beats: 2, repeats: 2 },
];

const store = () => useStudioStore.getState();

function focusLane(laneId: string) {
  if (!store().selectedLaneIds.includes(laneId)) store().setLaneSelection([laneId]);
}

function openInspector(laneId: string, tab: InspectorTab) {
  store().setLaneSelection([laneId]);
  useStudioView.getState().openInspector(tab);
}

/** Right-clicking a clip that isn't selected selects just it, like every DAW. */
export function selectForMenu(ref: ClipRef) {
  const selection = liveRefs(store().lanes, store().selectedClips);
  if (!selection.some((r) => sameRef(r, ref))) store().setClipSelection([ref]);
  focusLane(ref.laneId);
}

function snapTime(seconds: number) {
  const { snapToGrid, projectBpm } = store();
  const beat = beatLength(projectBpm);
  return snapToGrid ? Math.round(seconds / beat) * beat : seconds;
}

function laneEssentials(lane: StudioLane): MenuItem[] {
  return [
    { label: "Mute", icon: "M", shortcut: "M", checked: lane.muted, onSelect: () => store().toggleMute(lane.laneId) },
    { label: "Solo", icon: "S", shortcut: "S", checked: lane.solo, onSelect: () => store().toggleSolo(lane.laneId) },
    { label: "Lane settings…", icon: "⚙", onSelect: () => openInspector(lane.laneId, "mix") },
  ];
}

export function clipMenu(lane: StudioLane, ref: ClipRef, seconds: number): MenuItem[] {
  const selection = liveRefs(store().lanes, store().selectedClips);
  const count = selection.length || 1;
  const clip = clipsOf(lane).find((c) => clipId(c) === ref.clipId);
  const stretch = clip?.stretch ?? 1;
  const arranged = !!lane.clips?.length;
  const many = count > 1 ? ` ${count} clips` : "";
  return [
    { label: "Split here", icon: "✂", onSelect: () => clips.splitAt(seconds, [lane.laneId]) },
    { label: "Split at playhead", icon: "✂", shortcut: "X", onSelect: () => clips.splitAt() },
    { type: "separator" },
    { label: `Copy${many}`, icon: "⧉", shortcut: `${mod}C`, onSelect: clips.copy },
    { label: `Cut${many}`, icon: "✄", shortcut: `${mod}X`, onSelect: clips.cut },
    { label: "Paste at playhead", icon: "📋", shortcut: `${mod}V`, disabled: !clips.hasClipboard(), onSelect: () => clips.paste() },
    { label: `Duplicate${many}`, icon: "⊕", shortcut: `${mod}D`, onSelect: () => clips.duplicate() },
    {
      type: "chips",
      label: "Repeat",
      chips: [
        { label: "×2", onSelect: () => clips.duplicate(1) },
        { label: "×4", onSelect: () => clips.duplicate(3) },
        { label: "×8", onSelect: () => clips.duplicate(7) },
        { label: "fill 16 bars", onSelect: () => clips.repeatToBars(16), hint: "Loop the selection (rounded to whole bars) to fill 16 bars" },
      ],
    },
    { type: "separator" },
    { label: "Reverse", icon: "⟲", shortcut: "R", checked: !!clip?.reverse, onSelect: clips.reverse },
    {
      type: "chips",
      label: "Speed",
      chips: [
        { label: "½×", active: Math.abs(stretch - 0.5) < 0.001, onSelect: () => clips.setSpeed(0.5), hint: "Half speed, same pitch" },
        { label: "1×", active: Math.abs(stretch - 1) < 0.001, onSelect: () => clips.setSpeed(1) },
        { label: "2×", active: Math.abs(stretch - 2) < 0.001, onSelect: () => clips.setSpeed(2), hint: "Double speed, same pitch" },
      ],
    },
    {
      type: "chips",
      label: "Quantize",
      chips: [
        { label: "to beat", onSelect: () => clips.quantize("beat") },
        { label: "to bar", onSelect: () => clips.quantize("bar") },
      ],
    },
    {
      type: "chips",
      label: "Stutter",
      chips: STUTTERS.map((s) => ({
        label: s.label,
        hint: "Beat repeat from this point",
        onSelect: () => clips.stutter(s.beats, s.repeats, seconds, lane.laneId),
      })),
    },
    { type: "separator" },
    { label: "Move to playhead", icon: "⇥", onSelect: clips.moveToPlayhead },
    { label: "Loop and play this", icon: "🔁", shortcut: "⇧L", onSelect: clips.loopSelection },
    { label: "Send to a sample pad", icon: "▦", onSelect: () => clips.toPad(lane.laneId) },
    { type: "separator" },
    { label: "Cut out the silences", icon: "〰", hint: "Split this lane at every silence", onSelect: () => void clips.removeSilences(lane.laneId) },
    ...(arranged ? [{ label: "Back to the whole take", icon: "↺", onSelect: () => clips.wholeTake(lane.laneId) }] : []),
    { label: "Select every clip in this lane", icon: "▭", onSelect: () => clips.selectLaneClips(lane.laneId) },
    { type: "separator" },
    {
      label: ref.clipId === WHOLE && count === 1 ? "Delete (removes the lane)" : `Delete${many}`,
      icon: "🗑",
      shortcut: "⌫",
      danger: true,
      onSelect: clips.remove,
    },
  ];
}

export function laneMenu(lane: StudioLane): MenuItem[] {
  const automation = useStudioView.getState().automationLanes.includes(lane.laneId);
  return [
    ...laneEssentials(lane),
    { label: "Tempo & key…", icon: "♩", onSelect: () => openInspector(lane.laneId, "tempo") },
    { label: "Effects…", icon: "✦", onSelect: () => openInspector(lane.laneId, "fx") },
    {
      label: lane.kind === "vocals" ? "Match with a beat…" : "Match with a vocal…",
      icon: "🎚",
      onSelect: () => openInspector(lane.laneId, "match"),
    },
    {
      label: "Show automation",
      icon: "〰",
      checked: automation,
      onSelect: () => useStudioView.getState().toggleAutomation(lane.laneId),
    },
    {
      type: "chips",
      label: "Crossfader",
      chips: [
        { label: "off", active: lane.xfade === null, onSelect: () => store().setLaneXfade(lane.laneId, null) },
        { label: "A", active: lane.xfade === "a", onSelect: () => store().setLaneXfade(lane.laneId, "a") },
        { label: "B", active: lane.xfade === "b", onSelect: () => store().setLaneXfade(lane.laneId, "b") },
      ],
    },
    {
      label: "Split with Demucs…",
      icon: "🧩",
      hint: lane.kind === "vocals" ? "clean vocal" : "drums · bass · melody",
      onSelect: () => useStudioView.getState().setSplitLane(lane.laneId),
    },
    { type: "separator" },
    { label: "Select all its clips", icon: "▭", onSelect: () => clips.selectLaneClips(lane.laneId) },
    { label: "Cut out the silences", icon: "✂", onSelect: () => void clips.removeSilences(lane.laneId) },
    ...(lane.clips?.length ? [{ label: "Back to the whole take", icon: "↺", onSelect: () => clips.wholeTake(lane.laneId) }] : []),
    { type: "separator" },
    {
      label: "Preview the original stem",
      icon: "▶",
      onSelect: () =>
        previewPlayer.toggle({ stemId: lane.stemId, title: lane.trackTitle, artist: lane.artistName, kind: lane.kind }),
    },
    {
      label: "Duplicate lane",
      icon: "⊕",
      onSelect: () => {
        startNewStep();
        store().duplicateLane(lane.laneId);
      },
    },
    {
      label: "Export this lane (WAV)",
      icon: "⤓",
      onSelect: () => {
        useStudioView.getState().notify("Rendering the lane…");
        exportLane(lane, lane.trackTitle).catch(() => useStudioView.getState().notify("Couldn't export this lane", "error"));
      },
    },
    { type: "separator" },
    {
      label: "Remove lane",
      icon: "✕",
      danger: true,
      onSelect: () => {
        startNewStep();
        store().removeLane(lane.laneId);
      },
    },
  ];
}

/** Empty space in a lane: paste there, cut there, mark a loop from there. */
export function trackMenu(lane: StudioLane, seconds: number): MenuItem[] {
  const at = snapTime(seconds);
  const bar = beatLength(store().projectBpm) * 4;
  const barStart = Math.floor(seconds / bar) * bar;
  return [
    { label: "Paste here", icon: "📋", shortcut: `${mod}V`, disabled: !clips.hasClipboard(), onSelect: () => clips.paste(at) },
    { label: "Play from here", icon: "▶", onSelect: () => playFrom(at) },
    {
      label: "Start this lane here",
      icon: "⇥",
      onSelect: () => {
        startNewStep();
        clips.selectLaneClips(lane.laneId);
        clips.nudge(at - lane.offsetSeconds);
      },
    },
    loopChips(barStart),
    { label: "Select every clip", icon: "▭", shortcut: `${mod}A`, onSelect: clips.selectAllClips },
    { type: "separator" },
    ...laneEssentials(lane),
  ];
}

function playFrom(seconds: number) {
  audioEngine.seek(seconds);
  if (!store().isPlaying) void audioEngine.play().catch(() => {});
}

function loopChips(barStart: number): MenuItem {
  const bar = beatLength(store().projectBpm) * 4;
  return {
    type: "chips",
    label: "Loop",
    chips: [1, 2, 4, 8, 16].map((bars) => ({
      label: `${bars} bar${bars === 1 ? "" : "s"}`,
      onSelect: () => {
        store().setLoop({ enabled: true, start: barStart, end: barStart + bars * bar });
        playFrom(barStart);
      },
    })),
  };
}

export function rulerMenu(seconds: number): MenuItem[] {
  const state = store();
  const bar = beatLength(state.projectBpm) * 4;
  const barStart = Math.floor(seconds / bar) * bar;
  const hasLoop = state.loopEnd > state.loopStart;
  return [
    { label: "Play from here", icon: "▶", onSelect: () => playFrom(snapTime(seconds)) },
    { label: "Play from this bar", icon: "▶", onSelect: () => playFrom(barStart) },
    loopChips(barStart),
    ...(hasLoop
      ? ([
          {
            label: "Save the loop as a section",
            icon: "★",
            onSelect: () => {
              const label = window.prompt("Name this section (e.g. chorus, drop, verse 2)", `Section ${state.markers.length + 1}`);
              if (label?.trim()) state.addMarker({ label: label.trim().slice(0, 40), start: state.loopStart, end: state.loopEnd });
            },
          },
          { label: "Clear the loop", icon: "✕", onSelect: () => state.setLoop({ enabled: false, start: 0, end: 0 }) },
        ] as MenuItem[])
      : []),
    { type: "separator" },
    { label: "Split every lane here", icon: "✂", onSelect: () => clips.splitAt(snapTime(seconds), state.lanes.map((l) => l.laneId)) },
    { label: "Paste here", icon: "📋", disabled: !clips.hasClipboard(), onSelect: () => clips.paste(snapTime(seconds)) },
  ];
}
