"use client";

import {
  allClipRefs,
  clipEnd,
  clipId,
  clipStart,
  clipsOf,
  copyClips,
  deleteClips,
  duplicateClips,
  laneClipRefs,
  liveRefs,
  moveClips,
  pasteClips,
  quantizeClips,
  resolveSelection,
  selectionBounds,
  splitClips,
  updateClips,
  type ClipClipboard,
  type ClipRef,
} from "./clipEdit";
import { cutSilences } from "./autoMatch";
import { audioEngine } from "./audioEngine";
import { startNewStep } from "./studioHistory";
import { beatLength, useStudioStore } from "./studioStore";
import { useStudioView } from "./studioView";

// Everything you can do to the selected clips, in one place: the context
// menu, the selection toolbar and the keyboard all call these. Each one is
// a single undo step, and says what it did (or why it couldn't).

let clipboard: ClipClipboard | null = null;

const store = () => useStudioStore.getState();
const notify = (text: string, tone?: "info" | "error") => useStudioView.getState().notify(text, tone);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What an edit acts on: the selected clips, else every clip of the selected lanes. */
export function targetRefs(): ClipRef[] {
  const { lanes, selectedClips, selectedLaneIds } = store();
  const clips = liveRefs(lanes, selectedClips);
  if (clips.length) return clips;
  return lanes.filter((l) => selectedLaneIds.includes(l.laneId)).flatMap(laneClipRefs);
}

export function hasClipboard() {
  return !!clipboard?.items.length;
}

function edit(run: Parameters<ReturnType<typeof store>["editClips"]>[0]) {
  startNewStep();
  const done = store().editClips(run);
  startNewStep();
  return done;
}

export function selectAllClips() {
  store().setClipSelection(allClipRefs(store().lanes));
}

export function selectLaneClips(laneId: string, additive = false) {
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane) return;
  const refs = laneClipRefs(lane);
  store().setClipSelection(additive ? [...store().selectedClips.filter((r) => r.laneId !== laneId), ...refs] : refs);
}

export function clearSelection() {
  store().setClipSelection([]);
}

/** Splits at `seconds` (default: the playhead) — selected clips, else selected lanes, else every lane. */
export function splitAt(seconds = store().playhead, laneIds?: string[]) {
  const { lanes, selectedLaneIds } = store();
  const refs = liveRefs(lanes, store().selectedClips);
  const targets =
    laneIds ??
    (refs.length
      ? [...new Set(refs.map((r) => r.laneId))]
      : selectedLaneIds.length
        ? selectedLaneIds
        : lanes.map((l) => l.laneId));
  let count = 0;
  edit((current, selection) => {
    const result = splitClips(current, targets, selection, seconds);
    count = result.count;
    return result.count ? result : null;
  });
  if (!count) notify("Nothing to split there — put the playhead over a clip", "error");
}

export function duplicate(times = 1) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  edit((lanes) => duplicateClips(lanes, refs, { times }));
  notify(times === 1 ? `Duplicated ${plural(refs.length, "clip")}` : `Repeated ${times}×`);
}

/** Repeats the selection to fill `bars` bars from where it starts (whole copies only). */
export function repeatToBars(bars: number) {
  const refs = targetRefs();
  const bounds = selectionBounds(store().lanes, refs);
  if (!bounds) return notify("Select a clip first", "error");
  const barSeconds = beatLength(store().projectBpm) * 4;
  // Round the block to whole bars so the copies stay on the grid.
  const block = Math.max(barSeconds, Math.round((bounds.end - bounds.start) / barSeconds) * barSeconds);
  const times = Math.max(1, Math.round((bars * barSeconds) / block) - 1);
  edit((lanes) => duplicateClips(lanes, refs, { times, blockSeconds: block }));
  notify(`Looped to ${bars} bars`);
}

export function remove() {
  const refs = targetRefs();
  if (!refs.length) return false;
  edit((lanes) => deleteClips(lanes, refs));
  notify(`Deleted ${plural(refs.length, "clip")}`);
  return true;
}

export function copy() {
  const refs = targetRefs();
  const board = copyClips(store().lanes, refs);
  if (!board) return notify("Select a clip to copy", "error");
  clipboard = board;
  notify(`Copied ${plural(board.items.length, "clip")}`);
}

export function cut() {
  const refs = targetRefs();
  const board = copyClips(store().lanes, refs);
  if (!board) return notify("Select a clip to cut", "error");
  clipboard = board;
  edit((lanes) => deleteClips(lanes, refs));
  notify(`Cut ${plural(board.items.length, "clip")}`);
}

/** Pastes at `seconds` (default: the playhead), snapped to the beat when snap is on. */
export function paste(seconds = store().playhead) {
  if (!clipboard) return notify("Copy a clip first", "error");
  const { snapToGrid, projectBpm } = store();
  const beat = beatLength(projectBpm);
  const at = snapToGrid ? Math.round(seconds / beat) * beat : seconds;
  const board = clipboard;
  let count = 0;
  edit((lanes) => {
    const result = pasteClips(lanes, board, at);
    count = result.count;
    return count ? result : null;
  });
  notify(count ? `Pasted ${plural(count, "clip")}` : "The lanes those clips came from are gone", count ? "info" : "error");
}

