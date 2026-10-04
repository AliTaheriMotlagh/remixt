"use client";

import { ALL_ASPECTS, type Aspect, type Vibe } from "./aiControl";
import type { StemAnalysis } from "./analysis";
import { sectionBars, type BeatStructure } from "./arrange";
import { analyzeLane, suggestMatches } from "./autoMatch";
import { findParts } from "./beatParts";
import { clipEnd, clipId, clipStart, clipsOf, moveClips, normaliseLane, stutterLane } from "./clipEdit";
import { DEFAULT_OPTIONS, findChorus, planFromOptions, type MatchOptions, type Structure } from "./matchOptions";
import { bestKeyShift, keyFit, keyLabel, transposeKey } from "./musicKey";
import { pairPlanPatches, preparePair, type PairContext, type TempoChoice } from "./pairMatch";
import {
  DEFAULT_FX,
  beatLength,
  effectiveKey,
  laneFromStem,
  useStudioStore,
  type AutoPoint,
  type LaneClip,
  type LoadableStem,
  type LaneFx,
  type LanePatch,
  type StudioLane,
} from "./studioStore";
import { isBacking } from "@/lib/stemKinds";

// The AI producer. A vocal from one song over a beat from another rarely
// sounds good as it lands: different speeds, clashing keys, lines that
// don't fall on the beat, a vocal buried or pasted on top. This listens to
// both (tempo, key, bars, the vocal's sections and chorus, the beat's
// drop) and offers, in plain words:
//
//   Make it sound good — everything fixed in one go, the chorus on the drop
//   Mix check          — what's wrong right now, each with a fix
//   Styles             — whole remixes for a vibe (radio, club, TikTok…)
//   Drops & moments    — the chorus on the drop, build-ups, drum drops,
//                        stutters, swells — using the beat's own drums and
//                        bass (split out by Demucs) when they're in the mix
//   More               — single arrangement, tempo and sound ideas
//
// It's all the studio's own analysis, running in the browser: no account,
// no key, no model to install. Every idea is worked out from one starting
// mix and sets its values outright, and is tried from that same starting
// mix (aiTrial.ts): trying another swaps it in rather than piling on top.
// Each records what it touches (its aspects), so ideas that touch
// different things can be on together.

export type Role = "remixer" | "engineer" | "beatmaker";

/** Fix everything · fix one thing · a whole style · a moment · a single idea. */
export type IdeaKind = "auto" | "fix" | "full" | "moment" | "idea";

export type Idea = {
  id: string;
  role: Role;
  kind: IdeaKind;
  /** A short emoji for the idea's tile. */
  icon: string;
  title: string;
  /** In a few plain words: what you'll hear. */
  short: string;
  /** Why it helps, from what the analysis heard. */
  why: string;
  /** Exactly what applying it changes. */
  lines: string[];
  patches: Record<string, LanePatch>;
  projectBpm?: number;
  /** What it changes, for combining ideas. */
  aspects: Aspect[];
  /** The styles it suits, to put first when the person picks one. */
  vibes: Vibe[];
  /** A good moment to start listening from, in seconds. */
  listenAt?: number;
  /** The lanes it was worked out for, and the stem each was playing. */
  stems: Record<string, string>;
  /**
   * Lanes it swaps in: the beat replaced by its own drums, bass and melody
   * from the library (they add up to the same sound), so they can drop out
   * on their own. Undoing the idea puts the beat back.
   */
  lanes?: LaneChange;
};

export type LaneChange = { add: StudioLane[]; remove: string[] };

export type IdeaOptions = { vibe: Vibe };

/** What the ideas are worked out from — the mix as it was when asked. */
export type Session = {
  lanes: StudioLane[];
  projectBpm: number;
  analyses: Map<string, StemAnalysis>;
  vocal: StudioLane | null;
  beat: StudioLane | null;
  pair: PairContext | null;
  /** The beat's biggest lift, in its own bars, if it has one. */
  drop: Drop | null;
  /** The beat's drums, bass and melody in the library (split when its song was uploaded), if any. */
  beatParts: LoadableStem[];
  /** Things worth telling the user (e.g. why there are no timing ideas). */
  notes: string[];
  signature: string;
  /** Where everything was on the timeline (see timingSignature). */
  timing: string;
  options: IdeaOptions;
};

/**
 * What the ideas depend on: which lanes there are, what they play, and
 * their source tempos. A change here means listening again.
 */
export function mixSignature(lanes: StudioLane[]) {
  return lanes.map((l) => `${l.laneId}:${l.stemId}:${l.bpm?.toFixed(2) ?? "-"}`).join("|");
}

/**
 * What the ideas are placed against: where each lane's audio sits, how
 * fast and at what pitch it plays, and the project tempo.
 */
export function timingSignature(lanes: StudioLane[], projectBpm: number) {
  return `${projectBpm.toFixed(3)}#${lanes
    .map((l) => `${l.laneId}:${l.offsetSeconds.toFixed(3)}:${l.tempoRatio.toFixed(4)}:${l.pitchSemitones}:${JSON.stringify(l.clips ?? null)}`)
    .join("|")}`;
}

/** The vocal and beat to work on: the selected ones, else the first of each. */
export function pickPair(lanes: StudioLane[], selected: string[]) {
  const chosen = lanes.filter((l) => selected.includes(l.laneId));
  const vocal = chosen.find((l) => l.kind === "vocals") ?? lanes.find((l) => l.kind === "vocals") ?? null;
  const beat =
    chosen.find((l) => isBacking(l.kind)) ??
    lanes.find((l) => l.kind === "beat") ??
    lanes.find((l) => l.kind === "drums") ??
    lanes.find((l) => isBacking(l.kind)) ??
    null;
  return { vocal, beat };
}

export type Step = "listen" | "match" | "ideas";

/** Listens to every lane (cached per stem) and to the chosen vocal/beat pair. */
export async function prepareSession(
  vocalId: string | null,
  beatId: string | null,
  options: IdeaOptions,
  onStep: (step: Step) => void = () => {}
): Promise<Session> {
  const state = useStudioStore.getState();
  const lanes = state.lanes;
  const picked = pickPair(lanes, state.selectedLaneIds);
  const vocal = lanes.find((l) => l.laneId === vocalId) ?? picked.vocal;
  const beat = lanes.find((l) => l.laneId === beatId) ?? picked.beat;
  const notes: string[] = [];

  onStep("listen");
  const analyses = new Map<string, StemAnalysis>();
  await Promise.all(
    lanes.map(async (lane) => {
      const analysis = await analyzeLane(lane).catch(() => null);
      if (analysis) analyses.set(lane.laneId, analysis);
    })
  );

  onStep("match");
  let pair: PairContext | null = null;
  if (vocal && beat) {
    try {
      pair = await preparePair(vocal.laneId, beat.laneId);
    } catch (error) {
      notes.push(`${error instanceof Error ? error.message : "Couldn't match the vocal and beat"} — timing ideas are off.`);
    }
  } else {
    notes.push(vocal ? "Add a beat to unlock timing, drop and style ideas." : "Add a vocal to unlock timing, drop and style ideas.");
  }
  const beatParts = beat && beat.kind === "beat" ? await findParts(beat).catch(() => []) : [];
  onStep("ideas");
  return {
    lanes,
    projectBpm: state.projectBpm,
    analyses,
    vocal,
    beat,
    pair,
    drop: pair ? findDrop(pair.structure) : null,
    beatParts,
    notes,
    signature: mixSignature(lanes),
    timing: timingSignature(lanes, state.projectBpm),
    options,
  };
}

/**
 * The session moved onto the mix as it is now — same lanes playing the
 * same stems, but timing, pitch or levels may have changed — keeping what
 * was heard, so nothing has to be listened to again.
 */
export function rebaseSession(session: Session, options = session.options): Session {
  const { lanes, projectBpm } = useStudioStore.getState();
  const current = (lane: StudioLane | null) => (lane && lanes.find((l) => l.laneId === lane.laneId)) ?? null;
  return {
    ...session,
    lanes,
    projectBpm,
    vocal: current(session.vocal),
    beat: current(session.beat),
    signature: mixSignature(lanes),
    timing: timingSignature(lanes, projectBpm),
    options,
  };
}

// --- Drafting -------------------------------------------------------------------------

/** A copy of the mix to try changes on; collects them as patches for applyLanePatches. */
class Draft {
  lanes: Map<string, StudioLane>;
  patches: Record<string, LanePatch> = {};
  projectBpm: number | undefined;
  lines: string[] = [];
  readonly session: Session;

  constructor(session: Session) {
    this.session = session;
    this.lanes = new Map(session.lanes.map((l) => [l.laneId, l]));
  }

  lane(id: string) {
    return this.lanes.get(id)!;
  }

  get bpm() {
    return this.projectBpm ?? this.session.projectBpm;
  }

  get beat() {
    return beatLength(this.bpm);
  }

  get bar() {
    return this.beat * 4;
  }

  patch(id: string, p: LanePatch) {
    const lane = this.lanes.get(id);
    if (!lane) return;
    const next = normaliseLane({ ...lane, ...p, offsetSeconds: Math.max(0, p.offsetSeconds ?? lane.offsetSeconds) });
    this.lanes.set(id, next);
    const merged = { ...this.patches[id], ...p };
    // Normalising can move the lane's start to its first clip; keep both in step.
    if ("clips" in p || "offsetSeconds" in p) {
      merged.clips = next.clips;
      merged.offsetSeconds = next.offsetSeconds;
    }
    this.patches[id] = merged;
  }

  /** Takes on lanes edited by clipEdit's pure edits, as patches. */
  adopt(lanes: StudioLane[]) {
    for (const next of lanes) {
      const before = this.lanes.get(next.laneId);
      if (!before || before === next) continue;
      const p: LanePatch = {};
      if (next.clips !== before.clips) p.clips = next.clips;
      if (next.offsetSeconds !== before.offsetSeconds) p.offsetSeconds = next.offsetSeconds;
      if (Object.keys(p).length) this.patch(next.laneId, p);
    }
  }

