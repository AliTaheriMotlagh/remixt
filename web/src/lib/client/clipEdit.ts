import type { LaneClip, StudioLane } from "./studioStore";

// Editing clips the way a DAW does: pick any number of them, across any
// lanes, and move, cut, copy, paste, duplicate, repeat, quantize, reverse
// or delete them together. Everything here is pure — it takes the lanes
// and returns new ones plus the clips that should be selected afterwards —
// so the store, the context menu, the toolbar and the keyboard all share
// one implementation, and it can be tested without a browser.
//
// A clip is addressed by its lane and a stable id. A lane that plays its
// whole stem (clips === null) has a single pseudo clip, WHOLE.

/** Shortest a clip can be, in stem seconds. */
export const MIN_CLIP = 0.05;
/** The id of the one clip of a lane that isn't cut up. */
export const WHOLE = "whole";

export type ClipRef = { laneId: string; clipId: string };
export type EditResult = { lanes: StudioLane[]; selection: ClipRef[] };

export function newClipId() {
  return Math.random().toString(36).slice(2, 10);
}

/** How long a clip plays, in the lane's (unstretched) seconds. */
export function clipSpan(clip: LaneClip) {
  return (clip.to - clip.from) / (clip.stretch ?? 1);
}

/** A lane's clips — a lane that isn't arranged is one clip of its whole stem. */
export function clipsOf(lane: StudioLane): LaneClip[] {
  return lane.clips?.length ? lane.clips : [{ id: WHOLE, from: 0, to: lane.originalDuration, at: 0 }];
}

export function clipId(clip: LaneClip) {
  return clip.id ?? WHOLE;
}

/** Where a clip starts on the timeline, in seconds. */
export function clipStart(lane: StudioLane, clip: LaneClip) {
  return lane.offsetSeconds + clip.at / lane.tempoRatio;
}

/** Where a clip ends on the timeline, in seconds. */
export function clipEnd(lane: StudioLane, clip: LaneClip) {
  return clipStart(lane, clip) + clipSpan(clip) / lane.tempoRatio;
}

/** How much of the stem's own time the lane spans, start to end. */
function sourceSpan(lane: StudioLane) {
  if (!lane.clips?.length) return lane.originalDuration;
  return lane.clips.reduce((max, c) => Math.max(max, c.at + clipSpan(c)), 0);
}

export function withEffectiveDuration(lane: StudioLane): StudioLane {
  return { ...lane, duration: sourceSpan(lane) / lane.tempoRatio };
}

/** Gives every clip an id of its own (a copied clip shares its source's until here). */
function withIds(clips: LaneClip[]): LaneClip[] {
  const seen = new Set<string>();
  let changed = false;
  const out = clips.map((clip) => {
    if (clip.id && clip.id !== WHOLE && !seen.has(clip.id)) {
      seen.add(clip.id);
      return clip;
    }
    changed = true;
    const id = newClipId();
    seen.add(id);
    return { ...clip, id };
  });
  return changed ? out : clips;
}

/**
 * Keeps the lane starting where its first clip starts, so dragging the
 * lane, its "Start" field and the nudges all mean the same thing with or
 * without an arrangement — and makes sure every clip has an id.
 */
export function normaliseLane(lane: StudioLane): StudioLane {
  if (!lane.clips?.length) return withEffectiveDuration({ ...lane, clips: null });
  const first = Math.min(...lane.clips.map((c) => c.at));
  let offsetSeconds = lane.offsetSeconds + first / lane.tempoRatio;
  let shift = first;
  if (offsetSeconds < 0) {
    shift += offsetSeconds * lane.tempoRatio;
    offsetSeconds = 0;
  }
  const clips = withIds(lane.clips.map((c) => (shift === 0 ? c : { ...c, at: c.at - shift })));
  return withEffectiveDuration({ ...lane, offsetSeconds, clips });
}

/** Every clip in the mix, as refs. */
export function allClipRefs(lanes: StudioLane[]): ClipRef[] {
  return lanes.flatMap((lane) => clipsOf(lane).map((c) => ({ laneId: lane.laneId, clipId: clipId(c) })));
}

export function laneClipRefs(lane: StudioLane): ClipRef[] {
  return clipsOf(lane).map((c) => ({ laneId: lane.laneId, clipId: clipId(c) }));
}

export const sameRef = (a: ClipRef, b: ClipRef) => a.laneId === b.laneId && a.clipId === b.clipId;

