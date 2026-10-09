import type { Aspect } from "./aiControl";
import { clipEnd, clipStart, clipsOf } from "./clipEdit";
import { keyLabel } from "./musicKey";
import { DEFAULT_FX, beatLength, effectiveKey, laneName, type LaneFx, type StudioLane } from "./studioStore";
import type { StemKind } from "@/lib/stemKinds";

// "What exactly happened?" The AI producer's changes, read back from the
// mix itself: the mix before them and after, compared line by line — its
// speed, key, volume, where it starts, how it's cut, how it sounds and
// what moves were drawn on it — in plain words, with the numbers. It's
// worked out from the lanes, not from what an idea says it did, so it's
// exactly what you hear. Pure.

export type MixState = { lanes: StudioLane[]; projectBpm: number };

/** One thing that changed on a line. */
export type Change = {
  aspect: Aspect;
  /** What it is: "Speed", "Key", "Volume"… */
  label: string;
  /** Before → after, short: "92 → 124 BPM". */
  value: string;
  /** In words: "35% faster, so it moves with the beat (pitch unchanged)". */
  text: string;
};

export type LaneDiff = {
  laneId: string;
  name: string;
  kind: StemKind;
  /** A new line (a vocal layer, a beat's part), one taken out, one changed — or not touched. */
  status: "added" | "removed" | "changed" | "same";
  before: StudioLane | null;
  after: StudioLane | null;
  changes: Change[];
  /** For an added line: the line it came from (a layer's lead vocal, a part's beat). */
  from?: string;
};

