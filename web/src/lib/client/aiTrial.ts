"use client";

import { create } from "zustand";
import { ALL_ASPECTS, type Aspect } from "./aiControl";
import { compatible, fixesOf, ideaFits, leadOf, mixFix, rebaseSession, recompileIdea, timingSignature, type FixId, type HandEdit, type Idea, type Session } from "./aiIdeas";
import { applyScope, isWhole, originOf, retime, useAiScope, WHOLE_SONG, type Scope } from "./aiScope";
import { speedChange } from "./quickAdjust";
import { interceptHistory, recordStep, useStudioHistory, withoutRecording } from "./studioHistory";
import { asOneChange, useStudioStore, type LanePatch, type StudioLane } from "./studioStore";

// Auditioning AI ideas the way a DAW auditions presets. The mix as it was
// before the first try is kept aside; every try starts again from it, so
// trying one idea and then another swaps them — it never piles the second
// on top of the first. A/B flips between the original and the idea; Keep
// makes it one undo step; Revert puts the original back. Ideas that touch
// different things (an arrangement, a mix, a filter build) can be on at
// once: each is worked out again on top of the ones before it, the
// arrangement first, so a filter opens where the vocal now comes in.
//
// Every change can be switched on and off: an idea switched off stays
// listed (with a switch to put it back), and each part of an idea — its
// timing, key, levels, sound, moves, layers — can be switched off on its
// own. The co-producer's hands-on changes (Ask AI) are tried the same way.
//
// None of the trying is recorded as undo steps. If the person edits the
// mix while an idea is on, the idea is kept (undo takes back their edit,
// then the idea); undo while trying just reverts.

export type Mix = { lanes: StudioLane[]; duration: number; projectBpm: number };

/** A part of an idea that can be switched off on its own. */
export type Part = "timing" | "key" | "levels" | "effects" | "automation" | "layers";

/** The parts, with the aspects of an idea each covers (timing and speed go together: clips are placed for the speed). */
export const PARTS: { id: Part; label: string; aspects: Aspect[] }[] = [
  { id: "timing", label: "Timing & speed", aspects: ["arrangement", "tempo"] },
  { id: "key", label: "Key", aspects: ["key"] },
  { id: "levels", label: "Volume", aspects: ["levels"] },
  { id: "effects", label: "Sound", aspects: ["effects"] },
  { id: "automation", label: "Moves", aspects: ["automation"] },
  { id: "layers", label: "Layers", aspects: ["layers"] },
];

/** What each part sets on a lane. */
const FIELDS: Record<Part, (keyof LanePatch)[]> = {
  timing: ["clips", "offsetSeconds", "tempoRatio", "bpm"],
  key: ["pitchSemitones", "musicalKey"],
  levels: ["volume", "muted"],
  effects: ["fx"],
  automation: ["automation"],
  layers: [],
};

/** The parts an idea changes. */
export function partsOf(idea: Idea): Part[] {
  return PARTS.filter((p) => p.aspects.some((a) => idea.aspects.includes(a))).map((p) => p.id);
}

export type Trial = {
  /** The mix before any idea was tried — every try starts from here. */
  baseline: Mix;
  /** The ideas on, in the order they were added. */
  ideas: Idea[];
  /** Ideas switched off since trying started, last switched off first — listed so they can go back on. */
  off: Idea[];
  /** By idea: the parts of it switched off. */
  without: Record<string, Part[]>;
  /** The mix with them on. */
  result: Mix;
  /** A/B: which one is in the mix right now. */
  showing: "idea" | "original";
};

/** Ideas switched off that stay listed, to switch back on. */
const MAX_OFF = 12;

export const useAiTrial = create<{ trial: Trial | null }>(() => ({ trial: null }));

/**
 * One keep: the ideas kept, and the mix just before and just after — so
 * "What happened" can still say exactly what changed once they're kept.
 */
export type Kept = { id: number; at: number; ideas: Pick<Idea, "id" | "title" | "icon" | "why" | "lines">[]; before: Mix; after: Mix };

/** What the AI producer changed and the person kept, latest first — this mix only. */
export const useAiLog = create<{ kept: Kept[] }>(() => ({ kept: [] }));

/** Keeps listed in "What happened". */
const MAX_KEPT = 12;
let keptCount = 0;

/**
 * Ideas the last build left off because of the scope: a hands-on change
 * of the whole song's speed, which a section or some lanes can't have on
 * their own.
 */