  get empty() {
    return Object.keys(this.patches).length === 0 && this.projectBpm === undefined;
  }

  /** What the collected changes touch, compared with the starting mix. */
  aspects(): Aspect[] {
    const found = new Set<Aspect>();
    const differs = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    for (const [id, p] of Object.entries(this.patches)) {
      const before = this.session.lanes.find((l) => l.laneId === id);
      if (!before) continue;
      if (("clips" in p && differs(p.clips, before.clips)) || ("offsetSeconds" in p && Math.abs(p.offsetSeconds! - before.offsetSeconds) > 1e-3)) {
        found.add("arrangement");
      }
      if ("tempoRatio" in p && Math.abs(p.tempoRatio! - before.tempoRatio) > 1e-4) found.add("tempo");
      if ("pitchSemitones" in p && p.pitchSemitones !== before.pitchSemitones) found.add("key");
      if ("volume" in p && Math.abs(p.volume! - before.volume) > 0.005) found.add("levels");
      if ("fx" in p && differs(p.fx, before.fx)) found.add("effects");
      if ("automation" in p && differs(p.automation, before.automation)) found.add("automation");
    }
    if (this.projectBpm !== undefined && Math.abs(this.projectBpm - this.session.projectBpm) > 0.01) found.add("tempo");
    return ALL_ASPECTS.filter((a) => found.has(a));
  }

  idea(
    meta: Pick<Idea, "id" | "role" | "icon" | "title" | "short" | "why"> & { kind?: IdeaKind; vibes?: Vibe[]; listenAt?: number; lanes?: LaneChange }
  ): Idea {
    return {
      kind: "idea",
      vibes: [],
      ...meta,
      lines: this.lines,
      patches: this.patches,
      projectBpm: this.projectBpm,
      aspects: this.aspects(),
      stems: Object.fromEntries(this.session.lanes.map((l) => [l.laneId, l.stemId])),
    };
  }
}

/** When a lane's audio first comes in, on the timeline. */
function entryOf(lane: StudioLane) {
  return Math.min(...clipsOf(lane).map((c) => clipStart(lane, c)));
}
function endOf(lane: StudioLane) {
  return Math.max(...clipsOf(lane).map((c) => clipEnd(lane, c)));
}

const pct = (ratio: number) => `${ratio >= 1 ? "+" : "−"}${Math.abs((ratio - 1) * 100).toFixed(1)}%`;
const st = (n: number) => `${n > 0 ? "+" : ""}${n} st`;

// --- The beat's drop ------------------------------------------------------------------

export type Drop = {
  /** The beat's own bar (from 0) where the lift lands. */
  bar: number;
  /** "drop": a clear jump in energy; "peak": no jump, just its loudest stretch. */
  kind: "drop" | "peak";
};

/**
 * Where the beat lifts the most: the 4-bar line whose next 4 bars are
 * loudest compared with the 4 before it (and loud in themselves). With no
 * real jump anywhere, its loudest 4 bars.
 */
export function findDrop(structure: BeatStructure): Drop | null {
  const energy = structure.barEnergy;
  const end = Math.min(structure.endBar, energy.length);
  if (end < 12) return null;
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += energy[i] ?? 0;
    return sum / Math.max(1, to - from);
  };
  const loudest = Math.max(...energy.slice(0, end), 1e-9);
  let best: { bar: number; score: number; rise: number } | null = null;
  for (let bar = 4; bar + 4 <= end; bar += 4) {
    const after = mean(bar, bar + 4);
    const rise = after / Math.max(1e-9, mean(bar - 4, bar));
    const score = rise * (after / loudest);
    if (!best || score > best.score) best = { bar, score, rise };
  }
  if (best && best.rise >= 1.3) return { bar: best.bar, kind: "drop" };
  let peak = { bar: 0, level: -1 };
  for (let bar = 0; bar + 4 <= end; bar += 4) {
    const level = mean(bar, bar + 4);
    if (level > peak.level) peak = { bar, level };
  }
  return { bar: peak.bar, kind: "peak" };
}

/** Where the beat's bar `bar` falls on the timeline, as the draft has it now. */
function beatBarTime(draft: Draft, bar: number) {
  const pair = draft.session.pair!;
  // With the beat swapped for its parts, any part has the beat's timing.
  const beat = draft.lanes.get(pair.beatLaneId) ?? draft.lane(draft.session.beat!.laneId);
  return beat.offsetSeconds + pair.structure.grid.time(pair.structure.downbeat + 4 * bar) / beat.tempoRatio;
}

// --- Remixer & beatmaker: arrangement -------------------------------------------------

/** The tempo choice that bends the audio least. */
function gentlestTempo(pair: PairContext): TempoChoice {
  const cost = (c: TempoChoice) => Math.abs(Math.log(pair.tempos[c].vocalRatio)) + Math.abs(Math.log(pair.tempos[c].beatRatio));
  return cost("vocal") < cost("beat") - 0.01 ? "vocal" : "beat";
}

function adoptTiming(draft: Draft, result: ReturnType<typeof pairPlanPatches>) {
  for (const [id, patch] of Object.entries(result.patches)) {
    const { volume: _volume, fx: _fx, ...timing } = patch;
    void _volume;
    void _fx;
    draft.patch(id, timing);
  }
  draft.projectBpm = result.projectBpm;
}

/**
 * Lays the vocal on the beat with the Match panel's choices. Only timing
 * changes — level and sound stay the engineer's business.
 */
function arrange(draft: Draft, options: Partial<MatchOptions>) {
  const pair = draft.session.pair!;
  const { plan, notes } = planFromOptions(pair, { ...DEFAULT_OPTIONS, vocalPreset: "none", beatPreset: "none", ...options });
  const result = pairPlanPatches(pair, plan, [...draft.lanes.values()]);
  adoptTiming(draft, result);
  draft.lines.push(...notes, ...result.lines.filter((l) => !l.startsWith("Vocal level")));
  return `${plan.follow}|${JSON.stringify(plan.sections)}|${plan.shift_beats ?? 0}`;
}

/**
 * The vocal in its own order, moved as a whole so its chorus lands right
 * on the beat's drop. False when that can't work (no chorus placed, or it
 * would push the chorus off the beat).
 */
function arrangeOnDrop(draft: Draft, drop: Drop, tempo?: TempoChoice): boolean {
  const pair = draft.session.pair!;
  const chorus = findChorus(pair);
  const base = pair.suggestion.placements;
  const at = base.find((p) => chorus.all.includes(p.section));
  if (!at) return false;
  const shift = drop.bar - at.bar;
  const fits = (p: { section: number; bar: number }) =>
    p.bar >= 0 && p.bar + sectionBars(pair.heard.sections[p.section]) <= pair.structure.endBar + 0.25;
  const sections = base.map((p) => ({ ...p, bar: p.bar + shift })).filter(fits);
  if (!sections.some((p) => p.section === at.section)) return false;
  try {
    const result = pairPlanPatches(pair, { follow: tempo ?? gentlestTempo(pair), sections }, [...draft.lanes.values()]);
    adoptTiming(draft, result);
  } catch {
    return false;
  }
  const left = base.length - sections.length;
  draft.lines.push(
    shift === 0
      ? "The chorus already lands on the beat's drop — every line locked to its bars"
      : `Vocal moved ${Math.abs(shift)} bars ${shift > 0 ? "later" : "earlier"} so its chorus lands on the beat's ${drop.kind === "drop" ? "drop" : "loudest part"} (bar ${drop.bar + 1})`,
    ...(left > 0 ? [`${left} section${left === 1 ? "" : "s"} that would fall off the beat left out`] : [])
  );
  return true;
}

/** "I-I-I-I want…": a half-beat slice of the vocal at `at` (its entry by default), four times. */
function stutterAt(draft: Draft, at?: number) {
  const vocal = draft.lane(draft.session.vocal!.laneId);
  const clips = stutterLane(vocal, at ?? entryOf(vocal), draft.beat * 0.5, 4);
  if (!clips) return false;
  draft.patch(vocal.laneId, { clips });
  draft.lines.push(at === undefined ? "Stutter on the vocal's first word (⅛ note × 4) to announce it" : "Stutter on the first word of the chorus, right on the drop");
  return true;
}

/** The vocal's first bar, reversed, swelling up into its entry. */
function reverseSwell(draft: Draft) {
  const session = draft.session;
  if (!session.vocal) return false;
  const vocal = draft.lane(session.vocal.laneId);
  const entry = entryOf(vocal);
  const bar = draft.bar;
  if (entry < bar * 1.5) return false;
  const first = [...clipsOf(vocal)].sort((a, b) => clipStart(vocal, a) - clipStart(vocal, b))[0];
  const length = Math.min(bar * vocal.tempoRatio, first.to - first.from);
  const swell: LaneClip = { from: first.from, to: first.from + length, at: (entry - length / vocal.tempoRatio - vocal.offsetSeconds) * vocal.tempoRatio, reverse: true };
  draft.patch(vocal.laneId, { clips: [...clipsOf(vocal), swell].sort((a, b) => a.at - b.at) });
  draft.lines.push("The vocal's first bar reversed, swelling into its first line");
  return true;
}

/** Filter closed over the intro, opening as the vocal comes in; closing again over the last bars. */
function filterBuild(draft: Draft) {
  const bar = draft.bar;
  const vocal = draft.session.vocal && draft.lane(draft.session.vocal.laneId);
  const backing = [...draft.lanes.values()].filter((l) => isBacking(l.kind));
  if (!backing.length) return false;
  const songEnd = Math.max(...[...draft.lanes.values()].map(endOf));
  const entry = vocal ? entryOf(vocal) : Math.min(8 * bar, songEnd / 3);
  if (entry < 2 * bar) return false;
  const rise = Math.max(0, entry - 4 * bar);
  for (const lane of backing) {
    const points = [
      { t: rise, v: 0.32 },
      { t: entry, v: 1 },
      ...(songEnd - entry > 12 * bar
        ? [
            { t: songEnd - 4 * bar, v: 1 },
            { t: songEnd, v: 0.3 },
          ]
        : []),
    ];
    draft.patch(lane.laneId, { automation: { ...lane.automation, filter: points } });
  }
  draft.lines.push(
    `The beat starts muffled and opens up over the 4 bars before the vocal (bar ${Math.round(entry / bar) + 1})`,
    "…and closes again over the last 4 bars, for a DJ-style ending"
  );
  return true;
}

