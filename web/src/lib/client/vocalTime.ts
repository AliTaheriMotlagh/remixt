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

const plays = (clip: LaneClip, src: number) => src >= clip.from - EDGE && src <= clip.to + EDGE;

/** A line's place in a vocal: which lane and clip sing it, and when in the stem. `time` is where it last played on the timeline. */
export type LineAnchor = { laneId: string; stemId: string; clipId: string; src: number; time: number };

/** "lane|clip" for every clip of every lane — to tell clips an edit made from ones that were there. */
export function clipKeys(lanes: StudioLane[]): Set<string> {
  const out = new Set<string>();
  for (const lane of lanes) for (const clip of clipsOf(lane)) out.add(`${lane.laneId}|${clipId(clip)}`);
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
      const key = [r, gap > 0 ? 1 : 0, lane.muted || clip.muted ? 1 : 0, gap];
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
 * Where an anchored moment plays after an edit — the same clip if it
 * still plays it; else a clip the edit made that plays it (a split-off
 * half, AI Match's phrases, a section the AI redid), the one nearest where
 * it was; else carried with its clip (trimmed past it). `known` are the
 * clips there were before the edit (see clipKeys), so deleting a clip
 * doesn't send its words to an older copy elsewhere. Null when the clip
 * and its lane are gone — the line is left where it is.
 */
export function placeAnchor(lanes: StudioLane[], anchor: LineAnchor, known: Set<string>): LineAnchor | null {
  const related = lanes.filter(
    (l) => isVoice(l) && (l.laneId === anchor.laneId || originOf(l.laneId) === originOf(anchor.laneId) || l.stemId === anchor.stemId)
  );
  let same: { lane: StudioLane; clip: LaneClip } | null = null;
  let made: { lane: StudioLane; clip: LaneClip; time: number; muted: boolean } | null = null;
  for (const lane of related) {
    for (const clip of clipsOf(lane)) {
      const id = clipId(clip);
      if (lane.laneId === anchor.laneId && id === anchor.clipId) {
        same = { lane, clip };
        if (plays(clip, anchor.src) && !clip.muted) return at(lane, clip, anchor.src, anchor);
        continue;
      }
      if (known.has(`${lane.laneId}|${id}`) || !plays(clip, anchor.src)) continue;
      const time = timelineOf(lane, clip, anchor.src);
      const muted = !!(clip.muted || lane.muted);
      if (!made || (made.muted && !muted) || (made.muted === muted && Math.abs(time - anchor.time) < Math.abs(made.time - anchor.time))) {
        made = { lane, clip, time, muted };
      }
    }
  }
  if (made) return at(made.lane, made.clip, anchor.src, anchor);
  if (same) return at(same.lane, same.clip, anchor.src, anchor);
  return null;
}

function at(lane: StudioLane, clip: LaneClip, src: number, anchor: LineAnchor): LineAnchor {
  return { ...anchor, laneId: lane.laneId, stemId: lane.stemId, clipId: clipId(clip), src, time: timelineOf(lane, clip, src) };
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
