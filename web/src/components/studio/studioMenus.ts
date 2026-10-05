"use client";

import {
  ArrowDown,
  ArrowRightToLine,
  ArrowUp,
  ClipboardPaste,
  Combine,
  Copy,
  CopyPlus,
  Delete,
  Download,
  FlipHorizontal2,
  Headphones,
  LayoutGrid,
  Music2,
  Pencil,
  Play,
  Puzzle,
  RectangleHorizontal,
  Repeat,
  Scissors,
  Settings,
  SlidersVertical,
  Spline,
  SquareDashed,
  SquareSplitHorizontal,
  Star,
  Trash2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import * as clips from "@/lib/client/clipCommands";
import { WHOLE, clipId, clipsOf, liveRefs, sameRef, type ClipRef } from "@/lib/client/clipEdit";
import { audioEngine } from "@/lib/client/audioEngine";
import { exportLane } from "@/lib/client/mixdown";
import { previewPlayer } from "@/lib/client/previewPlayer";
import { startNewStep } from "@/lib/client/studioHistory";
import { beatLength, laneName, snapTime as snapToGrid, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
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
  return snapToGrid(seconds, store());
}

function gainLabel(gain: number) {
  return gain > 0 ? `${gain > 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)} dB` : "silent";
}

function rename(lane: StudioLane) {
  const name = window.prompt("Name this lane", laneName(lane));
  if (name === null) return;
  startNewStep();
  store().renameLane(lane.laneId, name);
}

/** Whole track or clips: the same choice from the lane menu, a clip's menu and the lane header. */
export function trackModeItems(lane: StudioLane): MenuItem[] {
  const whole = !lane.clips?.length;
  return [
    { type: "heading", label: whole ? "Track · whole" : `Track · ${lane.clips!.length} clips` },
    {
      label: "Whole track",
      icon: RectangleHorizontal,
      checked: whole,
      hint: whole ? "Plays the whole stem as one clip" : "Undo the cuts — the first clip stays put",
      onSelect: () => clips.makeWhole(lane.laneId),
    },
    {
      type: "chips",
      label: "Split into clips",
      chips: [
        { label: "at silences", onSelect: () => void clips.splitLane(lane.laneId, "silences"), hint: "One clip per phrase — the gaps are dropped" },
        ...([1, 2, 4, 8] as const).map((bars) => ({
          label: `every ${bars} bar${bars === 1 ? "" : "s"}`,
          onSelect: () => clips.splitLane(lane.laneId, bars),
          hint: "Equal clips on the bar lines, nothing dropped",
        })),
      ],
    },
  ];
}

function laneEssentials(lane: StudioLane): MenuItem[] {
  return [
    { label: "Mute", icon: VolumeX, shortcut: "M", checked: lane.muted, onSelect: () => store().toggleMute(lane.laneId) },
    { label: "Solo", icon: Headphones, shortcut: "S", checked: lane.solo, onSelect: () => store().toggleSolo(lane.laneId) },
    { label: "Lane settings…", icon: Settings, onSelect: () => openInspector(lane.laneId, "mix") },
  ];
}

export function clipMenu(lane: StudioLane, ref: ClipRef, seconds: number): MenuItem[] {
  const selection = liveRefs(store().lanes, store().selectedClips);
  const count = selection.length || 1;
  const clip = clipsOf(lane).find((c) => clipId(c) === ref.clipId);
  const stretch = clip?.stretch ?? 1;
  const gain = clip?.gain ?? 1;
  const many = count > 1 ? ` ${count} clips` : "";
  return [
    { label: "Split here", icon: SquareSplitHorizontal, onSelect: () => clips.splitAt(seconds, [lane.laneId]) },
    { label: "Split at playhead", icon: SquareSplitHorizontal, shortcut: "X", onSelect: () => clips.splitAt() },
    { type: "separator" },
    { label: `Copy${many}`, icon: Copy, shortcut: `${mod}C`, onSelect: clips.copy },
    { label: `Cut${many}`, icon: Scissors, shortcut: `${mod}X`, onSelect: clips.cut },
    { label: "Paste at playhead", icon: ClipboardPaste, shortcut: `${mod}V`, disabled: !clips.hasClipboard(), onSelect: () => clips.paste() },
    { label: `Duplicate${many}`, icon: CopyPlus, shortcut: `${mod}D`, onSelect: () => clips.duplicate() },
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
    { label: "Reverse", icon: FlipHorizontal2, shortcut: "R", checked: !!clip?.reverse, onSelect: clips.reverse },
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
    { type: "heading", label: "Shape" },
    {
      type: "chips",
      label: `Level${gain !== 1 ? ` (${gainLabel(gain)})` : ""}`,
      chips: [
        { label: "−3 dB", onSelect: () => clips.clipGain(-3), hint: "Quieter — this clip only" },
        { label: "+3 dB", onSelect: () => clips.clipGain(3), hint: "Louder — this clip only" },
        { label: "0 dB", active: gain === 1, onSelect: clips.resetClipGain, hint: "Back to the lane's level" },
      ],
    },
    {
      type: "chips",
      label: "Fade",
      chips: [
        { label: "in 1 beat", active: !!clip?.fadeIn, onSelect: () => clips.clipFade("in", 1) },
        { label: "out 1 beat", active: !!clip?.fadeOut, onSelect: () => clips.clipFade("out", 1) },
        { label: "in+out 1 bar", onSelect: () => clips.clipFade("both", 4) },
        { label: "off", onSelect: () => clips.clipFade("both", 0) },
      ],
    },
    { label: `${clip?.muted ? "Unmute" : "Mute"}${many || " clip"}`, icon: VolumeX, shortcut: "⇧M", checked: !!clip?.muted, onSelect: clips.toggleClipMute },
    { type: "heading", label: "Chop & fit" },
    {
      type: "chips",
      label: "Slice every",
      chips: [
        { label: "1/16", onSelect: () => clips.slice(0.25) },
        { label: "1/8", onSelect: () => clips.slice(0.5) },
        { label: "beat", onSelect: () => clips.slice(1) },
        { label: "bar", onSelect: () => clips.slice(4) },
      ],
    },
    {
      type: "chips",
      label: "Fit to",
      chips: [1, 2, 4, 8].map((bars) => ({
        label: `${bars} bar${bars === 1 ? "" : "s"}`,
        hint: "Speed it up or down (pitch stays) to last exactly this long",
        onSelect: () => clips.fitToBars(bars),
      })),
    },
    {
      type: "chips",
      label: "Trim at playhead",
      chips: [
        { label: "cut the start", onSelect: () => clips.trimAtPlayhead("start"), hint: "Drop what's before the playhead" },
        { label: "cut the end", onSelect: () => clips.trimAtPlayhead("end"), hint: "Drop what's after the playhead" },
      ],
    },
    { label: "Join clips", icon: Combine, shortcut: `${mod}J`, disabled: count < 2, hint: "Glue back pieces that follow on", onSelect: clips.join },
    { type: "separator" },
    { label: "Move to playhead", icon: ArrowRightToLine, onSelect: clips.moveToPlayhead },
    { label: "Loop and play this", icon: Repeat, shortcut: "⇧L", onSelect: clips.loopSelection },
    { label: "Send to a sample pad", icon: LayoutGrid, onSelect: () => clips.toPad(lane.laneId) },
    { type: "separator" },
    ...trackModeItems(lane),
    { label: "Select every clip in this lane", icon: SquareDashed, onSelect: () => clips.selectLaneClips(lane.laneId) },
    { type: "separator" },
    {
      label: ref.clipId === WHOLE && count === 1 ? "Delete (removes the lane)" : `Delete${many}`,
      icon: Trash2,
      shortcut: "⌫",
      danger: true,
      onSelect: clips.remove,
    },
  ];
}

export function laneMenu(lane: StudioLane): MenuItem[] {
  const automation = useStudioView.getState().automationLanes.includes(lane.laneId);
  const index = store().lanes.findIndex((l) => l.laneId === lane.laneId);
  const last = store().lanes.length - 1;
  const hasAutomation = !!(lane.automation.volume?.length || lane.automation.filter?.length);
  return [
    ...laneEssentials(lane),
    { label: "Rename…", icon: Pencil, onSelect: () => rename(lane) },
    {
      type: "chips",
      label: "Move",
      chips: [
        { label: "up", icon: ArrowUp, onSelect: () => (index > 0 ? (startNewStep(), store().moveLane(lane.laneId, -1)) : undefined), hint: "Move this lane up the list" },
        { label: "down", icon: ArrowDown, onSelect: () => (index < last ? (startNewStep(), store().moveLane(lane.laneId, 1)) : undefined), hint: "Move this lane down the list" },
      ],
    },
    { label: "Tempo & key…", icon: Music2, onSelect: () => openInspector(lane.laneId, "tempo") },
    { label: "Effects…", icon: WandSparkles, onSelect: () => openInspector(lane.laneId, "fx") },
    {
      label: lane.kind === "vocals" ? "Match with a beat…" : "Match with a vocal…",
      icon: SlidersVertical,
      onSelect: () => openInspector(lane.laneId, "match"),
    },
    {
      label: "Show automation",
      icon: Spline,
      checked: automation,
      onSelect: () => useStudioView.getState().toggleAutomation(lane.laneId),
    },
    {
      type: "chips",
      label: store().loopEnabled ? "Rhythm (over the loop)" : "Rhythm",
      chips: [
        { label: "pump", onSelect: () => clips.pump(lane.laneId), hint: "Dips on every beat and swells back — the sidechain feel" },
        { label: "gate 1/8", onSelect: () => clips.gate(lane.laneId, 0.5), hint: "Chops it on and off every eighth note" },
        { label: "gate 1/16", onSelect: () => clips.gate(lane.laneId, 0.25), hint: "Chops it on and off every sixteenth — trance gate" },
        ...(hasAutomation ? [{ label: "clear", onSelect: () => clips.clearAutomation(lane.laneId), hint: "Take the drawn automation off" }] : []),
      ],
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
      icon: Puzzle,
      hint: lane.kind === "vocals" ? "clean vocal" : "drums · bass · melody",
      onSelect: () => useStudioView.getState().setSplitLane(lane.laneId),
    },
    { type: "separator" },
    ...trackModeItems(lane),
    { label: "Select all its clips", icon: SquareDashed, onSelect: () => clips.selectLaneClips(lane.laneId) },
    { type: "separator" },
    {
      label: "Preview the original stem",
      icon: Play,
      onSelect: () =>
        previewPlayer.toggle({ stemId: lane.stemId, title: laneName(lane), artist: lane.artistName, kind: lane.kind }),
    },
    {
      label: "Duplicate lane",
      icon: CopyPlus,
      onSelect: () => {
        startNewStep();
        store().duplicateLane(lane.laneId);
      },
    },
    {
      label: "Export this lane (WAV)",
      icon: Download,
      onSelect: () => {
        useStudioView.getState().notify("Rendering the lane…");
        exportLane(lane, laneName(lane)).catch(() => useStudioView.getState().notify("Couldn't export this lane", "error"));
      },
    },
    { type: "separator" },
    {
      label: "Remove lane",
      icon: X,
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
    { label: "Paste here", icon: ClipboardPaste, shortcut: `${mod}V`, disabled: !clips.hasClipboard(), onSelect: () => clips.paste(at) },
    { label: "Play from here", icon: Play, onSelect: () => playFrom(at) },
    {
      label: "Start this lane here",
      icon: ArrowRightToLine,
      onSelect: () => {
        startNewStep();
        clips.selectLaneClips(lane.laneId);
        clips.nudge(at - lane.offsetSeconds);
      },
    },
    loopChips(barStart),
    { label: "Select every clip", icon: SquareDashed, shortcut: `${mod}A`, onSelect: clips.selectAllClips },
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
    { label: "Play from here", icon: Play, onSelect: () => playFrom(snapTime(seconds)) },
    { label: "Play from this bar", icon: Play, onSelect: () => playFrom(barStart) },
    loopChips(barStart),
    ...(hasLoop
      ? ([
          {
            label: "Save the loop as a section",
            icon: Star,
            onSelect: () => {
              const label = window.prompt("Name this section (e.g. chorus, drop, verse 2)", `Section ${state.markers.length + 1}`);
              if (label?.trim()) state.addMarker({ label: label.trim().slice(0, 40), start: state.loopStart, end: state.loopEnd });
            },
          },
          { label: "Clear the loop", icon: X, onSelect: () => state.setLoop({ enabled: false, start: 0, end: 0 }) },
        ] as MenuItem[])
      : []),
    { type: "separator" },
    { label: "Split every lane here", icon: SquareSplitHorizontal, onSelect: () => clips.splitAt(snapTime(seconds), state.lanes.map((l) => l.laneId)) },
    ...(hasLoop
      ? ([
          {
            label: "Delete the loop's time",
            icon: Delete,
            hint: "Takes it out of every lane — the rest moves up",
            onSelect: () => clips.removeTime(state.loopStart, state.loopEnd),
          },
        ] as MenuItem[])
      : []),
    {
      type: "chips",
      label: "Insert space here",
      chips: [1, 2, 4, 8].map((bars) => ({
        label: `${bars} bar${bars === 1 ? "" : "s"}`,
        hint: "Pushes everything from this bar later",
        onSelect: () => clips.insertBars(seconds, bars),
      })),
    },
    { label: "Paste here", icon: ClipboardPaste, disabled: !clips.hasClipboard(), onSelect: () => clips.paste(snapTime(seconds)) },
  ];
}