/**
 * A build-up into the moment `at`: the beat's filter opens over the 4 bars
 * before it, and the beat cuts out just before it lands — the drums for a
 * bar when they're a lane of their own (the beat's Demucs parts), else the
 * whole beat for its last beat.
 */
function buildUpTo(draft: Draft, at: number) {
  const bar = draft.bar;
  if (at < 4 * bar) return false;
  const backing = [...draft.lanes.values()].filter((l) => isBacking(l.kind));
  if (!backing.length) return false;
  const drums = backing.filter((l) => l.kind === "drums");
  const cutFrom = drums.length ? at - bar : at - draft.beat;
  const dip = drums.length ? 0 : 0.15;
  for (const lane of backing) {
    const cut = drums.length ? lane.kind === "drums" : true;
    const filter = [
      { t: at - 4 * bar, v: 0.3 },
      { t: at - 0.02, v: 0.85 },
      { t: at, v: 1 },
    ];
    const volume = cut
      ? [
          { t: 0, v: 1 },
          { t: cutFrom - 0.03, v: 1 },
          { t: cutFrom, v: dip },
          { t: at - 0.02, v: dip },
          { t: at, v: 1 },
        ]
      : lane.automation.volume;
    draft.patch(lane.laneId, { automation: { ...lane.automation, filter, ...(volume ? { volume } : {}) } });
  }
  draft.lines.push(
    `Build-up: the beat opens up over the 4 bars before bar ${Math.round(at / bar) + 1}`,
    drums.length ? "The drums drop out for the last bar, then slam back in" : "The beat cuts out for one beat, then everything hits at once"
  );
  return true;
}

/** The beat's last full 8 (or 4) bars, looped until the vocal has finished, then the beat's own ending. */
function extendBeat(draft: Draft, structure: BeatStructure) {
  const session = draft.session;
  if (!session.beat || !session.vocal) return false;
  const beat = draft.lane(session.beat.laneId);
  const vocal = draft.lane(session.vocal.laneId);
  if (beat.clips?.length) return false;
  const bar = draft.bar;
  const target = endOf(vocal) + 2 * bar;
  const needed = (target - beat.offsetSeconds) * beat.tempoRatio;
  if (needed <= beat.originalDuration + 0.5) return false;
  const loopBars = structure.endBar >= 16 ? 8 : 4;
  if (structure.endBar <= loopBars) return false;
  const loopFrom = structure.grid.time(structure.downbeat + 4 * (structure.endBar - loopBars));
  const loopTo = structure.grid.time(structure.downbeat + 4 * structure.endBar);
  if (!(loopFrom > 0 && loopTo > loopFrom && loopTo <= beat.originalDuration)) return false;
  const clips: LaneClip[] = [{ from: 0, to: loopTo, at: 0 }];
  const tail = beat.originalDuration - loopTo;
  let at = loopTo;
  let repeats = 0;
  while (at + tail < needed && repeats < 24) {
    clips.push({ from: loopFrom, to: loopTo, at });
    at += loopTo - loopFrom;
    repeats++;
  }
  if (tail > 0.05) clips.push({ from: loopTo, to: beat.originalDuration, at });
  draft.patch(beat.laneId, { clips });
  draft.lines.push(`The beat's last ${loopBars} bars looped ${repeats}× so it lasts as long as the vocal`);
  return true;
}

/** The keys the vocal and beat sound in now. */
function keysNow(pair: PairContext, vocal: StudioLane, beat: StudioLane) {
  return {
    vocalKey: effectiveKey(vocal) ?? transposeKey(pair.vocalAnalysis.key, vocal.pitchSemitones),
    beatKey: effectiveKey(beat) ?? transposeKey(pair.beatAnalysis.key, beat.pitchSemitones),
  };
}

/** Shifts the vocal to the beat's key when they clash. */
function fixKey(draft: Draft) {
  const { pair, vocal, beat } = draft.session;
  if (!pair || !vocal || !beat) return null;
  const v = draft.lane(vocal.laneId);
  const { vocalKey, beatKey } = keysNow(pair, v, draft.lane(beat.laneId));
  const fit = keyFit(vocalKey, beatKey);
  if (fit !== "far" && fit !== "clash") return null;
  const shift = bestKeyShift(vocalKey, beatKey).semitones;
  if (!shift) return null;
  const pitch = v.pitchSemitones + shift;
  draft.patch(v.laneId, { pitchSemitones: pitch });
  draft.lines.push(`Vocal pitch ${st(pitch)} → sings in ${keyLabel(transposeKey(vocalKey, shift))}, which fits the beat's ${keyLabel(beatKey)}`);
  return { shift, vocalKey, beatKey, fit };
}

// --- Sound engineer: the mix ------------------------------------------------------------

/** How far above the beat a balanced vocal sits (about 1 dB). */
const VOCAL_LIFT = 1.12;

/** Loudness-matched levels: the beat at 85% for headroom, vocals riding ~1 dB above it. */
function balancedLevels(session: Session): Map<string, number> {
  const levels = new Map<string, number>();
  const ref =
    (session.beat && session.analyses.get(session.beat.laneId)?.loudness ? session.beat : null) ??
    session.lanes.find((l) => isBacking(l.kind) && (session.analyses.get(l.laneId)?.loudness ?? 0) > 0) ??
    session.lanes.find((l) => (session.analyses.get(l.laneId)?.loudness ?? 0) > 0);
  const refLoudness = ref ? session.analyses.get(ref.laneId)!.loudness : 0;
  for (const lane of session.lanes) {
    const loudness = session.analyses.get(lane.laneId)?.loudness ?? 0;
    if (!ref || loudness <= 0) {
      levels.set(lane.laneId, lane.volume);
      continue;
    }
    const lift = lane.kind === "vocals" && isBacking(ref.kind) ? VOCAL_LIFT : 1;
    // Drums, bass and melody parts sit under the full beat, not level with it.
    const part = lane.kind !== "vocals" && lane.kind !== "beat" && ref.kind === "beat" ? 0.8 : 1;
    levels.set(lane.laneId, lane.laneId === ref.laneId ? 0.85 : (0.85 * lift * part * refLoudness) / loudness);
  }
  // A very quiet stem can't be turned up past 150%: turn everything else
  // down with it instead, so the balance still holds.
  const loudest = Math.max(...levels.values());
  const scale = loudest > 1.5 ? 1.5 / loudest : 1;
  for (const [id, volume] of levels) levels.set(id, Math.round(Math.min(1.5, Math.max(0.08, volume * scale)) * 100) / 100);
  return levels;
}

/** An effect rack in words, for the "what changes" list. */
export function describeFx(fx: LaneFx) {
  const parts: string[] = [];
  if (fx.highpass > 25) parts.push(`high-pass ${Math.round(fx.highpass)} Hz`);
  if (fx.lowpass < 19000) parts.push(`low-pass ${(fx.lowpass / 1000).toFixed(1)} kHz`);
  if (fx.compress) parts.push("compressor");
  for (const [k, label] of [
    ["eqLow", "lows"],
    ["eqMid", "mids"],
    ["eqHigh", "highs"],
  ] as const) {
    if (fx[k]) parts.push(`${label} ${fx[k] > 0 ? "+" : ""}${fx[k]} dB`);
  }
  if (fx.drive) parts.push(`drive ${Math.round(fx.drive * 100)}%`);
  if (fx.width) parts.push(`wide ${Math.round(fx.width * 100)}%`);
  if (fx.reverb) parts.push(`reverb ${Math.round(fx.reverb * 100)}% (${fx.reverbSize}s)`);
  if (fx.delay) parts.push(`${fx.delayDivision} delay ${Math.round(fx.delay * 100)}%`);
  if (fx.duck) parts.push(`ducks ${Math.round(fx.duck * 100)}% under the vocal`);
  if (Math.abs(fx.pan) > 0.01) parts.push(`pan ${fx.pan < 0 ? "L" : "R"}${Math.round(Math.abs(fx.pan) * 100)}`);
  if (fx.fadeIn) parts.push(`fade in ${fx.fadeIn}s`);
  if (fx.fadeOut) parts.push(`fade out ${fx.fadeOut}s`);
  return parts.length ? parts.join(", ") : "flat";
}

type MixId = "balanced" | "upfront" | "wide" | "lofi" | "punch" | "echo";

type MixRecipe = {
  id: MixId;
  icon: string;
  title: string;
  short: string;
  why: string;
  vibes: Vibe[];
  vocalDb: number;
  vocal: Partial<LaneFx>;
  backing: Partial<LaneFx>;
};

