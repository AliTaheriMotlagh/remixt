"use client";

import { z } from "zod";
import type { StemAnalysis } from "./analysis";
import { sectionBars, type BeatStructure } from "./arrange";
import { analyzeLane, suggestMatches } from "./autoMatch";
import { clipEnd, clipStart, clipsOf, normaliseLane, stutterLane } from "./clipEdit";
import { chatJson, LocalAiError, type LocalAiSettings } from "./localAi";
import { DEFAULT_OPTIONS, findChorus, planFromOptions, type Entry, type MatchOptions, type Structure } from "./matchOptions";
import { bestKeyShift, keyFit, keyLabel, transposeKey } from "./musicKey";
import { describeSections, pairPlanPatches, preparePair, type PairContext, type TempoChoice } from "./pairMatch";
import { startNewStep } from "./studioHistory";
import {
  DEFAULT_FX,
  DELAY_DIVISIONS,
  FX_PRESETS,
  beatLength,
  effectiveKey,
  useStudioStore,
  type DelayDivision,
  type LaneClip,
  type LaneFx,
  type LanePatch,
  type StudioLane,
} from "./studioStore";
import { isBacking, kindLabel } from "@/lib/stemKinds";

// The AI producer: three points of view on the open mix, each offering
// a few concrete ideas to audition and apply.
//
//   Remixer       — the arrangement: what comes when, hooks, length, energy
//   Sound engineer — the mix: levels, EQ, compression, space, key clashes
//   Beatmaker     — the groove: tempo, the beat's structure, builds, loops
//
// The studio's own analysis always produces ideas, instantly and offline.
// A language model on the user's machine (see localAi.ts) can add more:
// it gets the same measurements and answers in the same building blocks,
// so everything it suggests is checked and carried out by the studio's
// engine — it can't produce something the studio can't do.
//
// Ideas only ever set values (never "add 2 dB to whatever is there"), so
// applying one, then another, never stacks; each is one undo step. Every
// idea records which lanes it was made for, and refuses to apply once the
// mix has moved on (lanes swapped, removed, re-tempoed) — ask again then.
// Some ideas are worked out from where things are on the timeline (a
// filter that opens as the vocal comes in, a beat looped until the vocal
// ends); when the timing changes — another idea applied, a clip moved —
// they're re-worked for the mix as it is now (reworkIdeas), from the same
// analysis, so they never land where the vocal used to be.

export type Role = "remixer" | "engineer" | "beatmaker";

export const ROLES: { id: Role; label: string; icon: string; blurb: string }[] = [
  { id: "remixer", label: "Remixer", icon: "🎤", blurb: "Arrangement, hooks, length" },
  { id: "engineer", label: "Sound engineer", icon: "🎚", blurb: "Levels, EQ, space, key" },
  { id: "beatmaker", label: "Beatmaker", icon: "🥁", blurb: "Tempo, groove, builds" },
];

export type Idea = {
  id: string;
  role: Role;
  title: string;
  /** Why a producer would try this, from what the analysis heard. */
  why: string;
  /** Exactly what applying it changes. */
  lines: string[];
  patches: Record<string, LanePatch>;
  projectBpm?: number;
  /** A good moment to start listening from, in seconds. */
  listenAt?: number;
  source: "studio" | "local-ai";
  /** The lanes it was worked out for, and the stem each was playing. */
  stems: Record<string, string>;
  /** The model's own answer, kept so the idea can be re-worked when the mix moves. */
  spec?: ModelIdea;
};

/** What the ideas are worked out from — the mix as it was when asked. */
export type Session = {
  lanes: StudioLane[];
  projectBpm: number;
  analyses: Map<string, StemAnalysis>;
  vocal: StudioLane | null;
  beat: StudioLane | null;
  pair: PairContext | null;
  /** Things worth telling the user (e.g. why there are no arrangement ideas). */
  notes: string[];
  signature: string;
  /** Where everything was on the timeline (see timingSignature). */
  timing: string;
};

/**
 * What the ideas depend on: which lanes there are, what they play, and
 * their source tempos. Levels, effects and timing don't count — ideas set
 * those outright.
 */
export function mixSignature(lanes: StudioLane[]) {
  return lanes.map((l) => `${l.laneId}:${l.stemId}:${l.bpm?.toFixed(2) ?? "-"}`).join("|");
}

