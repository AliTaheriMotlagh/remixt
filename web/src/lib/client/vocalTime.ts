import type { Envelope, LyricLine } from "@/lib/lyrics";
import { clipEnd, clipId, clipsOf, clipStart } from "./clipEdit";
import type { LaneClip, StudioLane } from "./studioStore";

// Where a moment of a recording plays in the mix, and back. A lane plays
// its stem through clips — moved, trimmed, stretched, reversed, cut up by
// AI Match — so "the singer says this word 42 s into the vocal" lands at a
// different place on the timeline after every edit. Lyrics are timed on
// the timeline; these turn those times into moments of the vocal and back,
// so the words stay on the singing whatever is done to it. Pure (no store,
// no audio), so it can be tested on its own.

/** How far (stem seconds) past a clip's edge a moment still counts as that clip's: a line stamped just before the singing starts. */
const EDGE = 0.05;
/** How far (timeline seconds) from a vocal clip a line can be and still go with it. */
const MAX_GAP = 1.5;

function speed(lane: StudioLane, clip: LaneClip) {
  const tempo = lane.tempoRatio > 0 ? lane.tempoRatio : 1;
  const stretch = clip.stretch && clip.stretch > 0 ? clip.stretch : 1;
  return { tempo, stretch };
}

/** Where stem second `src` plays on the timeline in `clip` (carried on past the clip's edges at its speed). */
export function timelineOf(lane: StudioLane, clip: LaneClip, src: number): number {
  const { tempo, stretch } = speed(lane, clip);
  const into = clip.reverse ? clip.to - src : src - clip.from;
  return lane.offsetSeconds + (clip.at + into / stretch) / tempo;
}

/** The stem second `clip` plays at timeline second `t` (carried on past its edges). */
export function stemOf(lane: StudioLane, clip: LaneClip, t: number): number {
  const { tempo, stretch } = speed(lane, clip);
  const into = ((t - lane.offsetSeconds) * tempo - clip.at) * stretch;
  return clip.reverse ? clip.to - into : clip.from + into;
}

type Span = { from: number; to: number };
/** The moment is in the clip, or a breath outside it. */
const plays = (clip: Span, src: number) => src >= clip.from - EDGE && src <= clip.to + EDGE;
/** The moment is in the clip. */
const within = (clip: Span, src: number) => src >= clip.from && src <= clip.to;

/** A line's place in a vocal: which lane and clip sing it, and when in the stem. `time` is where it last played on the timeline. */
export type LineAnchor = { laneId: string; stemId: string; clipId: string; src: number; time: number };

/**
 * Every clip of every lane, by "lane|clip", with the stretch of its stem it
 * plays — to tell what an edit made or changed from what was already there.
 */
export function clipKeys(lanes: StudioLane[]): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>();
  for (const lane of lanes) for (const clip of clipsOf(lane)) out.set(`${lane.laneId}|${clipId(clip)}`, { from: clip.from, to: clip.to });
  return out;
}

function isVoice(lane: StudioLane) {
  return lane.kind === "vocals" && lane.originalDuration > 0;
}

/**
 * The vocal moment sung at timeline second `t`: the clip playing there
 * (or the nearest one, a breath away), in the lane `rank` puts first
 * (lower is better — e.g. the song the lyrics are the words of), an
 * audible clip before a muted one. Null when no vocal is near.
 */
export function anchorAt(lanes: StudioLane[], t: number, rank: (lane: StudioLane) => number = () => 0): LineAnchor | null {
  let best: { anchor: LineAnchor; key: number[] } | null = null;
  for (const lane of lanes) {
    if (!isVoice(lane)) continue;
    const r = rank(lane);
    for (const clip of clipsOf(lane)) {
      const start = clipStart(lane, clip);
      const end = clipEnd(lane, clip);
      const gap = t < start ? start - t : t > end ? t - end : 0;
      if (gap > MAX_GAP) continue;
      // Where one clip ends as the next begins, a line is the start of what's coming, not the tail of what's been.
      const ending = gap === 0 && end - t < 1e-3 && end - start > 1e-3 ? 1 : 0;
      // …and where two overlap (a crossfade), of the one that came in last.
      const key = [r, gap > 0 ? 1 : 0, lane.muted || clip.muted ? 1 : 0, ending, gap, gap === 0 ? t - start : 0];
      if (best && !before(key, best.key)) continue;
      best = { key, anchor: { laneId: lane.laneId, stemId: lane.stemId, clipId: clipId(clip), src: stemOf(lane, clip, t), time: t } };
    }
  }
  return best?.anchor ?? null;
}

