import { z } from "zod";

// The AI producer's tools: what a language model may do to a remix in the
// Studio. Shared by the server (which sends the definitions to the model)
// and the browser (which carries the calls out on the live project and
// reports back), so the two always agree.
//
// Lanes are named "L1", "L2", … in the order they appear in the Studio;
// bars are the ruler's bar numbers, from 1.

const lane = z.string().describe('A lane, as named by get_project: "L1", "L2", …');

const vocalPresets = ["vocal-air", "vocal-hall", "vocal-slap", "vocal-throw", "vocal-radio", "vocal-double"] as const;
const beatPresets = ["beat-punch", "beat-lofi", "beat-duck"] as const;

export const AI_TOOLS = {
  get_project: {
    description:
      "The remix as it is now: project tempo, loop, and every lane with its tempo, key, start bar, length, level, mute/solo, effects and clips. Call this first, and again after changes when you need to check them.",
    input: z.object({}),
  },
  analyze_pair: {
    description:
      "Listen to one vocal and one beat (the studio's analysis — you can't hear audio yourself): both tempos and keys, the beat's bars with a loudness digit 0-9 per bar, its intro, where its level changes and where its music ends, and the vocal cut into ~8-bar sections with length, loudness, how much is sung, pickups and which sections share their notes (similarity near 1 = a repeated chorus/hook). Also returns the studio's own suggested arrangement. Needed before arrange_pair.",
    input: z.object({ vocal: lane, beat: lane }),
  },
  arrange_pair: {
    description:
      "Lay a vocal on a beat: match their tempos (time-stretch only, pitch never changes) and place vocal sections (from analyze_pair) on bars of the beat. Sections may be reordered, repeated or left out; each phrase is locked to the beat's real hits. Replaces the vocal's previous arrangement.",
    input: z.object({
      vocal: lane,
      beat: lane,
      follow: z.enum(["beat", "vocal"]).describe("Which song keeps its tempo; the other is stretched to it."),
      sections: z
        .array(
          z.object({
            section: z.number().describe("Section index from analyze_pair."),
            bar: z.number().describe("Bar of the BEAT, counted from 0 as in analyze_pair, where the section's first downbeat lands."),
          })
        )
        .describe("The arrangement. Sections must not overlap and must end before the beat's music does."),
      shift_beats: z
        .number()
        .optional()
        .describe("Move the whole vocal -3..3 beats against the bar lines when the downbeat looks misread. Default 0."),
      vocal_gain_db: z.number().optional().describe("Vocal level against a loudness-matched start, -6..6 dB. Default 0."),
      vocal_preset: z.enum(vocalPresets).optional().describe("Effect chain for the vocal."),
      beat_preset: z.enum(beatPresets).optional().describe("Effect chain for the beat."),
    }),
  },
  auto_match: {
    description:
      "Run the studio's automatic AI Match over every lane: tempo, phrase-by-phrase arrangement of each vocal, levels and starting effects. A good first pass to refine from.",
    input: z.object({}),
  },
  set_lane: {
    description:
      "Change a lane's mix: level, mute, solo, pan, an effect preset, or single effect values. Only the fields given change.",
    input: z.object({
      lane,
      volume: z.number().optional().describe("0..1.5 (1 = unity)."),
      muted: z.boolean().optional(),
      solo: z.boolean().optional(),
      pan: z.number().optional().describe("-1 (left) .. 1 (right)."),
      preset: z
        .enum(["clean", ...vocalPresets, ...beatPresets])
        .optional()
        .describe("Replaces the lane's whole effect rack with a preset."),
      reverb: z.number().optional().describe("Reverb send 0..1."),
      reverb_size: z.number().optional().describe("Reverb decay in seconds, 0.3..6."),
      delay: z.number().optional().describe("Delay send 0..1."),
      delay_division: z.enum(["1/2", "1/4.", "1/4", "1/8.", "1/8", "1/16"]).optional(),
      delay_feedback: z.number().optional().describe("0..0.85."),
      eq_low: z.number().optional().describe("Low shelf gain, dB (-12..12)."),
      eq_mid: z.number().optional().describe("Mid gain, dB (-12..12)."),
      eq_high: z.number().optional().describe("High shelf gain, dB (-12..12)."),
      highpass: z.number().optional().describe("High-pass cutoff, Hz (20 = off)."),
      lowpass: z.number().optional().describe("Low-pass cutoff, Hz (20000 = off)."),
      width: z.number().optional().describe("Stereo widening 0..1."),
      drive: z.number().optional().describe("Saturation 0..1."),
      compress: z.boolean().optional().describe("Vocal levelling compressor."),
      fade_in: z.number().optional().describe("Seconds."),
      fade_out: z.number().optional().describe("Seconds."),
    }),
  },
  move_lane: {
    description: "Move a whole lane (all its clips) earlier or later by a number of beats (4 = one bar).",
    input: z.object({ lane, beats: z.number().describe("Negative = earlier. Can be fractional, e.g. 0.5.") }),
  },
  clips: {
    description:
      "Edit a lane's clips. list: each clip's number, start bar and length. split: cut at a bar. delete / duplicate: one clip by number. move: put a clip's start on a bar.",
    input: z.object({
      lane,
      action: z.enum(["list", "split", "delete", "duplicate", "move"]),
      clip: z.number().optional().describe("Clip number from list (1-based), for delete/duplicate/move."),
      bar: z.number().optional().describe("Ruler bar, from 1; fractions are beats (5.25 = beat 2 of bar 5). For split/move."),
    }),
  },
  cut_silences: {
    description: "Split a lane at every silence and drop the gaps; each phrase stays where it is and becomes its own clip.",
    input: z.object({ lane }),
  },
  whole_take: {
    description: "Undo all cuts on a lane: it plays its whole stem again, lined up on its first clip.",
    input: z.object({ lane }),
  },
  set_loop: {
    description: "Loop a range of ruler bars so the user can listen to a part, or clear the loop.",
    input: z.object({
      start_bar: z.number().optional(),
      end_bar: z.number().optional().describe("The bar the loop stops at (exclusive)."),
      clear: z.boolean().optional(),
    }),
  },
} as const;