/** The selected clips that still exist, grouped by lane (in lane order). */
export function resolveSelection(lanes: StudioLane[], refs: ClipRef[]) {
  const out: { lane: StudioLane; ids: Set<string> }[] = [];
  for (const lane of lanes) {
    const wanted = new Set(refs.filter((r) => r.laneId === lane.laneId).map((r) => r.clipId));
    if (wanted.size === 0) continue;
    const ids = new Set(clipsOf(lane).map(clipId).filter((id) => wanted.has(id)));
    if (ids.size) out.push({ lane, ids });
  }
  return out;
}

/** Only the refs that still point at a clip. */
export function liveRefs(lanes: StudioLane[], refs: ClipRef[]): ClipRef[] {
  return resolveSelection(lanes, refs).flatMap(({ lane, ids }) => [...ids].map((clipId) => ({ laneId: lane.laneId, clipId })));
}

/** Start and end of the selection on the timeline, in seconds. */
export function selectionBounds(lanes: StudioLane[], refs: ClipRef[]): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const { lane, ids } of resolveSelection(lanes, refs)) {
    for (const clip of clipsOf(lane)) {
      if (!ids.has(clipId(clip))) continue;
      start = Math.min(start, clipStart(lane, clip));
      end = Math.max(end, clipEnd(lane, clip));
    }
  }
  return Number.isFinite(start) ? { start, end } : null;
}

/** Replaces some lanes, keeping the others (and their identity) as they were. */
function replace(lanes: StudioLane[], next: Map<string, StudioLane | null>): StudioLane[] {
  const out: StudioLane[] = [];
  for (const lane of lanes) {
    if (!next.has(lane.laneId)) out.push(lane);
    else {
      const updated = next.get(lane.laneId);
      if (updated) out.push(updated);
    }
  }
  return out;
}

/** A lane's clips made concrete, so they can be edited one by one. */
function concrete(lane: StudioLane): LaneClip[] {
  return lane.clips?.length ? lane.clips : [{ id: newClipId(), from: 0, to: lane.originalDuration, at: 0 }];
}

/** Maps WHOLE in `ids` to the id `concrete` gave the lane's one clip. */
function concreteIds(lane: StudioLane, clips: LaneClip[], ids: Set<string>) {
  if (lane.clips?.length || !ids.has(WHOLE)) return ids;
  return new Set([clipId(clips[0])]);
}

/**
 * Moves the selected clips by `deltaSeconds`, keeping their spacing; none
 * goes before the start of the timeline. A lane whose every clip is
 * selected moves as a whole.
 */
export function moveClips(lanes: StudioLane[], refs: ClipRef[], deltaSeconds: number): EditResult {
  const selected = resolveSelection(lanes, refs);
  const bounds = selectionBounds(lanes, refs);
  if (!bounds || deltaSeconds === 0) return { lanes, selection: refs };
  const delta = Math.max(-bounds.start, deltaSeconds);
  const next = new Map<string, StudioLane>();
  for (const { lane, ids } of selected) {
    const clips = clipsOf(lane);
    if (clips.every((c) => ids.has(clipId(c)))) {
      next.set(lane.laneId, { ...lane, offsetSeconds: Math.max(0, lane.offsetSeconds + delta) });
      continue;
    }
    const moved = clips.map((c) => (ids.has(clipId(c)) ? { ...c, at: c.at + delta * lane.tempoRatio } : c));
    next.set(lane.laneId, normaliseLane({ ...lane, clips: moved }));
  }
  return { lanes: replace(lanes, next), selection: refs };
}

/**
 * Deletes the selected clips. A lane left with nothing to play is removed
 * (undo brings it back).
 */
export function deleteClips(lanes: StudioLane[], refs: ClipRef[]): EditResult {
  const next = new Map<string, StudioLane | null>();
  for (const { lane, ids } of resolveSelection(lanes, refs)) {
    const kept = clipsOf(lane).filter((c) => !ids.has(clipId(c)));
    next.set(lane.laneId, kept.length ? normaliseLane({ ...lane, clips: kept }) : null);
  }
  return { lanes: replace(lanes, next), selection: [] };
}

/**
 * Copies the selected clips `times` times, each copy straight after the
 * last — the selection as a block, so a beat and a vocal duplicated
 * together stay together. `gapSeconds` 0 with `times` 1 and `inPlace`
 * puts the copies exactly over the originals (for an Alt-drag). The
 * copies end up selected.
 */
