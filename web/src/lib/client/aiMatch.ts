"use client";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { activeAi, type AiProvider } from "./aiSettings";
import { refineTempo, type StemAnalysis } from "./analysis";
import {
  beatStructure,
  hearVocal,
  placeVocal,
  placementNotes,
  rulerBar,
  sectionBars,
  suggestLayout,
  type BeatStructure,
  type HeardVocal,
  type LaneInput,
  type SectionPlacement,
} from "./arrange";
import { analyzeGuide, analyzeLane } from "./autoMatch";
import { bestKeyShift, keyLabel } from "./musicKey";
import {
  DEFAULT_FX,
  FX_PRESETS,
  beatLength,
  effectiveKey,
  useStudioStore,
  type LanePatch,
  type StudioLane,
} from "./studioStore";

// The per-lane "✨ AI" in the Studio: one vocal and one beat, arranged by a
// language model (Claude or ChatGPT, with the user's own key).
//
// A language model can't hear audio, so it's given what the Studio's own
// analysis heard: both songs' tempo and key, the beat's bars and how loud
// each one is, where its intro and ending are, and the vocal cut into
// sections — how long each is, how loud, and which ones share their notes
// (a chorus that comes back). It answers with a plan in a fixed shape —
// which vocal section goes on which bar, whether to stretch the vocal or
// the beat, a correction if the bar lines were misread, level and FX — and
// the same engine as AI Match carries it out exactly. Pitch is never
// changed.

const VOCAL_PRESETS = FX_PRESETS.filter((p) => p.kind === "vocals");
const BEAT_PRESETS = FX_PRESETS.filter((p) => p.kind === "beat");

const PlanSchema = z.object({
  follow: z
    .enum(["beat", "vocal"])
    .describe("Which song keeps its tempo; the other is time-stretched to it (never pitch-shifted)."),
  shift_beats: z
    .number()
    .describe("Move the whole vocal this many beats against the bar lines (-3 to 3; 0 unless the downbeat looks misread)."),
  sections: z
    .array(
      z.object({
        section: z.number().describe("Index of a vocal section."),
        bar: z.number().describe("Bar of the beat (0-based) where that section's first downbeat lands."),
      })
    )
    .describe("The arrangement, in order. A section may be used more than once, or left out."),
  vocal_gain_db: z.number().describe("Vocal level against a loudness-matched starting point, -6 to 6 dB."),
  vocal_preset: z.enum(["none", ...VOCAL_PRESETS.map((p) => p.id)] as [string, ...string[]]),
  beat_preset: z.enum(["none", ...BEAT_PRESETS.map((p) => p.id)] as [string, ...string[]]),
  explanation: z.string().describe("A few sentences for the user on why this arrangement works."),
});

type Plan = z.infer<typeof PlanSchema>;

// The same shape for OpenAI's strict JSON-schema mode, which wants every
// property required and no extras.
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["follow", "shift_beats", "sections", "vocal_gain_db", "vocal_preset", "beat_preset", "explanation"],
  properties: {
    follow: { type: "string", enum: ["beat", "vocal"] },
    shift_beats: { type: "integer" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "bar"],
        properties: { section: { type: "integer" }, bar: { type: "integer" } },
      },
    },
    vocal_gain_db: { type: "number" },
    vocal_preset: { type: "string", enum: ["none", ...VOCAL_PRESETS.map((p) => p.id)] },
    beat_preset: { type: "string", enum: ["none", ...BEAT_PRESETS.map((p) => p.id)] },
    explanation: { type: "string" },
  },
};

