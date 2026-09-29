"use client";

import { sectionBars } from "./arrange";
import { describeSections, type PairContext, type PairPlan, type TempoChoice } from "./pairMatch";

// The lane's Match panel: a handful of plain choices — tempo, when the
// vocal comes in, the song's shape, a timing fix, level and sound — turned
// into an arrangement of the vocal's sections on the beat's bars. It's all
// the studio's own analysis: no account, no key, same answer every time.

export type Structure = "as-sung" | "tight" | "chorus-first" | "fill" | "short" | "hook";
export type Entry = "auto" | 0 | 4 | 8 | 16;

export type MatchOptions = {
  tempo: TempoChoice;
  entry: Entry;
  structure: Structure;
  /** Moves the whole vocal against the bar lines, in beats. */
  shiftBeats: -2 | -1 | 0 | 1 | 2;
  vocalGainDb: -3 | 0 | 3;
  vocalPreset: string;
  beatPreset: string;
};

export const DEFAULT_OPTIONS: MatchOptions = {
  tempo: "beat",
  entry: "auto",
  structure: "as-sung",
  shiftBeats: 0,
  vocalGainDb: 0,
  vocalPreset: "vocal-air",
  beatPreset: "none",
};

export const STRUCTURES: { id: Structure; label: string; hint: string }[] = [
  { id: "as-sung", label: "As sung", hint: "The vocal in its original order and spacing" },
  { id: "tight", label: "No long breaks", hint: "Original order, instrumental gaps cut short" },
  { id: "chorus-first", label: "Chorus first", hint: "Open with the chorus, then the song as sung" },
  { id: "fill", label: "Fill the beat", hint: "As sung, then the chorus again until the beat ends" },
  { id: "short", label: "Short version", hint: "One verse and the chorus twice" },
  { id: "hook", label: "Chorus only", hint: "Loop the chorus with breaks in between" },
];

/**
 * The section most likely to be the chorus: the one whose notes come back
 * most often (similar sections), loudness breaking ties. With nothing
 * repeating, simply the loudest.
 */
export function findChorus(ctx: PairContext): { first: number; all: number[]; confident: boolean } {
  const facts = describeSections(ctx.vocalAnalysis, ctx.heard);
  let best = 0;
  let bestScore = -Infinity;
  for (const f of facts) {
    const repeats = f.similarTo.filter((s) => s.similarity >= 0.6);
    const score = repeats.reduce((sum, s) => sum + s.similarity, 0) + f.loudness * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = f.section;
    }
  }
  const all = [best, ...facts[best].similarTo.filter((s) => s.similarity >= 0.6).map((s) => s.section)].sort(
    (a, b) => a - b
  );
  return { first: all[0], all, confident: all.length > 1 };
}

/**
 * Lays `order` (section indices, repeats allowed) on the beat's bars from
 * `entry`. Sections that follow each other in the original song keep
 * their original spacing (unless the gap between them is longer than
 * `keepGapsUpTo` bars); anything else starts on the next 4-bar line after
 * the last one ends, plus `breakBars` when a section repeats straight
 * after itself. Stops at the first section that doesn't fit the beat.
 */
function sequence(ctx: PairContext, order: number[], entry: number, keepGapsUpTo: number, breakBars = 0) {
  const { sections } = ctx.heard;
  const endBar = ctx.structure.endBar;
  const placements: { section: number; bar: number }[] = [];
  let left = 0;
  for (let i = 0; i < order.length; i++) {
    const index = order[i];
    const section = sections[index];
    if (!section) continue;
    let bar = entry;
    const previous = placements[placements.length - 1];
    if (previous) {
      const before = sections[previous.section];
      const lead = section.start - section.bar; // negative for a pickup
      const earliest = Math.ceil(previous.bar + (before.end - before.bar) - lead - 0.1);
      const nextInSong = index === previous.section + 1 && section.start - before.end <= keepGapsUpTo;
      if (nextInSong) {
        bar = Math.max(earliest, previous.bar + (section.bar - before.bar));
      } else {
        const gap = index === previous.section ? breakBars : 0;
        bar = entry + Math.ceil((earliest + gap - entry) / 4) * 4;
      }
    }
    if (bar + (section.end - section.bar) > endBar + 0.25) {
      left = order.length - i;
      break;
    }
    placements.push({ section: index, bar });
  }
  return { placements, left };
}

export type MatchPlan = { plan: PairPlan; notes: string[] };

/** Turns the panel's choices into a plan for applyPairPlan. */
export function planFromOptions(ctx: PairContext, options: MatchOptions): MatchPlan {
  const { sections } = ctx.heard;
  const all = sections.map((_, i) => i);
  const notes: string[] = [];
  const auto = ctx.suggestion.entry;
  const entry = options.entry === "auto" ? auto : Math.min(options.entry, Math.max(0, ctx.structure.endBar - 4));
  const chorus = findChorus(ctx);
  const chorusNote = () =>
    notes.push(
      chorus.confident
        ? `Chorus: section ${chorus.first} (it comes back ${chorus.all.length - 1} time${chorus.all.length === 2 ? "" : "s"})`
        : `No section repeats clearly, so the loudest one (section ${chorus.first}) is used as the chorus`
    );

  let order: number[];
  let keepGaps = 8;
  let breakBars = 0;
  switch (options.structure) {
    case "as-sung":
      order = all;
      break;
    case "tight":
      order = all;
      keepGaps = 2;
      break;
    case "chorus-first":
      chorusNote();
      order = [chorus.first, ...all];
      break;
    case "fill":
      chorusNote();
      order = [...all, ...Array(8).fill(chorus.first)];
      breakBars = 4;
      break;
    case "short": {
      chorusNote();
      const verse = chorus.first > 0 ? [chorus.first - 1] : [];
      order = [...verse, chorus.first, chorus.first];
      breakBars = 4;
      break;
    }
    case "hook":
      chorusNote();
      order = Array(16).fill(chorus.first);
      breakBars = 8;
      break;
  }

  // "As sung" from the automatic entry is exactly what AI Match picks,
  // including its fallbacks for a vocal longer than the beat.
  let placements;
  let left: number;
  if (options.structure === "as-sung" && options.entry === "auto") {
    placements = ctx.suggestion.placements;
    left = ctx.suggestion.dropped.length;
  } else {
    ({ placements, left } = sequence(ctx, order, entry, keepGaps, breakBars));
  }
  const repeating = options.structure === "fill" || options.structure === "hook";
  if (left > 0 && !repeating) {
    notes.push(`${left} section${left === 1 ? "" : "s"} didn't fit before the beat ends and ${left === 1 ? "was" : "were"} left out`);
  }
  if (placements.length === 0) {
    // Even the first section is longer than the beat: place it anyway.
    placements = [{ section: order[0] ?? 0, bar: 0 }];
    notes.push("The vocal is longer than the beat, so it runs past the end");
  }
  const bars = placements.reduce((max, p) => Math.max(max, p.bar + sectionBars(sections[p.section])), 0);
  notes.push(`${placements.length} section${placements.length === 1 ? "" : "s"}, about ${bars} bars of the beat's ${ctx.structure.endBar}`);

  return {
    plan: {
      follow: options.tempo,
      sections: placements,
      shift_beats: options.shiftBeats,
      vocal_gain_db: options.vocalGainDb,
      vocal_preset: options.vocalPreset === "none" ? undefined : options.vocalPreset,
      beat_preset: options.beatPreset === "none" ? undefined : options.beatPreset,
    },
    notes,
  };
}