export type AiToolName = keyof typeof AI_TOOLS;
export type AiToolInput<N extends AiToolName> = z.infer<(typeof AI_TOOLS)[N]["input"]>;

/** Tool definitions as JSON Schema, for the model APIs. */
export function toolDefinitions() {
  return (Object.keys(AI_TOOLS) as AiToolName[]).map((name) => {
    const { $schema: _unused, ...schema } = z.toJSONSchema(AI_TOOLS[name].input) as Record<string, unknown>;
    void _unused;
    return { name, description: AI_TOOLS[name].description, parameters: schema };
  });
}

export const PRODUCER_SYSTEM_PROMPT = `You are the AI producer inside Remixt, a browser studio where people remix songs: they pull a vocal (an acapella cut out of one song) onto a beat (the instrumental of another) and shape the result. You work alongside the user on their open project, using tools that edit it directly.

You can't hear audio. The studio's analysis (analyze_pair, get_project) tells you what it measured — tempos, keys, the beat's bars and loudness, the vocal's sections and which ones repeat. Reason from those like a producer reading a DAW's meters and waveforms.

How to work:
- Start with get_project to see the lanes, then analyze_pair for the vocal and beat you're matching.
- Make it sound like a real song: let the beat's intro play before the vocal comes in, start sections on 4- or 8-bar boundaries and where the beat's level changes, put the most repeated or loudest vocal section (usually the chorus) where the beat is fullest, bring a chorus back if it helps, and leave room for an outro. Keep verses in order unless there's a reason not to.
- Prefer the tempo option that stretches less, unless the user asks otherwise.
- Never change pitch or key. If the keys clash, say so and suggest the user uses the lane's Key → Match themselves.
- If the downbeat is flagged uncertain, consider shift_beats (usually ±2) or move_lane, and tell the user they can nudge ±½ bar if it sounds off.
- Check your work with get_project, and fix problems you find (overlaps, a vocal running past the beat, levels far apart).
- Do what the user asks; if the material doesn't allow it, say why and do the closest thing.
- Finish with a short, plain summary of what you changed and why, and what the user might try next. The user may not be a native English speaker: keep sentences simple.`;
