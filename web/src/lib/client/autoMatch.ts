"use client";

import { analyzeStem, beatPhase, type StemAnalysis } from "./analysis";
import { audioEngine } from "./audioEngine";
import { bestKeyShift, camelotCode, keyLabel, transposeKey } from "./musicKey";
import {
  DEFAULT_FX,
  FX_PRESETS,
  beatLength,
  referenceLane,
  useStudioStore,
  type LaneFx,
  type LanePatch,
  type StudioLane,
} from "./studioStore";

// "AI Match": listens to every lane and fits them together in one go —
// tempo (with half/double-time correction), key, beat alignment, relative
// levels and a starting FX chain. It's signal analysis in the browser
// (see analysis.ts), deterministic and explainable; the report lists each
// decision so the user can see what changed and undo it.

async function analyzeLane(lane: StudioLane): Promise<StemAnalysis | null> {
  await audioEngine.ensureLane(lane.laneId, lane.stemId);
  const buffer = audioEngine.getRawBuffer(lane.laneId);
  return buffer ? analyzeStem(lane.stemId, buffer) : null;
}

const keyAttempted = new Set<string>();

/**
 * Fills in the key of any lane that doesn't have one yet, in the
 * background, so the lane header can show it without the user asking.
 */
export async function detectMissingKeys() {
  const { lanes } = useStudioStore.getState();
  for (const lane of lanes) {
    if (lane.musicalKey || keyAttempted.has(lane.laneId)) continue;
    keyAttempted.add(lane.laneId);
    try {
      const analysis = await analyzeLane(lane);
      const current = useStudioStore.getState().lanes.find((l) => l.laneId === lane.laneId);
      if (analysis && current && !current.musicalKey) {
        useStudioStore.getState().setLaneKey(lane.laneId, analysis.key);
      }
    } catch {
      // Leave it unknown; the key can still be picked by hand.
    }
  }
}

/** Which parts of the mix AI Match is allowed to change. */
export type MatchSteps = {
  tempo: boolean;
  key: boolean;
  timing: boolean;
  levels: boolean;
  fx: boolean;
};

export const ALL_STEPS: MatchSteps = { tempo: true, key: true, timing: true, levels: true, fx: true };

/** One way of fitting the lanes together, ready to apply. */
export type MatchPlan = {
  id: string;
  title: string;
  /** One line: the target tempo/key and what gets bent to reach it. */
  summary: string;
  /** Every decision, for the "what changed" report. */
  lines: string[];
  patches: Record<string, LanePatch>;
  projectBpm: number;
  /** How far the audio gets bent (semitones + stretch); lower sounds more natural. */
  cost: number;
  recommended: boolean;
};

export type MatchSuggestions = {
  plans: MatchPlan[];
  /** Patches that put every lane (and the tempo) back exactly as it was. */
  undo: { patches: Record<string, LanePatch>; projectBpm: number };
};

function isDefaultFx(fx: LaneFx) {
  return (Object.keys(DEFAULT_FX) as (keyof LaneFx)[]).every((k) => fx[k] === DEFAULT_FX[k]);
}

function formatShift(semitones: number) {
  return semitones > 0 ? `+${semitones}` : `${semitones}`;
}

function db(ratio: number) {
  return `${ratio >= 1 ? "+" : ""}${(20 * Math.log10(ratio)).toFixed(1)} dB`;
}

function shortTitle(title: string) {
  return title.length > 18 ? `${title.slice(0, 17)}…` : title;
}

/**
 * Works out one match with `anchor` as the lane everything else follows
 * (its tempo, its key, its beat grid, its level). Pure: returns patches,
 * changes nothing.
 */
