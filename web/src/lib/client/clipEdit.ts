import type { AutoPoint, ClipOptions, LaneAutomation, LaneClip, Marker, StudioLane } from "./studioStore";

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

/** Drops the clip options that are at their defaults, so a clip saves and compares the same either way. */
export function cleanClip(clip: LaneClip): LaneClip {
  const next = { ...clip };
  if (!next.reverse) delete next.reverse;
  if (next.stretch === undefined || Math.abs(next.stretch - 1) < 0.0005) delete next.stretch;
  if (next.gain === undefined || Math.abs(next.gain - 1) < 0.005) delete next.gain;
  if (!next.muted) delete next.muted;
  if (!(next.fadeIn && next.fadeIn > 0.001)) delete next.fadeIn;
  if (!(next.fadeOut && next.fadeOut > 0.001)) delete next.fadeOut;
  return next;
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
    const [first, second] = cutClip(clip, at);
    next.set(lane.laneId, normaliseLane({ ...lane, clips: [...clips.slice(0, index), first, second, ...clips.slice(index + 1)] }));
    count++;
    if (ids?.has(clipId(clip))) {
      selection = selection.filter((r) => !(r.laneId === lane.laneId && (r.clipId === clipId(clip) || r.clipId === WHOLE)));
      selection.push({ laneId: lane.laneId, clipId: clipId(first) }, { laneId: lane.laneId, clipId: clipId(second) });
    }
  }
  return { lanes: replace(lanes, next), selection, count };
}

/**
 * Cuts a clip in two at `at` (lane seconds, inside the clip). The left half
 * keeps the clip's id and its fade in, the right half gets a new id and the
 * fade out; both keep its level, speed, direction and name.
 */
export function cutClip(clip: LaneClip, at: number): [LaneClip, LaneClip] {
  const stretch = clip.stretch ?? 1;
  const into = (at - clip.at) * stretch;
  const { fadeIn: _fadeIn, fadeOut: _fadeOut, ...rest } = clip;
  void _fadeIn;
  void _fadeOut;
  const left: LaneClip = { ...rest, ...(clip.fadeIn ? { fadeIn: clip.fadeIn } : {}) };
  const right: LaneClip = { ...rest, id: newClipId(), at, ...(clip.fadeOut ? { fadeOut: clip.fadeOut } : {}) };
  // Reversed audio plays its end first, so the left half is the stem's later part.
  if (clip.reverse) {
    return [
      { ...left, from: clip.to - into, to: clip.to },
      { ...right, from: clip.from, to: clip.to - into },
    ];
  }
  return [
    { ...left, to: clip.from + into },
    { ...right, from: clip.from + into },
  ];
}

