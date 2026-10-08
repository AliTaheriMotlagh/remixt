"use client";

import { checkMix, findDrop, harmonyOf, ideaFits, type Idea, type Session } from "./aiIdeas";
import { keepTrial, revertTrial, tryIdea, useAiTrial } from "./aiTrial";
import { audioEngine } from "./audioEngine";
import { describeSections } from "./pairMatch";
import { bestVersions, scoreMix } from "./mixScore";
import { keyLabel } from "./musicKey";
import { useBeatModel } from "./neuralBeats";
import { changeSpeed, nudge } from "./quickAdjust";
import { startNewStep } from "./studioHistory";
import { effectiveKey, laneName, useStudioStore, type LaneFx, type LanePatch } from "./studioStore";
import type { CoproducerToolName } from "@/lib/coproducer";

// The co-producer's hands: what each of its tools (lib/coproducer.ts)
// does in the Studio. They run here, in the browser, on the person's own
// mix — ideas through the same try / keep / undo as the AI producer panel,
// hands-on changes as ordinary undoable edits — and answer with plain
// facts for Claude to reason over.

export type CoproducerContext = {
  /** What the AI producer heard (null until it has listened). */
  session: () => Session | null;
  ideas: () => Idea[];
  /** Listens again if the mix changed since — resolves with the fresh session. */
  listen: () => Promise<Session | null>;
};

type Result = { content: string; isError?: boolean };

const round = (x: number, digits = 2) => Math.round(x * 10 ** digits) / 10 ** digits;

function lanesNow() {
  return useStudioStore.getState().lanes.map((l) => ({
    lane_id: l.laneId,
    name: laneName(l),
    kind: l.kind,
    tempo_bpm: l.bpm ? round(l.bpm * l.tempoRatio, 1) : null,
    original_bpm: l.bpm,
    speed: round(l.tempoRatio, 4),
    pitch_semitones: l.pitchSemitones,
    key: effectiveKey(l) ? keyLabel(effectiveKey(l)!) : null,
    volume: l.volume,
    muted: l.muted,
    starts_at_seconds: round(l.offsetSeconds),
    clips: l.clips?.length ?? 0,
    effects: Object.fromEntries(Object.entries(l.fx).filter(([k, v]) => v !== (DEFAULT_FX_VALUES as Record<string, unknown>)[k])),
  }));
}

const DEFAULT_FX_VALUES: Partial<LaneFx> = {
  pan: 0,
  highpass: 20,
  lowpass: 20000,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  drive: 0,
  compress: false,
  width: 0,
  reverb: 0,
  delay: 0,
  fadeIn: 0,
  fadeOut: 0,
  duck: 0,
};

function report(session: Session) {
  const lanes = useStudioStore.getState().lanes;
  const score = scoreMix(session, lanes);
  return {
    score: score.total,
    score_parts: score.parts.map((p) => ({ part: p.label, score: Math.round(p.score * 100), heard: p.text })),
    mix_check: checkMix(session, lanes).map((c) => ({ check: c.label, status: c.status, text: c.text })),
  };
}

const json = (value: unknown): Result => ({ content: JSON.stringify(value) });

/** Carries out one tool call. Never throws: problems come back as error results Claude can read. */
export async function runCoproducerTool(name: string, input: Record<string, unknown>, ctx: CoproducerContext): Promise<Result> {
  try {
    return await run(name as CoproducerToolName, input, ctx);
  } catch (error) {
    return { content: error instanceof Error ? error.message : "That didn't work", isError: true };
  }
}