const MIXES: MixRecipe[] = [
  {
    id: "balanced",
    icon: "⚖️",
    title: "Clean & balanced",
    short: "Clear vocal, even volumes",
    why: "Separated vocals and beats come out at very different volumes, and the vocal is thin and dry. This evens the volumes, cleans the vocal's rumble, adds presence and a little room, and makes a pocket in the beat for the voice.",
    vibes: ["radio", "any"],
    vocalDb: 0,
    vocal: { highpass: 110, compress: true, eqMid: 1.5, eqHigh: 3, reverb: 0.14, reverbSize: 1.6 },
    backing: { eqMid: -2.5, duck: 0.2, fadeOut: 4 },
  },
  {
    id: "upfront",
    icon: "🎤",
    title: "Vocal upfront",
    short: "Voice leads, beat pumps under it",
    why: "For rap and pop: the voice leads. The beat dips a little every time the vocal sings, so every word cuts through.",
    vibes: ["hard", "short"],
    vocalDb: 2.5,
    vocal: { highpass: 120, compress: true, eqMid: 2, eqHigh: 4, drive: 0.08, reverb: 0.1, delay: 0.16, delayDivision: "1/8", delayFeedback: 0.22 },
    backing: { duck: 0.45, eqMid: -3.5, fadeOut: 4 },
  },
  {
    id: "wide",
    icon: "🌌",
    title: "Big & spacious",
    short: "Wide vocal, long echoes",
    why: "For slower songs and big choruses: a wide doubled vocal, a long echo and a hall, over a beat with a little more weight and air.",
    vibes: ["chill", "club"],
    vocalDb: 0,
    vocal: { highpass: 110, compress: true, width: 0.55, reverb: 0.32, reverbSize: 3.2, delay: 0.2, delayDivision: "1/4.", delayFeedback: 0.4, eqHigh: 2.5 },
    backing: { eqLow: 1.5, eqMid: -1.5, eqHigh: 1.5, duck: 0.15, fadeOut: 6 },
  },
  {
    id: "lofi",
    icon: "📼",
    title: "Lo-fi tape",
    short: "Warm, dusty, old-record feel",
    why: "Rolls off the top and bottom and adds warmth to both, so two recordings from different eras sound like one dusty record.",
    vibes: ["lofi", "chill"],
    vocalDb: -1,
    vocal: { highpass: 220, lowpass: 7000, drive: 0.25, compress: true, reverb: 0.22, reverbSize: 2.4 },
    backing: { highpass: 50, lowpass: 6000, drive: 0.4, eqLow: 2, fadeIn: 2, fadeOut: 5 },
  },
  {
    id: "punch",
    icon: "🥊",
    title: "Punchy & loud",
    short: "Hard-hitting beat, bright vocal",
    why: "For club and trap: tight low end and more snap on the beat, a bright, slightly driven vocal with almost no reverb, so it all hits hard.",
    vibes: ["club", "hard"],
    vocalDb: 1,
    vocal: { highpass: 120, compress: true, eqHigh: 3, drive: 0.12, reverb: 0.08 },
    backing: { highpass: 28, eqLow: 3, eqMid: -1.5, eqHigh: 1.5, drive: 0.15, duck: 0.25 },
  },
  {
    id: "echo",
    icon: "🔁",
    title: "Echo-out ending",
    short: "Last word trails into space",
    why: "A long echo on the vocal and slow fades at both ends, so the song floats out instead of stopping dead.",
    vibes: ["chill", "radio"],
    vocalDb: 0,
    vocal: { highpass: 110, compress: true, delay: 0.3, delayDivision: "1/4.", delayFeedback: 0.5, reverb: 0.2, reverbSize: 2.6, fadeOut: 6 },
    backing: { fadeIn: 1.5, fadeOut: 8 },
  },
];

const mix = (id: MixId) => MIXES.find((m) => m.id === id)!;

function applyMix(draft: Draft, levels: Map<string, number>, recipe: Pick<MixRecipe, "vocalDb" | "vocal" | "backing">) {
  let vocalIndex = 0;
  for (const lane of draft.lanes.values()) {
    const vocal = lane.kind === "vocals";
    const fx: LaneFx = { ...DEFAULT_FX, ...(vocal ? recipe.vocal : recipe.backing) };
    // A second or third vocal (a harmony, a double) sits either side of the lead.
    if (vocal && vocalIndex > 0) fx.pan = vocalIndex % 2 ? 0.25 : -0.25;
    if (vocal) vocalIndex++;
    // Nothing to duck under without a vocal.
    if (!vocal && !draft.session.vocal) fx.duck = 0;
    const base = levels.get(lane.laneId) ?? lane.volume;
    const volume = Math.round(Math.min(1.5, base * 10 ** ((vocal ? recipe.vocalDb : 0) / 20)) * 100) / 100;
    draft.patch(lane.laneId, { volume, fx });
    draft.lines.push(`${lane.trackTitle}: volume ${Math.round(volume * 100)}% · ${describeFx(fx)}`);
  }
}

/** Sets each lane's volume to `levels`, nothing else. False if none changed. */
function applyLevels(draft: Draft, levels: Map<string, number>) {
  let changed = false;
  for (const lane of draft.lanes.values()) {
    const volume = levels.get(lane.laneId);
    if (volume === undefined || Math.abs(volume - lane.volume) < 0.005) continue;
    draft.patch(lane.laneId, { volume });
    draft.lines.push(`${lane.trackTitle}: volume ${Math.round(lane.volume * 100)}% → ${Math.round(volume * 100)}%`);
    changed = true;
  }
  return changed;
}

// --- The ideas --------------------------------------------------------------------------

function vocalListen(draft: Draft) {
  const vocal = draft.session.vocal && draft.lane(draft.session.vocal.laneId);
  return vocal ? Math.max(0, entryOf(vocal) - draft.bar) : 0;
}

/** What the Mix check can fix, each on its own or together. */
export type FixId = "sync" | "key" | "length" | "balance";

export const ALL_FIXES: FixId[] = ["sync", "length", "key", "balance"];

const FIX_WORDS: Record<FixId, string> = {
  sync: "speeds matched, every line on the beat",
  length: "ending fixed",
  key: "key fixed",
  balance: "volumes evened",
};

/**
 * The fixes in `wants`, all worked out together in one go — so fixing the
 * ending never undoes the timing, and so on: timing first (the chorus on
 * the drop too, with `onDrop`), then the ending, the key and the mix.
 */
function fixMix(session: Session, wants: Set<FixId>, { onDrop = false }: { onDrop?: boolean } = {}) {
  const draft = new Draft(session);
  const { pair, drop } = session;
  const done: string[] = [];
  let dropAt: number | null = null;
  if (pair && wants.has("sync")) {
    let placed = false;
    if (onDrop && drop?.kind === "drop" && findChorus(pair).confident && arrangeOnDrop(draft, drop)) {
      placed = true;
      dropAt = beatBarTime(draft, drop.bar);
    }
    if (!placed) {
      try {
        arrange(draft, { tempo: gentlestTempo(pair), structure: "as-sung" });
        placed = true;
      } catch {
        // Leave the timing as it is; the rest can still be fixed.
      }
    }
    if (placed) done.push(dropAt !== null ? "speeds matched, every line on the beat, chorus on the drop" : FIX_WORDS.sync);
  }
  if (wants.has("length") && ((pair && extendBeat(draft, pair.structure)) || tightenOutro(draft))) done.push(FIX_WORDS.length);
  if (wants.has("key") && fixKey(draft)) done.push(FIX_WORDS.key);
  // Volumes only: fixing the mix never puts effects on anything — those
  // are the person's choice (Sound, Fine-tune).
  if (wants.has("balance") && applyLevels(draft, balancedLevels(session))) done.push(FIX_WORDS.balance);
  return { draft, done, dropAt };
}

/** The fixes this mix has anything to do for. */
export function availableFixes(session: Session): Set<FixId> {
  return new Set(ALL_FIXES.filter((fix) => fixMix(session, new Set([fix])).done.length > 0));
}

/** The fixes an idea being tried already makes (Make it sound good makes them all). */
export function fixesOf(idea: Idea): FixId[] {
  if (idea.id === AUTO_ID) return ALL_FIXES;
  return idea.id.startsWith("fix:") ? (idea.id.slice(4).split("+") as FixId[]) : [];
}

/** The Mix check's fixes as one idea (null if none of them has anything to do). */
export function mixFix(session: Session, wants: FixId[]): Idea | null {
  const set = new Set(wants);
  const { draft, done } = fixMix(session, set);
  if (draft.empty || !done.length) return null;
  const ids = ALL_FIXES.filter((f) => set.has(f));
  return draft.idea({
    id: `fix:${ids.join("+")}`,
    kind: "fix",
    role: "engineer",
    icon: "🩺",
    title: ids.length === 1 ? `Fix: ${FIX_WORDS[ids[0]]}` : `${ids.length} fixes`,
    short: done.join(" · "),
    why: "The Mix check's fixes, worked out together so none undoes another.",
    listenAt: vocalListen(draft),
  });
}

const AUTO_ID = "auto-good";

/**
 * The one button: speeds matched and every line on the beat (the chorus
 * on the drop when there is one), the ending fixed, keys fixed and the
 * volumes evened — no effects added.
 */
function makeItGood(session: Session): Idea | null {
  const { draft, done, dropAt } = fixMix(session, new Set(ALL_FIXES), { onDrop: true });
  if (draft.empty) return null;
  return draft.idea({
    id: AUTO_ID,
    kind: "auto",
    role: "engineer",
    icon: "✨",
    title: "Make it sound good",
    short: done.join(" · "),
    why: "Fixes what usually makes a vocal over a different beat hard to listen to — different speeds, lines that miss the beat, clashing keys and uneven volumes — all at once.",
    listenAt: dropAt !== null ? Math.max(0, dropAt - 4 * draft.bar) : vocalListen(draft),
  });
}

/**
 * The session with the beat swapped for its own drums, bass and melody —
 * lanes already in the mix, or the library's parts lined up exactly where
 * the beat is (`change` says which). Null when there are none.
 */
function withParts(session: Session): { session: Session; change?: LaneChange } | null {
  if (session.lanes.some((l) => l.kind === "drums" || l.kind === "bass")) return { session };
  const beat = session.beat;
  if (!beat || beat.kind !== "beat" || !session.beatParts.length) return null;
  if (!session.lanes.some((l) => l.laneId === beat.laneId)) return null;
  const parts = session.beatParts.map((stem) =>
    normaliseLane({
      ...laneFromStem(stem, `${beat.laneId}~${stem.kind}`),
      bpm: beat.bpm,
      musicalKey: beat.musicalKey,
      pitchSemitones: beat.pitchSemitones,
      tempoRatio: beat.tempoRatio,
      offsetSeconds: beat.offsetSeconds,
      volume: beat.volume,
      fx: { ...beat.fx },
      clips: beat.clips?.map((c) => ({ ...c })) ?? null,
      automation: { ...beat.automation },
    })
  );
  const lanes = session.lanes.flatMap((l) => (l.laneId === beat.laneId ? parts : [l]));
  return {
    session: { ...session, lanes, beat: parts.find((p) => p.kind === "drums") ?? parts[0], signature: mixSignature(lanes) },
    change: { add: parts, remove: [beat.laneId] },
  };
}