/** Changes each selected clip with `update` (reverse, speed, level, fades…). */
export function updateClips(
  lanes: StudioLane[],
  refs: ClipRef[],
  update: (clip: LaneClip) => Partial<ClipOptions>
): EditResult {
  const next = new Map<string, StudioLane>();
  let selection = refs;
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    const updated = clips.map((clip) => {
      if (!ids.has(clipId(clip))) return clip;
      return cleanClip({ ...clip, ...update(clip) });
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

// --- Slicing, joining, trimming --------------------------------------------------

/** Most slices one Slice can make, so a long take on a 1/16 grid stays workable. */
export const MAX_SLICES = 512;

/**
 * Chops each selected clip at every grid line inside it (timeline
 * multiples of `gridSeconds`) — for chopping a loop or a vocal into beats
 * to rearrange. The pieces end up selected. `count` is how many cuts.
 */
export function sliceClips(lanes: StudioLane[], refs: ClipRef[], gridSeconds: number): EditResult & { count: number } {
  if (!(gridSeconds > 0)) return { lanes, selection: refs, count: 0 };
  const next = new Map<string, StudioLane>();
  const selection: ClipRef[] = [];
  let count = 0;
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    const out: LaneClip[] = [];
    for (const clip of clips) {
      if (!ids.has(clipId(clip))) {
        out.push(clip);
        continue;
      }
      const start = clipStart(lane, clip);
      const end = clipEnd(lane, clip);
      let piece = clip;
      const minTimeline = MIN_CLIP / lane.tempoRatio;
      for (let t = Math.ceil((start + minTimeline) / gridSeconds) * gridSeconds; t < end - minTimeline && count < MAX_SLICES; t += gridSeconds) {
        const [left, right] = cutClip(piece, (t - lane.offsetSeconds) * lane.tempoRatio);
        out.push(left);
        selection.push({ laneId: lane.laneId, clipId: clipId(left) });
        piece = right;
        count++;
      }
      out.push(piece);
      selection.push({ laneId: lane.laneId, clipId: clipId(piece) });
    }
    next.set(lane.laneId, normaliseLane({ ...lane, clips: out }));
  }
  return count ? { lanes: replace(lanes, next), selection, count } : { lanes, selection: refs, count: 0 };
}

/** Whether `b` carries on exactly where `a` stops — in the song and on the timeline. */
function continues(a: LaneClip, b: LaneClip) {
  const close = (x: number, y: number) => Math.abs(x - y) < 0.005;
  if (!!a.reverse !== !!b.reverse || !close(a.stretch ?? 1, b.stretch ?? 1)) return false;
  if (!close(a.gain ?? 1, b.gain ?? 1) || !!a.muted !== !!b.muted) return false;
  if (!close(b.at, a.at + clipSpan(a))) return false;
  return a.reverse ? close(b.to, a.from) : close(b.from, a.to);
}

/**
 * Glues selected clips back together where one carries straight on from
 * the next (e.g. after a split or a slice). `count` is how many joins.
 */
export function joinClips(lanes: StudioLane[], refs: ClipRef[]): EditResult & { count: number } {
  const next = new Map<string, StudioLane>();
  let selection = refs;
  let count = 0;
  for (const { lane, ids } of resolveSelection(lanes, refs)) {
    if (!lane.clips?.length) continue;
    const sorted = [...lane.clips].sort((a, b) => a.at - b.at);
    const out: LaneClip[] = [];
    let joined = 0;
    for (const clip of sorted) {
      const last = out[out.length - 1];
      if (last && ids.has(clipId(last)) && ids.has(clipId(clip)) && continues(last, clip)) {
        out[out.length - 1] = cleanClip({
          ...last,
          ...(last.reverse ? { from: clip.from } : { to: clip.to }),
          fadeOut: clip.fadeOut,
        });
        selection = selection.filter((r) => !(r.laneId === lane.laneId && r.clipId === clipId(clip)));
        joined++;
        continue;
      }
      out.push(clip);
    }
    if (!joined) continue;
    count += joined;
    next.set(lane.laneId, normaliseLane({ ...lane, clips: out }));
  }
  return { lanes: count ? replace(lanes, next) : lanes, selection, count };
}

/**
 * Trims each selected clip that `seconds` falls inside: drops what's
 * before it (`edge` "start") or after it ("end"). `count` is how many.
 */
export function trimClipsAt(lanes: StudioLane[], refs: ClipRef[], seconds: number, edge: "start" | "end"): EditResult & { count: number } {
  const next = new Map<string, StudioLane>();
  let selection = refs;
  let count = 0;
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    const at = (seconds - lane.offsetSeconds) * lane.tempoRatio;
    let changed = false;
    const out = clips.map((clip) => {
      if (!ids.has(clipId(clip)) || !(at > clip.at + MIN_CLIP && at < clip.at + clipSpan(clip) - MIN_CLIP)) return clip;
      const [left, right] = cutClip(clip, at);
      changed = true;
      count++;
      // The kept half takes over the clip's id, so the selection holds.
      return edge === "start" ? { ...right, id: clipId(clip) } : left;
    });
    if (!changed) continue;
    next.set(lane.laneId, normaliseLane({ ...lane, clips: out }));
    if (wanted.has(WHOLE)) {
      selection = [...selection.filter((r) => !(r.laneId === lane.laneId && r.clipId === WHOLE)), ...[...ids].map((clipId) => ({ laneId: lane.laneId, clipId }))];
    }
  }
  return { lanes: count ? replace(lanes, next) : lanes, selection, count };
}

/** Stretch bounds a clip can be fitted with (the same as a saved clip allows). */
export const MIN_STRETCH = 0.25;
export const MAX_STRETCH = 4;

/**
 * Speeds each selected clip up or down (pitch unchanged) so it lasts
 * exactly `seconds` on the timeline — a loop fitted to 1, 2 or 4 bars.
 * Clips that would need more than 4× either way are left. `count` is how many fitted.
 */
export function fitClips(lanes: StudioLane[], refs: ClipRef[], seconds: number): EditResult & { count: number } {
  let count = 0;
  if (!(seconds > 0)) return { lanes, selection: refs, count };
  const next = new Map<string, StudioLane>();
  let selection = refs;
  for (const { lane, ids: wanted } of resolveSelection(lanes, refs)) {
    const clips = concrete(lane);
    const ids = concreteIds(lane, clips, wanted);
    let changed = false;
    const out = clips.map((clip) => {
      if (!ids.has(clipId(clip))) return clip;
      const stretch = (clip.to - clip.from) / (seconds * lane.tempoRatio);
      if (stretch < MIN_STRETCH || stretch > MAX_STRETCH) return clip;
      changed = true;
      count++;
      return cleanClip({ ...clip, stretch });
    });
    if (!changed) continue;
    // Clips after a fitted one keep their places: it can now overlap or leave a gap, as in any DAW.
    next.set(lane.laneId, normaliseLane({ ...lane, clips: out }));
    if (wanted.has(WHOLE)) {
      selection = [...selection.filter((r) => !(r.laneId === lane.laneId && r.clipId === WHOLE)), ...[...ids].map((clipId) => ({ laneId: lane.laneId, clipId }))];
    }
  }
  return { lanes: count ? replace(lanes, next) : lanes, selection, count };
}

// --- Time: ripple delete and insert -------------------------------------------------

const EPS = 0.001;

/** Automation value at `t`, linear between points (held at the ends). */
function valueAt(points: AutoPoint[], t: number) {
  if (!points.length) return 1;
  if (t <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      return b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : b.v;
    }
  }
  return points[points.length - 1].v;
}

