// The AI co-producer's job description and its hands: the system prompt
// and the tools it can use in the Studio. Shared by the chat route (which
// sends them to Claude) and the Studio (which carries the tools out — they
// run in the browser, on the person's own mix, so every change goes
// through the same try / keep / undo as the AI producer's ideas).

export const COPRODUCER_SYSTEM = `You are the co-producer inside Remixt Studio, a web app where people make remixes by putting a vocal from one song over the beat of another. You sit next to the person like a friendly, skilled producer: you listen, explain in plain words, and make changes for them.

Who you're talking to: often someone who has never used a music app. Avoid jargon; when you use a term (BPM, key, drop, ducking), say what it means in a few words. Reply in the language the person writes in (many write in Persian/Farsi). Keep replies short — a few sentences, or a short list — unless asked for more.

How you work:
- You can't hear audio yourself. Your ears are the Studio's analysis, through your tools: get_mix (what's in the mix, the Mix check and a 0–100 score), listen_closely (tempo, keys, how many sung notes sit in the beat's chords at each pitch shift, the vocal's sections, the beat's drop) and best_versions (every ready-made idea scored as it would sound). Only state what the tools tell you.
- Before suggesting changes, call get_mix. When the person asks to make it sound good or better, call best_versions and try the best one.
- Prefer try_ideas: ideas are worked out by the Studio's own engine (timing, sync, keys, styles, drops, sound). Use adjust_lane and change_speed for small hands-on changes the ideas don't cover (a lane's volume, pitch, timing nudge, effects; the whole song's speed).
- Everything you change is tried, not kept: each idea and each of your hands-on changes shows in the Studio with its own on/off switch (and switches for its parts — timing, key, volume, sound), so the person can hear it with and without, compare Before/After, and keep or undo it. To take one change back, use take_off with its id; it stays listed, switched off.
- After you change something, say what you changed and why in one or two lines, tell them what to listen for, and call play so they hear it (from the moment that matters, if you know it). Ask them to press Keep if they like it.
- If something can't be fixed well (the vocal and beat are very far apart in tempo or key, or the vocal is rap with no melody to tune), say so honestly and suggest an alternative, like picking another beat.
- Don't change things the person didn't ask about, and never keep_changes unless they asked you to keep them.
- get_mix's "trying" shows what's on, what the person switched off, and which parts of an idea they switched off — respect those choices; don't switch them back on unless asked.`;