export function reverse() {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  edit((lanes) => updateClips(lanes, refs, (c) => ({ reverse: !c.reverse })));
}

/** Sets each selected clip's own speed (1 = the lane's). */
export function setSpeed(stretch: number) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  edit((lanes) => updateClips(lanes, refs, () => ({ stretch })));
}

export function quantize(unit: "beat" | "bar") {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  const beat = beatLength(store().projectBpm);
  edit((lanes) => quantizeClips(lanes, refs, unit === "bar" ? beat * 4 : beat));
  notify(`Snapped to the nearest ${unit}`);
}

export function nudge(seconds: number) {
  const refs = targetRefs();
  if (!refs.length) return false;
  edit((lanes) => moveClips(lanes, refs, seconds));
  return true;
}

/** Moves the selection so it starts at the playhead. */
export function moveToPlayhead() {
  const refs = targetRefs();
  const bounds = selectionBounds(store().lanes, refs);
  if (!bounds) return notify("Select a clip first", "error");
  const { playhead, snapToGrid, projectBpm } = store();
  const beat = beatLength(projectBpm);
  const target = snapToGrid ? Math.round(playhead / beat) * beat : playhead;
  edit((lanes) => moveClips(lanes, refs, target - bounds.start));
}

/** Loops playback over the selection (rounded out to beats when snap is on). */
export function loopSelection() {
  const bounds = selectionBounds(store().lanes, targetRefs());
  if (!bounds) return notify("Select a clip first", "error");
  const { snapToGrid, projectBpm } = store();
  const beat = beatLength(projectBpm);
  const start = snapToGrid ? Math.floor(bounds.start / beat + 0.01) * beat : bounds.start;
  const end = snapToGrid ? Math.ceil(bounds.end / beat - 0.01) * beat : bounds.end;
  store().setLoop({ enabled: true, start, end });
  audioEngine.seek(start);
}

/** Beat repeat on every selected lane (or the given one) at `seconds`. */
export function stutter(beats: number, repeats: number, seconds = store().playhead, laneId?: string) {
  const laneIds = laneId ? [laneId] : [...new Set(targetRefs().map((r) => r.laneId))];
  if (!laneIds.length) return notify("Select a lane or clip first", "error");
  startNewStep();
  let done = 0;
  for (const id of laneIds) if (store().stutterAt(id, seconds, beats, repeats)) done++;
  startNewStep();
  if (!done) notify("No audio there to repeat — put the playhead over a clip", "error");
}

/** Puts the first selected clip (or a bar from the playhead) on a sample pad. */
export function toPad(laneId?: string) {
  const state = store();
  if (state.pads.length >= 16) return notify("All 16 pads are full — remove one first", "error");
  const selected = resolveSelection(state.lanes, laneId ? state.selectedClips.filter((r) => r.laneId === laneId) : targetRefs())[0];
  const lane = selected?.lane ?? state.lanes.find((l) => l.laneId === laneId);
  if (!lane) return notify("Select a clip first", "error");
  const clips = clipsOf(lane);
  const clip = selected
    ? clips.find((c) => selected.ids.has(clipId(c)))!
    : clips.find((c) => state.playhead >= clipStart(lane, c) && state.playhead < clipEnd(lane, c));
  if (!clip) return notify("Put the playhead over this lane's audio (or select a clip)", "error");
  let { from, to } = clip;
  if (!selected) {
    from = clip.from + (state.playhead - clipStart(lane, clip)) * lane.tempoRatio * (clip.stretch ?? 1);
    to = Math.min(clip.to, from + beatLength(state.projectBpm) * 4 * lane.tempoRatio);
  }
  state.addPad({
    stemId: lane.stemId,
    kind: lane.kind,
    label: `${lane.trackTitle.slice(0, 14)} ${selected ? "clip" : "bar"}`,
    from,
    to,
    reverse: !!clip.reverse,
    tempoRatio: lane.tempoRatio,
    pitchSemitones: lane.pitchSemitones,
  });
  notify(`Added to pad ${state.pads.length + 1}`);
}

export async function removeSilences(laneId: string) {
  notify("Listening for the gaps…");
  startNewStep();
  try {
    const count = await cutSilences(laneId);
    notify(count ? `Cut into ${plural(count, "phrase")}` : "Couldn't find any silences to cut", count ? "info" : "error");
  } catch {
    notify("Couldn't analyse this lane", "error");
  }
}

export function wholeTake(laneId: string) {
  startNewStep();
  store().clearClips(laneId);
  store().setClipSelection(store().selectedClips.filter((r) => r.laneId !== laneId));
}