async function run(name: CoproducerToolName, input: Record<string, unknown>, ctx: CoproducerContext): Promise<Result> {
  const studio = useStudioStore.getState();
  if (name === "play") {
    const from = typeof input.from_seconds === "number" ? input.from_seconds : null;
    if (from !== null) audioEngine.seek(Math.max(0, Math.min(from, studio.duration)));
    if (!useStudioStore.getState().isPlaying) await audioEngine.play().catch(() => {});
    return json({ playing: true, from_seconds: round(useStudioStore.getState().playhead) });
  }
  if (name === "undo_try") {
    revertTrial();
    return json({ ok: true, note: "Back to the mix as it was before trying" });
  }
  if (name === "keep_changes") {
    const kept = keepTrial();
    return json({ kept: kept.map((i) => i.title), note: kept.length ? "Kept as one undo step" : "Nothing was being tried" });
  }
  if (name === "change_speed") {
    const factor = Number(input.factor);
    if (!(factor >= 0.8 && factor <= 1.25)) return { content: "factor must be between 0.8 and 1.25", isError: true };
    if (useAiTrial.getState().trial) keepTrial();
    changeSpeed(factor);
    return json({ project_bpm: useStudioStore.getState().projectBpm });
  }

  const session = await ctx.listen();
  if (!session) {
    return json({ lanes: lanesNow(), note: "The Studio needs a vocal and a beat in the mix to listen — ask the person to add them from the library." });
  }
  const ideas = ctx.ideas();
  const trial = useAiTrial.getState().trial;

  if (name === "get_mix") {
    const beatModel = useBeatModel.getState();
    return json({
      project_bpm: studio.projectBpm,
      lanes: lanesNow(),
      working_on: { vocal: session.vocal?.laneId ?? null, beat: session.beat?.laneId ?? null },
      trying: trial ? { ideas: trial.ideas.map((i) => ({ id: i.id, title: i.title })), showing: trial.showing } : null,
      ...report(session),
      notes: session.notes,
      beat_model: beatModel.status,
    });
  }

  if (name === "listen_closely") {
    const { pair } = session;
    if (!pair) return json({ note: session.notes.join(" ") || "No vocal/beat pair to look at" });
    const lanes = useStudioStore.getState().lanes;
    const vocal = lanes.find((l) => l.laneId === pair.vocalLaneId);
    const beat = lanes.find((l) => l.laneId === pair.beatLaneId);
    const scan = vocal && beat ? harmonyOf(session, { vocal, beat }) : null;
    const drop = findDrop(pair.structure);
    return json({
      beat: { bpm: round(pair.beatBpm), key: keyLabel(pair.beatKey), intro_bars: pair.structure.introBars, music_ends_bar: pair.structure.endBar, drop: drop ? { bar: drop.bar + 1, kind: drop.kind } : null, beats_heard_by: pair.beatAnalysis.neural ? "beat model (neural)" : "onset tracker" },
      vocal: {
        bpm: round(pair.reading),
        key: keyLabel(pair.vocalKey),
        bars_from: pair.heard.guided ? "its original beat (exact)" : "its voice alone (a guess)",
        sections: describeSections(pair.vocalAnalysis, pair.heard),
      },
      keys: pair.keys,
      harmony: scan
        ? {
            note: "share of the vocal's held notes that sit in the beat's chords where they land now, by pitch shift of the vocal",
            now: Math.round(scan.now.inChord * 100),
            by_shift: [...scan.byShift].map(([shift, h]) => ({ shift, in_chord_percent: Math.round(h.inChord * 100) })).sort((a, b) => b.in_chord_percent - a.in_chord_percent).slice(0, 5),
          }
        : { note: "no clear held notes to measure (rap, speech or very little singing) — only the key labels" },
    });
  }

  if (name === "list_ideas") {
    const kind = typeof input.kind === "string" ? input.kind : "all";
    const lanes = trial?.baseline.lanes ?? useStudioStore.getState().lanes;
    return json(
      ideas
        .filter((i) => kind === "all" || i.kind === kind)
        .map((i) => ({ id: i.id, kind: i.kind, title: i.title, what: i.short, why: i.why, changes: i.aspects, fits_now: ideaFits(i, lanes), on: !!trial?.ideas.some((t) => t.id === i.id) }))
    );
  }

  if (name === "best_versions") {
    const limit = typeof input.limit === "number" ? Math.max(1, Math.min(10, Math.round(input.limit))) : 5;
    const { now, versions } = bestVersions(session, ideas, limit);
    return json({
      current_score: now.total,
      best: versions.map((v) => ({ id: v.idea.id, title: v.idea.title, kind: v.idea.kind, score: v.score.total, weakest: [...v.score.parts].sort((a, b) => a.score - b.score)[0]?.text ?? null })),
    });
  }

  if (name === "try_ideas") {
    const ids = Array.isArray(input.ids) ? input.ids.filter((x): x is string => typeof x === "string") : [];
    const missing = ids.filter((id) => !ideas.some((i) => i.id === id));
    if (missing.length) return { content: `No idea with id ${missing.join(", ")} — call list_ideas for the ids`, isError: true };
    if (input.replace) revertTrial();
    const tried: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      const idea = ideas.find((i) => i.id === id)!;
      if (tryIdea(session, idea, { add: true })) tried.push(idea.title);
      else failed.push(idea.title);
    }
    const on = useAiTrial.getState().trial?.ideas ?? [];
    return json({
      tried,
      ...(failed.length ? { could_not_apply: failed } : {}),
      now_on: on.map((i) => ({ id: i.id, title: i.title, changed: i.lines.slice(0, 8), listen_from_seconds: i.listenAt ?? null })),
      ...report(session),
    });
  }

  if (name === "adjust_lane") {
    const laneId = String(input.lane_id ?? "");
    const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    if (!lane) return { content: `No lane ${laneId} — get_mix lists the lane ids`, isError: true };
    if (useAiTrial.getState().trial) keepTrial();
    const patch: LanePatch = {};
    if (typeof input.volume === "number") patch.volume = Math.max(0, Math.min(1.5, input.volume));
    if (typeof input.pitch_semitones === "number") patch.pitchSemitones = Math.max(-12, Math.min(12, Math.round(input.pitch_semitones)));
    const fx = input.effects && typeof input.effects === "object" ? (input.effects as Record<string, unknown>) : null;
    if (fx) {
      const names: Record<string, keyof LaneFx> = {
        reverb: "reverb", delay: "delay", width: "width", drive: "drive", duck: "duck",
        eq_low: "eqLow", eq_mid: "eqMid", eq_high: "eqHigh", highpass: "highpass", lowpass: "lowpass", compress: "compress", pan: "pan",
      };
      const next: LaneFx = { ...lane.fx };
      for (const [k, v] of Object.entries(fx)) {
        const field = names[k];
        if (!field || (typeof v !== "number" && typeof v !== "boolean")) continue;
        (next as Record<string, unknown>)[field] = v;
      }
      patch.fx = next;
    }
    if (Object.keys(patch).length) {
      startNewStep();
      useStudioStore.getState().applyLanePatches({ [laneId]: patch });
    }
    if (typeof input.nudge_beats === "number" && input.nudge_beats) nudge(laneId, input.nudge_beats);
    if (typeof input.muted === "boolean" && input.muted !== lane.muted) {
      startNewStep();
      useStudioStore.getState().toggleMute(laneId);
    }
    const fresh = await ctx.listen();
    return json({ ok: true, ...(fresh ? report(fresh) : {}) });
  }

  return { content: `Unknown tool ${name}`, isError: true };
}