type Remix = { id: string; icon: string; structure: Structure; title: string; short: string; why: (pair: PairContext) => string; vibes: Vibe[]; stutter?: boolean };

const REMIXES: Remix[] = [
  {
    id: "radio",
    icon: "📻",
    structure: "as-sung",
    title: "Original order",
    short: "The vocal as sung, on the beat",
    why: (pair) => `The vocal in its own order, coming in after the beat's ${pair.structure.introBars}-bar intro, with every line on the beat's bars. The safest, most natural fit.`,
    vibes: ["radio", "any"],
  },
  {
    id: "hook-first",
    icon: "🪝",
    structure: "chorus-first",
    title: "Chorus first",
    short: "Open on the hook",
    why: () => "Start with the chorus so it grabs you in the first seconds — how DJ edits and short clips start — with a stutter to announce it.",
    vibes: ["short", "club"],
    stutter: true,
  },
  {
    id: "short",
    icon: "⏱",
    structure: "short",
    title: "Short version",
    short: "One verse, chorus twice",
    why: () => "One verse and the chorus twice: the length for Reels, TikTok and Shorts.",
    vibes: ["short"],
  },
  {
    id: "extended",
    icon: "🔄",
    structure: "fill",
    title: "Extended",
    short: "Chorus keeps coming back",
    why: (pair) => `The whole vocal, then the chorus keeps coming back with breaks between, for all ${pair.structure.endBar} bars of the beat.`,
    vibes: ["club"],
  },
  {
    id: "chops",
    icon: "✂️",
    structure: "hook",
    title: "Chorus chops",
    short: "Only the hook, looped",
    why: () => "Only the chorus, looping with breaks for the beat to breathe — the bootleg style, great over a strong beat.",
    vibes: ["hard", "club"],
  },
];

function arrangementIdeas(session: Session): Idea[] {
  const pair = session.pair!;
  const tempo = gentlestTempo(pair);
  const seen = new Set<string>();
  const ideas: Idea[] = [];
  for (const r of REMIXES) {
    const draft = new Draft(session);
    try {
      const signature = arrange(draft, { tempo, structure: r.structure });
      if (seen.has(signature)) continue;
      seen.add(signature);
      if (r.stutter) stutterAt(draft);
      ideas.push(draft.idea({ id: `remixer-${r.id}`, role: "remixer", icon: r.icon, title: r.title, short: r.short, why: r.why(pair), vibes: r.vibes, listenAt: vocalListen(draft) }));
    } catch {
      // That shape doesn't work for this vocal; the others still might.
    }
  }

  // The other ways to agree on a tempo.
  const choices: { choice: TempoChoice; title: string; short: string }[] = [
    { choice: "beat", title: "Keep the beat's speed", short: "The vocal speeds up or slows down" },
    { choice: "vocal", title: "Keep the vocal's speed", short: "The beat follows the singer" },
    { choice: "middle", title: "Meet in the middle", short: "Both bend half as much" },
  ];
  for (const { choice, title, short } of choices) {
    if (choice === tempo) continue;
    const t = pair.tempos[choice];
    if (choice === "middle" && Math.abs(Math.log(t.beatRatio)) < 0.015) continue;
    const draft = new Draft(session);
    try {
      arrange(draft, { tempo: choice, structure: "as-sung" });
      ideas.push(
        draft.idea({
          id: `beatmaker-tempo-${choice}`,
          role: "beatmaker",
          icon: "⏱",
          title: `${title} (${t.projectBpm.toFixed(0)} BPM)`,
          short,
          why: `Beat ${pct(t.beatRatio)}, vocal ${pct(t.vocalRatio)} speed — the pitch doesn't change. ${
            choice === "vocal" ? "Keeps the singer's natural flow; the beat bends instead." : choice === "middle" ? "Both bend half as much — often the least noticeable." : "The beat's feel stays untouched."
          }`,
          vibes: choice === "middle" ? ["chill"] : [],
          listenAt: vocalListen(draft),
        })
      );
    } catch {
      // Skip a tempo that can't be arranged.
    }
  }
  return ideas;
}

type FullRecipe = {
  id: string;
  icon: string;
  vibe: Vibe;
  title: string;
  short: string;
  why: string;
  structure: Structure;
  /** Put the chorus on the beat's drop (when it has a clear one) instead of `structure`. */
  onDrop?: boolean;
  tempo?: TempoChoice;
  mix: MixId;
  stutter?: boolean;
  filter?: boolean;
  buildUp?: boolean;
  swell?: boolean;
  extend?: boolean;
};

const FULL_REMIXES: FullRecipe[] = [
  {
    id: "radio",
    icon: "📻",
    vibe: "radio",
    title: "Radio",
    short: "Clean, natural, ready to share",
    why: "The vocal in its own order on the beat's bars, keys fixed, volumes evened and the beat looped if the vocal is longer — clean and ready to publish.",
    structure: "as-sung",
    mix: "balanced",
    extend: true,
  },
  {
    id: "club",
    icon: "🪩",
    vibe: "club",
    title: "Club",
    short: "Build-up, chorus on the drop",
    why: "A build-up into the beat's drop with the chorus landing right on it, punchy low end, and the beat running as long as the vocal — made for a dancefloor.",
    structure: "fill",
    onDrop: true,
    mix: "punch",
    buildUp: true,
    extend: true,
  },
  {
    id: "short",
    icon: "📱",
    vibe: "short",
    title: "TikTok cut",
    short: "Under a minute, hook twice",
    why: "A stutter, one verse and the hook twice, with the vocal upfront and the beat pumping under it — the length for short videos.",
    structure: "short",
    mix: "upfront",
    stutter: true,
  },
  {
    id: "lofi",
    icon: "📼",
    vibe: "lofi",
    title: "Lo-fi",
    short: "Slower, warm, dusty",
    why: "Both meet half-way in speed, rolled off and warmed up like one old record, with a muffled intro that opens up.",
    structure: "as-sung",
    tempo: "middle",
    mix: "lofi",
    filter: true,
  },
  {
    id: "chill",
    icon: "🌙",
    vibe: "chill",
    title: "Chill",
    short: "Spacious, floating, late-night",
    why: "Lines close together, a wide spacious vocal, a reversed swell into the first line and the beat lasting as long as the vocal.",
    structure: "tight",
    mix: "wide",
    swell: true,
    extend: true,
  },
  {
    id: "hard",
    icon: "🔥",
    vibe: "hard",
    title: "Hard bootleg",
    short: "Chopped hook, heavy beat",
    why: "Only the hook, chopped and stuttered over the beat, the vocal driven and upfront with the beat pumping — the bootleg way.",
    structure: "hook",
    mix: "upfront",
    stutter: true,
  },
  {
    id: "festival",
    icon: "🎆",
    vibe: "club",
    title: "Festival",
    short: "Huge build, huge drop",
    why: "A long build-up into the drop, the chorus landing on it with a stutter, a huge wide vocal, and the beat running as long as the vocal.",
    structure: "chorus-first",
    onDrop: true,
    mix: "wide",
    buildUp: true,
    stutter: true,
    extend: true,
  },
];

function fullRemixIdeas(session: Session): Idea[] {
  const { pair, drop } = session;
  if (!pair) return [];
  const levels = balancedLevels(session);
  const ideas: Idea[] = [];
  for (const r of FULL_REMIXES) {
    const draft = new Draft(session);
    const tempo = r.tempo ?? gentlestTempo(pair);
    const onDrop = !!(r.onDrop && drop?.kind === "drop" && arrangeOnDrop(draft, drop, tempo));
    if (!onDrop) {
      try {
        arrange(draft, { tempo, structure: r.structure });
      } catch {
        continue;
      }
    }
    const dropAt = onDrop ? beatBarTime(draft, drop!.bar) : null;
    if (r.stutter) stutterAt(draft, dropAt ?? undefined);
    if (r.swell) reverseSwell(draft);
    if (r.extend) extendBeat(draft, pair.structure);
    if (r.buildUp && dropAt !== null) buildUpTo(draft, dropAt);
    else if (r.filter || r.buildUp) filterBuild(draft);
    fixKey(draft);
    applyMix(draft, levels, mix(r.mix));
    ideas.push(
      draft.idea({
        id: `full-${r.id}`,
        kind: "full",
        role: "remixer",
        icon: r.icon,
        title: r.title,
        short: r.short,
        why: r.why,
        vibes: [r.vibe],
        listenAt: dropAt !== null ? Math.max(0, dropAt - 4 * draft.bar) : vocalListen(draft),
      })
    );
  }
  return ideas;
}

/**
 * Moments that make a remix: the chorus landing on the beat's drop, a
 * build-up into it, drops and breakdowns with the beat's own drums and
 * bass (when Demucs's parts are lanes), stutters and swells.
 */