/**
 * What timeline-dependent ideas depend on: where each lane's audio sits,
 * how fast and at what pitch it plays, and the project tempo.
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
    lanes.find((l) => isBacking(l.kind)) ??
    null;
  return { vocal, beat };
}

/** Listens to every lane (cached per stem) and to the chosen vocal/beat pair. */
export async function prepareSession(vocalId?: string | null, beatId?: string | null): Promise<Session> {
  const state = useStudioStore.getState();
  const lanes = state.lanes;
  const picked = pickPair(lanes, state.selectedLaneIds);
  const vocal = lanes.find((l) => l.laneId === vocalId) ?? picked.vocal;
  const beat = lanes.find((l) => l.laneId === beatId) ?? picked.beat;
  const notes: string[] = [];

  const analyses = new Map<string, StemAnalysis>();
  await Promise.all(
    lanes.map(async (lane) => {
      const analysis = await analyzeLane(lane).catch(() => null);
      if (analysis) analyses.set(lane.laneId, analysis);
    })
  );

  let pair: PairContext | null = null;
  if (vocal && beat) {
    try {
      pair = await preparePair(vocal.laneId, beat.laneId);
    } catch (error) {
      notes.push(`${error instanceof Error ? error.message : "Couldn't match the vocal and beat"} — arrangement ideas are off.`);
    }
  } else {
    notes.push(vocal ? "Add a beat to get arrangement ideas." : "Add a vocal to get arrangement ideas.");
  }
  return {
    lanes,
    projectBpm: state.projectBpm,
    analyses,
    vocal,
    beat,
    pair,
    notes,
    signature: mixSignature(lanes),
    timing: timingSignature(lanes, state.projectBpm),
  };
}

/**
 * The session moved onto the mix as it is now — same lanes playing the
 * same stems, but timing, pitch or levels may have changed — keeping what
 * was heard, so nothing has to be listened to again.
 */
export function rebaseSession(session: Session): Session {
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
  };
}

/**
 * The same ideas, worked out again for `session` (a rebased one): each
 * studio idea from scratch, each of the model's from its answer. One that
 * no longer makes sense (the key clash is fixed, say) drops out — unless
 * it's `keep`, the one just applied — and one that now does joins in.
 */
export function reworkIdeas(session: Session, ideas: Idea[], keep?: string): Idea[] {
  const fresh = new Map(studioIdeas(session).map((idea) => [idea.id, idea]));
  const out: Idea[] = [];
  for (const idea of ideas) {
    let again: Idea | null | undefined;
    if (idea.spec) {
      try {
        again = compileModelIdea(session, idea.spec, idea.id);
      } catch {
        again = null;
      }
    } else {
      again = fresh.get(idea.id);
      fresh.delete(idea.id);
    }
    // Locking every lane to one tempo sets all their timing outright: it holds.
    if (again) out.push(again);
    else if (idea.id === keep || idea.id === SYNC_ID) out.push(idea);
  }
  out.push(...fresh.values());
  return out;
}

// --- Drafting -------------------------------------------------------------------------

/** A copy of the mix to try changes on; collects them as patches for applyLanePatches. */
class Draft {
  lanes: Map<string, StudioLane>;
  patches: Record<string, LanePatch> = {};
  projectBpm: number | undefined;
  lines: string[] = [];

  constructor(readonly session: Session) {
    this.lanes = new Map(session.lanes.map((l) => [l.laneId, l]));
  }

  lane(id: string) {
    return this.lanes.get(id)!;
  }