const refusedForScope = new Set<string>();

/** Whether `ideaId` couldn't go on because the AI is working on just a section or some lanes. */
export function refusedByScope(ideaId: string) {
  return refusedForScope.has(ideaId);
}

/** Tempo changes smaller than this are the same tempo. */
const SAME_BPM = 0.05;
let applying = false;

function currentMix(): Mix {
  const { lanes, duration, projectBpm } = useStudioStore.getState();
  return { lanes, duration, projectBpm };
}

/** Changes the mix as part of trying, not as an edit of the person's. */
function quietly(change: () => void) {
  applying = true;
  try {
    withoutRecording(change);
  } finally {
    applying = false;
  }
}

function setMix(mix: Mix) {
  quietly(() => useStudioStore.setState(mix));
}

/**
 * Arrangement and tempo first: the others are worked out on top of where
 * they put things. Ideas that swap the beat for its parts go after, so the
 * parts take on whatever the others did to the beat; hands-on changes
 * last, on top of everything.
 */
function ordered(ideas: Idea[]) {
  const timing = (i: Idea) => i.aspects.includes("arrangement") || i.aspects.includes("tempo");
  const swaps = (i: Idea) => !!i.lanes;
  const studio = ideas.filter((i) => !i.edits);
  return [
    ...studio.filter(timing),
    ...studio.filter((i) => !timing(i) && !swaps(i)),
    ...studio.filter((i) => !timing(i) && swaps(i)),
    ...ideas.filter((i) => i.edits),
  ];
}

/** Takes lanes out and puts new ones in, as an idea asks. */
function swapLanes(change: NonNullable<Idea["lanes"]>) {
  const { lanes } = useStudioStore.getState();
  const kept = lanes.filter((l) => !change.remove.includes(l.laneId));
  const added = change.add.filter((a) => !kept.some((l) => l.laneId === a.laneId));
  useStudioStore.setState({ lanes: [...kept, ...added] });
}

/** An idea with some of its parts left out. */
function withoutParts(idea: Idea, off: Part[]): Idea {
  if (!off.length) return idea;
  const dropped = new Set(off.flatMap((part) => FIELDS[part]));
  // Lanes it adds alongside (vocal layers) are its "layers" part; a swap (the beat for its parts) always goes.
  const noLayers = off.includes("layers") && !!idea.lanes?.add.length && !idea.lanes.remove.length;
  const added = new Set(noLayers ? idea.lanes!.add.map((l) => l.laneId) : []);
  const patches: Record<string, LanePatch> = {};
  for (const [laneId, patch] of Object.entries(idea.patches)) {
    if (added.has(laneId)) continue;
    const kept = Object.fromEntries(Object.entries(patch).filter(([field]) => !dropped.has(field as keyof LanePatch)));
    if (Object.keys(kept).length) patches[laneId] = kept;
  }
  return {
    ...idea,
    patches,
    projectBpm: off.includes("timing") ? undefined : idea.projectBpm,
    lanes: noLayers ? undefined : idea.lanes,
  };
}

/** What a set of hands-on changes touches (for listing them, and switching their parts). */
export function aspectsOfEdits(edits: HandEdit[]): Aspect[] {
  const found = new Set<Aspect>();
  for (const edit of edits) {
    if ("speed" in edit) {
      found.add("tempo");
      continue;
    }
    if (edit.nudgeSeconds) found.add("arrangement");
    if (edit.pitchSemitones !== undefined) found.add("key");
    if (edit.volume !== undefined || edit.muted !== undefined) found.add("levels");
    if (edit.fx) found.add("effects");
  }
  return ALL_ASPECTS.filter((a) => found.has(a));
}

/** Makes hands-on changes to the mix as it is now, leaving out the parts switched off. False if none applied. */
function applyEdits(edits: HandEdit[], off: Part[]) {
  let applied = false;
  for (const edit of edits) {
    const store = useStudioStore.getState();
    if ("speed" in edit) {
      if (off.includes("timing")) continue;
      const change = speedChange(edit.speed);
      if (!change) continue;
      store.applyLanePatches(change.patches, change.projectBpm);
      applied = true;
      continue;
    }
    const lane = store.lanes.find((l) => l.laneId === edit.laneId);
    if (!lane) continue;
    const patch: LanePatch = {};
    if (!off.includes("levels") && edit.volume !== undefined) patch.volume = edit.volume;
    if (!off.includes("levels") && edit.muted !== undefined) patch.muted = edit.muted;
    if (!off.includes("key") && edit.pitchSemitones !== undefined) patch.pitchSemitones = edit.pitchSemitones;
    if (!off.includes("effects") && edit.fx) patch.fx = { ...lane.fx, ...edit.fx };
    if (Object.keys(patch).length) {
      store.applyLanePatches({ [edit.laneId]: patch });
      applied = true;
    }
    if (!off.includes("timing") && edit.nudgeSeconds) {
      const ids = store.lanes.filter((l) => l.laneId === edit.laneId || leadOf(l.laneId) === edit.laneId).map((l) => l.laneId);
      useStudioStore.getState().moveLanes(ids, edit.nudgeSeconds);
      applied = true;
    }
  }
  return applied;
}