function momentIdeas(session: Session): Idea[] {
  const ideas: Idea[] = [];
  const { pair, drop } = session;
  if (pair && drop) {
    const label = drop.kind === "drop" ? "drop" : "loudest part";
    const onDrop = new Draft(session);
    if (arrangeOnDrop(onDrop, drop)) {
      const at = beatBarTime(onDrop, drop.bar);
      ideas.push(
        onDrop.idea({
          id: "moment-chorus-drop",
          kind: "moment",
          role: "remixer",
          icon: "🎯",
          title: `Chorus on the ${label}`,
          short: "The hook lands as the beat hits",
          why: `The beat's biggest moment is at bar ${drop.bar + 1}. Moving the vocal so its chorus starts right there makes both hit at once — the moment a remix is remembered for.`,
          vibes: ["club", "radio"],
          listenAt: Math.max(0, at - 2 * onDrop.bar),
        })
      );

      const big = new Draft(session);
      arrangeOnDrop(big, drop);
      const bigAt = beatBarTime(big, drop.bar);
      buildUpTo(big, bigAt);
      stutterAt(big, bigAt);
      ideas.push(
        big.idea({
          id: "moment-big-drop",
          kind: "moment",
          role: "beatmaker",
          icon: "💥",
          title: "The big drop",
          short: "Build-up, cut, chorus slams in",
          why: "A build-up rises for four bars, the beat cuts out, and the chorus slams in with a stutter right on the drop — the most exciting moment you can give a remix.",
          vibes: ["club", "hard"],
          listenAt: Math.max(0, bigAt - 5 * big.bar),
        })
      );
    }

    // With the beat's own drums, the build-up cuts just the drums.
    const withDrums = withParts(session);
    const build = new Draft(withDrums?.session ?? session);
    const at = beatBarTime(build, drop.bar);
    if (buildUpTo(build, at)) {
      ideas.push(
        build.idea({
          id: "moment-build",
          kind: "moment",
          role: "beatmaker",
          icon: "📈",
          title: `Build-up into the ${label}`,
          short: "Tension, then release",
          why: `Keeps everything where it is and adds tension before the beat's ${label} at bar ${drop.bar + 1}: the sound opens up, cuts out, then hits.`,
          vibes: ["club"],
          listenAt: Math.max(0, at - 5 * build.bar),
          lanes: withDrums?.change,
        })
      );
    }
  }

  const lead = session.vocal;
  if (lead) {
    const stutter = new Draft(session);
    if (stutterAt(stutter)) {
      ideas.push(stutter.idea({ id: "moment-stutter", kind: "moment", role: "remixer", icon: "🔂", title: "Stutter the first word", short: "“I-I-I-I want…”", why: "Repeats the first half-beat of the vocal four times as it comes in — a classic remix trick that announces the voice.", vibes: ["short", "hard"], listenAt: Math.max(0, entryOf(lead) - stutter.bar) }));
    }
    const swell = new Draft(session);
    if (reverseSwell(swell)) {
      ideas.push(swell.idea({ id: "moment-swell", kind: "moment", role: "remixer", icon: "🌊", title: "Reverse swell", short: "A whoosh into the first line", why: "The vocal's first bar played backwards, rising into its first word — a sucked-in whoosh that sets up the entrance.", vibes: ["chill", "club"], listenAt: Math.max(0, entryOf(lead) - 2 * swell.bar) }));
    }
  }
  const filter = new Draft(session);
  if (filterBuild(filter)) {
    ideas.push(filter.idea({ id: "moment-filter", kind: "moment", role: "beatmaker", icon: "🌫", title: "Muffled intro", short: "The beat opens up as the vocal lands", why: "The beat starts muffled, like from the next room, and opens up just as the vocal comes in.", vibes: ["club", "lofi"], listenAt: 0 }));
  }
  return [...ideas, ...partIdeas(session), ...dynamicsIdeas(session)];
}

/** A lane's audio switched off between `from` and `to` (seconds), and back on after. */
function gap(from: number, to: number, step = 0.03): AutoPoint[] {
  return [...(from > step ? [{ t: 0, v: 1 }, { t: from - step, v: 1 }] : []), { t: Math.max(0, from), v: 0 }, { t: to - step, v: 0 }, { t: to, v: 1 }];
}

/**
 * Arrangement moves made with volume and filter alone: the beat dropping
 * out under the first line, one beat handing over to another, the verses
 * held back so the chorus lifts.
 */
function dynamicsIdeas(session: Session): Idea[] {
  const ideas: Idea[] = [];
  const lead = session.vocal;
  const lanes = session.lanes;
  const backing = lanes.filter((l) => isBacking(l.kind));
  if (!lead || !backing.length) return ideas;
  const bar = beatLength(session.projectBpm) * 4;
  const entry = entryOf(lead);
  const end = endOf(lead);

  // Acapella: the beat drops out for the vocal's first two bars, then crashes in.
  {
    const draft = new Draft(session);
    for (const lane of backing) draft.patch(lane.laneId, { automation: { ...lane.automation, volume: gap(entry, entry + 2 * bar) } });
    draft.lines.push(`The beat stops for the first 2 bars of singing (from bar ${Math.round(entry / bar) + 1}), then comes back in`);
    ideas.push(draft.idea({ id: "moment-acapella", kind: "moment", role: "remixer", icon: "🎙", title: "Acapella moment", short: "Voice alone, then the beat crashes in", why: "Letting the first line be heard on its own makes everyone listen — and the beat landing after it feels huge.", vibes: ["radio", "hard", "short"], listenAt: Math.max(0, entry - bar) }));
  }

  // Beat switch: two full beats at the same speed — the second takes over halfway.
  const beats = backing.filter((l) => l.kind === "beat" && l.bpm);
  if (beats.length >= 2) {
    const [a, b] = beats;
    const speed = (l: StudioLane) => l.bpm! * l.tempoRatio;
    if (Math.abs(Math.log(speed(a) / speed(b))) < 0.015 && end - entry > 16 * bar) {
      const at = entry + Math.max(8, Math.round((end - entry) / 2 / (8 * bar)) * 8) * bar;
      const draft = new Draft(session);
      draft.patch(a.laneId, { automation: { ...a.automation, volume: [{ t: 0, v: 1 }, { t: at - 0.03, v: 1 }, { t: at, v: 0 }] } });
      draft.patch(b.laneId, { automation: { ...b.automation, volume: [{ t: 0, v: 0 }, { t: at - 0.03, v: 0 }, { t: at, v: 1 }] } });
      draft.lines.push(`“${a.trackTitle}” until bar ${Math.round(at / bar) + 1}, then “${b.trackTitle}” takes over`);
      ideas.push(draft.idea({ id: "moment-beat-switch", kind: "moment", role: "beatmaker", icon: "🔀", title: "Beat switch", short: "A new beat takes over halfway", why: "Halfway through, the second beat takes over under the same vocal — the switch-up that makes people replay a track.", vibes: ["hard", "club"], listenAt: Math.max(0, at - 2 * bar) }));
    }
  }

  // Verses held back, chorus opens up — from the clips' names.
  const chorus = clipsOf(lead)
    .filter((c) => c.label === "Chorus")
    .map((c) => [clipStart(lead, c), clipEnd(lead, c)] as const)
    .sort((x, y) => x[0] - y[0])
    .reduce<[number, number][]>((spans, [s, e]) => {
      const last = spans[spans.length - 1];
      if (last && s - last[1] < bar) last[1] = Math.max(last[1], e);
      else spans.push([s, e]);
      return spans;
    }, []);
  if (chorus.length && chorus.length < 8) {
    const draft = new Draft(session);
    const held = { volume: 0.8, filter: 0.7 };
    for (const lane of backing) {
      const volume: AutoPoint[] = [{ t: 0, v: held.volume }];
      const filter: AutoPoint[] = [{ t: 0, v: held.filter }];
      for (const [s, e] of chorus) {
        volume.push({ t: Math.max(0, s - 0.05), v: held.volume }, { t: s, v: 1 }, { t: e, v: 1 }, { t: e + 0.05, v: held.volume });
        filter.push({ t: Math.max(0, s - bar), v: held.filter }, { t: s, v: 1 }, { t: e, v: 1 }, { t: e + 0.05, v: held.filter });
      }
      draft.patch(lane.laneId, { automation: { ...lane.automation, volume, filter } });
    }
    draft.lines.push(`The beat sits back a little in the verses and opens up fully on ${chorus.length === 1 ? "the chorus" : `all ${chorus.length} choruses`}`);
    ideas.push(draft.idea({ id: "moment-dynamics", kind: "moment", role: "engineer", icon: "📶", title: "Chorus lift", short: "Verses sit back, choruses open up", why: "A song that's the same loudness all the way through gets tiring. Holding the beat back in the verses makes every chorus feel like a lift.", vibes: ["radio", "club", "chill"], listenAt: Math.max(0, chorus[0][0] - 2 * bar) }));
  }
  return ideas;
}

