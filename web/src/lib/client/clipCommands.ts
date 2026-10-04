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
  fitClips,
  insertTime as insertTimeIn,
  joinClips,
  laneClipRefs,
  liveRefs,
  moveClips,
  pasteClips,
  quantizeClips,
  removeTime as removeTimeFrom,
  resolveSelection,
  selectionBounds,
  shiftMarkers,
  sliceClips,
  splitClips,
  trimClipsAt,
  updateClips,
  type ClipClipboard,
  type ClipRef,
} from "./clipEdit";
import { cutSilences } from "./autoMatch";
import { audioEngine } from "./audioEngine";
import { gatePattern, pumpPattern, spliceAutomation } from "./automationPatterns";
import { startNewStep } from "./studioHistory";
import { beatLength, gridLength, laneName, snapTime, useStudioStore, type LaneClip } from "./studioStore";
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
  const at = snapTime(seconds, store());
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
  const target = snapTime(store().playhead, store());
  edit((lanes) => moveClips(lanes, refs, target - bounds.start));
}

/** Loops playback over the selection (rounded out to beats when snap is on). */
export function loopSelection() {
  const bounds = selectionBounds(store().lanes, targetRefs());
  if (!bounds) return notify("Select a clip first", "error");
  const { snapToGrid, projectBpm, gridBeats } = store();
  const grid = gridLength(projectBpm, gridBeats);
  const start = snapToGrid ? Math.floor(bounds.start / grid + 0.01) * grid : bounds.start;
  const end = snapToGrid ? Math.ceil(bounds.end / grid - 0.01) * grid : bounds.end;
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

// --- Clip level, mute and fades -------------------------------------------------

const db = (gain: number) => (gain > 0 ? `${(20 * Math.log10(gain)).toFixed(1)} dB` : "silent");

/** Turns each selected clip up or down by `dB` (its own level, on top of the lane's fader). */
export function clipGain(dB: number) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  let last = 1;
  edit((lanes) =>
    updateClips(lanes, refs, (c) => {
      last = Math.min(4, Math.max(0.05, (c.gain ?? 1) * 10 ** (dB / 20)));
      return { gain: last };
    })
  );
  notify(`Clip level ${db(last)}`);
}

/** Puts each selected clip back at the lane's own level. */
export function resetClipGain() {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  edit((lanes) => updateClips(lanes, refs, () => ({ gain: 1 })));
}

/** Silences the selected clips without deleting them (or brings them back). */
export function toggleClipMute() {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  const { lanes } = store();
  const anyOn = resolveSelection(lanes, refs).some(({ lane, ids }) => clipsOf(lane).some((c) => ids.has(clipId(c)) && !c.muted));
  edit((current) => updateClips(current, refs, () => ({ muted: anyOn })));
  notify(anyOn ? `Muted ${plural(refs.length, "clip")}` : `Unmuted ${plural(refs.length, "clip")}`);
}

/** Fades the selected clips in or out over `beats` beats (0 takes the fade off). */
export function clipFade(edge: "in" | "out" | "both", beats: number) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  const seconds = beats * beatLength(store().projectBpm);
  const patch = (): Partial<LaneClip> =>
    edge === "in" ? { fadeIn: seconds } : edge === "out" ? { fadeOut: seconds } : { fadeIn: seconds, fadeOut: seconds };
  edit((lanes) => updateClips(lanes, refs, patch));
  notify(beats ? `Fade ${edge === "both" ? "in and out" : edge} over ${beats} beat${beats === 1 ? "" : "s"}` : "Fades off");
}

// --- Slicing, joining, trimming, fitting -------------------------------------------

/** Chops the selected clips at every `beats`-beat line (the grid's when not given). */
export function slice(beats?: number) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  const { projectBpm, gridBeats } = store();
  const step = gridLength(projectBpm, beats ?? gridBeats);
  let count = 0;
  edit((lanes) => {
    const result = sliceClips(lanes, refs, step);
    count = result.count;
    return count ? result : null;
  });
  notify(count ? `Sliced into ${count + refs.length} pieces` : "Too short to slice at that size", count ? "info" : "error");
}

/** Joins selected clips that carry straight on from each other. */
export function join() {
  const refs = targetRefs();
  if (refs.length < 2) return notify("Select two or more clips that follow each other", "error");
  let count = 0;
  edit((lanes) => {
    const result = joinClips(lanes, refs);
    count = result.count;
    return count ? result : null;
  });
  notify(count ? `Joined ${plural(count + 1, "clip")}` : "Only clips that follow on from each other in the song can be joined", count ? "info" : "error");
}

/** Trims the selected clips (or the lanes' clips under the playhead) at the playhead. */
export function trimAtPlayhead(edge: "start" | "end") {
  const { lanes, playhead } = store();
  let refs = targetRefs();
  if (!refs.length) refs = lanes.flatMap(laneClipRefs);
  let count = 0;
  edit((current) => {
    const result = trimClipsAt(current, refs, playhead, edge);
    count = result.count;
    return count ? result : null;
  });
  if (!count) notify("Put the playhead inside a clip to trim it there", "error");
}