  get bpm() {
    return this.projectBpm ?? this.session.projectBpm;
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

  get empty() {
    return Object.keys(this.patches).length === 0 && this.projectBpm === undefined;
  }

  idea(meta: Pick<Idea, "id" | "role" | "title" | "why"> & { source?: Idea["source"]; listenAt?: number }): Idea {
    return {
      ...meta,
      source: meta.source ?? "studio",
      lines: this.lines,
      patches: this.patches,
      projectBpm: this.projectBpm,
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

// --- Remixer & beatmaker: arrangement -------------------------------------------------

/** The tempo choice that bends the audio least. */
function gentlestTempo(pair: PairContext): TempoChoice {
  const cost = (c: TempoChoice) => Math.abs(Math.log(pair.tempos[c].vocalRatio)) + Math.abs(Math.log(pair.tempos[c].beatRatio));
  return cost("vocal") < cost("beat") - 0.01 ? "vocal" : "beat";
}

/**
 * Lays the vocal on the beat with the Match panel's choices. Only timing
 * changes — level and sound stay the engineer's business.
 */
function arrange(draft: Draft, options: Partial<MatchOptions>) {
  const pair = draft.session.pair!;
  const { plan, notes } = planFromOptions(pair, { ...DEFAULT_OPTIONS, vocalPreset: "none", beatPreset: "none", ...options });
  const result = pairPlanPatches(pair, plan, [...draft.lanes.values()]);
  for (const [id, patch] of Object.entries(result.patches)) {
    const { volume: _volume, fx: _fx, ...timing } = patch;
    void _volume;
    void _fx;
    draft.patch(id, timing);
  }
  draft.projectBpm = result.projectBpm;
  draft.lines.push(...notes, ...result.lines.filter((l) => !l.startsWith("Vocal level")));
  return `${plan.follow}|${JSON.stringify(plan.sections)}|${plan.shift_beats ?? 0}`;
}

/** "I-I-I-I want…": the first half-beat of the vocal's entry, four times. */
function stutterIntro(draft: Draft) {
  const vocal = draft.lane(draft.session.vocal!.laneId);
  const clips = stutterLane(vocal, entryOf(vocal), beatLength(draft.bpm) * 0.5, 4);
  if (!clips) return;
  draft.patch(vocal.laneId, { clips });
  draft.lines.push("Stutter on the vocal's first word (⅛ note × 4) to announce it");
}

/** Filter closed over the intro, opening as the vocal comes in; closing again over the last bars. */
function filterBuild(draft: Draft) {
  const bar = beatLength(draft.bpm) * 4;
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
    `${backing.map((l) => l.trackTitle).join(", ")}: low-pass filter opens over the 4 bars before the vocal (bar ${Math.round(entry / bar) + 1})`,
    "…and closes again over the last 4 bars, for a DJ-style outro"
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
  const bar = beatLength(draft.bpm) * 4;
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
  draft.lines.push(`“${beat.trackTitle}”: its last ${loopBars} bars looped ${repeats}× so the beat runs as long as the vocal, then its own ending`);
  return true;
}

// --- Sound engineer: the mix ------------------------------------------------------------

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
    const lift = lane.kind === "vocals" && isBacking(ref.kind) ? 1.12 : 1;
    // Drums, bass and melody parts sit under the full beat, not level with it.
    const part = lane.kind !== "vocals" && lane.kind !== "beat" && ref.kind === "beat" ? 0.8 : 1;
    const volume = lane.laneId === ref.laneId ? 0.85 : (0.85 * lift * part * refLoudness) / loudness;
    levels.set(lane.laneId, Math.round(Math.min(1.5, Math.max(0.15, volume)) * 100) / 100);
  }
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

type MixRecipe = {
  id: string;
  title: string;
  why: string;
  vocalDb: number;
  vocal: Partial<LaneFx>;
  backing: Partial<LaneFx>;
};

const MIXES: MixRecipe[] = [
  {
    id: "balanced",
    title: "Clean, balanced mix",
    why: "Separated stems come out at very different levels and the vocal is thin and dry. Loudness-match them, clean the vocal's low end, add presence and a short room, and dip the beat's mids so the voice has a pocket.",
    vocalDb: 0,
    vocal: { highpass: 110, compress: true, eqMid: 1.5, eqHigh: 3, reverb: 0.14, reverbSize: 1.6 },
    backing: { eqMid: -2.5, fadeOut: 4 },
  },
  {
    id: "upfront",
    title: "Vocal upfront, beat pumps under it",
    why: "For rap and pop: the voice leads. The beat ducks (sidechain) every time the vocal sings, so the words cut through without the beat getting quieter overall.",
    vocalDb: 2.5,
    vocal: { highpass: 120, compress: true, eqMid: 2, eqHigh: 4, drive: 0.08, reverb: 0.1, delay: 0.16, delayDivision: "1/8", delayFeedback: 0.22 },
    backing: { duck: 0.45, eqMid: -3.5, fadeOut: 4 },
  },
  {
    id: "wide",
    title: "Big & spacious",
    why: "For slower songs and big choruses: a wide doubled vocal, a long dotted-eighth delay and a hall, over a beat with a little more weight and air.",
    vocalDb: 0,
    vocal: { highpass: 110, compress: true, width: 0.55, reverb: 0.32, reverbSize: 3.2, delay: 0.2, delayDivision: "1/4.", delayFeedback: 0.4, eqHigh: 2.5 },
    backing: { eqLow: 1.5, eqMid: -1.5, eqHigh: 1.5, fadeOut: 6 },
  },
  {
    id: "lofi",
    title: "Lo-fi tape",
    why: "Rolls off the top and bottom and adds saturation to both, so two recordings from different eras sound like one dusty record.",
    vocalDb: -1,
    vocal: { highpass: 220, lowpass: 7000, drive: 0.25, compress: true, reverb: 0.22, reverbSize: 2.4 },
    backing: { highpass: 50, lowpass: 6000, drive: 0.4, eqLow: 2, fadeIn: 2, fadeOut: 5 },
  },
  {
    id: "punch",
    title: "Punchy & loud",
    why: "For club and trap: tight low end and more snap on the beat, a bright, slightly driven vocal with almost no reverb, so it all hits hard.",
    vocalDb: 1,
    vocal: { highpass: 120, compress: true, eqHigh: 3, drive: 0.12, reverb: 0.08 },
    backing: { highpass: 28, eqLow: 3, eqMid: -1.5, eqHigh: 1.5, drive: 0.15 },
  },
];

function applyMix(draft: Draft, levels: Map<string, number>, recipe: Pick<MixRecipe, "vocalDb" | "vocal" | "backing">) {
  let vocalIndex = 0;
  for (const lane of draft.lanes.values()) {
    const vocal = lane.kind === "vocals";
    const fx: LaneFx = { ...DEFAULT_FX, ...(vocal ? recipe.vocal : recipe.backing) };
    // A second or third vocal (a harmony, a double) sits either side of the lead.
    if (vocal && vocalIndex > 0) fx.pan = vocalIndex % 2 ? 0.25 : -0.25;
    if (vocal) vocalIndex++;
    const base = levels.get(lane.laneId) ?? lane.volume;
    const volume = Math.round(Math.min(1.5, base * 10 ** ((vocal ? recipe.vocalDb : 0) / 20)) * 100) / 100;
    draft.patch(lane.laneId, { volume, fx });
    draft.lines.push(`${lane.trackTitle}: level ${Math.round(volume * 100)}% · ${describeFx(fx)}`);
  }
}

// --- The studio's own ideas ---------------------------------------------------------------

export function studioIdeas(session: Session): Idea[] {
  const ideas: Idea[] = [];
  const { pair } = session;
  const bar = (bpm: number) => beatLength(bpm) * 4;

  if (pair) {
    const tempo = gentlestTempo(pair);
    const seen = new Set<string>();
    const remixes: { id: string; structure: Structure; title: string; why: string; stutter?: boolean }[] = [
      {
        id: "radio",
        structure: "as-sung",
        title: "Radio edit",
        why: `The vocal in its own order, coming in after the beat's ${pair.structure.introBars}-bar intro, with every phrase locked to the beat's bars. The safest, most natural fit.`,
      },
      {
        id: "hook-first",
        structure: "chorus-first",
        title: "Hook up front",
        why: "Open on the chorus so the remix grabs you in the first seconds — how DJ edits and short-form clips start — with a stutter to announce it.",
        stutter: true,
      },
      {
        id: "short",
        structure: "short",
        title: "Short & shareable",
        why: "One verse and the chorus twice: the length for Reels, TikTok and Shorts, and the quickest way to test a pairing.",
      },
      {
        id: "extended",
        structure: "fill",
        title: "Extended club mix",
        why: `The whole vocal, then the chorus keeps coming back with breaks between, for all ${pair.structure.endBar} bars of the beat — long enough to dance to.`,
      },
      {
        id: "chops",
        structure: "hook",
        title: "Hook chops",
        why: "Only the chorus, looping with breaks for the beat to breathe — the bootleg / vocal-chop style, great over a strong instrumental.",
      },
    ];
    for (const r of remixes) {
      const draft = new Draft(session);
      try {
        const signature = arrange(draft, { tempo, structure: r.structure });
        if (seen.has(signature)) continue;
        seen.add(signature);
        if (r.stutter) stutterIntro(draft);
        const vocal = draft.lane(session.vocal!.laneId);
        ideas.push(draft.idea({ id: `remixer-${r.id}`, role: "remixer", title: r.title, why: r.why, listenAt: Math.max(0, entryOf(vocal) - bar(draft.bpm)) }));
      } catch {
        // That shape doesn't work for this vocal; the others still might.
      }
    }

    // Beatmaker: the other ways to agree on a tempo.
    const choices: { choice: TempoChoice; title: (bpm: number) => string }[] = [
      { choice: "beat", title: (bpm) => `Keep the beat's groove (${bpm.toFixed(1)} BPM)` },
      { choice: "vocal", title: (bpm) => `Keep the vocal's own tempo (${bpm.toFixed(1)} BPM)` },
      { choice: "middle", title: (bpm) => `Meet in the middle (${bpm.toFixed(1)} BPM)` },
    ];
    for (const { choice, title } of choices) {
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
            title: title(t.projectBpm),
            why: `Beat ${pct(t.beatRatio)}, vocal ${pct(t.vocalRatio)} speed (pitch unchanged). ${
              choice === "vocal" ? "Keeps the singer's natural flow; the beat bends instead." : choice === "middle" ? "Both bend half as much — often the least audible." : "The beat's feel stays untouched."
            }`,
            listenAt: Math.max(0, entryOf(draft.lane(session.vocal!.laneId)) - bar(draft.bpm)),
          })
        );
      } catch {
        // Skip a tempo that can't be arranged.
      }
    }