/** Drops and breakdowns, made with the beat's own drums and bass (Demucs's parts) when they're lanes of the mix. */
function partIdeas(base: Session): Idea[] {
  const parts = withParts(base);
  if (!parts) return [];
  const { session, change: lanes } = parts;
  const lead = session.vocal ?? session.lanes.find((l) => l.kind === "vocals");
  const drums = session.lanes.filter((l) => l.kind === "drums");
  const bass = session.lanes.filter((l) => l.kind === "bass");
  if (!lead || (!drums.length && !bass.length)) return [];
  const bar = beatLength(session.projectBpm) * 4;
  const entry = entryOf(lead);
  const end = endOf(lead);
  const step = 0.03;
  const ideas: Idea[] = [];
  const silence = (lanes: StudioLane[], from: number, to: number, draft: Draft) => {
    for (const lane of lanes) {
      const points = [...(from > step ? [{ t: 0, v: 1 }, { t: from - step, v: 1 }] : []), { t: Math.max(0, from), v: 0 }, { t: to - step, v: 0 }, { t: to, v: 1 }];
      draft.patch(lane.laneId, { automation: { ...lane.automation, volume: points } });
    }
  };

  // The moment to build towards: the beat's own drop when it has one,
  // else where the vocal comes in.
  const dropAt = session.pair && session.drop?.kind === "drop" ? beatBarTime(new Draft(session), session.drop.bar) : null;
  const moment = dropAt !== null && dropAt >= 3 * bar ? dropAt : entry;
  const what = moment === dropAt ? "the drop" : "the vocal";
  const atBar = Math.round(moment / bar) + 1;

  if (drums.length && moment >= 3 * bar) {
    const draft = new Draft(session);
    silence(drums, moment - 2 * bar, moment, draft);
    draft.lines.push(`Drums out for the 2 bars before ${what} (bar ${atBar}), slamming back in with it`);
    ideas.push(draft.idea({ id: "parts-drop", kind: "moment", role: "beatmaker", icon: "🥁", title: "Drum drop", short: "Drums vanish, then slam back", why: `Pull the drums for two bars and ${what} hits twice as hard when they come back.`, vibes: ["club", "hard"], listenAt: Math.max(0, moment - 4 * bar), lanes }));
  }
  if (moment >= 2 * bar) {
    const draft = new Draft(session);
    silence([...drums, ...bass], 0, moment, draft);
    draft.lines.push(`Only the melody until ${what} (bar ${atBar}), then drums and bass come in`);
    ideas.push(draft.idea({ id: "parts-intro", kind: "moment", role: "beatmaker", icon: "🎹", title: "Melody-only intro", short: `Drums & bass come in with ${what}`, why: `Start with just the chords and melody, and bring the drums and bass in with ${what} — the song builds instead of starting at full speed.`, vibes: ["radio", "chill"], listenAt: 0, lanes }));
  }
  if (end - entry > 24 * bar) {
    const middle = entry + Math.round((end - entry) / 2 / (8 * bar)) * 8 * bar;
    const draft = new Draft(session);
    silence([...drums, ...bass], middle, middle + 4 * bar, draft);
    draft.lines.push(`Drums and bass out for 4 bars from bar ${Math.round(middle / bar) + 1}`);
    ideas.push(draft.idea({ id: "parts-breakdown", kind: "moment", role: "beatmaker", icon: "🕳", title: "Breakdown", short: "Strip it back halfway through", why: "Just the vocal and melody for four bars halfway through, then everything back in — gives a long remix a second peak.", vibes: ["club", "chill"], listenAt: Math.max(0, middle - 2 * bar), lanes }));
  }
  return ideas;
}

/** Trims a lane so nothing plays after `seconds`. */
function trimAfter(lane: StudioLane, seconds: number): LaneClip[] | null {
  const kept: LaneClip[] = [];
  for (const c of clipsOf(lane)) {
    const start = clipStart(lane, c);
    const end = clipEnd(lane, c);
    if (start >= seconds - 0.05) continue;
    if (end <= seconds) {
      kept.push(c);
      continue;
    }
    const keep = (seconds - start) * lane.tempoRatio * (c.stretch ?? 1);
    kept.push(c.reverse ? { ...c, from: c.to - keep } : { ...c, to: c.from + keep });
  }
  return kept.length ? kept : null;
}

/**
 * Ends the beat 4 bars after the last vocal line when it would otherwise
 * play on for more than 8, fading out. False when it doesn't run long.
 */
function tightenOutro(draft: Draft) {
  const bar = draft.bar;
  const lanes = [...draft.lanes.values()];
  const vocals = lanes.filter((l) => l.kind === "vocals");
  const backing = lanes.filter((l) => isBacking(l.kind));
  if (!vocals.length || !backing.length) return false;
  const beatStart = Math.min(...backing.map(entryOf));
  const beatEnd = Math.max(...backing.map(endOf));
  const vEnd = Math.max(...vocals.map(endOf));
  if (beatEnd - vEnd <= 8 * bar) return false;
  const target = beatStart + Math.ceil((vEnd - beatStart) / bar + 4) * bar;
  let trimmed = false;
  for (const lane of backing) {
    if (endOf(lane) <= target) continue;
    const clips = trimAfter(lane, target);
    if (!clips) continue;
    draft.patch(lane.laneId, { clips, fx: { ...lane.fx, fadeOut: Math.max(lane.fx.fadeOut, 3) } });
    trimmed = true;
  }
  if (trimmed) draft.lines.push(`Beat ends 4 bars after the last vocal line (bar ${Math.round(target / bar) + 1}), fading out`);
  return trimmed;
}

/** Fixes for the mix as it stands — read from where the clips are right now, whoever put them there. */
function fixIdeas(session: Session): Idea[] {
  const ideas: Idea[] = [];
  const bar = beatLength(session.projectBpm) * 4;
  const vocals = session.lanes.filter((l) => l.kind === "vocals");
  const backing = session.lanes.filter((l) => isBacking(l.kind));
  if (!session.lanes.length) return ideas;
  const bars = (seconds: number) => Math.round(seconds / bar);

  // Dead air before anything plays.
  const earliest = Math.min(...session.lanes.map(entryOf));
  if (earliest > 1.5) {
    const draft = new Draft(session);
    for (const lane of draft.lanes.values()) {
      const automation = Object.fromEntries(
        Object.entries(lane.automation).map(([k, points]) => [k, (points as AutoPoint[] | undefined)?.map((p) => ({ ...p, t: Math.max(0, p.t - earliest) }))])
      );
      draft.patch(lane.laneId, { offsetSeconds: lane.offsetSeconds - earliest, automation });
    }
    draft.lines.push(`Every lane ${earliest.toFixed(1)}s earlier, keeping them in step`);
    ideas.push(draft.idea({ id: "fix-start", kind: "fix", role: "remixer", icon: "⏩", title: "Cut the silence at the start", short: `${earliest.toFixed(1)}s of nothing removed`, why: "Nothing plays for the first seconds — listeners skip. Everything moves up together, so nothing falls out of sync.", listenAt: 0 }));
  }

  const lead = session.vocal ?? vocals[0];
  if (lead && backing.length) {
    const beatStart = Math.min(...backing.map(entryOf));
    const beatEnd = Math.max(...backing.map(endOf));
    const vEntry = entryOf(lead);
    const vEnd = Math.max(...vocals.map(endOf));
    const intro = (vEntry - beatStart) / bar;

    // A long wait before the voice. Moving by whole bars keeps every line on its bar.
    if (intro > 16.5) {
      const shift = (Math.floor(intro) - 8) * bar;
      const draft = new Draft(session);
      for (const v of vocals) draft.patch(v.laneId, { offsetSeconds: v.offsetSeconds - shift });
      draft.lines.push(`Vocals ${bars(shift)} bars earlier: in after an 8-bar intro instead of ${Math.floor(intro)}`);
      ideas.push(draft.idea({ id: "fix-late-entry", kind: "fix", role: "remixer", icon: "⏩", title: "Bring the vocal in sooner", short: "An 8-bar intro, not a long wait", why: `The vocal waits ${Math.floor(intro)} bars to come in — most listeners are gone by then.`, vibes: ["radio", "short"], listenAt: Math.max(0, beatStart + 7 * bar) }));
    }

    // No intro at all, with beat to spare.
    if (intro < 0.5 && vEnd + 4 * bar <= beatEnd) {
      const draft = new Draft(session);
      for (const v of vocals) draft.patch(v.laneId, { offsetSeconds: v.offsetSeconds + 4 * bar });
      draft.lines.push("Vocals 4 bars later, so the beat has a short intro");
      ideas.push(draft.idea({ id: "fix-intro", kind: "fix", role: "remixer", icon: "🚪", title: "Add a short intro", short: "4 bars of beat first", why: "The vocal starts on the very first beat. Four bars of beat first sets the groove and gives the voice an entrance.", listenAt: 0 }));
    }

    // The biggest gap in the lead vocal while the beat plays on.
    if (lead.clips?.length) {
      const sorted = [...lead.clips].sort((a, b) => clipStart(lead, a) - clipStart(lead, b));
      let gap = { size: 0, index: -1 };
      for (let i = 0; i + 1 < sorted.length; i++) {
        const size = clipStart(lead, sorted[i + 1]) - clipEnd(lead, sorted[i]);
        if (size > gap.size && clipStart(lead, sorted[i + 1]) < beatEnd) gap = { size, index: i };
      }
      if (gap.size > 8 * bar) {
        const shiftBars = Math.floor(gap.size / bar) - 2;
        const later = sorted.slice(gap.index + 1).map((c) => ({ laneId: lead.laneId, clipId: clipId(c) }));
        const draft = new Draft(session);
        draft.adopt(moveClips([...draft.lanes.values()], later, -shiftBars * bar).lanes);
        const at = Math.round(clipEnd(lead, sorted[gap.index]) / bar) + 1;
        draft.lines.push(`Everything after bar ${at} moved ${shiftBars} bars earlier, leaving a 2-bar breath`);
        ideas.push(draft.idea({ id: "fix-gap", kind: "fix", role: "remixer", icon: "🧲", title: "Close the long gap", short: `A ${Math.round(gap.size / bar)}-bar silence in the vocal`, why: `The vocal goes quiet for ${Math.round(gap.size / bar)} bars while the beat carries on — the energy drops.`, listenAt: Math.max(0, clipEnd(lead, sorted[gap.index]) - 2 * bar) }));
      }
    }
  }

  // Two vocals singing over each other.
  if (vocals.length > 1) {
    const [a, ...rest] = vocals;
    const span = (l: StudioLane) => clipsOf(l).map((c) => [clipStart(l, c), clipEnd(l, c)] as const);
    const overlap = (x: StudioLane, y: StudioLane) => {
      let total = 0;
      for (const [s1, e1] of span(x)) for (const [s2, e2] of span(y)) total += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
      return total;
    };
    const clashing = rest.filter((l) => overlap(a, l) > 0.3 * Math.min(endOf(a) - entryOf(a), endOf(l) - entryOf(l)));
    if (clashing.length) {
      const draft = new Draft(session);
      clashing.forEach((l, i) => {
        draft.patch(l.laneId, { volume: Math.round(l.volume * 0.7 * 100) / 100, fx: { ...l.fx, pan: i % 2 ? -0.35 : 0.35, highpass: Math.max(l.fx.highpass, 160) } });
        draft.lines.push(`${l.trackTitle}: quieter, to the ${i % 2 ? "left" : "right"}, thinner low end`);
      });
      ideas.push(draft.idea({ id: "fix-vocal-clash", kind: "fix", role: "engineer", icon: "↔️", title: "Separate the vocals", short: "Lead in the middle, the other to the side", why: "Two vocals sing over each other most of the time, so neither is clear. The lead stays in the middle; the other steps back and to the side.", listenAt: Math.max(0, entryOf(clashing[0])) }));
    }
  }

  return ideas;
}

