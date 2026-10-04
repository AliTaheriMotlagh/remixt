"use client";

import { useEffect, useState } from "react";
import { audioEngine } from "@/lib/client/audioEngine";
import { beatLength, useStudioStore } from "@/lib/client/studioStore";
import { redo, startNewStep, undo } from "@/lib/client/studioHistory";
import { PAD_KEYS } from "./SamplePads";
import * as commands from "@/lib/client/clipCommands";
import { liveRefs } from "@/lib/client/clipEdit";
import { useStudioView } from "@/lib/client/studioView";

// Keyboard control of the mix, in the Studio and on a remix's page: the
// transport, the lanes (pick with the arrow keys, then mute, solo, nudge)
// and, in the Studio, the selected clips — copy, cut, paste, duplicate,
// split, reverse, quantize, delete — through the same commands as the
// right-click menu. Every edit is undoable. "?" shows the list.

type Mode = "studio" | "remix";

type Shortcut = { keys: string[]; label: string; studioOnly?: boolean };

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Playback",
    items: [
      { keys: ["Space"], label: "Play / pause" },
      { keys: ["Esc"], label: "Stop · when stopped, deselect" },
      { keys: ["←", "→"], label: "Back / forward 5 seconds" },
      { keys: ["⇧ ←", "⇧ →"], label: "Back / forward one bar" },
      { keys: ["Home", "End"], label: "Jump to the start / near the end" },
      { keys: ["L"], label: "Loop on / off" },
      { keys: ["+", "−"], label: "Master volume up / down" },
      { keys: ["K"], label: "Metronome on / off", studioOnly: true },
      { keys: ["N"], label: "Snap to beat on / off", studioOnly: true },
      { keys: ["Z"], label: "Zoom to fit the song", studioOnly: true },
      { keys: ["I"], label: "AI producer", studioOnly: true },
    ],
  },
  {
    title: "Clips",
    items: [
      { keys: ["Click", "⇧/⌘ Click"], label: "Select a clip / add to the selection", studioOnly: true },
      { keys: ["Drag"], label: "Across empty space: select several", studioOnly: true },
      { keys: ["⌥ Drag"], label: "Drag a copy", studioOnly: true },
      { keys: ["Right-click"], label: "Every option for what's under the pointer", studioOnly: true },
      { keys: ["⌘/Ctrl C", "X", "V"], label: "Copy / cut / paste at the playhead", studioOnly: true },
      { keys: ["⌘/Ctrl D"], label: "Duplicate", studioOnly: true },
      { keys: ["X"], label: "Split at the playhead", studioOnly: true },
      { keys: ["R"], label: "Reverse", studioOnly: true },
      { keys: ["Q", "⇧ Q"], label: "Quantize to the beat / bar", studioOnly: true },
      { keys: ["⇧ L"], label: "Loop the selection", studioOnly: true },
      { keys: ["[", "]"], label: "Nudge a beat earlier / later (⇧: a bar)" },
      { keys: ["Delete"], label: "Delete", studioOnly: true },
    ],
  },
  {
    title: "AI producer (panel open)",
    items: [
      { keys: [",", "."], label: "Try the previous / next idea", studioOnly: true },
      { keys: ["B"], label: "Before / after", studioOnly: true },
      { keys: ["Enter"], label: "Keep the idea", studioOnly: true },
      { keys: ["⌘/Ctrl Z"], label: "Undo the idea you're trying", studioOnly: true },
    ],
  },
  {
    title: "Lanes",
    items: [
      { keys: ["↑", "↓"], label: "Select the lane above / below (⇧ adds)" },
      { keys: ["⌘/Ctrl A"], label: "Select everything" },
      { keys: ["M", "S"], label: "Mute / solo the selected lanes" },
      { keys: ["E"], label: "Lane settings", studioOnly: true },
      { keys: ["1 … 0"], label: "Play sample pads 1–10", studioOnly: true },
      { keys: ["⌘/Ctrl Z"], label: "Undo (⇧ to redo)" },
      { keys: ["?"], label: "Show this list" },
    ],
  },
];

