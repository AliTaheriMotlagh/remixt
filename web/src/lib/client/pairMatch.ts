"use client";

import { refineTempo, type StemAnalysis } from "./analysis";
import {
  beatStructure,
  hearVocal,
  placeVocal,
  placementNotes,
  rulerBar,
  sectionBars,
  suggestLayout,
  type BeatStructure,
  type HeardVocal,
  type LaneInput,
  type SectionPlacement,
  type SuggestedLayout,
} from "./arrange";
import { analyzeGuide, analyzeLane } from "./autoMatch";
import { bestKeyShift, keyLabel, type MusicalKey } from "./musicKey";
import {
  DEFAULT_FX,
  FX_PRESETS,
  beatLength,
  effectiveKey,
  useStudioStore,
  type LanePatch,
} from "./studioStore";

// Matching one vocal with one beat, the way the lane's Match panel asks
// for it (see matchOptions.ts): preparePair listens to both — tempos,
// keys, the beat's bars, the vocal's sections and which ones repeat — and
// applyPairPlan lays the vocal on the beat as chosen, through the same
// engine as AI Match. Pitch is never changed.

const VOCAL_PRESETS = FX_PRESETS.filter((p) => p.kind === "vocals");
const BEAT_PRESETS = FX_PRESETS.filter((p) => p.kind === "beat");