/** Speeds the selected clips up or down (pitch unchanged) to last exactly `bars` bars each. */
export function fitToBars(bars: number) {
  const refs = targetRefs();
  if (!refs.length) return notify("Select a clip first", "error");
  let count = 0;
  edit((lanes) => {
    const result = fitClips(lanes, refs, bars * 4 * beatLength(store().projectBpm));
    count = result.count;
    return count ? result : null;
  });
  notify(
    count ? `Fitted to ${bars} bar${bars === 1 ? "" : "s"}` : `That would need more than 4× the speed — pick a different length`,
    count ? "info" : "error"
  );
}

// --- Time ------------------------------------------------------------------------------

/** Ripple delete: takes `start`..`end` out of the whole song and closes the gap. */
export function removeTime(start: number, end: number) {
  if (!(end - start > 0.05)) return notify("Set a loop over the part to take out first", "error");
  const state = store();
  startNewStep();
  const lanes = removeTimeFrom(state.lanes, start, end);
  useStudioStore.setState({
    lanes,
    duration: lanes.reduce((max, l) => Math.max(max, l.offsetSeconds + l.duration), 0),
    markers: shiftMarkers(state.markers, start, end, -(end - start)),
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    selectedClips: [],
  });
  startNewStep();
  audioEngine.seek(Math.min(start, useStudioStore.getState().duration));
  notify(`Took out ${(end - start).toFixed(1)}s — everything after moved up`);
}

/** Puts `bars` bars of silence into the whole song at `seconds` (snapped to the bar). */
export function insertBars(seconds: number, bars: number) {
  const state = store();
  const bar = beatLength(state.projectBpm) * 4;
  const at = Math.round(seconds / bar) * bar;
  const length = bars * bar;
  startNewStep();
  const lanes = insertTimeIn(state.lanes, at, length);
  useStudioStore.setState({
    lanes,
    duration: lanes.reduce((max, l) => Math.max(max, l.offsetSeconds + l.duration), 0),
    markers: shiftMarkers(state.markers, at, at, length),
    selectedClips: [],
  });
  startNewStep();
  notify(`${plural(bars, "bar")} of space added at bar ${Math.round(at / bar) + 1}`);
}

// --- Rhythmic automation ------------------------------------------------------------------

/** The stretch a pattern goes over: the loop when there is one, else the lane's whole length. */
function patternRange(laneId: string) {
  const { lanes, loopEnabled, loopStart, loopEnd } = store();
  const lane = lanes.find((l) => l.laneId === laneId);
  if (!lane) return null;
  if (loopEnabled && loopEnd > loopStart) return { lane, start: loopStart, end: loopEnd };
  return { lane, start: lane.offsetSeconds, end: lane.offsetSeconds + lane.duration };
}

function showAutomation(laneId: string) {
  const view = useStudioView.getState();
  if (!view.automationLanes.includes(laneId)) view.toggleAutomation(laneId);
}

/** Chops a lane on and off every `beats` beats over the loop (or the whole lane). */
export function gate(laneId: string, beats: number) {
  const range = patternRange(laneId);
  if (!range) return;
  const step = beats * beatLength(store().projectBpm);
  startNewStep();
  store().setAutomation(laneId, "volume", spliceAutomation(range.lane.automation.volume, range.start, range.end, gatePattern(range.start, range.end, step, { duty: 0.55, floor: 0.05 })));
  showAutomation(laneId);
  notify(`Gate on “${laneName(range.lane)}”${store().loopEnabled ? " over the loop" : ""}`);
}

/** Sidechain-style pumping on every beat, over the loop (or the whole lane). */
export function pump(laneId: string, depth = 0.6) {
  const range = patternRange(laneId);
  if (!range) return;
  startNewStep();
  store().setAutomation(laneId, "volume", spliceAutomation(range.lane.automation.volume, range.start, range.end, pumpPattern(range.start, range.end, beatLength(store().projectBpm), { depth })));
  showAutomation(laneId);
  notify(`Pumping on every beat on “${laneName(range.lane)}”`);
}

/** Takes a lane's drawn automation off. */
export function clearAutomation(laneId: string) {
  startNewStep();
  store().setAutomation(laneId, "volume", null);
  store().setAutomation(laneId, "filter", null);
  notify("Automation cleared");
}

// --- Whole track or clips ------------------------------------------------------------

/** How a lane can be split: at its silences (phrase by phrase), or every so many bars. */
export type SplitHow = "silences" | 1 | 2 | 4 | 8;

/** Splits a whole lane into clips — at its silences, or every `bars` bars. */
export function splitLane(laneId: string, how: SplitHow) {
  if (how === "silences") return removeSilences(laneId);
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane) return;
  let count = 0;
  edit((lanes) => {
    const result = sliceClips(lanes, laneClipRefs(lane), how * 4 * beatLength(store().projectBpm));
    count = result.count;
    return count ? result : null;
  });
  notify(count ? `Split into ${clipsOf(store().lanes.find((l) => l.laneId === laneId)!).length} clips of ${plural(how, "bar")}` : "Too short to split at that size", count ? "info" : "error");
}

/** The lane back as one whole track (undoable). */
export function makeWhole(laneId: string) {
  const lane = store().lanes.find((l) => l.laneId === laneId);
  if (!lane?.clips?.length) return notify("It's already one whole track");
  wholeTake(laneId);
  notify(`“${laneName(lane)}” is one whole track again — ⌘Z to undo`);
}
