"use client";

import { analyzeStem, beatPhase, findPhrases, refineTempo, type StemAnalysis } from "./analysis";
import { PRE_ROLL, TAIL, arrangeVocal, beatStructure } from "./arrange";
import { audioEngine } from "./audioEngine";
import { fetchStem } from "./stemFetch";
import { bestKeyShift, keyLabel } from "./musicKey";
import { withoutHistory } from "./studioHistory";
import {
  DEFAULT_FX,
  FX_PRESETS,
  beatLength,
  clipsOf,
  referenceLane,
  useStudioStore,
  type LaneClip,
  type LaneFx,
  type LanePatch,
  effectiveKey,
  type StudioLane,
} from "./studioStore";

// "AI Match": listens to every lane and fits them together in one go —
// tempo (with half/double-time correction), a phrase-by-phrase
// arrangement of each vocal on the beat's bars (see arrange.ts), relative
// levels and a starting FX chain. It never changes pitch: keys are only
// reported, and shifting one stays the user's call. It's signal analysis
// in the browser (see analysis.ts), deterministic and explainable; the
// report lists each decision so the user can see what changed and undo it.

export async function analyzeLane(lane: StudioLane): Promise<StemAnalysis | null> {
  await audioEngine.ensureLane(lane.laneId, lane.stemId);
  const buffer = audioEngine.getRawBuffer(lane.laneId);
  return buffer ? analyzeStem(lane.stemId, buffer) : null;
}

const guideCache = new Map<string, Promise<StemAnalysis | null>>();

/**
 * A vocal's original beat — the other stem of the song it came from —
 * analysed. Its hits say exactly where the singer's bars fall, which the
 * voice alone can't. Null when that beat isn't in the library any more.
 */
export function analyzeGuide(lane: StudioLane): Promise<StemAnalysis | null> {
  const cached = guideCache.get(lane.stemId);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(`/api/stems/${lane.stemId}/partner`);
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id: string | null };
    if (!id) return null;
    const inProject = useStudioStore.getState().lanes.find((l) => l.stemId === id);
    if (inProject) return analyzeLane(inProject);
    const data = await fetchStem(id);
    // Decoding needs a context but not a running one.
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
    return analyzeStem(id, buffer);
  })().catch(() => null);
  guideCache.set(lane.stemId, promise);
  return promise;
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
        // Detected, not chosen — so not something to undo.
        withoutHistory(lane.laneId, { musicalKey: analysis.key }, () =>
          useStudioStore.getState().setLaneKey(lane.laneId, analysis.key)
        );
      }
    } catch {
      // Leave it unknown; the key can still be picked by hand.
    }
  }
}

/**
 * Splits a lane at its silences and drops them, leaving every phrase
 * exactly where it was — cleans the bleed out of a vocal's gaps and makes
 * each line a clip that can be moved on its own. Returns how many clips
 * the lane has afterwards (0: nothing to cut).
 */
export async function cutSilences(laneId: string): Promise<number> {
  const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
  if (!lane) return 0;
  const analysis = await analyzeLane(lane);
  if (!analysis) return 0;
  const phrases = findPhrases(analysis);
  const current = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
  if (!current || phrases.length === 0) return 0;

  const clips: LaneClip[] = [];
  for (const clip of clipsOf(current)) {
    for (const p of phrases) {
      const from = Math.max(clip.from, p.start - PRE_ROLL);
      const to = Math.min(clip.to, p.end + TAIL);
      if (to - from > 0.05) {
        clips.push({ ...clip, from, to, at: clip.at + (from - clip.from) / (clip.stretch ?? 1) });
      }
    }
  }
  if (clips.length === 0) return 0;
  useStudioStore.getState().setClips(laneId, clips);
  return clips.length;
}

/** Which parts of the mix AI Match is allowed to change. */
export type MatchSteps = {
  tempo: boolean;
  /** Beat grid alignment, and each vocal cut into phrases and laid on the beat. */
  arrange: boolean;
  levels: boolean;
  fx: boolean;
};

export const ALL_STEPS: MatchSteps = { tempo: true, arrange: true, levels: true, fx: true };