function buildPlan(
  original: StudioLane[],
  analyses: Map<string, StemAnalysis>,
  steps: MatchSteps,
  anchor: StudioLane | undefined,
  currentBpm: number
) {
  const lines: string[] = [];
  const pick = (has: (l: StudioLane) => boolean) =>
    anchor && has(anchor) ? anchor : undefined;

  // Work on copies with any missing BPM or key filled in from analysis.
  const working = original.map((lane) => {
    const analysis = analyses.get(lane.laneId);
    return {
      ...lane,
      bpm: lane.bpm ?? analysis?.bpmEstimate ?? null,
      musicalKey: lane.musicalKey ?? analysis?.key ?? null,
    };
  });
  const anchorOf = (has: (l: StudioLane) => boolean) =>
    working.find((l) => l.laneId === pick(has)?.laneId) ?? referenceLane(working, has);

  const patches: Record<string, LanePatch> = {};
  const patch = (laneId: string, p: LanePatch) => {
    patches[laneId] = { ...patches[laneId], ...p };
  };
  for (const lane of working) {
    const before = original.find((l) => l.laneId === lane.laneId)!;
    if (lane.bpm !== before.bpm) {
      patch(lane.laneId, { bpm: lane.bpm });
      lines.push(`${lane.trackTitle}: no stored BPM — estimated ${lane.bpm?.toFixed(1)}`);
    }
    if (lane.musicalKey && !before.musicalKey) patch(lane.laneId, { musicalKey: lane.musicalKey });
  }

  // --- 1. Tempo ---------------------------------------------------------------
  let projectBpm = currentBpm;
  const tempoRef = anchorOf((l) => !!l.bpm && l.bpm > 0);
  if (steps.tempo) {
    if (tempoRef?.bpm) {
      const target = tempoRef.bpm * tempoRef.tempoRatio;
      projectBpm = Math.round(target * 100) / 100;
      lines.push(`Tempo: everything locked to ${projectBpm.toFixed(1)} BPM from “${tempoRef.trackTitle}”`);

      for (const lane of working) {
        if (!lane.bpm || lane.bpm <= 0 || lane.laneId === tempoRef.laneId) continue;
        // Tempo detection often reports half or double the felt tempo, and
        // a 70 BPM vocal really does sit fine on a 140 BPM beat. Pick the
        // reading that needs the least stretching.
        const readings = [lane.bpm, lane.bpm * 2, lane.bpm / 2];
        const bpm = readings.reduce((best, r) =>
          Math.abs(Math.log(target / r)) < Math.abs(Math.log(target / best)) ? r : best
        );
        const tempoRatio = Math.min(2, Math.max(0.5, target / bpm));
        const reread = bpm !== lane.bpm;
        lane.bpm = bpm;
        lane.tempoRatio = tempoRatio;
        patch(lane.laneId, { bpm, tempoRatio });
        lines.push(
          `${lane.trackTitle}: ${bpm.toFixed(1)} → ${target.toFixed(1)} BPM (${tempoRatio.toFixed(3)}× speed)` +
            (reread ? " — read as half/double time" : "")
        );
      }
    } else {
      lines.push("Tempo: no lane has a BPM, so timing was left alone");
    }
  }

  // --- 2. Key -----------------------------------------------------------------
  const keyRef = anchorOf((l) => !!l.musicalKey);
  let targetKey = keyRef?.musicalKey ? transposeKey(keyRef.musicalKey, keyRef.pitchSemitones) : null;
  if (steps.key) {
    if (keyRef && targetKey) {
      lines.push(`Key: matching to ${keyLabel(targetKey)} (${camelotCode(targetKey)}) from “${keyRef.trackTitle}”`);
      for (const lane of working) {
        if (!lane.musicalKey || lane.laneId === keyRef.laneId) continue;
        const match = bestKeyShift(lane.musicalKey, targetKey);
        lane.pitchSemitones = match.semitones;
        patch(lane.laneId, { pitchSemitones: match.semitones });
        const result = transposeKey(lane.musicalKey, match.semitones);
        const how =
          match.relation === "same"
            ? "same key"
            : match.relation === "relative"
              ? "relative key, same notes"
              : "a fifth away on the Camelot wheel — a smaller, cleaner shift";
        lines.push(
          `${lane.trackTitle}: ${keyLabel(lane.musicalKey)} ${formatShift(match.semitones)} st → ${keyLabel(result)} (${camelotCode(result)}, ${how})`
        );
      }
    } else {
      lines.push("Key: couldn't detect a key on any lane");
      targetKey = null;
    }
  }

  // --- 3. Beat alignment --------------------------------------------------------
  // First slide the reference lane (by under half a beat) so its hits land
  // on the project grid — then the ruler, snap and metronome all agree with
  // the music. Then drop every other lane's entry onto a bar line.
  if (steps.timing && tempoRef?.bpm) {
    const beat = beatLength(projectBpm);
    const bar = beat * 4;
    const refAnalysis = analyses.get(tempoRef.laneId);
    const ref = tempoRef;
    const startOffset = ref.offsetSeconds;
    if (refAnalysis) {
      const phase = beatPhase(refAnalysis, 60 / ref.bpm!) / ref.tempoRatio;
      const misalignment = (((ref.offsetSeconds + phase) % beat) + beat) % beat;
      let offset = ref.offsetSeconds + (misalignment > beat / 2 ? beat - misalignment : -misalignment);
      if (offset < 0) offset += beat;
      if (Math.abs(offset - ref.offsetSeconds) > 0.001) {
        ref.offsetSeconds = offset;
        patch(ref.laneId, { offsetSeconds: offset });
        lines.push(`“${ref.trackTitle}”: moved ${Math.round((offset - startOffset) * 1000)} ms so its beat sits on the grid`);
      }
    }

    for (const lane of working) {
      const analysis = analyses.get(lane.laneId);
      if (lane.laneId === tempoRef.laneId || !analysis || !lane.bpm) continue;
      const period = 60 / lane.bpm;
      const phase = beatPhase(analysis, period);
      // The beat in the lane's own groove nearest to where it comes in.
      let entryBeat = phase + Math.round((analysis.entry - phase) / period) * period;
      if (entryBeat < 0) entryBeat += period;
      const entry = entryBeat / lane.tempoRatio;

      // Keep it roughly where the user put it: nearest bar to its current
      // entry point, but never before the start of the timeline.
      let barIndex = Math.round((lane.offsetSeconds + entry) / bar);
      if (barIndex * bar < entry) barIndex = Math.ceil(entry / bar);
      const offset = barIndex * bar - entry;
      lane.offsetSeconds = offset;
      patch(lane.laneId, { offsetSeconds: offset });
      lines.push(`${lane.trackTitle}: first phrase lands on bar ${barIndex + 1}, locked to the beat grid`);
    }
  }

  // --- 4. Levels ----------------------------------------------------------------
  // Loudness-match against the reference, with the vocal riding ~1 dB on
  // top — separated stems come out at wildly different levels.
  if (steps.levels) {
    const levelRef = anchorOf((l) => (analyses.get(l.laneId)?.loudness ?? 0) > 0);
    const refLoudness = levelRef ? analyses.get(levelRef.laneId)!.loudness : 0;
    if (levelRef && refLoudness > 0 && working.length > 1) {
      const base = 0.85; // leave headroom for the sum of the lanes
      for (const lane of working) {
        const loudness = analyses.get(lane.laneId)?.loudness ?? 0;
        if (loudness <= 0) continue;
        const lift = lane.kind === "vocals" && levelRef.kind === "beat" ? 1.12 : 1;
        const volume =
          lane.laneId === levelRef.laneId
            ? base
            : Math.min(1.5, Math.max(0.2, (base * lift * refLoudness) / loudness));
        const rounded = Math.round(volume * 100) / 100;
        if (Math.abs(rounded - lane.volume) < 0.01) continue;
        patch(lane.laneId, { volume: rounded });
        lines.push(`${lane.trackTitle}: level ${Math.round(rounded * 100)}% (${db(rounded / Math.max(0.01, lane.volume))})`);
      }
    }
  }

  // --- 5. Starting FX -------------------------------------------------------------
  // Only on lanes still on flat settings — never overwrite a sound the
  // user already dialled in.
  if (steps.fx) {
    const hasVocal = working.some((l) => l.kind === "vocals");
    const hasBeat = working.some((l) => l.kind === "beat");
    const air = FX_PRESETS.find((p) => p.id === "vocal-air")!;
    for (const lane of working) {
      if (!isDefaultFx(lane.fx)) continue;
      if (lane.kind === "vocals" && hasBeat) {
        patch(lane.laneId, { fx: { ...DEFAULT_FX, ...air.fx } });
        lines.push(`${lane.trackTitle}: “Air” vocal chain — high-pass, levelling compressor, presence, a little room`);
      } else if (lane.kind === "beat" && hasVocal) {
        patch(lane.laneId, { fx: { ...DEFAULT_FX, eqMid: -2.5 } });
        lines.push(`${lane.trackTitle}: mids dipped 2.5 dB to make a pocket for the vocal`);
      }
    }
  }

  // How much bending this plan asks for: every semitone of pitch shift,
  // and every ~5% of time-stretch, costs about the same audibly.
  let cost = 0;
  const bends: string[] = [];
  for (const lane of working) {
    const semis = Math.abs(lane.pitchSemitones);
    const stretch = Math.abs(Math.log(lane.tempoRatio)) * 20;
    cost += semis + stretch;
    const parts: string[] = [];
    if (steps.key && patches[lane.laneId]?.pitchSemitones !== undefined && lane.pitchSemitones !== 0) {
      parts.push(`${formatShift(lane.pitchSemitones)} st`);
    }
    if (steps.tempo && patches[lane.laneId]?.tempoRatio !== undefined && Math.abs(lane.tempoRatio - 1) > 0.001) {
      parts.push(`${lane.tempoRatio.toFixed(2)}×`);
    }
    if (parts.length) bends.push(`${shortTitle(lane.trackTitle)} ${parts.join(", ")}`);
  }

  const target = [
    steps.tempo && tempoRef?.bpm ? `${projectBpm.toFixed(1)} BPM` : null,
    steps.key && targetKey ? keyLabel(targetKey) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = [target, bends.length ? bends.join(" · ") : "nothing needs bending"]
    .filter(Boolean)
    .join(" — ");

  return { lines, patches, projectBpm, cost, summary };
}

/**
 * Listens to every lane and proposes a few different ways to fit them
 * together — each lane in turn setting the tempo and key — ranked by how
 * little the audio has to be bent. Nothing changes until one is applied.
 */
export async function suggestMatches(steps: MatchSteps): Promise<MatchSuggestions> {
  const store = useStudioStore.getState();
  const lanes = store.lanes;

  const undo: MatchSuggestions["undo"] = { patches: {}, projectBpm: store.projectBpm };
  for (const lane of lanes) {
    undo.patches[lane.laneId] = {
      bpm: lane.bpm,
      musicalKey: lane.musicalKey,
      pitchSemitones: lane.pitchSemitones,
      tempoRatio: lane.tempoRatio,
      offsetSeconds: lane.offsetSeconds,
      volume: lane.volume,
      fx: { ...lane.fx },
    };
  }

  const analyses = new Map<string, StemAnalysis>();
  await Promise.all(
    lanes.map(async (lane) => {
      const analysis = await analyzeLane(lane);
      if (analysis) analyses.set(lane.laneId, analysis);
    })
  );

  // One candidate per lane as the anchor; the tempo/key only differ
  // between lanes, so with just levels/timing/FX ticked, one plan will do.
  const bendable = steps.tempo || steps.key;
  const anchors = bendable ? lanes : [referenceLane(lanes, () => true)!];
  const candidates = anchors.map((anchor) => ({
    anchor,
    ...buildPlan(lanes, analyses, steps, anchor, store.projectBpm),
  }));

  // Two anchors that land on the same tempo and key are the same plan.
  const distinct = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates.sort((a, b) => a.cost - b.cost)) {
    const signature = `${candidate.summary.split(" — ")[0]}`;
    if (!distinct.has(signature)) distinct.set(signature, candidate);
  }
  const ranked = [...distinct.values()].slice(0, 3);
  const plans: MatchPlan[] = ranked.map((candidate, i) => ({
    id: candidate.anchor.laneId,
    title: bendable
      ? `Follow ${candidate.anchor.kind === "vocals" ? "the vocal" : "the beat"} “${shortTitle(candidate.anchor.trackTitle)}”`
      : "Tighten the mix",
    summary: candidate.summary,
    lines: candidate.lines,
    patches: candidate.patches,
    projectBpm: candidate.projectBpm,
    cost: candidate.cost,
    recommended: i === 0 && ranked.length > 1,
  }));
  return { plans, undo };
}

/**
 * Applies one plan on top of the state the suggestions were made from, so
 * trying one plan and then another doesn't stack their changes.
 */
export function applyMatch(plan: MatchPlan, undo: MatchSuggestions["undo"]) {
  const merged: Record<string, LanePatch> = {};
  for (const [laneId, original] of Object.entries(undo.patches)) {
    merged[laneId] = { ...original, ...plan.patches[laneId] };
  }
  useStudioStore.getState().applyLanePatches(merged, plan.projectBpm);
}
