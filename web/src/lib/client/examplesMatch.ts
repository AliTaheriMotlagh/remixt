// What matching a vocal to a beat means, worked out for two demo songs with
// the same helpers the Studio uses (musicKey.ts): the tempo ratio, who keeps
// their tempo, and the key shift. Pure, so the Examples lab and the tests
// share it.

import { bestKeyShift, camelotCode, keyFit, keyLabel, transposeKey, type KeyFit, type MusicalKey } from "./musicKey";
import type { DemoSongMeta } from "./demoSongDefs";

export type TempoMode = "beat" | "vocal" | "middle";
export type PairSettings = {
  vocalId: string;
  beatId: string;
  /** Which song keeps its tempo. */
  mode: TempoMode;
  /** Semitones to pitch the vocal by, or "auto" to let bestKeyShift choose. */
  semitones: number | "auto";
};

export const TEMPO_MODE_LABELS: Record<TempoMode, { label: string; hint: string }> = {
  beat: { label: "Beat keeps tempo", hint: "The vocal is stretched to the beat. Usually the safest: the beat is the foundation." },
  vocal: { label: "Vocal keeps tempo", hint: "The beat is stretched to the vocal. Good when the vocal is the star." },
  middle: { label: "Meet in the middle", hint: "Both move halfway, so neither is stretched as far." },
};

/** Reads a tempo as written, half or double — whichever is nearest `target`. */
export function nearestReading(bpm: number, target: number) {
  return [bpm, bpm * 2, bpm / 2].reduce((best, r) =>
    Math.abs(Math.log(target / r)) < Math.abs(Math.log(target / best)) ? r : best
  );
}

export type Level = "perfect" | "good" | "warn" | "bad";