    // Beatmaker: loop the beat when the vocal outlasts it.
    const extended = new Draft(session);
    if (extendBeat(extended, pair.structure)) {
      ideas.push(
        extended.idea({
          id: "beatmaker-extend",
          role: "beatmaker",
          title: "Loop the beat to fit the whole vocal",
          why: `The vocal runs past the end of “${session.beat!.trackTitle}”'s music (bar ${pair.structure.endBar}). Loop its last bars, on the bar lines, so every line has a beat under it.`,
          listenAt: Math.max(0, endOf(session.beat!) - bar(session.projectBpm) * 2),
        })
      );
    }

    // Engineer: a key clash.
    const vocalKey = effectiveKey(session.vocal!) ?? pair.vocalKey;
    const beatKey = effectiveKey(session.beat!) ?? pair.beatKey;
    const fit = keyFit(vocalKey, beatKey);
    if (fit === "far" || fit === "clash") {
      const shift = bestKeyShift(vocalKey, beatKey).semitones;
      if (shift !== 0) {
        const draft = new Draft(session);
        const pitch = session.vocal!.pitchSemitones + shift;
        draft.patch(session.vocal!.laneId, { pitchSemitones: pitch });
        draft.lines.push(
          `${session.vocal!.trackTitle}: pitch ${st(pitch)} → sounds in ${keyLabel(transposeKey(vocalKey, shift))}, which shares ${keyLabel(beatKey)}'s notes`
        );
        ideas.push(
          draft.idea({
            id: "engineer-key",
            role: "engineer",
            title: `Fix the key clash (vocal ${st(shift)})`,
            why: `The vocal is in ${keyLabel(vocalKey)} and the beat in ${keyLabel(beatKey)} — they ${fit === "clash" ? "clash" : "sit uneasily"}. A ${Math.abs(shift)}-semitone shift fixes the notes; it colours the voice a little${Math.abs(shift) > 3 ? " (this one's a big shift — listen closely)" : ""}.`,
            listenAt: Math.max(0, entryOf(session.vocal!)),
          })
        );
      }
    }
  }

  // Engineer: mixes. Work on any lanes, vocal or not.
  const levels = balancedLevels(session);
  const hasVocal = session.lanes.some((l) => l.kind === "vocals");
  for (const recipe of MIXES) {
    if (!hasVocal && recipe.id === "upfront") continue;
    const draft = new Draft(session);
    applyMix(draft, levels, recipe);
    ideas.push(
      draft.idea({
        id: `engineer-${recipe.id}`,
        role: "engineer",
        title: recipe.title,
        why: recipe.why,
        listenAt: session.vocal ? Math.max(0, entryOf(session.vocal)) : 0,
      })
    );
  }

  // Beatmaker: a filter build into the vocal.
  const build = new Draft(session);
  if (filterBuild(build)) {
    ideas.push(
      build.idea({
        id: "beatmaker-filter",
        role: "beatmaker",
        title: "Filter build into the drop",
        why: "The beat starts muffled and opens up just as the vocal lands — the oldest trick for making an entrance hit — then closes out at the end.",
        listenAt: 0,
      })
    );
  }
  return ideas;
}

