"use client";

import { diffMix } from "./aiExplain";
import { useAiTrial } from "./aiTrial";
import { withEffectiveDuration } from "./clipEdit";
import { asAuthor, currentSnapshot, undo, useStudioHistory, type History, type Snapshot, type StepAuthor } from "./studioHistory";
import { laneName, useStudioStore, type LaneFx, type StudioLane } from "./studioStore";

// The Studio's history read back, a step at a time — what each step
// changed, line by line and in words (the same words as the AI's "What
// happened"), when, and by whom — and any one step taken back on its own,
// leaving everything after it as it is: only what that step changed goes
// back to how it was. That can be the whole step, or just what it did to
// one lane. It's a new step itself, so it can be undone in turn.
//
// A step's "before" is its snapshot in the undo steps; its "after" is the
// next one's, or the mix as it is now for the last.

export type HistoryEntry = {
  /** Where it is in the undo steps (History.past). */
  index: number;
  at: number | null;
  by: StepAuthor;
  /** What it was called (an AI idea's title, "Undid …"), else the first thing it changed. */
  title: string;
  /** Everything it changed, a sentence each. */
  lines: string[];
  /** The lanes it added, took out or changed. */
  laneIds: string[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What a step changed beyond the lanes' sound and timing (aiExplain covers those): names, solo, the crossfader side. */
function laneExtras(before: StudioLane, after: StudioLane): string[] {
  const lines: string[] = [];
  const name = `“${laneName(after)}”`;
  if ((before.name ?? "") !== (after.name ?? "")) lines.push(`“${laneName(before)}” renamed ${name}.`);
  if (before.solo !== after.solo) lines.push(`${name} ${after.solo ? "soloed" : "unsoloed"}.`);
  if (before.xfade !== after.xfade) lines.push(after.xfade ? `${name} on side ${after.xfade.toUpperCase()} of the crossfader.` : `${name} off the crossfader.`);
  return lines;
}

/** What a step changed about the song as a whole (the tempo is in aiExplain's summary). */
function songLines(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  if (Math.abs(before.masterVolume - after.masterVolume) > 0.005) lines.push(`Master volume ${pct(before.masterVolume)} → ${pct(after.masterVolume)}.`);
  if (before.loopEnabled !== after.loopEnabled || before.loopStart !== after.loopStart || before.loopEnd !== after.loopEnd) {
    const range = `${clock(after.loopStart)}–${clock(after.loopEnd)}`;
    lines.push(!after.loopEnabled ? "Loop off." : !before.loopEnabled ? `Loop on (${range}).` : `Loop moved to ${range}.`);
  }
  if (!same(before.markers, after.markers)) lines.push(`Markers changed (${after.markers.length} now).`);
  if (!same(before.pads, after.pads)) lines.push(`Sample pads changed (${after.pads.length} now).`);
  if (!same(before.master, after.master)) lines.push("The master's sound changed (tone and glue).");
  if (Math.abs(before.crossfader - after.crossfader) > 0.005) lines.push("Crossfader moved.");
  return lines;
}

/** Lanes added or taken out, said as one thing ("Added 4 lines of “Song”", "Took out “Vocal”") — what a step is mostly about when it does that. */
function addedOrRemoved(lanes: StudioLane[], verb: string) {
  if (!lanes.length) return null;
  const songs = [...new Set(lanes.map((l) => l.trackTitle))];
  if (lanes.length === 1) return `${verb} “${laneName(lanes[0])}”`;
  return songs.length === 1 ? `${verb} ${lanes.length} lines of “${songs[0]}”` : `${verb} ${lanes.length} lanes`;
}

/** Everything one step changed, in words, the lanes it touched, and what it's called in a few words. */
export function describeStep(before: Snapshot, after: Snapshot): { lines: string[]; laneIds: string[]; headline: string | null } {
  const diff = diffMix({ lanes: before.lanes, projectBpm: before.projectBpm }, { lanes: after.lanes, projectBpm: after.projectBpm });
  const lines = [...diff.summary];
  const added = diff.lanes.filter((d) => d.status === "added").map((d) => d.after!);
  const removed = diff.lanes.filter((d) => d.status === "removed").map((d) => d.before!);
  const headline = addedOrRemoved(added, "Added") ?? addedOrRemoved(removed, "Took out");
  const laneIds = new Set(diff.lanes.filter((d) => d.status !== "same").map((d) => d.laneId));
  for (const a of after.lanes) {
    const b = before.lanes.find((l) => l.laneId === a.laneId);
    if (!b || b === a) continue;
    const extras = laneExtras(b, a);
    if (extras.length) laneIds.add(a.laneId);
    lines.push(...extras);
  }
  lines.push(...songLines(before, after));
  return { lines, laneIds: [...laneIds], headline };
}

/** Every step in the history, oldest first. */
export function historyEntries({ past }: Pick<History, "past">, current: Snapshot): HistoryEntry[] {
  return past.map((before, index) => {
    const after = past[index + 1] ?? current;
    const { lines, laneIds, headline } = describeStep(before, after);
    const title = before.meta?.label ?? headline ?? lines[0]?.replace(/\.$/, "") ?? "A small change";
    return { index, at: before.meta?.at ?? null, by: before.meta?.by ?? "you", title, lines: lines.length ? lines : ["A small change (nothing you'd hear)."], laneIds };
  });
}

/** Lane fields a step never changes: what the lane is, not how it's set. */
const FIXED = new Set<keyof StudioLane>(["laneId", "stemId", "kind", "trackTitle", "artistName", "peaks", "originalDuration", "duration"]);
/** Song fields a step can change. */
const SONG: (keyof Snapshot)[] = ["projectBpm", "masterVolume", "loopEnabled", "loopStart", "loopEnd", "markers", "crossfader", "pads", "master"];

const FIELD_NAMES: Partial<Record<string, string>> = {
  tempoRatio: "speed",
  pitchSemitones: "key",
  musicalKey: "key",
  offsetSeconds: "start",
  clips: "cut",
  muted: "on/off",
  automation: "drawn moves",
  name: "name",
  bpm: "tempo",
  projectBpm: "song tempo",
  masterVolume: "master volume",
  loopEnabled: "loop",
  loopStart: "loop",
  loopEnd: "loop",
  markers: "markers",
  pads: "pads",
  master: "master sound",
  crossfader: "crossfader",
};

/** `current`'s lane with what the step changed on it (`before` → `after`) put back; what had changed again since is noted in `later`. */
function revertLane(before: StudioLane, after: StudioLane, current: StudioLane, later: Set<string>): StudioLane {
  const out: Record<string, unknown> = { ...current };
  let changed = false;
  const note = (field: string) => later.add(`“${laneName(current)}”'s ${FIELD_NAMES[field] ?? field}`);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof StudioLane>) {
    if (FIXED.has(key)) continue;
    if (key === "fx" || key === "automation") {
      const b = before[key] as Record<string, unknown>;
      const a = after[key] as Record<string, unknown>;
      const c = { ...(current[key] as Record<string, unknown>) };
      let any = false;
      for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (same(b[k], a[k])) continue;
        if (!same(c[k], a[k])) note(key === "fx" ? (k as keyof LaneFx) : "automation");
        if (b[k] === undefined) delete c[k];
        else c[k] = b[k];
        any = true;
      }
      if (any) {
        out[key] = c;
        changed = true;
      }
      continue;
    }
    if (same(before[key], after[key])) continue;
    if (!same(current[key], after[key])) note(key);
    if (before[key] === undefined) delete out[key];
    else out[key] = before[key];
    changed = true;
  }
  return changed ? withEffectiveDuration(out as StudioLane) : current;
}

