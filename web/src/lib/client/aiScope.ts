import { create } from "zustand";
import { clipEnd, clipStart, clipsOf, cutLaneAt, normaliseLane, selectionBounds, withEffectiveDuration, type ClipRef } from "./clipEdit";
import { beatLength, laneName, type Marker, type StudioLane } from "./studioStore";

// Where the AI producer may change things: the whole song or just a
// stretch of it (a section), and every lane or only the ones picked. An
// idea is always worked out for the whole mix, so it sounds the same as it
// would anywhere; the scope then decides what of it is heard. Outside the
// section, and on the lanes left out, the mix stays exactly as it was.
//
// A lane the idea changes inside a section becomes two: the original,
// with the section cut out of it, and the idea's version, playing only the
// section — each at its own speed, pitch and sound. Pure: lanes in, lanes
// out.

export type ScopeRange = { start: number; end: number; label: string };

export type Scope = {
  /** Timeline seconds the AI may change; null: the whole song. */
  range: ScopeRange | null;
  /** The lanes the AI may change; null: every lane. */
  lanes: string[] | null;
};

export const WHOLE_SONG: Scope = { range: null, lanes: null };

/**
 * What the AI producer works on now (see aiTrial.setScope, which also
 * works what's on out again) — and `preview`, a section being dragged out
 * that isn't picked yet, shown on the timeline as it moves.
 */
export const useAiScope = create<{ scope: Scope; preview: ScopeRange | null }>(() => ({ scope: WHOLE_SONG, preview: null }));

/** Shortest section worth working on, in seconds. */
export const MIN_SECTION = 0.5;

export function isWhole(scope: Scope) {
  return !scope.range && !scope.lanes;
}

/** The lane a lane came from: a vocal layer or a beat's part belongs to its lead or its beat. */
export function originOf(laneId: string) {
  const at = laneId.indexOf("~");
  return at > 0 ? laneId.slice(0, at) : laneId;
}

function inLanes(scope: Scope, laneId: string) {
  return !scope.lanes || scope.lanes.includes(originOf(laneId));
}

const EPS = 0.002;

/** The fields that make two versions of a lane sound different. */
function sound(lane: StudioLane) {
  const { offsetSeconds, tempoRatio, pitchSemitones, volume, muted, fx, clips, automation, stemId } = lane;
  return JSON.stringify([offsetSeconds, tempoRatio, pitchSemitones, volume, muted, fx, clips, automation, stemId]);
}

function sameSound(a: StudioLane, b: StudioLane) {
  return a === b || sound(a) === sound(b);
}

function laneStart(lane: StudioLane) {
  return Math.min(...clipsOf(lane).map((c) => clipStart(lane, c)));
}

function laneEnd(lane: StudioLane) {
  return Math.max(...clipsOf(lane).map((c) => clipEnd(lane, c)));
}

/**
 * The part of `lane` inside (or outside) `start`..`end`, or null where it
 * plays nothing there. Its own fade in or out stays only where the lane
 * really starts or ends — not at a cut, where it would dip.
 */
export function lanePart(lane: StudioLane, start: number, end: number, inside: boolean): StudioLane | null {
  const all = clipsOf(lane);
  const cut = cutLaneAt(lane, [start, end]);
  const kept = cut.filter((c) => {
    const mid = (clipStart(lane, c) + clipEnd(lane, c)) / 2;
    return mid > start && mid < end ? inside : !inside;
  });
  if (!kept.length) return null;
  // Nothing was cut or left out: the lane as it is.
  if (kept.length === cut.length && cut.length === all.length) return lane;
  const part = normaliseLane({ ...lane, clips: kept });
  const fx = { ...part.fx };
  if (Math.abs(laneStart(part) - laneStart(lane)) > EPS) fx.fadeIn = 0;
  if (Math.abs(laneEnd(part) - laneEnd(lane)) > EPS) fx.fadeOut = 0;
  return { ...part, fx };
}

/** The id of the lane playing an idea's version of `laneId` in a section. */
export function sectionLaneId(laneId: string, range: ScopeRange) {
  return `${laneId}~sec${Math.round(range.start * 100)}`;
}

/**
 * The mix with an idea (`result`, worked out for the whole mix from
 * `baseline`) heard only where `scope` allows: the original everywhere
 * else. Lanes come out in the original's order, with lanes the idea added
 * (layers, the beat's parts) after the lane they came from.
 */