function before(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** The lane an AI section copy came from ("abc~sec4200" → "abc"). */
const originOf = (laneId: string) => {
  const at = laneId.indexOf("~");
  return at > 0 ? laneId.slice(0, at) : laneId;
};

/**
 * Where an anchored moment plays after an edit. In order:
 *
 *   - its own clip, if that still plays it;
 *   - a clip the edit made, or grew to cover it, that plays it (a split-off
 *     half, AI Match's phrases, a section the AI redid, two halves joined
 *     again by an undo) — the one nearest where it was;
 *   - with its own clip gone or trimmed past it, another clip that was
 *     playing the moment all along (a copy of the chorus elsewhere): the
 *     words go to the singing that's left — but the line stays tied to the
 *     clip it was on, so undoing the edit brings it back;
 *   - nobody singing it any more: carried along with its own clip, when
 *     that was only trimmed past it.
 *
 * A clip counts as playing a moment a breath outside it (a line stamped
 * just before the singing starts) only when no clip has the moment inside
 * it: cut a vocal right before a line and the line belongs to the half
 * that sings it, not the half that ends there. `known` are the clips there
 * were before the edit and what each played (see clipKeys). Null when
 * nothing plays the moment and its clip is gone — the line is left where
 * it is.
 */
export function placeAnchor(lanes: StudioLane[], anchor: LineAnchor, known: Map<string, { from: number; to: number }>): LineAnchor | null {
  const related = lanes.filter(
    (l) => isVoice(l) && (l.laneId === anchor.laneId || originOf(l.laneId) === originOf(anchor.laneId) || l.stemId === anchor.stemId)
  );
  type Place = { lane: StudioLane; clip: LaneClip; inside: boolean; key: number[] };
  let same: { lane: StudioLane; clip: LaneClip } | null = null;
  let own: Place | null = null;
  let made: Place | null = null;
  let copy: Place | null = null;
  const better = (a: Place, b: Place | null) => !b || before(a.key, b.key);
  for (const lane of related) {
    for (const clip of clipsOf(lane)) {
      const id = clipId(clip);
      const mine = lane.laneId === anchor.laneId && id === anchor.clipId;
      if (mine) same = { lane, clip };
      if (!plays(clip, anchor.src)) continue;
      const inside = within(clip, anchor.src);
      const muted = clip.muted || lane.muted ? 1 : 0;
      // Best first: audible, the moment inside it, nearest where the line was.
      const place: Place = { lane, clip, inside, key: [muted, inside ? 0 : 1, Math.abs(timelineOf(lane, clip, anchor.src) - anchor.time)] };
      if (mine) {
        if (!clip.muted) own = place;
        continue;
      }
      const was = known.get(`${lane.laneId}|${id}`);
      if (was && plays(was, anchor.src)) {
        if (!muted && inside && better(place, copy)) copy = place;
      } else if (better(place, made)) made = place;
    }
  }
  // A clip with the moment inside it comes before any that only has it a breath outside.
  if (own?.inside) return at(own.lane, own.clip, anchor.src, anchor);
  if (made?.inside) return at(made.lane, made.clip, anchor.src, anchor);
  if (copy) return { ...anchor, time: timelineOf(copy.lane, copy.clip, anchor.src) };
  if (own) return at(own.lane, own.clip, anchor.src, anchor);
  if (made) return at(made.lane, made.clip, anchor.src, anchor);
  if (same) return at(same.lane, same.clip, anchor.src, anchor);
  return null;
}

function at(lane: StudioLane, clip: LaneClip, src: number, anchor: LineAnchor): LineAnchor {
  return { ...anchor, laneId: lane.laneId, stemId: lane.stemId, clipId: clipId(clip), src, time: timelineOf(lane, clip, src) };
}

/** Copies of a line closer together than this are one singing of it (a doubled voice, a harmony), not two. */
const SAME_SINGING = 0.75;

/** Somewhere a line is sung: when on the timeline, and how fast the vocal plays there (1: as recorded). */
export type Sung = { time: number; speed: number };

/**
 * Everywhere the line at timeline second `time` is sung: there, and
 * wherever else its moment of the vocal can be heard — a chorus pasted in
 * again, a section the AI repeated. The sheet has the line once; someone
 * watching a clip of the second chorus still wants its words. A line with
 * no vocal near it is just where it is.
 */
export function sungAt(lanes: StudioLane[], time: number, rank?: (lane: StudioLane) => number): Sung[] {
  const anchor = anchorAt(lanes, time, rank);
  const speedOf = (lane: StudioLane, clip: LaneClip) => {
    const { tempo, stretch } = speed(lane, clip);
    return tempo * stretch;
  };
  const own = lanes.find((l) => l.laneId === anchor?.laneId);
  const ownClip = own && clipsOf(own).find((c) => clipId(c) === anchor!.clipId);
  const out: Sung[] = [{ time, speed: own && ownClip ? speedOf(own, ownClip) : 1 }];
  if (!anchor) return out;
  const copies: Sung[] = [];
  for (const lane of lanes) {
    if (!isVoice(lane) || lane.muted || lane.stemId !== anchor.stemId) continue;
    for (const clip of clipsOf(lane)) {
      if (clip.muted || anchor.src < clip.from || anchor.src > clip.to) continue;
      if (lane.laneId === anchor.laneId && clipId(clip) === anchor.clipId) continue;
      copies.push({ time: timelineOf(lane, clip, anchor.src), speed: speedOf(lane, clip) });
    }
  }
  for (const copy of copies.sort((a, b) => a.time - b.time)) {
    if (out.every((o) => Math.abs(o.time - copy.time) >= SAME_SINGING)) out.push(copy);
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Everything about the vocal lanes that decides where their singing plays — not their level, effects or waveform. */
export function vocalShape(lanes: StudioLane[]): string {
  return lanes
    .filter(isVoice)
    .map((l) => `${l.laneId}:${l.stemId}:${l.offsetSeconds}:${l.tempoRatio}:${l.muted ? 1 : 0}:${clipsOf(l).map((c) => `${clipId(c)},${c.from},${c.to},${c.at},${c.stretch ?? 1},${c.reverse ? 1 : 0},${c.muted ? 1 : 0}`).join(";")}`)
    .join("|");
}

const round = (x: number) => Math.round(x * 100) / 100;

/**
 * Lines timed to a recording (seconds into its stem), put where `lane`
 * plays them: through its clips, at their speed. A moment played more
 * than once goes to its first audible play; one cut out of the
 * arrangement goes with the clip it's nearest in the recording, when
 * that's a breath away — else it's untimed (it isn't sung in this mix).
 */
export function placeOnStem(lines: LyricLine[], lane: StudioLane): LyricLine[] {
  const clips = clipsOf(lane);
  return lines.map((line) => {
    if (line.time === null) return line;
    const src = line.time;
    let best: { time: number; key: number[] } | null = null;
    for (const clip of clips) {
      const gap = src < clip.from ? clip.from - src : src > clip.to ? src - clip.to : 0;
      if (gap > MAX_GAP) continue;
      const time = timelineOf(lane, clip, src);
      const key = [gap > 0 ? 1 : 0, clip.muted ? 1 : 0, gap, time];
      if (!best || before(key, best.key)) best = { time, key };
    }
    return { ...line, time: best ? round(Math.max(0, best.time)) : null };
  });
}

/**
 * A stem's loudness curve (`values` every `step` stem seconds from its
 * start) laid on the timeline the way `lane` plays it: `rate` points a
 * second, from where its first clip starts to where its last one ends —
 * silent between clips, and where they're muted.
 */
export function layOut(lane: StudioLane, stem: { values: ArrayLike<number>; step: number }, rate = 50): Envelope {
  const clips = clipsOf(lane).filter((c) => !c.muted);
  if (!clips.length || !(stem.step > 0)) return { values: new Float32Array(0), start: lane.offsetSeconds, step: 1 / rate };
  const start = Math.min(...clips.map((c) => clipStart(lane, c)));
  const end = Math.max(...clips.map((c) => clipEnd(lane, c)));
  const values = new Float32Array(Math.max(0, Math.ceil((end - start) * rate)));
  for (const clip of clips) {
    const from = Math.max(0, Math.floor((clipStart(lane, clip) - start) * rate));
    const to = Math.min(values.length, Math.ceil((clipEnd(lane, clip) - start) * rate));
    for (let i = from; i < to; i++) {
      const src = stemOf(lane, clip, start + i / rate);
      const v = stem.values[Math.floor(src / stem.step)];
      if (v !== undefined && v > values[i]) values[i] = v;
    }
  }
  return { values, start, step: 1 / rate };
}

/** The vocal lane singing at timeline second `t` (or a breath from it), the one `rank` puts first, and the stem moment there. */
export function vocalAt(lanes: StudioLane[], t: number, rank?: (lane: StudioLane) => number): { lane: StudioLane; src: number } | null {
  const a = anchorAt(lanes, t, rank);
  const lane = a && lanes.find((l) => l.laneId === a.laneId);
  return lane ? { lane, src: a.src } : null;
}

/**
 * Lines timed to a recording (seconds into its stem), moved along it so
 * the first timed line is sung at timeline second `at` in `lane`, and every
 * other line keeps its place in the recording — so with the vocal sped up,
 * cut up or stretched (AI Match), each line still lands on its words, not
 * just the first. Null when `lane` doesn't sing near `at`.
 */
export function startOnStem(lines: LyricLine[], lanes: StudioLane[], at: number, rank?: (lane: StudioLane) => number): LyricLine[] | null {
  const first = lines.find((l) => l.time !== null)?.time;
  const here = vocalAt(lanes, at, rank);
  if (first === undefined || first === null || !here) return null;
  const shift = here.src - first;
  return placeOnStem(
    lines.map((l) => (l.time === null ? l : { ...l, time: l.time + shift })),
    here.lane
  );
}

/**
 * Lines timed on the timeline, moved together so the first timed one is at
 * `at` — along the vocal they're sung on (each keeps its distance from the
 * first in the recording, so they stay on their words however the vocal is
 * cut or stretched). A line with no vocal under it moves as far as the
 * first one does.
 */
export function slideAlongVocal(lines: LyricLine[], lanes: StudioLane[], at: number, rank?: (lane: StudioLane) => number): LyricLine[] | null {
  const firstIndex = lines.findIndex((l) => l.time !== null);
  if (firstIndex < 0) return null;
  const firstTime = lines[firstIndex].time!;
  const delta = at - firstTime;
  const from = anchorAt(lanes, firstTime, rank);
  const to = vocalAt(lanes, at, rank);
  if (!from || !to || to.lane.laneId !== from.laneId) return null;
  const lane = to.lane;
  const shift = to.src - from.src;
  const prefer = (l: StudioLane) => (l.laneId === lane.laneId ? 0 : 1);
  return lines.map((line) => {
    if (line.time === null) return line;
    const a = anchorAt([lane], line.time, prefer);
    if (!a) return { ...line, time: round(Math.max(0, line.time + delta)) };
    const placed = placeOnStem([{ ...line, time: a.src + shift }], lane)[0];
    return placed.time === null ? { ...line, time: round(Math.max(0, line.time + delta)) } : placed;
  });
}