/** Mean chroma of a stretch of a song, from its analysis. */
function chromaBetween(analysis: StemAnalysis, from: number, to: number) {
  const sum = new Array(12).fill(0);
  const a = Math.max(0, Math.floor(from * analysis.chromaRate));
  const b = Math.min(analysis.chroma.length / 12, Math.ceil(to * analysis.chromaRate));
  for (let f = a; f < b; f++) for (let pc = 0; pc < 12; pc++) sum[pc] += analysis.chroma[f * 12 + pc];
  return sum;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

function meanEnergy(analysis: StemAnalysis, from: number, to: number) {
  const a = Math.max(0, Math.floor(from * analysis.onsetRate));
  const b = Math.min(analysis.energy.length, Math.ceil(to * analysis.onsetRate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += analysis.energy[i];
  return b > a ? sum / (b - a) : 0;
}

/** 0..9 for each value, against the loudest, on a dB-like scale. */
function digits(values: number[]) {
  const max = Math.max(...values);
  return values.map((v) => (v > 0 && max > 0 ? Math.max(0, Math.min(9, Math.round(9 + 3 * Math.log10(v / max)))) : 0));
}

/** Each section's length, loudness, pickup, and which other sections share its notes. */
export function describeSections(vocal: StemAnalysis, heard: HeardVocal) {
  const { sections } = heard;
  const spans = sections.map((s) => ({ from: s.phrases[0].start, to: s.phrases[s.phrases.length - 1].end }));
  // Compare sections on what sets them apart: remove the profile they all
  // share (the key), then see which remain alike.
  const profiles = spans.map((s) => chromaBetween(vocal, s.from, s.to));
  const normalisedProfiles = profiles.map((p) => {
    const total = p.reduce((a, b) => a + b, 0) || 1;
    return p.map((v) => v / total);
  });
  const mean = new Array(12).fill(0);
  for (const p of normalisedProfiles) for (let i = 0; i < 12; i++) mean[i] += p[i] / normalisedProfiles.length;
  const distinct = normalisedProfiles.map((p) => p.map((v, i) => v - mean[i]));
  const loudness = digits(spans.map((s) => meanEnergy(vocal, s.from, s.to)));

  return sections.map((section, i) => {
    const sung = section.phrases.reduce((t, p) => t + (p.end - p.start), 0);
    const span = Math.max(0.1, spans[i].to - spans[i].from);
    const first = section.phrases[0];
    const similarTo = sections
      .map((_, j) => ({ section: j, similarity: Math.round(cosine(distinct[i], distinct[j]) * 100) / 100 }))
      .filter((s) => s.section !== i && s.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
    return {
      section: i,
      lengthBars: sectionBars(section),
      originalBar: section.bar - sections[0].bar,
      phrases: section.phrases.length,
      loudness: loudness[i],
      sungFraction: Math.round((sung / span) * 100) / 100,
      pickupBeats: first.inBeats < 0 ? Math.round(-first.inBeats * 10) / 10 : 0,
      similarTo,
    };
  });
}


/** Reads the vocal's tempo as written, half or double — whichever is nearest `target`. */
function nearestReading(bpm: number, target: number) {
  return [bpm, bpm * 2, bpm / 2].reduce((best, r) =>
    Math.abs(Math.log(target / r)) < Math.abs(Math.log(target / best)) ? r : best
  );
}

const clampRatio = (r: number) => Math.min(2, Math.max(0.5, r));

/** Which song keeps its tempo — or both move halfway. */
export type TempoChoice = "beat" | "vocal" | "middle";

/** Everything known about a vocal/beat pair, ready to describe or arrange. */
export type PairContext = {
  vocalLaneId: string;
  beatLaneId: string;
  vocalAnalysis: StemAnalysis;
  beatAnalysis: StemAnalysis;
  guide: StemAnalysis | null;
  beatBpm: number;
  /** The vocal's tempo as read against the beat (half/double resolved). */
  reading: number;
  tempos: Record<TempoChoice, { projectBpm: number; beatRatio: number; vocalRatio: number }>;
  structure: BeatStructure;
  heard: HeardVocal;
  suggestion: SuggestedLayout;
  vocalKey: MusicalKey;
  beatKey: MusicalKey;
  keys: string;
};

/** Listens to a vocal and a beat — cached per stem, so asking again is quick. */
export async function preparePair(vocalLaneId: string, beatLaneId: string): Promise<PairContext> {
  const lanes = useStudioStore.getState().lanes;
  const vocalLane = lanes.find((l) => l.laneId === vocalLaneId);
  const beatLane = lanes.find((l) => l.laneId === beatLaneId);
  if (!vocalLane || !beatLane) throw new Error("One of those lanes doesn't exist.");
  if (vocalLane.kind !== "vocals" || beatLane.kind !== "beat") throw new Error("Give one vocal lane and one beat lane.");

  const [vocalAnalysis, beatAnalysis, guide] = await Promise.all([
    analyzeLane(vocalLane),
    analyzeLane(beatLane),
    analyzeGuide(vocalLane),
  ]);
  if (!vocalAnalysis || !beatAnalysis) throw new Error("Couldn't load the audio of those lanes.");

  // Tempos, sharpened against the songs' real hits.
  const beatSource = beatLane.bpm ?? beatAnalysis.bpmEstimate;
  const vocalSource = vocalLane.bpm ?? guide?.bpmEstimate ?? vocalAnalysis.bpmEstimate;
  if (!beatSource || !vocalSource) throw new Error("Couldn't find a tempo for both lanes — set their BPM by hand.");
  const beatBpm = refineTempo(beatAnalysis, beatSource);
  const vocalBpm = guide ? refineTempo(guide, vocalSource) : vocalSource;
  const beatTempo = beatBpm * beatLane.tempoRatio;
  const reading = nearestReading(vocalBpm, beatTempo);
  const tempos = {
    beat: { projectBpm: beatTempo, beatRatio: beatLane.tempoRatio, vocalRatio: clampRatio(beatTempo / reading) },
    vocal: { projectBpm: reading, beatRatio: clampRatio(reading / beatBpm), vocalRatio: 1 },
    // Halfway on a log scale, so each is stretched by the same amount.
    middle: (() => {
      const target = Math.sqrt(beatTempo * reading);
      return { projectBpm: target, beatRatio: clampRatio(target / beatBpm), vocalRatio: clampRatio(target / reading) };
    })(),
  };

  const structure = beatStructure(beatAnalysis, beatBpm);
  const heard = hearVocal(vocalAnalysis, reading, guide ?? undefined);
  if (!structure) throw new Error(`Couldn't find the bars of “${beatLane.trackTitle}”.`);
  if (!heard) throw new Error(`Couldn't hear clear phrases in “${vocalLane.trackTitle}”.`);

  const vocalKey = effectiveKey(vocalLane) ?? vocalAnalysis.key;
  const beatKey = effectiveKey(beatLane) ?? beatAnalysis.key;
  const keyMatch = bestKeyShift(vocalKey, beatKey);
  const keys =
    keyMatch.semitones === 0
      ? `compatible (${keyMatch.relation === "neighbour" ? "neighbours on the Camelot wheel" : "same notes"})`
      : `they clash — the vocal would need ${keyMatch.semitones > 0 ? "+" : ""}${keyMatch.semitones} semitones to fit, which the user can do by hand`;

  return {
    vocalLaneId,
    beatLaneId,
    vocalAnalysis,
    beatAnalysis,
    guide,
    beatBpm,
    reading,
    tempos,
    structure,
    heard,
    suggestion: suggestLayout(heard, structure),
    vocalKey,
    beatKey,
    keys,
  };
}

export type PairPlan = {
  follow: TempoChoice;
  sections: SectionPlacement[];
  shift_beats?: number;
  vocal_gain_db?: number;
  vocal_preset?: string;
  beat_preset?: string;
};

/**
 * Carries out an arrangement: tempo, sections on bars, level and effects.
 * The plan is checked first — sections must exist, can't overlap and must
 * fit the beat. Returns what changed.
 */
export function applyPairPlan(ctx: PairContext, plan: PairPlan): string[] {
  const lanes = useStudioStore.getState().lanes;
  const vocalLane = lanes.find((l) => l.laneId === ctx.vocalLaneId);
  const beatLane = lanes.find((l) => l.laneId === ctx.beatLaneId);
  if (!vocalLane || !beatLane) throw new Error("One of those lanes is gone.");
  const { structure, heard } = ctx;
  const lines: string[] = [];
  const tempo = ctx.tempos[plan.follow];
  const beatInput: LaneInput = {
    analysis: ctx.beatAnalysis,
    bpm: ctx.beatBpm,
    tempoRatio: tempo.beatRatio,
    offsetSeconds: beatLane.offsetSeconds,
    title: beatLane.trackTitle,
    duration: beatLane.originalDuration,
  };
  const vocalInput: LaneInput = {
    analysis: ctx.vocalAnalysis,
    bpm: ctx.reading,
    tempoRatio: tempo.vocalRatio,
    offsetSeconds: vocalLane.offsetSeconds,
    title: vocalLane.trackTitle,
    duration: vocalLane.originalDuration,
    guide: ctx.guide ?? undefined,
  };

  // Overlap is judged on the singing itself — a pickup or a last word
  // spilling into the neighbour's bar is how songs flow, not a clash.
  const placements: SectionPlacement[] = [];
  let singingUntil = -Infinity;
  const asked = plan.sections.map((p) => ({ section: Math.round(p.section), bar: Math.round(p.bar) }));
  for (const { section, bar } of asked.sort((a, b) => a.bar - b.bar)) {
    const found = heard.sections[section];
    if (!found) {
      lines.push(`There's no section ${section}; skipped it`);
      continue;
    }
    const lead = found.start - found.bar; // negative for a pickup
    const earliest = Math.ceil(singingUntil - 0.1 - lead);
    const start = Math.max(bar, earliest, 0);
    if (start >= structure.endBar) {
      lines.push(`Section ${section} would start past the end of the beat's music (bar ${structure.endBar}), so it was left out`);
      continue;
    }
    if (start !== bar) lines.push(`Section ${section} moved from bar ${bar} to ${start} so it doesn't overlap the one before`);
    placements.push({ section, bar: start });
    singingUntil = start + (found.end - found.bar);
  }
  if (singingUntil > structure.endBar + 0.5) {
    lines.push(`Warning: the last section runs ${(singingUntil - structure.endBar).toFixed(1)} bars past the end of the beat's music`);
  }
  if (placements.length === 0) throw new Error("None of those sections could be placed — check the section numbers and bars.");

  const shiftBeats = Math.max(-3, Math.min(3, Math.round(plan.shift_beats ?? 0)));
  const placement = placeVocal(vocalInput, beatInput, structure, heard, placements, shiftBeats);
  if (!placement) throw new Error("Couldn't place the vocal's phrases.");

  // Level: loudness-matched to the beat, the vocal a touch on top, then
  // the requested adjustment.
  const gain = Math.max(-6, Math.min(6, plan.vocal_gain_db ?? 0));
  const loudnessRatio = ctx.vocalAnalysis.loudness > 0 ? ctx.beatAnalysis.loudness / ctx.vocalAnalysis.loudness : 1;
  const volume =
    Math.round(Math.min(1.5, Math.max(0.2, beatLane.volume * 1.12 * loudnessRatio * 10 ** (gain / 20))) * 100) / 100;

  const vocalPreset = VOCAL_PRESETS.find((p) => p.id === plan.vocal_preset);
  const beatPreset = BEAT_PRESETS.find((p) => p.id === plan.beat_preset);
  const patches: Record<string, LanePatch> = {
    [vocalLane.laneId]: {
      bpm: ctx.reading,
      tempoRatio: tempo.vocalRatio,
      offsetSeconds: placement.offsetSeconds,
      clips: placement.clips,
      volume,
      ...(vocalPreset ? { fx: { ...DEFAULT_FX, ...vocalPreset.fx } } : {}),
    },
    [beatLane.laneId]: {
      bpm: ctx.beatBpm,
      tempoRatio: tempo.beatRatio,
      ...(beatPreset ? { fx: { ...DEFAULT_FX, ...beatPreset.fx } } : {}),
    },
  };
  useStudioStore.getState().applyLanePatches(patches, Math.round(tempo.projectBpm * 100) / 100);

  const bar = beatLength(tempo.projectBpm) * 4;
  lines.unshift(
    plan.follow === "beat"
      ? `Tempo: the beat stays at ${tempo.projectBpm.toFixed(1)} BPM; the vocal plays at ${tempo.vocalRatio.toFixed(3)}× speed (pitch unchanged)`
      : plan.follow === "vocal"
        ? `Tempo: the vocal stays at ${tempo.projectBpm.toFixed(1)} BPM; the beat plays at ${tempo.beatRatio.toFixed(3)}× speed (pitch unchanged)`
        : `Tempo: both meet at ${tempo.projectBpm.toFixed(1)} BPM — vocal ${tempo.vocalRatio.toFixed(3)}×, beat ${tempo.beatRatio.toFixed(3)}× (pitch unchanged)`,
    `Placed: ${placements
      .map((p) => `section ${p.section} on ruler bar ${rulerBar(beatInput, structure, p.bar, bar)}`)
      .join(", ")} — ${placement.clips.length} clips`
  );
  if (shiftBeats !== 0) lines.push(`Vocal moved ${shiftBeats > 0 ? "+" : ""}${shiftBeats} beats against the bar lines`);
  lines.push(`Vocal level ${Math.round(volume * 100)}%`);
  if (vocalPreset) lines.push(`Vocal effects: ${vocalPreset.label}`);
  if (beatPreset) lines.push(`Beat effects: ${beatPreset.label}`);
  lines.push(`Keys: ${keyLabel(ctx.vocalKey)} on ${keyLabel(ctx.beatKey)} — ${ctx.keys}`);
  lines.push(...placementNotes(vocalInput, beatInput, structure, heard, placement));
  return lines;
}