/**
 * Automation with `start`..`end` taken out (or, with start === end and a
 * positive `delta`, time put in at `start`): later points move by `delta`,
 * and the line carries on from where it was.
 */
export function shiftAutomation(points: AutoPoint[], start: number, end: number, delta: number): AutoPoint[] {
  if (!points.length || points[points.length - 1].t < start) return points;
  const before = points.filter((p) => p.t < start - EPS);
  const after = points.filter((p) => p.t > end + EPS).map((p) => ({ ...p, t: Math.max(0, p.t + delta) }));
  const join = [{ t: start, v: valueAt(points, start) }];
  if (end > start) join.push({ t: start + EPS, v: valueAt(points, end) });
  else join.push({ t: start + delta, v: valueAt(points, start) });
  return [...before, ...join, ...after].filter((p, i, all) => i === 0 || p.t >= all[i - 1].t);
}

function shiftLaneAutomation(automation: LaneAutomation, start: number, end: number, delta: number): LaneAutomation {
  const out: LaneAutomation = {};
  if (automation.volume?.length) out.volume = shiftAutomation(automation.volume, start, end, delta);
  if (automation.filter?.length) out.filter = shiftAutomation(automation.filter, start, end, delta);
  return out;
}

/** Sections (markers) after a time edit: shifted, squeezed or dropped. */
export function shiftMarkers(markers: Marker[], start: number, end: number, delta: number): Marker[] {
  const move = (t: number) => (t >= end - EPS ? Math.max(0, t + delta) : t > start ? start : t);
  return markers
    .map((m) => ({ ...m, start: move(m.start), end: move(m.end) }))
    .filter((m) => m.end - m.start > 0.05);
}