const SYSTEM_PROMPT = `You are a music producer arranging a vocal (an acapella cut out of one song) over a beat (the instrumental of another song), inside a remix studio.

You can't hear the audio. The studio has analysed both songs and gives you what it measured: tempos and keys, the beat's bars with how loud each one is (a digit 0-9 per bar), where its intro and ending are and where its level changes, and the vocal cut into sections with their length in bars, loudness, how much of the time is sung, and which sections share their notes (similarity near 1 usually means a repeated chorus or hook).

Decide how the vocal should sit on the beat so it sounds like a real song:
- Put vocal sections on bars of the beat. Bars are counted from 0 on the beat; a section's "bar" is where its first downbeat lands (a pickup of a beat or two before it is handled for you). Sections must not overlap and must end before the beat's music does.
- Use the beat's structure: let an intro play before the vocal comes in, start sections at 4- or 8-bar boundaries and where the beat's level changes, put the most repeated or loudest vocal section (likely the chorus) where the beat is fullest, and leave room for an outro.
- You may reorder sections, repeat one (a chorus or hook coming back is normal), or leave some out. Keep verses in their original order unless there's a reason not to.
- Choose which song keeps its tempo. Stretching either one far from 1.0x sounds less natural, so prefer the option that bends less, unless the user says otherwise.
- shift_beats corrects the vocal against the bar lines when the downbeat looks misread (it's flagged as uncertain, or the vocal's lines mostly start two beats off the one). Otherwise leave it 0.
- Pitch is never changed. If the keys clash, say so in the explanation and suggest the user shifts it by hand, but don't try to fix it.
- The studio's own suggested arrangement is included; improve on it where you can, keep it where it's already right.
- If the user asked for something, follow it where the material allows and say when it doesn't.`;