export function applyScope(baseline: StudioLane[], result: StudioLane[], scope: Scope): StudioLane[] {
  if (isWhole(scope)) return result;
  const range = scope.range;
  const out: StudioLane[] = [];
  const inBaseline = new Set(baseline.map((l) => l.laneId));
  const added = result.filter((l) => !inBaseline.has(l.laneId));
  const placed = new Set<string>();

  const putIdea = (r: StudioLane, b: StudioLane | undefined) => {
    if (!range) return void out.push(r);
    if (b && sameSound(b, r)) return void out.push(b);
    const before = b ? lanePart(b, range.start, range.end, false) : null;
    const during = lanePart(r, range.start, range.end, true);
    if (before) out.push(before);
    if (during) {
      out.push(before ? { ...during, laneId: sectionLaneId(r.laneId, range), name: `${laneName(r)} · ${range.label}`.slice(0, 40), solo: false } : during);
    }
  };

  const putAdded = (origin: string) => {
    for (const r of added) {
      if (placed.has(r.laneId) || originOf(r.laneId) !== origin) continue;
      placed.add(r.laneId);
      // Lanes left out don't get the idea's additions either.
      if (inLanes(scope, r.laneId)) putIdea(r, undefined);
    }
  };

  for (const b of baseline) {
    const r = result.find((l) => l.laneId === b.laneId);
    if (!inLanes(scope, b.laneId)) out.push(b);
    else if (r) putIdea(r, b);
    else if (range) {
      // Taken out by the idea (the beat swapped for its parts): it stays outside the section.
      const before = lanePart(b, range.start, range.end, false);
      if (before) out.push(before);
    }
    putAdded(b.laneId);
  }
  for (const r of added) {
    if (placed.has(r.laneId)) continue;
    placed.add(r.laneId);
    if (inLanes(scope, r.laneId)) putIdea(r, undefined);
  }
  return out;
}

/**
 * Every lane played `k` times as fast, all together — the whole mix sped
 * up or slowed down as one, everything staying where it is against
 * everything else. An idea that settled the vocal and beat on a new tempo
 * is put back on the song's own this way before it's heard in a section,
 * so the section and the song around it run at one speed.
 */
export function retime(lanes: StudioLane[], k: number): StudioLane[] {
  if (!(k > 0) || Math.abs(k - 1) < 1e-6) return lanes;
  return lanes.map((lane) => {
    const automation = Object.fromEntries(
      Object.entries(lane.automation).map(([param, points]) => [param, points?.map((p) => ({ ...p, t: p.t / k }))])
    );
    return withEffectiveDuration({ ...lane, tempoRatio: lane.tempoRatio * k, offsetSeconds: lane.offsetSeconds / k, automation });
  });
}

/** "1:05" */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type SectionChoice = ScopeRange & { id: string };

/**
 * The sections there are to pick from: the loop region, the selected
 * clips, each marker, and the next 8 bars from the playhead (always
 * there, so a section can be picked without setting anything up).
 */
export function sectionChoices(state: {
  lanes: StudioLane[];
  loopStart: number;
  loopEnd: number;
  markers: Marker[];
  selectedClips: ClipRef[];
  playhead: number;
  projectBpm: number;
  duration: number;
}): SectionChoice[] {
  const choices: SectionChoice[] = [];
  const add = (id: string, name: string, start: number, end: number) => {
    const s = Math.max(0, start);
    const e = Math.min(end, Math.max(state.duration, s));
    if (e - s < MIN_SECTION) return;
    choices.push({ id, start: s, end: e, label: `${name} ${clock(s)}–${clock(e)}` });
  };
  if (state.loopEnd > state.loopStart) add("loop", "Loop", state.loopStart, state.loopEnd);
  const selected = state.selectedClips.length ? selectionBounds(state.lanes, state.selectedClips) : null;
  if (selected) add("selection", "Selected clips", selected.start, selected.end);
  for (const m of state.markers) add(`marker:${m.id}`, m.label || "Marker", m.start, m.end);
  const bar = beatLength(state.projectBpm) * 4;
  const from = Math.floor(state.playhead / bar + 1e-6) * bar;
  add("bars", "8 bars", from, from + 8 * bar);
  return choices;
}