/**
 * The baseline with `ideas` on; the ones that couldn't go on are left out.
 * Worked out as one change of the mix, so the audio engine only hears
 * where it ends up (see asOneChange).
 */
function build(session: Session, baseline: Mix, ideas: Idea[], without: Record<string, Part[]>): { result: Mix; on: Idea[] } {
  const on: Idea[] = [];
  const { scope } = useAiScope.getState();
  const whole = isWhole(scope);
  refusedForScope.clear();
  asOneChange(() => {
    setMix(baseline);
    const inSync = session.timing === timingSignature(baseline.lanes, baseline.projectBpm);
    for (const idea of ordered(ideas)) {
      const off = without[idea.id] ?? [];
      if (idea.edits) {
        // The whole song faster or slower can't be had in just a section.
        const edits = whole ? idea.edits : idea.edits.filter((e) => !("speed" in e));
        let applied = false;
        const before = useStudioStore.getState().lanes;
        quietly(() => (applied = applyEdits(edits, off)));
        // Heard only in its own part of the song: everything else on stays as it is around it.
        if (applied && idea.scope) setLanes(applyScope(before, useStudioStore.getState().lanes, idea.scope));
        if (applied || off.length) on.push(idea);
        else if (edits.length < idea.edits.length) refusedForScope.add(idea.id);
        continue;
      }
      const compiled = on.length === 0 && inSync ? idea : recompileIdea(idea, rebaseSession(session));
      if (!compiled) continue;
      const kept = withoutParts(compiled, off);
      // Made for lanes that aren't here any more (the mix was cleared or replaced since) —
      // nor may it bring back a layer or a part whose vocal or beat is gone.
      const lanesNow = useStudioStore.getState().lanes;
      if (!ideaFits(kept, lanesNow) || kept.lanes?.add.some((l) => !lanesNow.some((n) => n.laneId === originOf(l.laneId)))) continue;
      quietly(() => {
        if (kept.lanes) swapLanes(kept.lanes);
        // Also works the duration out again for any lanes swapped in.
        useStudioStore.getState().applyLanePatches(kept.patches, kept.projectBpm);
      });
      on.push(idea);
    }
    if (!whole && on.length) {
      // Ideas that met the vocal and beat on a new tempo are played back at
      // the song's own, everything together (so it all still lines up), then
      // heard only where the scope says: the original everywhere else.
      const now = useStudioStore.getState();
      const lanes = Math.abs(now.projectBpm - baseline.projectBpm) > SAME_BPM ? retime(now.lanes, baseline.projectBpm / now.projectBpm) : now.lanes;
      setLanes(applyScope(baseline.lanes, lanes, scope), baseline.projectBpm);
    }
  });
  return { result: currentMix(), on };
}

/** Puts `lanes` in the mix as part of trying (the duration follows; `projectBpm` too, when given). */
function setLanes(lanes: StudioLane[], projectBpm?: number) {
  const duration = lanes.reduce((max, l) => Math.max(max, l.offsetSeconds + l.duration), 0);
  quietly(() => useStudioStore.setState(projectBpm === undefined ? { lanes, duration } : { lanes, duration, projectBpm }));
}


/**
 * Puts what's wanted on and records it as the trial. Ideas that were
 * switched off stay listed; with nothing on and nothing listed, it's over.
 */
function settle(session: Session, baseline: Mix, wanted: Idea[], from: Pick<Trial, "off" | "without"> | null): Idea[] {
  const without = from?.without ?? {};
  const { result, on } = build(session, baseline, wanted, without);
  // Each one keeps its whole patch (every clip it cut): only the latest few stay listed.
  const off = (from?.off ?? []).filter((i) => !on.some((o) => o.id === i.id)).slice(0, MAX_OFF);
  if (!on.length && !off.length) {
    setMix(baseline);
    useAiTrial.setState({ trial: null });
    return [];
  }
  useAiTrial.setState({ trial: { baseline, ideas: on, off, without, result, showing: "idea" } });
  return on;
}