/**
 * With more than one beat or vocal, every lane locked to one tempo and
 * grid — the classic one-click AI Match. Slower (it listens to every lane).
 */
const SYNC_ID = "beatmaker-sync";

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
    role: "beatmaker",
    title: `Lock every lane to ${plan.projectBpm.toFixed(1)} BPM`,
    why: `${plan.title}: every lane stretched to one tempo, the beat's downbeats on the bar lines and each vocal laid phrase by phrase.`,
    listenAt: 0,
  });
}

// --- Applying --------------------------------------------------------------------------------

/** Whether every lane the idea was made for is still here, playing the same stem. */
export function ideaFits(idea: Idea, lanes: StudioLane[]) {
  return Object.keys(idea.patches).every((id) => {
    const lane = lanes.find((l) => l.laneId === id);
    return !!lane && lane.stemId === idea.stems[id];
  });
}

/** Applies an idea as one undo step. Throws when the mix has changed under it. */
export function applyIdea(idea: Idea) {
  const store = useStudioStore.getState();
  if (!ideaFits(idea, store.lanes)) throw new Error("This idea was made for lanes that have changed since — get fresh ideas.");
  startNewStep();
  store.applyLanePatches(idea.patches, idea.projectBpm);
  startNewStep();
}

// --- The local model's ideas -------------------------------------------------------------------

function loudnessDigits(values: number[]) {
  const max = Math.max(...values);
  return values
    .map((v) => (v > 0 && max > 0 ? Math.max(0, Math.min(9, Math.round(9 + 3 * Math.log10(v / max)))) : 0))
    .join("");
}

function changedFx(fx: LaneFx) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_FX) as (keyof LaneFx)[]) if (fx[key] !== DEFAULT_FX[key]) out[key] = fx[key];
  return out;
}