export function duplicateClips(
  lanes: StudioLane[],
  refs: ClipRef[],
  { times = 1, inPlace = false, blockSeconds }: { times?: number; inPlace?: boolean; blockSeconds?: number } = {}
): EditResult {
  const bounds = selectionBounds(lanes, refs);
  if (!bounds) return { lanes, selection: refs };
  const block = inPlace ? 0 : (blockSeconds ?? bounds.end - bounds.start);
  const next = new Map<string, StudioLane>();
  const selection: ClipRef[] = [];
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    const copies: LaneClip[] = [];
    for (let k = 1; k <= (inPlace ? 1 : times); k++) {
      for (const clip of clips) {
        if (!ids.has(clipId(clip))) continue;
        const copy = { ...clip, id: newClipId(), at: clip.at + k * block * lane.tempoRatio };
        copies.push(copy);
        selection.push({ laneId: lane.laneId, clipId: copy.id });
      }
    }
    next.set(lane.laneId, normaliseLane({ ...lane, clips: [...clips, ...copies].sort((a, b) => a.at - b.at) }));
  }
  return { lanes: replace(lanes, next), selection };
}

/**
 * Cuts the clip under `seconds` in two, in each of the given lanes —
 * only among the selected clips when `refs` has any in that lane. Both
 * halves of a selected clip stay selected. `count` says how many cuts.
 */
export function splitClips(
  lanes: StudioLane[],
  laneIds: string[],
  refs: ClipRef[],
  seconds: number
): EditResult & { count: number } {
  const next = new Map<string, StudioLane>();
  let selection = refs.slice();
  let count = 0;
  for (const lane of lanes) {
    if (!laneIds.includes(lane.laneId)) continue;
    const limited = new Set(refs.filter((r) => r.laneId === lane.laneId).map((r) => r.clipId));
    const clips = concrete(lane);
    const ids = limited.size ? concreteIds(lane, clips, limited) : null;
    const at = (seconds - lane.offsetSeconds) * lane.tempoRatio;
    const index = clips.findIndex(
      (c) => (!ids || ids.has(clipId(c))) && at > c.at + MIN_CLIP && at < c.at + clipSpan(c) - MIN_CLIP
    );
    if (index < 0) continue;
    const clip = clips[index];
    const cut = clip.from + (at - clip.at) * (clip.stretch ?? 1);
    const right = { ...clip, id: newClipId(), from: cut, at };
    // Reversed audio plays its end first, so the left half is the stem's later part.
    const [first, second] = clip.reverse
      ? [{ ...clip, from: clip.to - (cut - clip.from), to: clip.to }, { ...right, from: clip.from, to: clip.to - (cut - clip.from) }]
      : [{ ...clip, to: cut }, right];
    next.set(lane.laneId, normaliseLane({ ...lane, clips: [...clips.slice(0, index), first, second, ...clips.slice(index + 1)] }));
    count++;
    if (ids?.has(clipId(clip))) {
      selection = selection.filter((r) => !(r.laneId === lane.laneId && (r.clipId === clipId(clip) || r.clipId === WHOLE)));
      selection.push({ laneId: lane.laneId, clipId: clipId(first) }, { laneId: lane.laneId, clipId: right.id });
    }
  }
  return { lanes: replace(lanes, next), selection, count };
}

/** Changes each selected clip with `update` (reverse, speed…). */
export function updateClips(
  lanes: StudioLane[],
  refs: ClipRef[],
  update: (clip: LaneClip) => Partial<Pick<LaneClip, "reverse" | "stretch">>
): EditResult {
  const next = new Map<string, StudioLane>();
  let selection = refs;
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    const updated = clips.map((clip) => {
      if (!ids.has(clipId(clip))) return clip;
      const changed: LaneClip = { ...clip, ...update(clip) };
      if (!changed.reverse) delete changed.reverse;
      if (changed.stretch === undefined || Math.abs(changed.stretch - 1) < 0.0005) delete changed.stretch;
      return changed;
    });
    next.set(lane.laneId, normaliseLane({ ...lane, clips: updated }));
    if (wanted.has(WHOLE)) {
      selection = [...selection.filter((r) => !(r.laneId === lane.laneId && r.clipId === WHOLE)), ...[...ids].map((clipId) => ({ laneId: lane.laneId, clipId }))];
    }
  }
  return { lanes: replace(lanes, next), selection };
}

/** Snaps the start of every selected clip to the nearest multiple of `gridSeconds`. */
export function quantizeClips(lanes: StudioLane[], refs: ClipRef[], gridSeconds: number): EditResult {
  if (!(gridSeconds > 0)) return { lanes, selection: refs };
  const next = new Map<string, StudioLane>();
  for (const { lane, ids } of resolveSelection(lanes, refs)) {
    const clips = clipsOf(lane);
    if (!lane.clips?.length) {
      next.set(lane.laneId, { ...lane, offsetSeconds: Math.max(0, Math.round(lane.offsetSeconds / gridSeconds) * gridSeconds) });
      continue;
    }
    const moved = clips.map((c) => {
      if (!ids.has(clipId(c))) return c;
      const start = clipStart(lane, c);
      const target = Math.max(0, Math.round(start / gridSeconds) * gridSeconds);
      return { ...c, at: c.at + (target - start) * lane.tempoRatio };
    });
    next.set(lane.laneId, normaliseLane({ ...lane, clips: moved }));
  }
  return { lanes: replace(lanes, next), selection: refs };
}