/**
 * The mix with one step (`before` → `after`) taken back out of `current`
 * — only what that step changed, or with `laneId` only what it did to that
 * lane. Lanes it added go, lanes it took out come back where they were, and
 * every setting it changed goes back to how it was. `later` lists what had
 * been changed again since, which goes back too. Null when nothing of the
 * step is left to take back.
 */
export function revertStep(before: Snapshot, after: Snapshot, current: Snapshot, laneId?: string): { mix: Partial<Snapshot>; later: string[] } | null {
  const later = new Set<string>();
  let lanes = current.lanes;
  let changed = false;
  const wanted = (id: string) => !laneId || id === laneId;

  for (const a of after.lanes) {
    if (!wanted(a.laneId)) continue;
    const b = before.lanes.find((l) => l.laneId === a.laneId);
    const at = lanes.findIndex((l) => l.laneId === a.laneId);
    if (at < 0 || b === a) continue;
    if (!b) {
      // Added by the step: it goes (with anything done to it since).
      if (lanes[at] !== a) later.add(`“${laneName(a)}”`);
      lanes = lanes.filter((_, i) => i !== at);
      changed = true;
      continue;
    }
    const next = revertLane(b, a, lanes[at], later);
    if (next !== lanes[at]) {
      lanes = lanes.map((l, i) => (i === at ? next : l));
      changed = true;
    }
  }

  for (const [i, b] of before.lanes.entries()) {
    if (!wanted(b.laneId) || after.lanes.some((l) => l.laneId === b.laneId) || lanes.some((l) => l.laneId === b.laneId)) continue;
    // Taken out by the step: back where it was, after the lane it followed (if that's still there).
    const prior = before.lanes
      .slice(0, i)
      .reverse()
      .map((p) => lanes.findIndex((l) => l.laneId === p.laneId))
      .find((at) => at >= 0);
    const at = prior === undefined ? 0 : prior + 1;
    lanes = [...lanes.slice(0, at), b, ...lanes.slice(at)];
    changed = true;
  }

  const mix: Partial<Snapshot> = {};
  if (!laneId) {
    for (const field of SONG) {
      if (same(before[field], after[field])) continue;
      if (!same(current[field], after[field])) later.add(FIELD_NAMES[field] ?? field);
      (mix as Record<string, unknown>)[field] = before[field];
      changed = true;
    }
  }
  if (!changed) return null;
  if (lanes !== current.lanes) {
    mix.lanes = lanes;
    mix.duration = lanes.reduce((max, lane) => Math.max(max, lane.offsetSeconds + lane.duration), 0);
  }
  return { mix, later: [...later] };
}