export type MixDiff = {
  /** The project tempo, when it changed. */
  tempo: { from: number; to: number } | null;
  lanes: LaneDiff[];
  /** Every line that changed, said in one sentence each — the summary at the top. */
  summary: string[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (n: number, unit: string) => `${n > 0 ? "+" : ""}${n}${unit}`;

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function entryOf(lane: StudioLane) {
  return Math.min(...clipsOf(lane).filter((c) => !c.muted).map((c) => clipStart(lane, c)), Infinity);
}

function endOf(lane: StudioLane) {
  return Math.max(...clipsOf(lane).filter((c) => !c.muted).map((c) => clipEnd(lane, c)), 0);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The effects that differ, in words: "reverb 0% → 22%", "compressor on". */
function fxChanges(before: LaneFx, after: LaneFx): string[] {
  const words: string[] = [];
  const level = (label: string, key: "reverb" | "delay" | "width" | "drive" | "duck") => {
    if (Math.abs(before[key] - after[key]) > 0.005) words.push(after[key] <= 0.005 ? `${label} off` : before[key] <= 0.005 ? `${label} ${pct(after[key])}` : `${label} ${pct(before[key])} → ${pct(after[key])}`);
  };
  level("reverb", "reverb");
  level("echo", "delay");
  level("width", "width");
  level("drive", "drive");
  level("ducking under the vocal", "duck");
  if (before.compress !== after.compress) words.push(after.compress ? "compressor on" : "compressor off");
  if (Math.abs(before.highpass - after.highpass) > 1) words.push(after.highpass <= 25 ? "low cut off" : `low cut at ${Math.round(after.highpass)} Hz`);
  if (Math.abs(before.lowpass - after.lowpass) > 10) words.push(after.lowpass >= 19500 ? "high cut off" : `high cut at ${(after.lowpass / 1000).toFixed(1)} kHz`);
  const eq = (["eqLow", "eqMid", "eqHigh"] as const).filter((k) => Math.abs(before[k] - after[k]) > 0.05);
  if (eq.length) words.push(`EQ ${eq.map((k) => `${k === "eqLow" ? "low" : k === "eqMid" ? "mid" : "high"} ${signed(Math.round(after[k] * 10) / 10, " dB")}`).join(", ")}`);
  if (Math.abs(before.pan - after.pan) > 0.02) words.push(Math.abs(after.pan) < 0.02 ? "centred" : `panned ${pct(Math.abs(after.pan))} ${after.pan < 0 ? "left" : "right"}`);
  if (before.delayDivision !== after.delayDivision && after.delay > 0.005) words.push(`echo every ${after.delayDivision}`);
  if (Math.abs(before.fadeIn - after.fadeIn) > 0.05) words.push(after.fadeIn > 0.05 ? `fades in over ${after.fadeIn.toFixed(1)}s` : "no fade-in");
  if (Math.abs(before.fadeOut - after.fadeOut) > 0.05) words.push(after.fadeOut > 0.05 ? `fades out over ${after.fadeOut.toFixed(1)}s` : "no fade-out");
  return words;
}

/** How a line is cut: "one whole take", "14 lines". */
function cutWords(lane: StudioLane) {
  const n = lane.clips?.length ?? 0;
  return n ? `${n} piece${n === 1 ? "" : "s"}` : "one whole take";
}

/** Named parts of a line, in order ("Verse 1, Chorus, Verse 2…") — what the AI called its sections. */
function sections(lane: StudioLane) {
  const names: string[] = [];
  for (const c of [...(lane.clips ?? [])].sort((a, b) => clipStart(lane, a) - clipStart(lane, b))) {
    if (c.label && names[names.length - 1] !== c.label) names.push(c.label);
  }
  return names;
}

/** What changed on one line, before → after. */
export function laneChanges(before: StudioLane, after: StudioLane, mix: { before: MixState; after: MixState }): Change[] {
  const changes: Change[] = [];
  const bar = beatLength(mix.after.projectBpm) * 4;

  if (Math.abs(before.tempoRatio - after.tempoRatio) > 1e-4) {
    const ratio = after.tempoRatio / before.tempoRatio;
    const faster = ratio > 1;
    const amount = Math.round(Math.abs(ratio - 1) * 1000) / 10;
    const bpmBefore = before.bpm ?? after.bpm;
    const bpmAfter = after.bpm ?? before.bpm;
    // Read as half or double time now (a 152 BPM vocal over a 79 BPM beat is counted at 76): both sides said that way.
    const recounted = !!bpmBefore && !!bpmAfter && Math.abs(Math.log(bpmAfter / bpmBefore)) > 0.3;
    const value = bpmAfter
      ? `${(bpmAfter * before.tempoRatio).toFixed(0)} → ${(bpmAfter * after.tempoRatio).toFixed(0)} BPM`
      : `${before.tempoRatio.toFixed(2)}× → ${after.tempoRatio.toFixed(2)}×`;
    changes.push({
      aspect: "tempo",
      label: "Speed",
      value,
      text: `${amount}% ${faster ? "faster" : "slower"}${
        recounted ? ` (its ${bpmBefore!.toFixed(0)} BPM counted in ${bpmAfter! < bpmBefore! ? "half" : "double"} time)` : ""
      } — stretched in time, so its pitch stays the same`,
    });
  }

  if (before.pitchSemitones !== after.pitchSemitones) {
    const shift = after.pitchSemitones - before.pitchSemitones;
    const from = effectiveKey(before);
    const to = effectiveKey(after);
    changes.push({
      aspect: "key",
      label: "Key",
      value: from && to ? `${keyLabel(from)} → ${keyLabel(to)}` : signed(shift, " st"),
      text: `${Math.abs(shift)} semitone${Math.abs(shift) === 1 ? "" : "s"} ${shift > 0 ? "higher" : "lower"} — every note moves by the same step, so the melody stays the same`,
    });
  }

  if (Math.abs(before.volume - after.volume) > 0.005 || before.muted !== after.muted) {
    if (before.muted !== after.muted) {
      changes.push({ aspect: "levels", label: "On / off", value: after.muted ? "on → off" : "off → on", text: after.muted ? "Switched off (muted)" : "Switched back on" });
    }
    if (Math.abs(before.volume - after.volume) > 0.005) {
      const db = after.volume > 0 && before.volume > 0 ? Math.round(20 * Math.log10(after.volume / before.volume) * 10) / 10 : null;
      changes.push({
        aspect: "levels",
        label: "Volume",
        value: `${pct(before.volume)} → ${pct(after.volume)}`,
        text: `${after.volume > before.volume ? "Louder" : "Quieter"}${db !== null ? ` by ${Math.abs(db)} dB` : ""}`,
      });
    }
  }

  const clipsChanged = !same(before.clips, after.clips);
  const startBefore = entryOf(before);
  const startAfter = entryOf(after);
  if (Number.isFinite(startBefore) && Number.isFinite(startAfter) && Math.abs(startBefore - startAfter) > 0.02) {
    const moved = startAfter - startBefore;
    changes.push({
      aspect: "arrangement",
      label: "Starts",
      value: `${clock(startBefore)} → ${clock(startAfter)}`,
      text: `Comes in ${Math.abs(moved) >= bar * 0.9 ? `${Math.round(Math.abs(moved) / bar)} bar${Math.round(Math.abs(moved) / bar) === 1 ? "" : "s"}` : `${Math.abs(moved).toFixed(2)}s`} ${moved > 0 ? "later" : "earlier"} (bar ${Math.round(startAfter / bar) + 1})`,
    });
  }
  if (clipsChanged) {
    const wasWhole = !before.clips?.length;
    const isWhole = !after.clips?.length;
    const named = sections(after);
    const reversed = (after.clips ?? []).filter((c) => c.reverse).length - (before.clips ?? []).filter((c) => c.reverse).length;
    const text = isWhole
      ? "Back to one whole take, as recorded"
      : wasWhole
        ? `Cut at its silences into ${after.clips!.length} pieces, each laid on the beat's bars${named.length ? ` — ${named.slice(0, 5).join(", ")}${named.length > 5 ? "…" : ""}` : ""}`
        : `Re-arranged: ${cutWords(before)} → ${cutWords(after)}${named.length ? ` (${named.slice(0, 5).join(", ")}${named.length > 5 ? "…" : ""})` : ""}`;
    changes.push({ aspect: "arrangement", label: "Cut", value: `${cutWords(before)} → ${cutWords(after)}`, text: reversed > 0 ? `${text}; ${reversed} piece${reversed === 1 ? "" : "s"} played backwards` : text });
    const endBefore = endOf(before);
    const endAfter = endOf(after);
    if (Math.abs(endAfter - endBefore) > bar) {
      changes.push({ aspect: "arrangement", label: "Ends", value: `${clock(endBefore)} → ${clock(endAfter)}`, text: endAfter > endBefore ? "Lasts longer (looped or extended)" : "Ends sooner (trimmed)" });
    }
  }

  const fx = fxChanges(before.fx, after.fx);
  if (fx.length) changes.push({ aspect: "effects", label: "Sound", value: `${fx.length} change${fx.length === 1 ? "" : "s"}`, text: fx.join(", ") });

  for (const param of ["volume", "filter"] as const) {
    const was = before.automation[param];
    const now = after.automation[param];
    if (same(was, now)) continue;
    const label = param === "volume" ? "Volume moves" : "Filter sweep";
    changes.push({
      aspect: "automation",
      label,
      value: now?.length ? (was?.length ? "redrawn" : "drawn") : "removed",
      text: now?.length
        ? param === "volume"
          ? `Its volume rises and falls over time (${now.length} points) — drop-outs, build-ups or pumping`
          : `A filter opens and closes over time (${now.length} points) — muffled, then wide open`
        : `Its ${param === "volume" ? "volume moves were" : "filter sweep was"} taken off`,
    });
  }
  return changes;
}

/** The line an added lane came from: a vocal layer's lead, a beat part's beat. */
function originId(laneId: string) {
  const at = laneId.indexOf("~");
  return at > 0 ? laneId.slice(0, at) : null;
}

/** One sentence for a changed line, for the summary. */
function sentence(diff: LaneDiff, lanes: StudioLane[]): string | null {
  const name = `“${diff.name}”`;
  if (diff.status === "added") {
    const from = diff.from ? lanes.find((l) => l.laneId === diff.from) : undefined;
    const shift = from && diff.after ? diff.after.pitchSemitones - from.pitchSemitones : 0;
    return `New line ${name}${from ? `, made from “${laneName(from)}”` : ""}${shift ? ` (${signed(shift, " st")})` : ""}.`;
  }
  if (diff.status === "removed") return `${name} taken out.`;
  if (diff.status !== "changed") return null;
  const parts = diff.changes.map((c) => {
    if (c.label === "Speed") return `${c.text.split(" — ")[0].replace(/ \(its .*\)$/, "")} (${c.value}${/counted in half/.test(c.text) ? ", half time" : /counted in double/.test(c.text) ? ", double time" : ""})`;
    if (c.label === "Key") return `${c.text.split(" — ")[0]} (${c.value})`;
    if (c.label === "Cut") return c.text.split(" — ")[0].replace(/^Cut/, "cut").replace(/^Re-arranged/, "re-arranged").replace(/^Back/, "back");
    if (c.label === "Starts") return c.text.replace(/^Comes/, "comes");
    if (c.label === "Volume") return c.text.charAt(0).toLowerCase() + c.text.slice(1);
    if (c.label === "Sound") return c.text;
    return c.text.charAt(0).toLowerCase() + c.text.slice(1);
  });
  return `${name}: ${parts.join("; ")}.`;
}

/** Everything that differs between two mixes, line by line. */
export function diffMix(before: MixState, after: MixState): MixDiff {
  const lanes: LaneDiff[] = [];
  const mix = { before, after };
  for (const a of after.lanes) {
    const b = before.lanes.find((l) => l.laneId === a.laneId) ?? null;
    if (!b) {
      lanes.push({ laneId: a.laneId, name: laneName(a), kind: a.kind, status: "added", before: null, after: a, changes: [], from: originId(a.laneId) ?? undefined });
      continue;
    }
    const changes = b === a ? [] : laneChanges(b, a, mix);
    lanes.push({ laneId: a.laneId, name: laneName(a), kind: a.kind, status: changes.length ? "changed" : "same", before: b, after: a, changes });
  }
  for (const b of before.lanes) {
    if (after.lanes.some((l) => l.laneId === b.laneId)) continue;
    // Taken out because its parts took over (a beat swapped for its drums, bass and melody)?
    const replacedBy = after.lanes.filter((l) => originId(l.laneId) === b.laneId);
    lanes.push({ laneId: b.laneId, name: laneName(b), kind: b.kind, status: "removed", before: b, after: null, changes: [], from: replacedBy.length ? replacedBy.map((l) => l.laneId).join(",") : undefined });
  }
  const tempo = Math.abs(before.projectBpm - after.projectBpm) > 0.05 ? { from: before.projectBpm, to: after.projectBpm } : null;
  const summary: string[] = [];
  if (tempo) summary.push(`The song's tempo went from ${tempo.from.toFixed(0)} to ${tempo.to.toFixed(0)} BPM.`);
  const swapped = lanes.filter((d) => d.status === "removed" && d.from);
  for (const d of swapped) {
    const parts = d.from!.split(",").map((id) => after.lanes.find((l) => l.laneId === id)).filter((l): l is StudioLane => !!l);
    summary.push(`“${d.name}” was swapped for its own ${parts.map((p) => (p.kind === "other" ? "melody" : p.kind)).join(", ")} — they add up to the same sound, but each can now drop out on its own.`);
  }
  for (const d of lanes) {
    if (d.status === "removed" && d.from) continue;
    // A beat's parts that just took its place aren't new lines worth a sentence each.
    if (d.status === "added" && d.from && swapped.some((s) => s.laneId === d.from)) continue;
    const said = sentence(d, after.lanes);
    if (said) summary.push(said);
  }
  return { tempo, lanes, summary };
}

/** How many lines changed (added, removed or changed). */
export function changedCount(diff: MixDiff) {
  return diff.lanes.filter((d) => d.status !== "same").length;
}

/** Whether a fx rack is still the default (nothing on). */
export function plainFx(fx: LaneFx) {
  return (Object.keys(DEFAULT_FX) as (keyof LaneFx)[]).every((k) => fx[k] === DEFAULT_FX[k]);
}