function soundIdeas(session: Session): Idea[] {
  const levels = balancedLevels(session);
  const hasVocal = session.lanes.some((l) => l.kind === "vocals");
  return MIXES.filter((r) => r.id !== "balanced" && (hasVocal || (r.id !== "upfront" && r.id !== "echo"))).map((recipe) => {
    const draft = new Draft(session);
    applyMix(draft, levels, recipe);
    return draft.idea({ id: `sound-${recipe.id}`, role: "engineer", icon: recipe.icon, title: recipe.title, short: recipe.short, why: recipe.why, vibes: recipe.vibes, listenAt: session.vocal ? Math.max(0, entryOf(session.vocal)) : 0 });
  });
}

/** All the studio's ideas for the session — each kind with those suiting the chosen vibe first. */
export function studioIdeas(session: Session): Idea[] {
  const auto = makeItGood(session);
  const all = [
    ...(auto ? [auto] : []),
    ...fixIdeas(session),
    ...fullRemixIdeas(session),
    ...momentIdeas(session),
    ...(session.pair ? arrangementIdeas(session) : []),
    ...soundIdeas(session),
  ];
  return rankIdeas(all, session.options.vibe);
}

const KIND_ORDER: Record<IdeaKind, number> = { auto: 0, fix: 1, full: 2, moment: 3, idea: 4 };

export function rankIdeas(ideas: Idea[], vibe: Vibe): Idea[] {
  const fits = (i: Idea) => (vibe !== "any" && i.vibes.includes(vibe) ? 0 : 1);
  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => KIND_ORDER[a.idea.kind] - KIND_ORDER[b.idea.kind] || fits(a.idea) - fits(b.idea) || a.index - b.index)
    .map((x) => x.idea);
}

const SYNC_ID = "beatmaker-sync";

/**
 * With more than one beat or vocal, every lane locked to one tempo and
 * grid — the classic one-click AI Match. Slower (it listens to every lane).
 */
export async function syncEverythingIdea(session: Session): Promise<Idea | null> {
  if (session.lanes.length < 3 && session.pair) return null;
  const { plans } = await suggestMatches({ tempo: true, arrange: true, levels: false, fx: false });
  const plan = plans[0];
  if (!plan) return null;
  const draft = new Draft(session);
  for (const [id, patch] of Object.entries(plan.patches)) {
    const { volume: _volume, fx: _fx, ...timing } = patch;
    void _volume;
    void _fx;
    draft.patch(id, timing);
  }
  draft.projectBpm = plan.projectBpm;
  draft.lines.push(...plan.lines.filter((l) => !/level|chain|dipped/.test(l)));
  return draft.idea({
    id: SYNC_ID,
    kind: "fix",
    role: "beatmaker",
    icon: "🔗",
    title: `Lock every lane to ${plan.projectBpm.toFixed(0)} BPM`,
    short: "Every lane at one speed, on one grid",
    why: `${plan.title}: every lane stretched to one speed, the beat's bars lined up and each vocal laid line by line.`,
    listenAt: 0,
  });
}

/**
 * `idea` worked out again for `session` (the mix with other ideas already
 * on it, when they're combined). Null when it no longer makes sense there.
 */
export function recompileIdea(idea: Idea, session: Session): Idea | null {
  // Locking every lane to one tempo sets all their timing outright: it holds.
  if (idea.id === SYNC_ID) return idea;
  if (idea.id.startsWith("fix:")) return mixFix(session, fixesOf(idea));
  return studioIdeas(session).find((i) => i.id === idea.id) ?? null;
}

/** The ideas worked out again for `session` (the mix after the person changed it). */
export function reworkIdeas(session: Session, ideas: Idea[]): Idea[] {
  return [...studioIdeas(session), ...ideas.filter((idea) => idea.id === SYNC_ID)];
}

// --- Applying --------------------------------------------------------------------------------

/** Whether every lane the idea was made for is still here, playing the same stem. */
export function ideaFits(idea: Idea, lanes: StudioLane[]) {
  const { add = [], remove = [] } = idea.lanes ?? {};
  if (!remove.every((id) => lanes.some((l) => l.laneId === id))) return false;
  const after = [...lanes.filter((l) => !remove.includes(l.laneId)), ...add];
  return Object.keys(idea.patches).every((id) => {
    const lane = after.find((l) => l.laneId === id);
    return !!lane && lane.stemId === idea.stems[id];
  });
}

/** Whether two ideas can be on at once: they touch different things. */
export function compatible(a: Idea, b: Idea) {
  const timing = (i: Idea) => i.aspects.includes("arrangement") || i.aspects.includes("tempo");
  if (timing(a) && timing(b)) return false;
  return !a.aspects.some((x) => b.aspects.includes(x));
}

// --- Mix check ---------------------------------------------------------------------------------

export type CheckStatus = "good" | "warn" | "bad";

export type Check = {
  id: string;
  icon: string;
  label: string;
  status: CheckStatus;
  /** What's going on, in plain words. */
  text: string;
  /** What fixes it (see mixFix). */
  fix?: FixId;
};

/**
 * What's wrong with the mix right now, in plain words, each with the idea
 * that fixes it: speed, timing, key, volume, how the two end. Only real
 * problems — how the vocal should sound is the person's taste. Read from `lanes` as they are (an idea being tried included),
 * with what the session heard.
 */
export function checkMix(session: Session, lanes: StudioLane[]): Check[] {
  const checks: Check[] = [];
  const { pair } = session;
  const find = (lane: StudioLane | null) => (lane && lanes.find((l) => l.laneId === lane.laneId)) ?? null;
  const vocal = find(session.vocal);
  // With the beat swapped for its parts (a drop being tried), its drums stand in for it.
  const beat =
    find(session.beat) ??
    (session.beat && (lanes.find((l) => l.laneId === `${session.beat!.laneId}~drums`) ?? lanes.find((l) => l.laneId.startsWith(`${session.beat!.laneId}~`)))) ??
    null;
  const vocals = lanes.filter((l) => l.kind === "vocals");
  const backing = lanes.filter((l) => isBacking(l.kind));

  if (pair && vocal && beat) {
    const vocalBpm = pair.reading * vocal.tempoRatio;
    const beatBpm = pair.beatBpm * beat.tempoRatio;
    const off = Math.abs(Math.log(vocalBpm / beatBpm));
    const arranged = !!vocal.clips?.length;
    checks.push({
      id: "speed",
      icon: "⏱",
      label: "Speed",
      status: off < 0.012 ? "good" : off < 0.04 ? "warn" : "bad",
      text:
        off < 0.012
          ? `Vocal and beat move at the same speed (${beatBpm.toFixed(0)} BPM)`
          : `Vocal at ${vocalBpm.toFixed(0)} BPM, beat at ${beatBpm.toFixed(0)} BPM — they ${off < 0.04 ? "slowly drift apart" : "fight each other"}`,
      fix: "sync",
    });
    checks.push({
      id: "timing",
      icon: "🧩",
      label: "On the beat",
      status: off >= 0.012 ? "bad" : arranged ? "good" : "warn",
      text:
        off >= 0.012
          ? "The lines can't land on the beat until the speeds match"
          : arranged
            ? "Every vocal line sits on the beat's bars"
            : "The vocal is one long take — its lines may not land on the beat",
      fix: "sync",
    });
    const { vocalKey, beatKey } = keysNow(pair, vocal, beat);
    const fit = keyFit(vocalKey, beatKey);
    checks.push({
      id: "key",
      icon: "🎼",
      label: "Key",
      status: fit === "clash" ? "bad" : fit === "far" ? "warn" : "good",
      text:
        fit === "clash"
          ? `The keys clash (${keyLabel(vocalKey)} over ${keyLabel(beatKey)}) — notes sound wrong together`
          : fit === "far"
            ? `The keys rub a little (${keyLabel(vocalKey)} over ${keyLabel(beatKey)})`
            : `In tune together (${keyLabel(vocalKey)} over ${keyLabel(beatKey)})`,
      fix: "key",
    });
  }

  if (vocal && backing.length) {
    const ref = beat ?? backing[0];
    const vl = session.analyses.get(vocal.laneId)?.loudness ?? 0;
    // Parts swapped in carry the beat's level, so the beat's loudness still applies.
    const bl = session.analyses.get(ref.laneId)?.loudness ?? (session.beat ? session.analyses.get(session.beat.laneId)?.loudness : 0) ?? 0;
    if (vl > 0 && bl > 0) {
      const ratio = (vl * vocal.volume) / (bl * ref.volume) / VOCAL_LIFT;
      checks.push({
        id: "volume",
        icon: "🔊",
        label: "Volume",
        status: ratio < 0.5 || ratio > 2.2 ? "bad" : ratio < 0.75 || ratio > 1.5 ? "warn" : "good",
        text: ratio < 0.75 ? "The vocal is buried under the beat" : ratio > 1.5 ? "The vocal is much louder than the beat" : "Vocal and beat are balanced",
        fix: "balance",
      });
    }
  }

  if (vocals.length && backing.length) {
    const bar = beatLength(session.projectBpm) * 4;
    const vEnd = Math.max(...vocals.map(endOf));
    const bEnd = Math.max(...backing.map(endOf));
    checks.push(
      vEnd > bEnd + bar
        ? { id: "length", icon: "🏁", label: "Ending", status: "bad", text: "The vocal keeps singing after the beat stops", fix: "length" }
        : bEnd - vEnd > 8 * bar
          ? { id: "length", icon: "🏁", label: "Ending", status: "warn", text: `The beat plays on for ${Math.round((bEnd - vEnd) / bar)} bars after the singing ends`, fix: "length" }
          : { id: "length", icon: "🏁", label: "Ending", status: "good", text: "Vocal and beat end together" }
    );
  }
  return checks;
}
