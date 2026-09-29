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

export type AutoMatchResult = {
  lines: string[];
  /** Patches that put every lane back exactly as it was. */
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

export async function autoMatch(): Promise<AutoMatchResult> {
  const store = useStudioStore.getState();
  const lanes = store.lanes;
  const lines: string[] = [];

  const undo: AutoMatchResult["undo"] = { patches: {}, projectBpm: store.projectBpm };
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

  // Work on copies with any missing BPM or key filled in from analysis.
  const working = lanes.map((lane) => {
    const analysis = analyses.get(lane.laneId);
    return {
      ...lane,
      bpm: lane.bpm ?? analysis?.bpmEstimate ?? null,
      musicalKey: lane.musicalKey ?? analysis?.key ?? null,
    };
  });
  const patches: Record<string, LanePatch> = {};
  const patch = (laneId: string, p: LanePatch) => {
    patches[laneId] = { ...patches[laneId], ...p };
  };
  for (const lane of working) {
    const original = lanes.find((l) => l.laneId === lane.laneId)!;
    if (lane.bpm !== original.bpm) {
      patch(lane.laneId, { bpm: lane.bpm });
      lines.push(`${lane.trackTitle}: no stored BPM — estimated ${lane.bpm?.toFixed(1)}`);
    }
    if (lane.musicalKey && !original.musicalKey) patch(lane.laneId, { musicalKey: lane.musicalKey });
  }

  // --- 1. Tempo ---------------------------------------------------------------
  let projectBpm = store.projectBpm;
  const tempoRef = referenceLane(working, (l) => !!l.bpm && l.bpm > 0);
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

  // --- 2. Key -----------------------------------------------------------------
  const keyRef = referenceLane(working, (l) => !!l.musicalKey);
  if (keyRef?.musicalKey) {
    const target = transposeKey(keyRef.musicalKey, keyRef.pitchSemitones);
    lines.push(`Key: matching to ${keyLabel(target)} (${camelotCode(target)}) from “${keyRef.trackTitle}”`);
    for (const lane of working) {
      if (!lane.musicalKey || lane.laneId === keyRef.laneId) continue;
      const match = bestKeyShift(lane.musicalKey, target);
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
  }

  // --- 3. Beat alignment --------------------------------------------------------
  // First slide the reference lane (by under half a beat) so its hits land
  // on the project grid — then the ruler, snap and metronome all agree with
  // the music. Then drop every other lane's entry onto a bar line.
  if (tempoRef?.bpm) {
    const beat = beatLength(projectBpm);
    const bar = beat * 4;
    const refAnalysis = analyses.get(tempoRef.laneId);
    const ref = working.find((l) => l.laneId === tempoRef.laneId)!;
    if (refAnalysis) {
      const phase = beatPhase(refAnalysis, 60 / ref.bpm!) / ref.tempoRatio;
      const misalignment = (((ref.offsetSeconds + phase) % beat) + beat) % beat;
      let offset = ref.offsetSeconds + (misalignment > beat / 2 ? beat - misalignment : -misalignment);
      if (offset < 0) offset += beat;
      if (Math.abs(offset - ref.offsetSeconds) > 0.001) {
        ref.offsetSeconds = offset;
        patch(ref.laneId, { offsetSeconds: offset });
        lines.push(`“${ref.trackTitle}”: moved ${Math.round((offset - tempoRef.offsetSeconds) * 1000)} ms so its beat sits on the grid`);
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
  const levelRef = referenceLane(working, (l) => (analyses.get(l.laneId)?.loudness ?? 0) > 0);
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

  // --- 5. Starting FX -------------------------------------------------------------
  // Only on lanes still on flat settings — never overwrite a sound the
  // user already dialled in.
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

  useStudioStore.getState().applyLanePatches(patches, projectBpm);
  return { lines, undo };
}