/**
 * Tries `idea` from the original mix — instead of whatever was on, or,
 * with `add`, on top of the ones on (only those it can't be combined with
 * go, and `replace`, the one it takes the place of). False if it couldn't
 * be applied to this mix.
 */
export function tryIdea(
  session: Session,
  idea: Idea,
  { add = false, replace }: { add?: boolean; replace?: string } = {}
): boolean {
  const { trial } = useAiTrial.getState();
  const baseline = trial?.baseline ?? currentMix();
  const ideas =
    add && trial ? [...trial.ideas.filter((i) => i.id !== idea.id && i.id !== replace && compatible(i, idea)), idea] : [idea];
  const on = settle(session, baseline, ideas, trial);
  return on.some((i) => i.id === idea.id);
}

/**
 * Puts several ideas on at once, on top of what's on, worked out together
 * in one go (the mix is built once, not once per idea). Returns the ones
 * that went on. `after`: a trial just reverted to be worked out again (new
 * options, a fresh listen) — what was switched off in it stays off.
 */
export function tryIdeas(session: Session, ideas: Idea[], { after = null }: { after?: Trial | null } = {}): Idea[] {
  const { trial } = useAiTrial.getState();
  const from = trial ?? after;
  if (!ideas.length) {
    // Nothing to put on, but things switched off to keep listing.
    if (!trial && after?.off.length) settle(session, currentMix(), [], after);
    return [];
  }
  const baseline = trial?.baseline ?? currentMix();
  const wanted = ideas.reduce<Idea[]>((list, idea) => [...list.filter((i) => compatible(i, idea)), idea], trial?.ideas ?? []);
  const on = settle(session, baseline, wanted, from);
  return ideas.filter((idea) => on.some((i) => i.id === idea.id));
}

/** Switches one idea off, keeping the rest on — it stays listed, to switch back on. */
export function removeFromTrial(session: Session, ideaId: string) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const idea = trial.ideas.find((i) => i.id === ideaId);
  if (!idea) return;
  const rest = trial.ideas.filter((i) => i.id !== ideaId);
  settle(session, trial.baseline, rest, { ...trial, off: [idea, ...trial.off.filter((i) => i.id !== ideaId)] });
}

/** The idea on that makes `fix`: the Mix check's fixes (one idea for all of them), or Make it sound good. */
export function fixHolder(fix: FixId): Idea | null {
  return useAiTrial.getState().trial?.ideas.find((i) => fixesOf(i).includes(fix)) ?? null;
}

/**
 * Puts one of the Mix check's fixes on, with the fixes already on — all
 * worked out together as one idea, so none undoes another. `available`:
 * the fixes this mix has anything to do for (the rest are left out of
 * the idea). Returns the other ideas it took the place of (a style that
 * placed the vocal another way, say), or null if it couldn't go on.
 */
export function addFix(session: Session, fix: FixId, available?: Set<FixId>): Idea[] | null {
  const on = useAiTrial.getState().trial?.ideas ?? [];
  const wants = [...new Set([...on.flatMap(fixesOf), fix])].filter((f) => f === fix || !available || available.has(f));
  const idea = mixFix(session, wants);
  if (!idea) return null;
  const replaced = on.filter((i) => !fixesOf(i).length && !compatible(i, idea));
  return tryIdea(session, idea, { add: true }) ? replaced : null;
}

/**
 * Takes just `fix` off; the other fixes stay on, worked out again without
 * it. With Make it sound good on, its other fixes stay on in its place.
 * With no other fix left, the fixes are switched off (listed, to switch
 * back on). False if `fix` wasn't on.
 */
export function removeFix(session: Session, fix: FixId, available?: Set<FixId>): boolean {
  const holder = fixHolder(fix);
  if (!holder) return false;
  const rest = fixesOf(holder).filter((f) => f !== fix && (!available || available.has(f)));
  const idea = rest.length ? mixFix(session, rest) : null;
  if (idea && tryIdea(session, idea, { add: true, replace: holder.id })) return true;
  removeFromTrial(session, holder.id);
  return true;
}