/** Mean chroma of a stretch of a song, from its analysis. */
function chromaBetween(analysis: StemAnalysis, from: number, to: number) {
  const sum = new Array(12).fill(0);
  const a = Math.max(0, Math.floor(from * analysis.chromaRate));
  const b = Math.min(analysis.chroma.length / 12, Math.ceil(to * analysis.chromaRate));
  for (let f = a; f < b; f++) for (let pc = 0; pc < 12; pc++) sum[pc] += analysis.chroma[f * 12 + pc];
  return sum;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

function meanEnergy(analysis: StemAnalysis, from: number, to: number) {
  const a = Math.max(0, Math.floor(from * analysis.onsetRate));
  const b = Math.min(analysis.energy.length, Math.ceil(to * analysis.onsetRate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += analysis.energy[i];
  return b > a ? sum / (b - a) : 0;
}

/** 0..9 for each value, against the loudest, on a dB-like scale. */
function digits(values: number[]) {
  const max = Math.max(...values);
  return values.map((v) => (v > 0 && max > 0 ? Math.max(0, Math.min(9, Math.round(9 + 3 * Math.log10(v / max)))) : 0));
}

/** What the model is told about the vocal's sections. */
function describeSections(vocal: StemAnalysis, heard: HeardVocal) {
  const { sections } = heard;
  const spans = sections.map((s) => ({ from: s.phrases[0].start, to: s.phrases[s.phrases.length - 1].end }));
  // Compare sections on what sets them apart: remove the profile they all
  // share (the key), then see which remain alike.
  const profiles = spans.map((s) => chromaBetween(vocal, s.from, s.to));
  const normalisedProfiles = profiles.map((p) => {
    const total = p.reduce((a, b) => a + b, 0) || 1;
    return p.map((v) => v / total);
  });
  const mean = new Array(12).fill(0);
  for (const p of normalisedProfiles) for (let i = 0; i < 12; i++) mean[i] += p[i] / normalisedProfiles.length;
  const distinct = normalisedProfiles.map((p) => p.map((v, i) => v - mean[i]));
  const loudness = digits(spans.map((s) => meanEnergy(vocal, s.from, s.to)));

  return sections.map((section, i) => {
    const sung = section.phrases.reduce((t, p) => t + (p.end - p.start), 0);
    const span = Math.max(0.1, spans[i].to - spans[i].from);
    const first = section.phrases[0];
    const similarTo = sections
      .map((_, j) => ({ section: j, similarity: Math.round(cosine(distinct[i], distinct[j]) * 100) / 100 }))
      .filter((s) => s.section !== i && s.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
    return {
      section: i,
      lengthBars: sectionBars(section),
      originalBar: section.bar - sections[0].bar,
      phrases: section.phrases.length,
      loudness: loudness[i],
      sungFraction: Math.round((sung / span) * 100) / 100,
      pickupBeats: first.inBeats < 0 ? Math.round(-first.inBeats * 10) / 10 : 0,
      similarTo,
    };
  });
}

/** Bars where the beat's level jumps or drops — where its sections change. */
function levelChanges(structure: BeatStructure) {
  const { barEnergy, endBar } = structure;
  const log = barEnergy.map((e) => Math.log10(e + 1e-10));
  const changes: { bar: number; change: "up" | "down" }[] = [];
  for (let j = 2; j + 2 <= endBar; j++) {
    const before = (log[j - 2] + log[j - 1]) / 2;
    const after = (log[j] + log[j + 1]) / 2;
    const jump = after - before;
    if (Math.abs(jump) >= 0.25 && (changes.length === 0 || j - changes[changes.length - 1].bar >= 2)) {
      changes.push({ bar: j, change: jump > 0 ? "up" : "down" });
    }
  }
  return changes;
}

async function askClaude(key: string, model: string, brief: string): Promise<Plan> {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  // Opus 5 / Fable 5.x can decline a request on a safety classifier's
  // false positive; server-side fallbacks retry it on another model
  // instead of failing the arrangement.
  const withFallbacks = /^claude-(opus-5|fable-5)/.test(model);
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: brief }],
      output_config: { format: betaZodOutputFormat(PlanSchema) },
      ...(withFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to arrange these songs.");
    if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off — try again.");
    if (!response.parsed_output) throw new Error("Claude's answer wasn't a usable arrangement — try again.");
    return response.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Anthropic rejected that API key — check it in AI settings.");
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Anthropic doesn't know the model “${model}” — pick another in AI settings.`);
    if (err instanceof Anthropic.RateLimitError) throw new Error("Anthropic's rate limit was hit — wait a moment and try again.");
    if (err instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Anthropic — check your connection.");
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic error ${err.status}: ${err.message}`);
    if (err instanceof Error && err.message.startsWith("Claude")) throw err;
    // The SDK couldn't parse the answer into the plan's shape.
    throw new Error("Claude's answer wasn't a usable arrangement — try again.");
  }
}

async function askOpenAI(key: string, model: string, brief: string): Promise<Plan> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: brief },
        ],
        response_format: { type: "json_schema", json_schema: { name: "arrangement", strict: true, schema: OPENAI_SCHEMA } },
      }),
    });
  } catch {
    throw new Error("Couldn't reach OpenAI — check your connection.");
  }
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  } | null;
  if (res.status === 401) throw new Error("OpenAI rejected that API key — check it in AI settings.");
  if (res.status === 404) throw new Error(`OpenAI doesn't know the model “${model}” — pick another in AI settings.`);
  if (res.status === 429) throw new Error("OpenAI's rate limit or quota was hit — wait a moment or check your billing.");
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${body?.error?.message ?? res.statusText}`);
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`ChatGPT declined: ${message.refusal}`);
  try {
    return PlanSchema.parse(JSON.parse(message?.content ?? ""));
  } catch {
    throw new Error("ChatGPT's answer wasn't a usable arrangement — try again.");
  }
}

export type PairMatch = {
  explanation: string;
  lines: string[];
  provider: AiProvider;
  model: string;
  /** Puts both lanes and the project tempo back as they were. */
  undo: { patches: Record<string, LanePatch>; projectBpm: number };
};

function snapshot(lane: StudioLane): LanePatch {
  return {
    bpm: lane.bpm,
    tempoRatio: lane.tempoRatio,
    offsetSeconds: lane.offsetSeconds,
    clips: lane.clips,
    volume: lane.volume,
    fx: { ...lane.fx },
  };
}

/** Reads the vocal's tempo as written, half or double — whichever is nearest `target`. */
function nearestReading(bpm: number, target: number) {
  return [bpm, bpm * 2, bpm / 2].reduce((best, r) =>
    Math.abs(Math.log(target / r)) < Math.abs(Math.log(target / best)) ? r : best
  );
}

const clampRatio = (r: number) => Math.min(2, Math.max(0.5, r));

/**
 * Has the configured model arrange `vocalLaneId` on `beatLaneId`, and
 * applies its plan. `request` is the user's own wish, in their words.
 * `onStage` reports progress for the button.
 */
export async function aiMatchPair(
  vocalLaneId: string,
  beatLaneId: string,
  request: string,
  onStage?: (stage: string) => void
): Promise<PairMatch> {
  const ai = activeAi();
  if (!ai) throw new Error("Add a Claude or ChatGPT API key in AI settings first.");
  const lanes = useStudioStore.getState().lanes;
  const vocalLane = lanes.find((l) => l.laneId === vocalLaneId);
  const beatLane = lanes.find((l) => l.laneId === beatLaneId);
  if (!vocalLane || !beatLane) throw new Error("One of those lanes is gone.");

  onStage?.("Listening…");
  const [vocalAnalysis, beatAnalysis, guide] = await Promise.all([
    analyzeLane(vocalLane),
    analyzeLane(beatLane),
    analyzeGuide(vocalLane),
  ]);
  if (!vocalAnalysis || !beatAnalysis) throw new Error("Couldn't load the audio of those lanes.");

  // Tempos, sharpened against the songs' real hits.
  const beatSource = beatLane.bpm ?? beatAnalysis.bpmEstimate;
  const vocalSource = vocalLane.bpm ?? guide?.bpmEstimate ?? vocalAnalysis.bpmEstimate;
  if (!beatSource || !vocalSource) throw new Error("Couldn't find a tempo for both lanes — set their BPM by hand.");
  const beatBpm = refineTempo(beatAnalysis, beatSource);
  const vocalBpm = guide ? refineTempo(guide, vocalSource) : vocalSource;
  const beatTempo = beatBpm * beatLane.tempoRatio;
  const reading = nearestReading(vocalBpm, beatTempo);
  const tempos = {
    beat: { projectBpm: beatTempo, beatRatio: beatLane.tempoRatio, vocalRatio: clampRatio(beatTempo / reading) },
    vocal: { projectBpm: reading, beatRatio: clampRatio(reading / beatBpm), vocalRatio: 1 },
  };

  const structure = beatStructure(beatAnalysis, beatBpm);
  const heard = hearVocal(vocalAnalysis, reading, guide ?? undefined);
  if (!structure) throw new Error(`Couldn't find the bars of “${beatLane.trackTitle}”.`);
  if (!heard) throw new Error(`Couldn't hear clear phrases in “${vocalLane.trackTitle}”.`);
  const suggestion = suggestLayout(heard, structure);

  const vocalKey = effectiveKey(vocalLane) ?? vocalAnalysis.key;
  const beatKey = effectiveKey(beatLane) ?? beatAnalysis.key;
  const keyMatch = bestKeyShift(vocalKey, beatKey);
  const beatLoudness = digits(structure.barEnergy);

  const brief = {
    beat: {
      title: beatLane.trackTitle,
      bpm: Math.round(beatBpm * 100) / 100,
      key: keyLabel(beatKey),
      bars: structure.bars,
      introBars: structure.introBars,
      musicEndsAtBar: structure.endBar,
      barLoudness: beatLoudness.join(""),
      levelChanges: levelChanges(structure),
      downbeatCertain: structure.downbeatConfidence >= 0.15,
    },
    vocal: {
      title: vocalLane.trackTitle,
      bpm: Math.round(reading * 100) / 100,
      key: keyLabel(vocalKey),
      barLinesFrom: heard.guided ? "its original beat (exact)" : "the voice alone (a guess)",
      downbeatCertain: heard.downbeatConfidence >= 0.15,
      sections: describeSections(vocalAnalysis, heard),
    },
    keys:
      keyMatch.semitones === 0
        ? `compatible (${keyMatch.relation === "neighbour" ? "neighbours on the Camelot wheel" : "same notes"})`
        : `they clash — the vocal would need ${keyMatch.semitones > 0 ? "+" : ""}${keyMatch.semitones} semitones to fit, which the user can do by hand`,
    tempoOptions: {
      beat: `keep the beat at ${tempos.beat.projectBpm.toFixed(1)} BPM, stretch the vocal ${tempos.beat.vocalRatio.toFixed(3)}x`,
      vocal: `keep the vocal at ${tempos.vocal.projectBpm.toFixed(1)} BPM, stretch the beat ${tempos.vocal.beatRatio.toFixed(3)}x`,
    },
    suggested: {
      follow: Math.abs(Math.log(tempos.beat.vocalRatio)) <= Math.abs(Math.log(tempos.vocal.beatRatio)) ? "beat" : "vocal",
      sections: suggestion.placements,
      leftOut: suggestion.dropped,
    },
    presets: {
      vocal: VOCAL_PRESETS.map((p) => ({ id: p.id, what: p.hint })),
      beat: BEAT_PRESETS.map((p) => ({ id: p.id, what: p.hint })),
    },
    userRequest: request.trim() || null,
  };

  onStage?.(`Asking ${ai.provider === "anthropic" ? "Claude" : "ChatGPT"}…`);
  const briefText = `Here's what the studio measured. Arrange the vocal on the beat.\n\n${JSON.stringify(brief, null, 1)}`;
  const plan =
    ai.provider === "anthropic" ? await askClaude(ai.key, ai.model, briefText) : await askOpenAI(ai.key, ai.model, briefText);

  // --- Check the plan, then carry it out ---------------------------------------
  onStage?.("Arranging…");
  const lines: string[] = [];
  const tempo = tempos[plan.follow];
  const beatInput: LaneInput = {
    analysis: beatAnalysis,
    bpm: beatBpm,
    tempoRatio: tempo.beatRatio,
    offsetSeconds: beatLane.offsetSeconds,
    title: beatLane.trackTitle,
    duration: beatLane.originalDuration,
  };
  const vocalInput: LaneInput = {
    analysis: vocalAnalysis,
    bpm: reading,
    tempoRatio: tempo.vocalRatio,
    offsetSeconds: vocalLane.offsetSeconds,
    title: vocalLane.trackTitle,
    duration: vocalLane.originalDuration,
    guide: guide ?? undefined,
  };

  // Sections must exist, sit in order without overlapping, and fit the
  // beat. Overlap is judged on the singing itself — a pickup or a last
  // word spilling into the neighbour's bar is how songs flow, not a clash.
  const placements: SectionPlacement[] = [];
  let singingUntil = -Infinity;
  const asked = plan.sections.map((p) => ({ section: Math.round(p.section), bar: Math.round(p.bar) }));
  for (const { section, bar } of asked.sort((a, b) => a.bar - b.bar)) {
    const found = heard.sections[section];
    if (!found) continue;
    const lead = found.start - found.bar; // negative for a pickup
    const earliest = Math.ceil(singingUntil - 0.1 - lead);
    const start = Math.max(bar, earliest, 0);
    if (start >= structure.endBar) {
      lines.push(`Section ${section} was placed past the end of the beat's music, so it was left out`);
      continue;
    }
    if (start !== bar) lines.push(`Section ${section} moved from bar ${bar} to ${start} so it doesn't overlap the one before`);
    placements.push({ section, bar: start });
    singingUntil = start + (found.end - found.bar);
  }
  let usedPlan = true;
  if (placements.length === 0) {
    usedPlan = false;
    placements.push(...suggestion.placements);
    lines.push("The AI's plan had no usable sections, so the studio's own arrangement was used");
  }
  const shiftBeats = Math.max(-3, Math.min(3, Math.round(plan.shift_beats)));
  const placement = placeVocal(vocalInput, beatInput, structure, heard, placements, shiftBeats);
  if (!placement) throw new Error("Couldn't place the vocal's phrases.");

  const store = useStudioStore.getState();
  const undo = {
    patches: { [vocalLane.laneId]: snapshot(vocalLane), [beatLane.laneId]: snapshot(beatLane) },
    projectBpm: store.projectBpm,
  };

  // Level: loudness-matched to the beat, the vocal a touch on top, then
  // the model's adjustment.
  const gain = Math.max(-6, Math.min(6, plan.vocal_gain_db));
  const loudnessRatio = vocalAnalysis.loudness > 0 ? beatAnalysis.loudness / vocalAnalysis.loudness : 1;
  const volume = Math.round(Math.min(1.5, Math.max(0.2, beatLane.volume * 1.12 * loudnessRatio * 10 ** (gain / 20))) * 100) / 100;

  const vocalPreset = VOCAL_PRESETS.find((p) => p.id === plan.vocal_preset);
  const beatPreset = BEAT_PRESETS.find((p) => p.id === plan.beat_preset);
  const patches: Record<string, LanePatch> = {
    [vocalLane.laneId]: {
      bpm: reading,
      tempoRatio: tempo.vocalRatio,
      offsetSeconds: placement.offsetSeconds,
      clips: placement.clips,
      volume,
      ...(vocalPreset ? { fx: { ...DEFAULT_FX, ...vocalPreset.fx } } : {}),
    },
    [beatLane.laneId]: {
      bpm: beatBpm,
      tempoRatio: tempo.beatRatio,
      ...(beatPreset ? { fx: { ...DEFAULT_FX, ...beatPreset.fx } } : {}),
    },
  };
  store.applyLanePatches(patches, Math.round(tempo.projectBpm * 100) / 100);

  // --- Report -------------------------------------------------------------------
  const bar = beatLength(tempo.projectBpm) * 4;
  lines.unshift(
    plan.follow === "beat"
      ? `Tempo: the beat stays at ${tempo.projectBpm.toFixed(1)} BPM; the vocal plays at ${tempo.vocalRatio.toFixed(3)}× speed (pitch unchanged)`
      : `Tempo: the vocal stays at ${tempo.projectBpm.toFixed(1)} BPM; the beat plays at ${tempo.beatRatio.toFixed(3)}× speed (pitch unchanged)`,
    `Arrangement${usedPlan ? "" : " (fallback)"}: ${placements
      .map((p) => `section ${p.section} on bar ${rulerBar(beatInput, structure, p.bar, bar)}`)
      .join(", ")}`
  );
  if (shiftBeats !== 0) lines.push(`Vocal moved ${shiftBeats > 0 ? "+" : ""}${shiftBeats} beat${Math.abs(shiftBeats) === 1 ? "" : "s"} against the bar lines`);
  lines.push(`${vocalLane.trackTitle}: level ${Math.round(volume * 100)}%${gain ? ` (${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB by the AI)` : ""}`);
  if (vocalPreset) lines.push(`${vocalLane.trackTitle}: “${vocalPreset.label}” vocal chain`);
  if (beatPreset) lines.push(`${beatLane.trackTitle}: “${beatPreset.label}” on the beat`);
  lines.push(`Keys: ${keyLabel(vocalKey)} on ${keyLabel(beatKey)} — ${brief.keys}`);
  lines.push(...placementNotes(vocalInput, beatInput, structure, heard, placement));

  return { explanation: plan.explanation, lines, provider: ai.provider, model: ai.model, undo };
}