/** The tools, in the Messages API's shape (JSON Schema inputs). */
export const COPRODUCER_TOOLS = [
  {
    name: "get_mix",
    description:
      "The mix as it is right now: every lane (id, name, vocal or beat, tempo, key, speed and pitch changes, volume, effects), the project tempo, whether an idea is being tried, the Mix check (what's good and what's wrong, in plain words) and the overall score out of 100 with its parts (same speed, on the beat, lines on the bars, in tune, balance, natural sound, ending). Call this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listen_closely",
    description:
      "A deeper look at the vocal and beat being worked on: both tempos, both keys, how many of the vocal's held notes sit in the beat's chords now and at every pitch shift from -6 to +5 semitones, the vocal's sections (length in bars, loudness, which repeat — the chorus), the beat's intro, end and drop, and whether the beat model heard the beats and downbeats. Use it to explain why something sounds off.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_ideas",
    description:
      "The ideas the Studio has worked out for this mix, with their ids. Kinds: auto (Make it sound good — fixes speed, timing, key, volume at once), sync (ways to lock vocal and beat together), fix (single Mix check fixes), full (whole-remix styles: radio, club, lo-fi, TikTok…), moment (drops, build-ups, stutters, vocal layers), idea (single arrangement, speed or sound changes).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["all", "auto", "sync", "fix", "full", "moment", "idea"], description: "Only ideas of this kind (default all)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "best_versions",
    description:
      "Scores every whole-mix idea (Make it sound good, each sync template, each style, each fix) as it would sound, without playing it, and returns the best ones with their scores and the current mix's score — the Studio auditioning its own ideas. Use this to pick what to try.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 10, description: "How many to return (default 5)." } },
      additionalProperties: false,
    },
  },
  {
    name: "try_ideas",
    description:
      "Tries one or more ideas (by id from list_ideas or best_versions) on the mix, stacked in the order given — only one timing idea (sync, style, auto) can be on at once; a later one replaces an earlier. Non-destructive: the person can compare and keep or undo. Returns what changed, the new Mix check and the new score.",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        replace: { type: "boolean", description: "Take off whatever is being tried first (default false: add on top)." },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "undo_try",
    description: "Takes off everything being tried and puts the mix back as it was.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "take_off",
    description:
      "Switches one change off — an idea or one of your hands-on changes, by the id get_mix's trying list (or adjust_lane / change_speed) gave — keeping the rest on. It stays listed, so the person can switch it back on. Returns the new score.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "keep_changes",
    description: "Keeps what's being tried, as one undo step. Only when the person asks to keep it.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "adjust_lane",
    description:
      "A hands-on change to one lane, tried on top of whatever is on (the person can switch it off, compare and keep or undo it, like an idea). All fields optional; effect values are absolute. volume 0–1.5 (1 = as loaded); pitch_semitones -12…12 (vocals keep their natural voice); nudge_beats moves the lane earlier (negative) or later in beats; effects: reverb/delay/width/drive/duck 0–1, eq_low/eq_mid/eq_high in dB (-12…12), highpass/lowpass in Hz, compress true/false, pan -1…1. Returns the change's id and the new score.",
    input_schema: {
      type: "object",
      properties: {
        lane_id: { type: "string" },
        volume: { type: "number", minimum: 0, maximum: 1.5 },
        pitch_semitones: { type: "number", minimum: -12, maximum: 12 },
        nudge_beats: { type: "number", minimum: -8, maximum: 8 },
        muted: { type: "boolean" },
        effects: {
          type: "object",
          properties: {
            reverb: { type: "number", minimum: 0, maximum: 1 },
            delay: { type: "number", minimum: 0, maximum: 1 },
            width: { type: "number", minimum: 0, maximum: 1 },
            drive: { type: "number", minimum: 0, maximum: 1 },
            duck: { type: "number", minimum: 0, maximum: 1 },
            eq_low: { type: "number", minimum: -12, maximum: 12 },
            eq_mid: { type: "number", minimum: -12, maximum: 12 },
            eq_high: { type: "number", minimum: -12, maximum: 12 },
            highpass: { type: "number", minimum: 20, maximum: 2000 },
            lowpass: { type: "number", minimum: 1000, maximum: 20000 },
            compress: { type: "boolean" },
            pan: { type: "number", minimum: -1, maximum: 1 },
          },
          additionalProperties: false,
        },
      },
      required: ["lane_id"],
      additionalProperties: false,
    },
  },
  {
    name: "change_speed",
    description:
      "Makes the whole song faster or slower (every lane together, pitch unchanged), tried on top of whatever is on like adjust_lane. factor 0.8–1.25, e.g. 1.05 = 5% faster. Returns the change's id.",
    input_schema: {
      type: "object",
      properties: { factor: { type: "number", minimum: 0.8, maximum: 1.25 } },
      required: ["factor"],
      additionalProperties: false,
    },
  },
  {
    name: "play",
    description: "Starts playback so the person hears the result, from a moment in seconds (default: where the playhead is).",
    input_schema: {
      type: "object",
      properties: { from_seconds: { type: "number", minimum: 0 } },
      additionalProperties: false,
    },
  },
] as const;

export type CoproducerToolName = (typeof COPRODUCER_TOOLS)[number]["name"];

/** Most tool rounds in one reply before the Studio stops and hands back. */
export const MAX_TOOL_ROUNDS = 12;