/** A lane's clips cut at each of `times` (timeline seconds) that falls inside one. */
function cutLaneAt(lane: StudioLane, times: number[]): LaneClip[] {
  let clips = concrete(lane);
  for (const t of times) {
    const at = (t - lane.offsetSeconds) * lane.tempoRatio;
    clips = clips.flatMap((c) => (at > c.at + MIN_CLIP / 2 && at < c.at + clipSpan(c) - MIN_CLIP / 2 ? cutClip(c, at) : [c]));
  }
  return clips;
}

function timeEdit(lanes: StudioLane[], start: number, end: number, delta: number): StudioLane[] {
  const out: StudioLane[] = [];
  for (const lane of lanes) {
    const automation = shiftLaneAutomation(lane.automation, start, end, delta);
    const laneEnd = lane.offsetSeconds + lane.duration;
    if (laneEnd <= start + EPS) {
      out.push({ ...lane, automation });
      continue;
    }
    if (!lane.clips?.length && lane.offsetSeconds >= end - EPS) {
      out.push({ ...lane, automation, offsetSeconds: Math.max(0, lane.offsetSeconds + delta) });
      continue;
    }
    const clips = cutLaneAt(lane, end > start ? [start, end] : [start])
      .filter((c) => end <= start || !(clipStart(lane, c) >= start - EPS && clipEnd(lane, c) <= end + EPS))
      .map((c) => (clipStart(lane, c) >= end - EPS ? { ...c, at: c.at + delta * lane.tempoRatio } : c));
    // A lane with nothing left to play goes (undo brings it back).
    if (!clips.length) continue;
    out.push(normaliseLane({ ...lane, automation, clips }));
  }
  return out;
}

/** Takes `start`..`end` out of the whole song: everything after moves up to close the gap. */
export function removeTime(lanes: StudioLane[], start: number, end: number): StudioLane[] {
  if (!(end - start > MIN_CLIP)) return lanes;
  return timeEdit(lanes, Math.max(0, start), end, -(end - Math.max(0, start)));
}

/** Puts `seconds` of silence into the whole song at `at`: everything after moves later. */
export function insertTime(lanes: StudioLane[], at: number, seconds: number): StudioLane[] {
  if (!(seconds > 0)) return lanes;
  return timeEdit(lanes, Math.max(0, at), Math.max(0, at), seconds);
}

// --- Whole track or clips ------------------------------------------------------------

/**
 * Whether a lane's clips play its stem forwards and in its own order, each
 * part once — so the whole take could stand in for them (the clips just
 * leave out the gaps). The small stretches the AI gives phrases to follow
 * a drifting beat, and phrase edges that overlap a little, still count;
 * a part played twice, backwards or at a really different speed doesn't.
 */
export function playsInOrder(lane: StudioLane): boolean {
  if (!lane.clips?.length) return true;
  const sorted = [...lane.clips].sort((a, b) => a.at - b.at);
  return sorted.every((c, i) => {
    const stretch = c.stretch ?? 1;
    if (c.reverse || stretch < 0.85 || stretch > 1.18) return false;
    if (i === 0) return true;
    const prev = sorted[i - 1];
    // Starts later in the song than the one before, and doesn't go back over most of it.
    return c.from > prev.from + 0.05 && c.from >= prev.to - Math.min(0.75, (prev.to - prev.from) / 2);
  });
}

/**
 * The lane playing its whole stem again, anchored on its first clip: that
 * clip stays exactly where it was and the rest of the take plays around it
 * as originally recorded.
 */
export function asWholeTake(lane: StudioLane): StudioLane {
  if (!lane.clips?.length) return lane;
  const first = lane.clips.reduce((a, b) => (b.at < a.at ? b : a));
  const offsetSeconds = Math.max(0, lane.offsetSeconds + (first.at - first.from) / lane.tempoRatio);
  return withEffectiveDuration({ ...lane, offsetSeconds, clips: null });
}