/** Typing into a field (a title, a BPM) must never drive the transport. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target instanceof HTMLInputElement && !["checkbox", "button", "radio"].includes(target.type);
}

function scrollToLane(laneId: string) {
  document.getElementById(`lane-${laneId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Moves the lane selection up or down one, or grows it that way with Shift. */
function stepSelection(direction: 1 | -1, extend: boolean) {
  const { lanes, selectedLaneIds, setLaneSelection } = useStudioStore.getState();
  if (lanes.length === 0) return;
  const indexes = selectedLaneIds
    .map((id) => lanes.findIndex((l) => l.laneId === id))
    .filter((i) => i >= 0);
  const edge = indexes.length === 0 ? (direction === 1 ? -1 : lanes.length) : direction === 1 ? Math.max(...indexes) : Math.min(...indexes);
  const next = Math.max(0, Math.min(lanes.length - 1, edge + direction));
  const id = lanes[next].laneId;
  setLaneSelection(extend ? [...new Set([...selectedLaneIds, id])] : [id]);
  scrollToLane(id);
}

function handleKey(event: KeyboardEvent, mode: Mode, openHelp: () => void) {
  const mod = event.metaKey || event.ctrlKey;
  const typing = isTyping(event.target);
  const state = useStudioStore.getState();
  const selected = state.selectedLaneIds.filter((id) => state.lanes.some((l) => l.laneId === id));
  const clipsSelected = liveRefs(state.lanes, state.selectedClips).length > 0;
  // Mute/solo act on the selected lanes, or the lanes of the selected clips.
  const laneTargets = selected.length ? selected : [...new Set(liveRefs(state.lanes, state.selectedClips).map((r) => r.laneId))];
  const beat = beatLength(state.projectBpm);
  const bar = beat * 4;
  const key = event.key;
  const lower = key.toLowerCase();
  const studio = mode === "studio";

  // Undo/redo — except while typing, where the text box has its own.
  if (mod && !event.altKey && (lower === "z" || lower === "y")) {
    if (typing) return;
    event.preventDefault();
    if (lower === "y" || event.shiftKey) redo();
    else undo();
    return;
  }
  // A range slider keeps its arrow keys; any other field keeps everything.
  if (typing) return;
  if (event.target instanceof HTMLInputElement && event.target.type === "range" && key.startsWith("Arrow")) return;
  // An open menu or dialog has the keyboard.
  if (document.querySelector('[role="menu"]')) return;

  const handled = () => event.preventDefault();
  // Each press is an undo step of its own (holding a key down repeats into one).
  if (!event.repeat) startNewStep();

  if (mod && !event.altKey) {
    if (lower === "a" && state.lanes.length) {
      handled();
      state.setLaneSelection(state.lanes.map((l) => l.laneId));
      if (studio) commands.selectAllClips();
    } else if (lower === "d" && studio && (clipsSelected || selected.length)) {
      handled();
      if (clipsSelected) commands.duplicate();
      else for (const id of selected) state.duplicateLane(id);
    } else if (studio && (lower === "c" || lower === "x") && (clipsSelected || selected.length)) {
      // Leave copying text on the page alone when there's nothing of ours to copy.
      if (window.getSelection()?.toString()) return;
      handled();
      if (lower === "c") commands.copy();
      else commands.cut();
    } else if (studio && lower === "v" && commands.hasClipboard()) {
      handled();
      commands.paste();
    }
    return;
  }
  if (event.altKey) return;

  if (key === "?") {
    handled();
    openHelp();
    return;
  }

  switch (event.code) {
    case "Space":
      handled();
      if (state.lanes.length === 0) return;
      if (state.isPlaying) audioEngine.pause();
      else void audioEngine.play().catch(() => {});
      return;
    case "Escape":
      // Stops the mix; with it already stopped, lets go of the selection.
      if (!state.isPlaying && (clipsSelected || selected.length)) {
        if (clipsSelected) commands.clearSelection();
        else state.setLaneSelection([]);
      } else audioEngine.stop();
      return;
    case "ArrowLeft":
    case "ArrowRight": {
      handled();
      const step = (event.shiftKey ? bar : 5) * (event.code === "ArrowLeft" ? -1 : 1);
      audioEngine.seek(Math.min(Math.max(0, state.duration - 0.05), Math.max(0, state.playhead + step)));
      return;
    }
    case "ArrowUp":
    case "ArrowDown":
      if (state.lanes.length === 0) return;
      handled();
      stepSelection(event.code === "ArrowUp" ? -1 : 1, event.shiftKey);
      return;
    case "Home":
      handled();
      audioEngine.seek(0);
      return;
    case "End":
      handled();
      audioEngine.seek(Math.max(0, state.duration - 10));
      return;
    case "BracketLeft":
    case "BracketRight": {
      const delta = (event.shiftKey ? bar : beat) * (event.code === "BracketLeft" ? -1 : 1);
      if (clipsSelected) {
        handled();
        commands.nudge(delta);
      } else if (selected.length) {
        handled();
        state.moveLanes(selected, delta);
      }
      return;
    }
    case "Delete":
    case "Backspace":
      if (!studio) return;
      if (clipsSelected) {
        handled();
        commands.remove();
      } else if (selected.length) {
        handled();
        for (const id of selected) state.removeLane(id);
      }
      return;
  }

  if (key === "+" || key === "=" || key === "-" || key === "_") {
    handled();
    const up = key === "+" || key === "=";
    state.setMasterVolume(Math.max(0, Math.min(1.5, Math.round((state.masterVolume + (up ? 0.1 : -0.1)) * 10) / 10)));
    return;
  }

  if (event.shiftKey) {
    if (!studio) return;
    if (lower === "l" && (clipsSelected || selected.length)) commands.loopSelection();
    else if (lower === "q" && (clipsSelected || selected.length)) commands.quantize("bar");
    return;
  }

  switch (lower) {
    case "l":
      state.setLoop({ enabled: !state.loopEnabled });
      return;
    case "m":
      for (const id of laneTargets) state.toggleMute(id);
      return;
    case "s":
      for (const id of laneTargets) state.toggleSolo(id);
      return;
    case "k":
      if (studio) state.toggleMetronome();
      return;
    case "n":
      if (studio) state.toggleSnap();
      return;
    case "x":
      if (studio) commands.splitAt();
      return;
    case "r":
      if (studio && (clipsSelected || selected.length)) commands.reverse();
      return;
    case "q":
      if (studio && (clipsSelected || selected.length)) commands.quantize("beat");
      return;
    case "z":
      if (studio) useStudioView.getState().setZoom(1);
      return;
    case "i":
      if (studio && state.lanes.length) {
        const view = useStudioView.getState();
        view.setAiOpen(!view.aiOpen);
      }
      return;
    case "e":
      if (studio && selected.length) useStudioView.getState().openInspector();
      return;
  }

  if (studio && PAD_KEYS.includes(key)) {
    const pad = state.pads[PAD_KEYS.indexOf(key)];
    if (pad) {
      handled();
      void audioEngine.triggerPad(pad).catch(() => {});
    }
  }
}