/** What the model is told: the studio's measurements, in bars and plain numbers. */
export function describeForModel(session: Session, offered: Idea[]) {
  const { pair, lanes, projectBpm } = session;
  const name = (id: string | undefined) => `L${lanes.findIndex((l) => l.laneId === id) + 1}`;
  const bar = beatLength(projectBpm) * 4;
  return {
    project: {
      bpm: Math.round(projectBpm * 10) / 10,
      lanes: lanes.map((l) => {
        const key = effectiveKey(l);
        return {
          lane: name(l.laneId),
          kind: kindLabel(l.kind),
          title: l.trackTitle,
          plays_at_bpm: l.bpm ? Math.round(l.bpm * l.tempoRatio * 10) / 10 : null,
          key: key ? keyLabel(key) : "unknown",
          starts_bar: Math.round((entryOf(l) / bar + 1) * 10) / 10,
          ends_bar: Math.round((endOf(l) / bar + 1) * 10) / 10,
          volume_db: Math.round(20 * Math.log10(Math.max(0.01, l.volume)) * 10) / 10,
          effects: changedFx(l.fx),
          clips: l.clips?.length ?? "whole take",
        };
      }),
    },
    pair: pair
      ? (() => {
          const energy = pair.structure.barEnergy;
          const digits = loudnessDigits(energy);
          const changes = [...digits].flatMap((d, i) => (i > 0 && Math.abs(Number(d) - Number(digits[i - 1])) >= 3 ? [i] : []));
          const chorus = findChorus(pair);
          return {
            vocal: name(pair.vocalLaneId),
            beat: name(pair.beatLaneId),
            beat_info: {
              bpm: Math.round(pair.beatBpm * 100) / 100,
              key: keyLabel(pair.beatKey),
              bars: pair.structure.bars,
              intro_bars: pair.structure.introBars,
              music_ends_at_bar: pair.structure.endBar,
              loudness_per_bar_0_to_9: digits,
              level_changes_at_bars: changes.slice(0, 16),
            },
            vocal_info: {
              bpm: Math.round(pair.reading * 100) / 100,
              key: keyLabel(pair.vocalKey),
              bar_lines: pair.heard.guided ? "exact (from its original beat)" : "guessed from the voice",
              sections: describeSections(pair.vocalAnalysis, pair.heard),
              chorus_guess: { section: chorus.first, repeats_at_sections: chorus.all, confident: chorus.confident },
            },
            keys: pair.keys,
            tempo_options: Object.fromEntries(
              (Object.keys(pair.tempos) as TempoChoice[]).map((c) => [
                c,
                {
                  bpm: Math.round(pair.tempos[c].projectBpm * 10) / 10,
                  beat_speed: Math.round(pair.tempos[c].beatRatio * 1000) / 1000,
                  vocal_speed: Math.round(pair.tempos[c].vocalRatio * 1000) / 1000,
                },
              ])
            ),
            studio_suggested_entry_bar: pair.suggestion.entry,
            note: "Bars in beat_info, sections and entry are the BEAT's own bars, counted from 0.",
          };
        })()
      : null,
    ideas_already_offered: offered.map((i) => `${i.role}: ${i.title}`),
  };
}

const PRESET_IDS = FX_PRESETS.map((p) => p.id) as [string, ...string[]];
const DIVISIONS = DELAY_DIVISIONS.map((d) => d.id) as [DelayDivision, ...DelayDivision[]];
const STRUCTURE_IDS = ["as-sung", "tight", "chorus-first", "fill", "short", "hook"] as const;

const laneMix = z
  .object({
    level_db: z.number().optional(),
    preset: z.enum(PRESET_IDS).optional(),
    reverb: z.number().optional(),
    delay: z.number().optional(),
    delay_division: z.enum(DIVISIONS).optional(),
    eq_low: z.number().optional(),
    eq_mid: z.number().optional(),
    eq_high: z.number().optional(),
    highpass: z.number().optional(),
    lowpass: z.number().optional(),
    drive: z.number().optional(),
    width: z.number().optional(),
    compress: z.boolean().optional(),
    duck: z.number().optional(),
    pan: z.number().optional(),
  })
  .partial();

const modelIdea = z.object({
  role: z.enum(["remixer", "engineer", "beatmaker"]),
  title: z.string().min(1),
  why: z.string().default(""),
  structure: z.enum(STRUCTURE_IDS).optional(),
  sections: z.array(z.object({ section: z.number(), bar: z.number() })).optional(),
  tempo: z.enum(["beat", "vocal", "middle"]).optional(),
  entry_bar: z.number().optional(),
  shift_beats: z.number().optional(),
  stutter_intro: z.boolean().optional(),
  filter_build: z.boolean().optional(),
  loop_beat_to_fit: z.boolean().optional(),
  key_fix: z.boolean().optional(),
  vocal: laneMix.optional(),
  beat: laneMix.optional(),
});
const modelAnswer = z.object({ ideas: z.array(z.unknown()) });

type ModelIdea = z.infer<typeof modelIdea>;

/** JSON Schema for constrained decoding — kept flat and small for small models. */
function answerSchema() {
  const { $schema: _unused, ...schema } = z.toJSONSchema(z.object({ ideas: z.array(modelIdea) }), { io: "input" }) as Record<string, unknown>;
  void _unused;
  return schema;
}