/** One way of fitting the lanes together, ready to apply. */
export type MatchPlan = {
  id: string;
  title: string;
  /** One line: the target tempo and what gets stretched to reach it. */
  summary: string;
  /** Every decision, for the "what changed" report. */
  lines: string[];
  patches: Record<string, LanePatch>;
  projectBpm: number;
  /** How far the audio gets stretched; lower sounds more natural. */
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

function db(ratio: number) {
  return `${ratio >= 1 ? "+" : ""}${(20 * Math.log10(ratio)).toFixed(1)} dB`;
}

function shortTitle(title: string) {
  return title.length > 18 ? `${title.slice(0, 17)}…` : title;
}

/**
 * Works out one match with `anchor` as the lane everything else follows
 * (its tempo, its beat grid, its level). Pure: returns patches, changes
 * nothing.
 */
function buildPlan(
  original: StudioLane[],
  analyses: Map<string, StemAnalysis>,
  guides: Map<string, StemAnalysis>,
  sharpened: Map<string, number>,
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
      bpm: sharpened.get(lane.laneId) ?? lane.bpm ?? analysis?.bpmEstimate ?? null,
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
      lines.push(
        before.bpm
          ? `${lane.trackTitle}: BPM sharpened ${before.bpm.toFixed(1)} → ${lane.bpm?.toFixed(2)} from ${
              lane.kind === "vocals" ? "its original beat's" : "its"
            } hits across the whole song`
          : `${lane.trackTitle}: no stored BPM — estimated ${lane.bpm?.toFixed(1)}`
      );
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

  // --- 2. Keys (reported, never changed) -------------------------------------------
  // Pitch-shifting a stem colours it, so AI Match leaves pitch as it is
  // and only says how the keys sit; the lane's Key → Match does the shift
  // if the user wants it.
  const keyRef = anchorOf((l) => !!l.musicalKey);
  const refKey = keyRef ? effectiveKey(keyRef) : null;
  if (keyRef && refKey) {
    for (const lane of working) {
      const key = effectiveKey(lane);
      if (!key || lane.laneId === keyRef.laneId) continue;
      const match = bestKeyShift(key, refKey);
      lines.push(
        match.semitones === 0
          ? `Key: ${lane.trackTitle} (${keyLabel(key)}) already sits with ${keyLabel(refKey)} — ${
              match.relation === "neighbour" ? "neighbours on the Camelot wheel" : "same notes"
            }`
          : `Key: ${lane.trackTitle} is ${keyLabel(key)} against ${keyLabel(refKey)} — pitch left alone; its Key → Match would shift it ${
              match.semitones > 0 ? "+" : ""
            }${match.semitones} st if it clashes`
      );
    }
  }

  // --- 3. Beat grid and arrangement ----------------------------------------------------
  // First slide the reference lane (by under half a bar) so its downbeats
  // land on the project's bar lines — then the ruler, snap and metronome
  // all agree with the music. Then lay every vocal on the beat phrase by
  // phrase, and put any other lane's entry on a bar line.
  if (steps.arrange && tempoRef?.bpm) {
    const beat = beatLength(projectBpm);
    const bar = beat * 4;
    const ref = tempoRef;
    const refAnalysis = analyses.get(ref.laneId);
    const refStructure = refAnalysis ? beatStructure(refAnalysis, ref.bpm!) : null;
    const startOffset = ref.offsetSeconds;
    let firstDownbeat: number | null = null;
    if (refStructure) {
      firstDownbeat = refStructure.grid.time(refStructure.downbeat) / ref.tempoRatio;
    } else if (refAnalysis) {
      firstDownbeat = beatPhase(refAnalysis, 60 / ref.bpm!) / ref.tempoRatio;
    }
    if (firstDownbeat !== null) {
      const unit = refStructure ? bar : beat;
      const misalignment = (((ref.offsetSeconds + firstDownbeat) % unit) + unit) % unit;
      let offset = ref.offsetSeconds + (misalignment > unit / 2 ? unit - misalignment : -misalignment);
      if (offset < 0) offset += unit;
      if (Math.abs(offset - ref.offsetSeconds) > 0.001) {
        ref.offsetSeconds = offset;
        patch(ref.laneId, { offsetSeconds: offset });
        lines.push(
          `“${ref.trackTitle}”: moved ${Math.round((offset - startOffset) * 1000)} ms so its ${
            refStructure ? "downbeats sit on the bar lines" : "beat sits on the grid"
          }`
        );
      }
    }

    // The beat the vocals are laid on: the reference if it's a beat, else
    // the first beat lane (the reference vocal then only sets the tempo).
    const backing = ref.kind === "beat" ? ref : working.find((l) => l.kind === "beat" && l.bpm);
    const backingAnalysis = backing && analyses.get(backing.laneId);
    const backingStructure =
      backing === ref ? refStructure : backing && backingAnalysis ? beatStructure(backingAnalysis, backing.bpm!) : null;

    for (const lane of working) {
      const analysis = analyses.get(lane.laneId);
      if (lane.laneId === tempoRef.laneId || !analysis || !lane.bpm) continue;

      if (lane.kind === "vocals" && backing && backingAnalysis && backingStructure) {
        const vocalTempo = lane.bpm * lane.tempoRatio;
        const beatTempo = backing.bpm! * backing.tempoRatio;
        if (Math.abs(Math.log(vocalTempo / beatTempo)) > 0.03) {
          lines.push(
            `${lane.trackTitle}: plays at ${vocalTempo.toFixed(1)} BPM against ${beatTempo.toFixed(1)} — match the tempo first to arrange it`
          );
          continue;
        }
        const result = arrangeVocal(
          {
            analysis,
            bpm: lane.bpm,
            tempoRatio: lane.tempoRatio,
            offsetSeconds: lane.offsetSeconds,
            title: lane.trackTitle,
            duration: lane.originalDuration,
            guide: guides.get(lane.laneId),
          },
          {
            analysis: backingAnalysis,
            bpm: backing.bpm!,
            tempoRatio: backing.tempoRatio,
            offsetSeconds: backing.offsetSeconds,
            title: backing.trackTitle,
            duration: backing.originalDuration,
          },
          backingStructure,
          bar
        );
        if ("error" in result) {
          lines.push(result.error);
        } else {
          lane.offsetSeconds = result.offsetSeconds;
          lane.clips = result.clips;
          patch(lane.laneId, { offsetSeconds: result.offsetSeconds, clips: result.clips });
          lines.push(...result.lines);
          continue;
        }
      }

      // Anything not arranged: the whole take, its entry on a bar line.
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
      lane.clips = null;
      patch(lane.laneId, { offsetSeconds: offset, clips: null });
      lines.push(`${lane.trackTitle}: comes in on bar ${barIndex + 1}, locked to the beat grid`);
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

  // How much stretching this plan asks for — every ~5% is audible.
  let cost = 0;
  const bends: string[] = [];
  for (const lane of working) {
    cost += Math.abs(Math.log(lane.tempoRatio)) * 20;
    if (steps.tempo && patches[lane.laneId]?.tempoRatio !== undefined && Math.abs(lane.tempoRatio - 1) > 0.001) {
      bends.push(`${shortTitle(lane.trackTitle)} ${lane.tempoRatio.toFixed(2)}×`);
    }
  }
  const arranged = working.filter((l) => patches[l.laneId]?.clips?.length).length;

  const target = steps.tempo && tempoRef?.bpm ? `${projectBpm.toFixed(1)} BPM` : "";
  const summary = [
    target,
    bends.length ? bends.join(" · ") : "nothing needs stretching",
    arranged ? `${arranged === 1 ? "vocal" : `${arranged} vocals`} arranged phrase by phrase` : null,
  ]
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
      tempoRatio: lane.tempoRatio,
      offsetSeconds: lane.offsetSeconds,
      clips: lane.clips,
      volume: lane.volume,
      fx: { ...lane.fx },
    };
  }

  const analyses = new Map<string, StemAnalysis>();
  const guides = new Map<string, StemAnalysis>();
  await Promise.all(
    lanes.map(async (lane) => {
      const [analysis, guide] = await Promise.all([
        analyzeLane(lane),
        lane.kind === "vocals" && (steps.arrange || steps.tempo) ? analyzeGuide(lane) : null,
      ]);
      if (analysis) analyses.set(lane.laneId, analysis);
      if (guide) guides.set(lane.laneId, guide);
    })
  );

  // Sharpen each stored tempo against the song's real hits — a beat's
  // own, a vocal's from its original beat (a voice's onsets are too soft
  // to judge by).
  const sharpened = new Map<string, number>();
  if (steps.tempo) {
    for (const lane of lanes) {
      const source = lane.kind === "beat" ? analyses.get(lane.laneId) : guides.get(lane.laneId);
      if (!lane.bpm || !source) continue;
      const refined = refineTempo(source, lane.bpm);
      if (Math.abs(refined - lane.bpm) >= 0.01) sharpened.set(lane.laneId, refined);
    }
  }

  // One candidate per lane as the anchor; only the tempo differs between
  // them, so with just arrangement/levels/FX ticked, one plan will do.
  const bendable = steps.tempo;
  const anchors = bendable ? lanes : [referenceLane(lanes, () => true)!];
  const candidates = anchors.map((anchor) => ({
    anchor,
    ...buildPlan(lanes, analyses, guides, sharpened, steps, anchor, store.projectBpm),
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