/** What Copy keeps: the clips with where they sat, to paste back into the same stem. */
export type ClipClipboard = {
  items: { laneId: string; stemId: string; clip: LaneClip; startSeconds: number }[];
  origin: number;
};

export function copyClips(lanes: StudioLane[], refs: ClipRef[]): ClipClipboard | null {
  const bounds = selectionBounds(lanes, refs);
  if (!bounds) return null;
  const items: ClipClipboard["items"] = [];
  for (const { lane, ids } of resolveSelection(lanes, refs)) {
    for (const clip of clipsOf(lane)) {
      if (!ids.has(clipId(clip))) continue;
      items.push({ laneId: lane.laneId, stemId: lane.stemId, clip: { ...clip }, startSeconds: clipStart(lane, clip) });
    }
  }
  return { items, origin: bounds.start };
}

/**
 * Pastes copied clips so the earliest starts at `seconds`, each into the
 * lane it came from — or, if that lane is gone, the first one playing the
 * same stem. Returns how many found a home.
 */
export function pasteClips(lanes: StudioLane[], clipboard: ClipClipboard, seconds: number): EditResult & { count: number } {
  const added = new Map<string, LaneClip[]>();
  const selection: ClipRef[] = [];
  for (const item of clipboard.items) {
    const lane = lanes.find((l) => l.laneId === item.laneId) ?? lanes.find((l) => l.stemId === item.stemId);
    if (!lane) continue;
    const start = seconds + (item.startSeconds - clipboard.origin);
    const copy = { ...item.clip, id: newClipId(), at: (start - lane.offsetSeconds) * lane.tempoRatio };
    added.set(lane.laneId, [...(added.get(lane.laneId) ?? []), copy]);
    selection.push({ laneId: lane.laneId, clipId: copy.id });
  }
  const next = new Map<string, StudioLane>();
  for (const [laneId, copies] of added) {
    const lane = lanes.find((l) => l.laneId === laneId)!;
    const clips = [...concrete(lane), ...copies].sort((a, b) => a.at - b.at);
    next.set(laneId, normaliseLane({ ...lane, clips }));
  }
  // Normalising can shift a lane's `at`s, never its ids — the refs hold.
  return { lanes: replace(lanes, next), selection, count: selection.length };
}

/**
 * Beat repeat: from `seconds`, the `beatSeconds × beats`-long slice that
 * starts there played `repeats` times in a row, over whatever was there.
 * Null when there's no audio at that point.
 */
export function stutterLane(
  lane: StudioLane,
  seconds: number,
  sliceSeconds: number,
  repeats: number
): LaneClip[] | null {
  if (repeats < 2) return null;
  const clips = clipsOf(lane);
  const at = (seconds - lane.offsetSeconds) * lane.tempoRatio;
  const index = clips.findIndex((c) => at >= c.at && at < c.at + clipSpan(c) - MIN_CLIP);
  if (index < 0) return null;
  const clip = clips[index];
  const stretch = clip.stretch ?? 1;
  const sliceLane = sliceSeconds * lane.tempoRatio;
  const from = clip.from + (at - clip.at) * stretch;
  const to = Math.min(clip.to, from + sliceLane * stretch);
  if (to - from < MIN_CLIP) return null;
  const span = (to - from) / stretch;
  const end = at + span * repeats;

  // Cut out what the repeats play over, keeping everything either side.
  const kept: LaneClip[] = [];
  for (const c of clips) {
    const cEnd = c.at + clipSpan(c);
    const cStretch = c.stretch ?? 1;
    if (cEnd <= at || c.at >= end) {
      kept.push(c);
      continue;
    }
    if (c.at < at) kept.push({ ...c, to: c.from + (at - c.at) * cStretch });
    if (cEnd > end) kept.push({ ...c, id: newClipId(), from: c.from + (end - c.at) * cStretch, at: end });
  }
  const repeated = Array.from({ length: repeats }, (_, i) => ({ ...clip, id: newClipId(), from, to, at: at + i * span }));
  return [...kept, ...repeated]
    .filter((c) => c.to - c.from >= MIN_CLIP / 2)
    .map((c) => (c.id === WHOLE ? { ...c, id: newClipId() } : c))
    .sort((a, b) => a.at - b.at);
}