const SYSTEM_PROMPT = `You are three music professionals working together inside Remixt, a browser studio where people put a vocal (an acapella cut out of one song) over a beat (the instrumental of another):
- REMIXER: the arrangement — which vocal sections go where, hooks, length, energy.
- SOUND ENGINEER: the mix — levels, EQ, compression, space (reverb/delay), sidechain ducking, key clashes.
- BEATMAKER: the groove — tempo choice, the beat's structure, filter builds, looping the beat.

You can't hear audio. The studio measured it for you: tempos, keys, the beat's bars with a loudness digit 0-9 per bar (where it builds and drops), its intro and where its music ends, and the vocal cut into sections with their length, loudness and which sections repeat (similar notes = probably the chorus). Reason from these numbers the way a producer reads meters and waveforms.

Answer with JSON: {"ideas": [...]} — each idea is a concrete thing a pro would try with THIS material. Fields:
- role, title (max 6 words), why (1-2 short, simple sentences that cite the numbers that motivate it).
- Arrangement (needs a vocal and a beat): "structure" (as-sung | tight | chorus-first | fill | short | hook), OR "sections": [{"section": index, "bar": beat bar from 0}] for a custom order. Sections must not overlap and must end before music_ends_at_bar. Put the chorus where the beat is loudest; start sections on bars that are multiples of 4 or where the level changes. "entry_bar": when the vocal comes in (0, 4, 8 or 16). "tempo": beat | vocal | middle — prefer the one with speeds closest to 1. "shift_beats": -2..2 only if the downbeat seems off.
- Effects you can switch on: "stutter_intro", "filter_build", "loop_beat_to_fit" (only if the vocal is longer than the beat), "key_fix" (only if the keys clash).
- Mix: "vocal" and/or "beat" objects: level_db (-6..6, relative to a loudness-matched balance), preset (${PRESET_IDS.join(", ")}), reverb 0..1, delay 0..1, delay_division, eq_low/eq_mid/eq_high dB -12..12, highpass Hz, lowpass Hz, drive 0..1, width 0..1, compress, duck 0..1 (beat dips while the vocal sings), pan -1..1.
Never change pitch except through key_fix. Don't repeat ideas_already_offered — bring different, bolder takes. Use plain English: the user may not be a native speaker.`;

const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined || !Number.isFinite(v) ? undefined : Math.min(hi, Math.max(lo, v)));

function mixFrom(spec: z.infer<typeof laneMix> | undefined): Partial<LaneFx> | null {
  if (!spec) return null;
  const preset = FX_PRESETS.find((p) => p.id === spec.preset);
  const fx: Partial<LaneFx> = { ...(preset?.fx ?? {}) };
  const set = <K extends keyof LaneFx>(key: K, value: LaneFx[K] | undefined) => {
    if (value !== undefined) fx[key] = value;
  };
  set("reverb", clamp(spec.reverb, 0, 0.8));
  set("delay", clamp(spec.delay, 0, 0.7));
  set("delayDivision", spec.delay_division);
  set("eqLow", clamp(spec.eq_low, -12, 12));
  set("eqMid", clamp(spec.eq_mid, -12, 12));
  set("eqHigh", clamp(spec.eq_high, -12, 12));
  set("highpass", clamp(spec.highpass, 20, 1500));
  set("lowpass", clamp(spec.lowpass, 800, 20000));
  set("drive", clamp(spec.drive, 0, 0.8));
  set("width", clamp(spec.width, 0, 1));
  set("compress", spec.compress);
  set("duck", clamp(spec.duck, 0, 0.8));
  set("pan", clamp(spec.pan, -1, 1));
  return fx;
}

