// What a social clip covers and the words shown on it. Pure (no DOM, no
// store), so the clip dialog, the video renderer and the tests share it.

import { countSyllables, isSung, sectionsOf, type LyricLine } from "./lyrics";

/** The longest clip: what Reels, Shorts and Stories take in one go. */
export const MAX_CLIP_SECONDS = 60;
/** The shortest clip worth posting. */
export const MIN_CLIP_SECONDS = 5;

/** A line shown on the clip, in seconds from the clip's start. */
export type ClipLine = {
  start: number;
  /** When it leaves the screen: the next line's start, or a few seconds after it's sung. */
  end: number;
  /** How long it fills in with colour (karaoke) — about how long it takes to sing. */
  wipe: number;
  text: string;
};

/** A part of the song to make a clip of. */
export type ClipPart = {
  id: string;
  label: string;
  start: number;
  end: number;
  kind: "loop" | "section" | "playhead" | "song" | "custom";
};

/** Roughly how long a line takes to sing, in seconds. */
function singLength(text: string) {
  return Math.max(1.2, countSyllables(text) * 0.24);
}

/** The timed, sung lines in order. */
function timedLines(lines: LyricLine[]) {
  return lines
    .filter((l): l is { time: number; text: string } => l.time !== null && isSung(l))
    .sort((a, b) => a.time - b.time);
}

/**
 * The lines sung between `start` and `end` on the timeline, timed from the
 * clip's start. A line stays up until the next one comes in (a long gap
 * clears it a few seconds after it's sung); one that began just before the
 * clip is shown from its first frame.
 */
export function clipLyrics(lines: LyricLine[], start: number, end: number): ClipLine[] {
  const timed = timedLines(lines);
  const out: ClipLine[] = [];
  for (let i = 0; i < timed.length; i++) {
    const at = timed[i].time;
    const next = timed[i + 1]?.time ?? Infinity;
    const sing = Math.min(singLength(timed[i].text), Math.max(0.3, next - at));
    const until = Math.min(next, at + sing + 3);
    if (until <= start || at >= end) continue;
    // The tail of a line before the part, on screen for a blink at its start: left out.
    if (at < start && until - start < 1) continue;
    // A line under way when the clip starts keeps its real (negative) start, so it shows part filled.
    out.push({ start: round(at - start), end: round(Math.min(end, until) - start), wipe: sing, text: timed[i].text });
  }
  return out;
}

/** A line shows this much before it's sung, so it can be read in time. */
const LEAD = 0.2;

/** The line on screen at `t` seconds into the clip, and the one after it. */
export function clipLineAt(lines: ClipLine[], t: number): { current: ClipLine | null; next: ClipLine | null } {
  let current: ClipLine | null = null;
  let next: ClipLine | null = null;
  for (const line of lines) {
    if (line.start <= t + LEAD && t < line.end) current = line;
    else if (line.start > t + LEAD) {
      next = line;
      break;
    }
  }
  return { current, next };
}

/** A start and end kept inside the song and between the shortest and longest clip. */
export function clampRange(start: number, end: number, duration: number): { start: number; end: number } {
  const total = Math.max(0, duration);
  const length = Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, end - start));
  const s = Math.max(0, Math.min(start, total - Math.min(total, length)));
  return { start: round(s), end: round(Math.min(total, s + length)) };
}

const round = (x: number) => Math.round(x * 100) / 100;

/**
 * The parts of the song a clip can be made of, best first: the loop, the
 * song's sections from the timed lyrics (a little before each so the
 * first word isn't clipped), stretches from the playhead, and the whole
 * song when it's short enough.
 */
export function clipParts({
  lines,
  loop,
  playhead,
  duration,
}: {
  lines: LyricLine[];
  loop: { enabled: boolean; start: number; end: number };
  playhead: number;
  duration: number;
}): ClipPart[] {
  if (duration <= 0) return [];
  const parts: ClipPart[] = [];
  if (loop.enabled && loop.end - loop.start >= 1) {
    parts.push({ id: "loop", label: "The loop", kind: "loop", ...clampRange(loop.start, loop.end, duration) });
  }
  const seen = new Map<string, number>();
  for (const section of sectionsOf(lines)) {
    if (section.start === null) continue;
    const from = Math.max(0, section.start - 0.5);
    const to = section.end ?? Math.min(duration, section.start + 30);
    const count = (seen.get(section.name) ?? 0) + 1;
    seen.set(section.name, count);
    parts.push({
      id: `section-${section.index}`,
      label: count > 1 ? `${section.name} (${count})` : section.name,
      kind: "section",
      ...clampRange(from, to, duration),
    });
  }
  const from = playhead >= duration - MIN_CLIP_SECONDS ? 0 : playhead;
  for (const seconds of [15, 30, 60]) {
    if (from + Math.min(seconds, MIN_CLIP_SECONDS) > duration) continue;
    parts.push({ id: `playhead-${seconds}`, label: `${seconds} s from ${from > 0 ? "here" : "the start"}`, kind: "playhead", ...clampRange(from, from + seconds, duration) });
  }
  if (duration <= MAX_CLIP_SECONDS) parts.push({ id: "song", label: "The whole song", kind: "song", start: 0, end: round(duration) });
  return parts;
}

/** The part to start on: the loop, else the section under the playhead, else 30 s from it. */
export function defaultPart(parts: ClipPart[], playhead: number): ClipPart | null {
  return (
    parts.find((p) => p.kind === "loop") ??
    parts.find((p) => p.kind === "section" && playhead >= p.start && playhead < p.end) ??
    parts.find((p) => p.id === "playhead-30") ??
    parts[0] ??
    null
  );
}

/**
 * From one sung line to another (indexes into `lines`): half a second
 * before the first, until the line after the last comes in (or it's had
 * time to be sung).
 */
export function lineRange(lines: LyricLine[], from: number, to: number, duration: number): { start: number; end: number } | null {
  const a = lines[Math.min(from, to)];
  const b = lines[Math.max(from, to)];
  if (a?.time == null || b?.time == null) return null;
  const after = timedLines(lines).find((l) => l.time > b.time!);
  const end = after ? after.time : b.time + singLength(b.text) + 1;
  return clampRange(a.time - 0.5, end, duration);
}