/** Forgets an idea that was switched off (it's no longer listed). */
export function dismissOff(ideaId: string) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const off = trial.off.filter((i) => i.id !== ideaId);
  if (!off.length && !trial.ideas.length) return revertTrial();
  useAiTrial.setState({ trial: { ...trial, off } });
}

/** Switches one part of an idea (its timing, key, levels…) on or off. */
export function switchPart(session: Session, ideaId: string, part: Part, on: boolean) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const offNow = trial.without[ideaId] ?? [];
  const next = on ? offNow.filter((p) => p !== part) : [...new Set([...offNow, part])];
  const without = { ...trial.without, [ideaId]: next };
  if (!trial.ideas.some((i) => i.id === ideaId)) {
    useAiTrial.setState({ trial: { ...trial, without } });
    return;
  }
  settle(session, trial.baseline, trial.ideas, { ...trial, without });
}

/** A/B: the original or the idea in the mix (flips when not given). */
export function compare(showing?: Trial["showing"]) {
  const { trial } = useAiTrial.getState();
  if (!trial) return;
  const next = showing ?? (trial.showing === "idea" ? "original" : "idea");
  if (next === trial.showing) return;
  setMix(next === "idea" ? trial.result : trial.baseline);
  useAiTrial.setState({ trial: { ...trial, showing: next } });
}

/** Keeps what's being tried, as one undo step. */
export function keepTrial(): Idea[] {
  const { trial } = useAiTrial.getState();
  if (!trial) return [];
  if (!trial.ideas.length) {
    revertTrial();
    return [];
  }
  if (trial.showing === "original") setMix(trial.result);
  recordStep(trial.baseline);
  useAiTrial.setState({ trial: null });
  const kept: Kept = {
    id: ++keptCount,
    at: Date.now(),
    ideas: trial.ideas.map(({ id, title, icon, why, lines }) => ({ id, title, icon, why, lines })),
    before: trial.baseline,
    after: trial.result,
  };
  useAiLog.setState((log) => ({ kept: [kept, ...log.kept].slice(0, MAX_KEPT) }));
  return trial.ideas;
}

/** Puts the original mix back. Returns what was being tried (to work it out again, see tryIdeas). */
export function revertTrial(): Trial | null {
  const { trial } = useAiTrial.getState();
  if (!trial) return null;
  setMix(trial.baseline);
  useAiTrial.setState({ trial: null });
  return trial;
}

/**
 * What the AI may change: the whole song, a section, some lanes. With
 * ideas on, they're worked out again for it at once.
 */
export function setScope(session: Session | null, scope: Scope) {
  useAiScope.setState({ scope, preview: null });
  const { trial } = useAiTrial.getState();
  if (session && trial) settle(session, trial.baseline, trial.ideas, trial);
}

/**
 * Forgets what was being tried without touching the mix — it's a
 * different mix now (cleared, or another one opened), and the old
 * original must never come back over it. The scope goes back to the
 * whole song: a section of the old mix means nothing in the new one.
 */
export function forgetTrial() {
  refusedForScope.clear();
  useAiTrial.setState({ trial: null });
  useAiLog.setState({ kept: [] });
  useAiScope.setState({ scope: WHOLE_SONG, preview: null });
}

// Undo while trying means "not this": back to the original. Redo has
// nothing to redo until it's kept.
interceptHistory((action) => {
  if (!useAiTrial.getState().trial) return false;
  if (action === "undo") revertTrial();
  return true;
});

if (typeof window !== "undefined") {
  useStudioStore.subscribe((state, prev) => {
    if (applying || (state.lanes === prev.lanes && state.projectBpm === prev.projectBpm)) return;
    // Cleared: a section of the old mix means nothing in the next one.
    const cleared = !state.lanes.length && prev.lanes.length > 0;
    const { trial } = useAiTrial.getState();
    if (!trial) {
      if (cleared) forgetTrial();
      return;
    }
    // The person edited the mix with the idea on: it's theirs now. (The
    // history has already recorded their edit; the idea goes in before it.)
    // A different project, or editing the original while comparing, lets it go.
    const { past } = useStudioHistory.getState();
    const justRecorded = past[past.length - 1]?.lanes === prev.lanes;
    if (trial.showing === "idea" && prev.lanes === trial.result.lanes && justRecorded) {
      recordStep(trial.baseline, { beforeLast: true });
    }
    if (cleared) forgetTrial();
    else useAiTrial.setState({ trial: null });
  });
}