/** Turns one of the model's ideas into changes, through the studio's own engine. */
function compileModelIdea(session: Session, idea: ModelIdea, id: string): Idea | null {
  const draft = new Draft(session);
  const { pair } = session;
  const wantsArrangement = idea.structure || idea.sections?.length || idea.tempo || idea.entry_bar !== undefined || idea.shift_beats;
  if (pair && wantsArrangement) {
    const tempo = idea.tempo ?? gentlestTempo(pair);
    const shift = Math.round(clamp(idea.shift_beats, -2, 2) ?? 0) as MatchOptions["shiftBeats"];
    if (idea.sections?.length) {
      const sections = idea.sections
        .map((s) => ({ section: Math.round(s.section), bar: Math.max(0, Math.round(s.bar)) }))
        .filter((s) => pair.heard.sections[s.section])
        .slice(0, 24);
      if (sections.length) {
        const result = pairPlanPatches(pair, { follow: tempo, sections, shift_beats: shift }, [...draft.lanes.values()]);
        for (const [id, patch] of Object.entries(result.patches)) {
          const { volume: _volume, fx: _fx, ...timing } = patch;
          void _volume;
          void _fx;
          draft.patch(id, timing);
        }
        draft.projectBpm = result.projectBpm;
        draft.lines.push(...result.lines.filter((l) => !l.startsWith("Vocal level")));
        const bars = result.placements.reduce((max, p) => Math.max(max, p.bar + sectionBars(pair.heard.sections[p.section])), 0);
        draft.lines.push(`${result.placements.length} sections over ${bars} bars`);
      }
    } else {
      const wanted = idea.entry_bar;
      const entry: Entry =
        wanted === undefined
          ? "auto"
          : ([0, 4, 8, 16] as const).reduce((best, e) => (Math.abs(e - wanted) < Math.abs(best - wanted) ? e : best));
      arrange(draft, { tempo, structure: idea.structure ?? "as-sung", entry, shiftBeats: shift });
    }
  }
  if (pair && idea.stutter_intro) stutterIntro(draft);
  if (pair && idea.loop_beat_to_fit) extendBeat(draft, pair.structure);
  if (idea.filter_build) filterBuild(draft);
  if (pair && idea.key_fix) {
    const vocal = session.vocal!;
    const vocalKey = effectiveKey(vocal) ?? pair.vocalKey;
    const beatKey = effectiveKey(session.beat!) ?? pair.beatKey;
    const shift = bestKeyShift(vocalKey, beatKey).semitones;
    if (shift) {
      draft.patch(vocal.laneId, { pitchSemitones: vocal.pitchSemitones + shift });
      draft.lines.push(`${vocal.trackTitle}: pitch ${st(vocal.pitchSemitones + shift)} to fit ${keyLabel(beatKey)}`);
    }
  }
  const vocalFx = mixFrom(idea.vocal);
  const beatFx = mixFrom(idea.beat);
  if (vocalFx || beatFx) {
    const levels = balancedLevels(session);
    for (const lane of draft.lanes.values()) {
      const vocal = lane.kind === "vocals";
      const spec = vocal ? idea.vocal : idea.beat;
      const fx = vocal ? vocalFx : beatFx;
      if (!fx || !spec) continue;
      const db = clamp(spec.level_db, -6, 6) ?? 0;
      const volume = Math.round(Math.min(1.5, (levels.get(lane.laneId) ?? lane.volume) * 10 ** (db / 20)) * 100) / 100;
      const full = { ...DEFAULT_FX, ...fx };
      draft.patch(lane.laneId, { volume, fx: full });
      draft.lines.push(`${lane.trackTitle}: level ${Math.round(volume * 100)}% · ${describeFx(full)}`);
    }
  }
  if (draft.empty) return null;
  const vocal = session.vocal && draft.lane(session.vocal.laneId);
  return {
    ...draft.idea({
      id,
      role: idea.role,
      title: idea.title.slice(0, 60),
      why: idea.why.slice(0, 400),
      source: "local-ai",
      listenAt: vocal ? Math.max(0, entryOf(vocal) - beatLength(draft.bpm) * 4) : 0,
    }),
    spec: idea,
  };
}

export type AskOptions = {
  roles: Role[];
  /** What the user asked for, in their words (optional). */
  request: string;
  offered: Idea[];
  count?: number;
  signal?: AbortSignal;
  onProgress?: (characters: number) => void;
};

/** Asks the local model for more ideas. Returns the ones that check out. */
export async function askLocalModel(settings: LocalAiSettings, session: Session, options: AskOptions): Promise<{ ideas: Idea[]; skipped: number }> {
  const count = options.count ?? 3;
  const focus =
    options.roles.length === 3
      ? `one idea from each role (${count} in total)`
      : `${count} ideas, all with role "${options.roles[0]}"`;
  const user = [
    `The studio's measurements:\n${JSON.stringify(describeForModel(session, options.offered))}`,
    `Give ${focus}.`,
    options.request.trim() ? `The artist asks: “${options.request.trim().slice(0, 300)}” — follow that.` : "",
    session.pair ? "" : "There's no vocal+beat pair, so only mix ideas (vocal/beat objects, filter_build) can work.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await chatJson(settings, SYSTEM_PROMPT, user, answerSchema(), { signal: options.signal, onProgress: options.onProgress });
  const answer = modelAnswer.safeParse(raw);
  if (!answer.success) throw new LocalAiError("The model answered in the wrong shape — try again, or a larger model.");
  const ideas: Idea[] = [];
  let skipped = 0;
  const batch = Date.now().toString(36);
  answer.data.ideas.forEach((entry, i) => {
    const parsed = modelIdea.safeParse(entry);
    if (!parsed.success) {
      skipped++;
      return;
    }
    try {
      const idea = compileModelIdea(session, parsed.data, `ai-${batch}-${i}`);
      if (idea) ideas.push(idea);
      else skipped++;
    } catch {
      skipped++;
    }
  });
  return { ideas, skipped };
}