/**
 * Installs the shortcuts for this page and renders the "⌨ Shortcuts"
 * button with the list behind it (hidden on touch screens, which have no
 * keyboard to use them with).
 */
export default function StudioShortcuts({ mode, className = "" }: { mode: Mode; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      handleKey(event, mode, () => setOpen(true));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    // Captured first, so Esc closes the list rather than stopping the mix.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground pointer-coarse:hidden ${className}`}
        title="Keyboard shortcuts (?)"
      >
        ⌨ Shortcuts <span className="ml-1 rounded border border-border px-1 font-mono text-[10px]">?</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div
            className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground" aria-label="Close">
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Click clips (or drag across empty space) to select them, then act on them — or right-click anything for its options. Every edit can be undone.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {GROUPS.map((group) => {
                const items = group.items.filter((item) => mode === "studio" || !item.studioOnly);
                if (items.length === 0) return null;
                return (
                  <section key={group.title} className={group.title === "Clips" ? "sm:row-span-2" : ""}>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {items.map((item) => (
                        <li key={item.label} className="flex items-center justify-between gap-3">
                          <span>{item.label}</span>
                          <span className="flex shrink-0 gap-1">
                            {item.keys.map((k) => (
                              <kbd
                                key={k}
                                className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted"
                              >
                                {k}
                              </kbd>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