export type UndoResult = { ok: true; title: string; later: string[] } | { ok: false; reason: string };

/**
 * Takes one step of the history back on its own (see revertStep), as a
 * new step by `by`. With `laneId`, only what it did to that lane.
 */
export function undoStep(index: number, { laneId, by = "you" }: { laneId?: string; by?: StepAuthor } = {}): UndoResult {
  if (useAiTrial.getState().trial) return { ok: false, reason: "An AI idea is being tried — keep it or undo it first" };
  const { past } = useStudioHistory.getState();
  const before = past[index];
  if (!before) return { ok: false, reason: "There's no such change in the history" };
  const current = currentSnapshot();
  const after = past[index + 1] ?? current;
  const reverted = revertStep(before, after, current, laneId);
  if (!reverted) return { ok: false, reason: "Nothing of that change is left to undo" };
  const entry = historyEntries({ past: [before] }, after)[0];
  const lane = laneId ? current.lanes.find((l) => l.laneId === laneId) ?? before.lanes.find((l) => l.laneId === laneId) : undefined;
  const title = `Undid “${entry.title}”${lane ? ` on “${laneName(lane)}”` : ""}`;
  asAuthor(by, title, () => useStudioStore.setState(reverted.mix));
  return { ok: true, title, later: reverted.later };
}

/** Undoes every step from `index` on, newest first (redo brings them back). */
export function undoBackTo(index: number): UndoResult {
  if (useAiTrial.getState().trial) return { ok: false, reason: "An AI idea is being tried — keep it or undo it first" };
  const { past } = useStudioHistory.getState();
  if (!past[index]) return { ok: false, reason: "There's no such change in the history" };
  for (let n = past.length - index; n > 0; n--) undo();
  return { ok: true, title: `Back to before step ${index + 1}`, later: [] };
}