export type PairAnalysis = {
  vocalBpm: number;
  beatBpm: number;
  /** The vocal's tempo read as written, double or half — nearest to the beat. */
  reading: number;
  readingNote: "as written" | "double-time" | "half-time";
  /** Tempo both end up at. */
  targetBpm: number;
  /** Audio tempo ratio to apply to each. */
  vocalRatio: number;
  beatRatio: number;
  /** How many target bars one source bar of each takes (0.5, 1 or 2). */
  vocalFactor: number;
  beatFactor: number;
  /** Largest stretch either side gets, in percent. */
  stretchPct: number;
  rawGapBpm: number;
  rawGapPct: number;
  tempoVerdict: { level: Level; title: string; detail: string };
  semitones: number;
  autoRelation: "same" | "relative" | "neighbour" | null;
  rawKeyFit: KeyFit;
  shiftedKey: MusicalKey;
  shiftedFit: KeyFit;
  vocalCamelot: string;
  beatCamelot: string;
  shiftedCamelot: string;
  keyVerdict: { level: Level; title: string; detail: string };
  overall: { level: Level; title: string };
  /** Target bars in the loop, and source bars each side supplies. */
  loopBars: number;
  vocalSourceBars: number;
  beatSourceBars: number;
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function analyzePair(vocal: DemoSongMeta, beat: DemoSongMeta, settings: PairSettings): PairAnalysis {
  const reading = nearestReading(vocal.bpm, beat.bpm);
  const readingNote = reading === vocal.bpm ? "as written" : reading > vocal.bpm ? "double-time" : "half-time";
  const targetBpm =
    settings.mode === "beat" ? beat.bpm : settings.mode === "vocal" ? reading : Math.sqrt(reading * beat.bpm);

  const vocalReading = nearestReading(vocal.bpm, targetBpm);
  const beatReading = nearestReading(beat.bpm, targetBpm);
  const vocalRatio = targetBpm / vocalReading;
  const beatRatio = targetBpm / beatReading;
  const vocalFactor = vocalReading / vocal.bpm;
  const beatFactor = beatReading / beat.bpm;
  const stretchPct = Math.max(Math.abs(vocalRatio - 1), Math.abs(beatRatio - 1)) * 100;
  const rawGapBpm = reading - beat.bpm;
  const rawGapPct = (Math.abs(rawGapBpm) / beat.bpm) * 100;

  let loopBars = 8;
  while (loopBars > 2 && (loopBars / vocalFactor > 8 || loopBars / beatFactor > 8)) loopBars /= 2;

  const tempoVerdict = judgeTempo(stretchPct, readingNote, settings.mode, vocal, beat, targetBpm);

  const auto = bestKeyShift(vocal.key, beat.key);
  const semitones = settings.semitones === "auto" ? auto.semitones : settings.semitones;
  const shiftedKey = transposeKey(vocal.key, semitones);
  const rawKeyFit = keyFit(vocal.key, beat.key);
  const shiftedFit = keyFit(shiftedKey, beat.key);
  const shiftedCamelot = camelotCode(shiftedKey);
  const keyVerdict = judgeKey({
    vocal,
    beat,
    semitones,
    rawKeyFit,
    shiftedFit,
    shiftedCamelot,
    autoRelation: settings.semitones === "auto" ? auto.relation : null,
  });

  const rank: Record<Level, number> = { perfect: 0, good: 1, warn: 2, bad: 3 };
  const worst = [tempoVerdict.level, keyVerdict.level].reduce((a, b) => (rank[b] > rank[a] ? b : a));
  const overall = {
    level: worst,
    title:
      worst === "perfect"
        ? "A near-perfect match"
        : worst === "good"
          ? "Works well"
          : worst === "warn"
            ? "Usable, with caveats"
            : "This pair fights each other",
  };

  return {
    vocalBpm: vocal.bpm,
    beatBpm: beat.bpm,
    reading,
    readingNote,
    targetBpm,
    vocalRatio,
    beatRatio,
    vocalFactor,
    beatFactor,
    stretchPct,
    rawGapBpm,
    rawGapPct,
    tempoVerdict,
    semitones,
    autoRelation: settings.semitones === "auto" ? auto.relation : null,
    rawKeyFit,
    shiftedKey,
    shiftedFit,
    vocalCamelot: vocal.camelot,
    beatCamelot: beat.camelot,
    shiftedCamelot,
    keyVerdict,
    overall,
    loopBars,
    vocalSourceBars: loopBars / vocalFactor,
    beatSourceBars: loopBars / beatFactor,
  };
}

function judgeTempo(
  stretchPct: number,
  readingNote: PairAnalysis["readingNote"],
  mode: TempoMode,
  vocal: DemoSongMeta,
  beat: DemoSongMeta,
  target: number
): PairAnalysis["tempoVerdict"] {
  const where = `${Math.round(target * 10) / 10} BPM`;
  const half =
    readingNote === "as written"
      ? ""
      : ` The vocal's ${vocal.bpm} BPM is read as ${readingNote === "double-time" ? "double" : "half"} time, so it rides the beat as a ${readingNote === "double-time" ? "slow, spacious" : "busy, double-speed"} line.`;
  if (stretchPct < 0.5)
    return { level: "perfect", title: `Perfect: both already at ${where}`, detail: `No stretching needed.${half}` };
  if (stretchPct <= 4)
    return { level: "perfect", title: `Perfect: only ${stretchPct.toFixed(1)}% stretch`, detail: `Inaudible tempo change to reach ${where}.${half}` };
  if (stretchPct <= 10)
    return { level: "good", title: `Good: ${stretchPct.toFixed(0)}% stretch`, detail: `A small tempo change to ${where}; barely noticeable.${half}` };
  if (stretchPct <= 18)
    return {
      level: "warn",
      title: `Noticeable: ${stretchPct.toFixed(0)}% stretch`,
      detail: `Stretching this far starts to change the feel and add artifacts.${mode === "middle" ? "" : " Meeting in the middle would spread it over both."}${half}`,
    };
  return {
    level: "bad",
    title: `Too far: ${stretchPct.toFixed(0)}% stretch`,
    detail: `${vocal.title} and ${beat.title} are too far apart in tempo. Expect warbly audio; pick a closer beat or try another tempo option.${half}`,
  };
}

function judgeKey(o: {
  vocal: DemoSongMeta;
  beat: DemoSongMeta;
  semitones: number;
  rawKeyFit: KeyFit;
  shiftedFit: KeyFit;
  shiftedCamelot: string;
  autoRelation: "same" | "relative" | "neighbour" | null;
}): PairAnalysis["keyVerdict"] {
  const { vocal, beat, semitones, rawKeyFit, shiftedFit, shiftedCamelot } = o;
  const names = `${keyLabel(vocal.key)} (${vocal.camelot}) against ${keyLabel(beat.key)} (${beat.camelot})`;
  if (semitones === 0) {
    if (vocal.camelot === beat.camelot)
      return { level: "perfect", title: `Perfect: same Camelot code (${vocal.camelot})`, detail: "Identical notes. No pitch shift needed." };
    if (rawKeyFit === "relative")
      return {
        level: "perfect",
        title: `Perfect: relative keys (${vocal.camelot} + ${beat.camelot})`,
        detail: "One is the relative major or minor of the other: exactly the same seven notes, so nothing clashes.",
      };
    if (rawKeyFit === "neighbour")
      return {
        level: "good",
        title: `Blends: neighbours on the Camelot wheel (${vocal.camelot} → ${beat.camelot})`,
        detail: "A fifth apart: six of seven notes are shared. It sounds natural; it's how DJs mix harmonically.",
      };
    if (rawKeyFit === "far")
      return { level: "warn", title: `Tense: two steps apart (${vocal.camelot} → ${beat.camelot})`, detail: `${names} share only five notes. Works for a moment, but may grate.` };
    return {
      level: "bad",
      title: `Clashes: ${vocal.camelot} against ${beat.camelot}`,
      detail: `${names} share very few notes, so melody and chords rub against each other. A pitch shift would fix it.`,
    };
  }
  const shiftText = `${signed(semitones)} semitone${Math.abs(semitones) === 1 ? "" : "s"}`;
  const result =
    shiftedFit === "same" || shiftedFit === "relative"
      ? `then it uses exactly the beat's notes (${shiftedCamelot})`
      : shiftedFit === "neighbour"
        ? `then it sits a fifth from the beat (${shiftedCamelot} next to ${beat.camelot}) and blends`
        : `but it still clashes with the beat (${shiftedCamelot} against ${beat.camelot})`;
  const was = rawKeyFit === "clash" || rawKeyFit === "far" ? "Unshifted they clash. " : "";
  const level: Level =
    shiftedFit === "same" || shiftedFit === "relative" ? (Math.abs(semitones) <= 3 ? "good" : "warn") : shiftedFit === "neighbour" ? "good" : "bad";
  const big = Math.abs(semitones) > 4 ? " A shift this big makes voices sound chipmunk-like or muddy." : "";
  return {
    level,
    title: level === "bad" ? `Clashes: ${shiftText} is not enough` : `Needs ${shiftText}`,
    detail: `${was}Pitching the vocal ${shiftText}: ${result}.${big}`,
  };
}

/** One bar of the vocal on the grid: where it starts and ends, in the beat's bars. */
export type GridRect = { x: number; w: number; sung: boolean };

/**
 * Where the vocal's bars land against the beat's bar lines. Matched: both on
 * the target grid, so they line up. Raw: each at its own tempo, so the
 * vocal's bars slide away from the beat's.
 */
export function gridRects(vocal: DemoSongMeta, beat: DemoSongMeta, a: PairAnalysis, matched: boolean): { bars: number; rects: GridRect[] } {
  const rects: GridRect[] = [];
  const bars = a.loopBars;
  const startV = vocal.chorusBar;
  if (matched) {
    for (let j = 0; j < a.vocalSourceBars; j++) {
      rects.push({ x: j * a.vocalFactor, w: a.vocalFactor, sung: !!vocal.vocalBars[startV + j] });
    }
  } else {
    // Raw: both play at their own speed; vocal bars measured in the beat's raw bars.
    const barV = 240 / vocal.bpm;
    const barB = 240 / beat.bpm;
    for (let j = 0; j < a.vocalSourceBars; j++) {
      rects.push({ x: (j * barV) / barB, w: barV / barB, sung: !!vocal.vocalBars[startV + j] });
    }
  }
  return { bars, rects: rects.filter((r) => r.x < bars) };
}

/** How far a bar line of the vocal slides from the beat's each bar, in ms (raw playback). */
export function driftPerBarMs(vocal: DemoSongMeta, beat: DemoSongMeta, a: PairAnalysis) {
  const barV = (240 / vocal.bpm) * a.vocalFactor;
  const barB = 240 / beat.bpm;
  return Math.abs(barV - barB) * 1000;
}
