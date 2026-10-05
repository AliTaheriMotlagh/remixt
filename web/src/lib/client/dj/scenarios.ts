// The DJ simulator's training missions, in order: from "press play" to a
// timed club night. Each has a briefing (why it matters and where it shows
// up in real DJing), a starting setup for the decks, and objectives that are
// checked against the live state. Pure data and pure checks.

import { keyFit, type KeyFit } from "../musicKey";
import type { Derived } from "./djDerived";
import type { CrowdState } from "./crowd";
import type { Weights } from "./scoring";
import type { DeckId, DjSnapshot } from "./djTypes";
import type { DemoStem } from "../demoSongDefs";

export type CheckCtx = {
  snap: DjSnapshot;
  d: Derived;
  dt: number;
  /** Seconds since the mission began. */
  time: number;
  /** True once `cond` has been continuously true for `seconds` (keyed, reset when it drops). */
  hold: (key: string, cond: boolean, seconds: number) => boolean;
  holdTime: (key: string) => number;
  /** Scratch memory for this objective; cleared when it completes. */
  memo: Record<string, number | boolean | string>;
  eqSwap: (out: DeckId, bars?: number) => boolean;
  crowd: CrowdState | null;
};

export type Objective = {
  id: string;
  text: string;
  /** Lessons: the control to spotlight (a `data-dj` id such as "A-play", "M-xfader"). */
  target?: string;
  /** Lessons: why this step matters, shown under the instruction. */
  why?: string;
  /** Fraction (0..1) for objectives that take time. */
  progress?: (c: CheckCtx) => number;
  check: (c: CheckCtx) => boolean;
  /** A plain-language nudge when the learner seems stuck; null when there's nothing to say. */
  hint?: (c: CheckCtx) => string | null;
};

export type DeckSetup = {
  trackId: string;
  playing?: boolean;
  /** Start position, in bars. */
  startBar?: number;
  volume?: number;
  tempoPct?: number;
  killStems?: DemoStem[];
  killLow?: boolean;
};

export type MissionSetup = {
  tempoRange?: number;
  decks: Partial<Record<DeckId, DeckSetup>>;
  crossfader?: number;
  /** B's beats land this many ms early (negative: late) relative to A, if both play. */
  phaseOffsetMs?: number;
};

/** What kind of exercise: the original training missions, or the Learn → Practice → Test curriculum and real gigs. */
export type ScenarioCategory = "mission" | "lesson" | "drill" | "test" | "gig";

/** Console limits for an exercise (beatmatching by ear hides the BPM and switches SYNC off, say). */
export type ScenarioRules = {
  noSync?: boolean;
  hideBpm?: boolean;
  noQuantize?: boolean;
  /** Hide the beat-match meter (the phase gauge gives the answer away). */
  noMeter?: boolean;
};

export type QuizQuestion = {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  /** Show the Camelot wheel with the question. */
  wheel?: boolean;
};

export type Mission = {
  id: string;
  number: number;
  title: string;
  tagline: string;
  briefing: { why: string; realWorld: string; tips: string[] };
  setup: MissionSetup;
  objectives: Objective[];
  weights: Weights;
  /** Objectives before this index don't count towards the score. */
  scoreFrom?: number;
  /** Seconds. The mission ends (scored as it stands) when this runs out. */
  timeLimit?: number;
  kind?: "club";
  category?: ScenarioCategory;
  /** Curriculum level (1–5). */
  level?: number;
  rules?: ScenarioRules;
  /** Gear this exercise is built for; the session switches to it (scratching needs turntables). */
  gear?: string;
  /** Tests: theory questions asked before the practical part (or alone, with no objectives). */
  quiz?: QuizQuestion[] | ((seed: number) => QuizQuestion[]);
  /** A different starting setup per attempt (drills vary every run). */
  setupFor?: (seed: number) => MissionSetup;
  /** An AI DJ plays this deck (back-to-back). */
  aiDeck?: DeckId;
  /** Scripted surprises: e.g. "power" stops Deck A at 12 s for the recovery gig. */
  events?: { at: number; kind: "stop-a" | "stop-playing" }[];
  /** The library songs option makes sense here (needs from missionTracks.ts). */
  libraryFriendly?: boolean;
  /** Minutes, for the curriculum cards. */
  minutes?: number;
};

const fitOk = (f: KeyFit | null) => f === "same" || f === "relative" || f === "neighbour";
const fmt = (n: number, digits = 1) => Math.abs(n).toFixed(digits);
const deckName = (d: DeckId) => `Deck ${d}`;

function tempoHint(c: CheckCtx, adjust: DeckId, minDiff: number) {
  const diff = c.d.tempoDiff;
  if (!c.d.bothLoaded || Math.abs(diff) <= minDiff) return null;
  // diff > 0: A is faster. If we're adjusting B, B is the slow one.
  const adjustIsSlow = adjust === "B" ? diff > 0 : diff < 0;
  const other = adjust === "A" ? "B" : "A";
  return `${deckName(adjust)} is ${fmt(diff)} BPM ${adjustIsSlow ? "slow" : "fast"} next to ${deckName(other)}: move ${deckName(adjust)}'s tempo fader ${adjustIsSlow ? "up" : "down"}, or press SYNC.`;
}

function phaseHint(c: CheckCtx, adjust: DeckId, limitMs: number) {
  if (!c.d.bothPlaying || Math.abs(c.d.phaseMs) <= limitMs) return null;
  // phaseMs > 0: B is ahead, so B needs to go back (nudge −); A needs to go forward (nudge +).
  const nudge = adjust === "B" ? (c.d.phaseMs > 0 ? "−" : "+") : c.d.phaseMs > 0 ? "+" : "−";
  const ahead = c.d.phaseMs > 0 ? "B" : "A";
  return `The beats are ${Math.round(Math.abs(c.d.phaseMs))} ms apart (${deckName(ahead)} lands early). Hold ${deckName(adjust)}'s nudge ${nudge} for a moment, then let go.`;
}

export const MISSIONS: Mission[] = [
  {
    id: "preflight",
    number: 1,
    title: "Pre-flight check",
    tagline: "Play, cue and loop: learn the controls",
    briefing: {
      why: "Before you mix, you need to be sure of the basics: starting a track, finding your cue point and looping a few beats. Everything else is built from these.",
      realWorld:
        "A DJ's CUE button marks where a track should start. Hold it to preview, tap it while playing to snap back. Loops let you stretch a groove while you prepare the next track.",
      tips: ["Play/Pause starts the deck. CUE jumps back to the cue point and stops.", "Loop buttons count in beats: 4 beats is one bar.", "Keyboard: Q plays Deck A, W is CUE."],
    },
    setup: { decks: { A: { trackId: "neon-drive", volume: 0.25 }, B: { trackId: "warehouse-lights", volume: 0.8 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    objectives: [
      { id: "play", target: "A-play", text: "Press PLAY on Deck A", check: (c) => c.snap.decks.A.playing, hint: () => "Press the big PLAY button on Deck A (or the Q key)." },
      {
        id: "volume",
        target: "A-volume",
        text: "Raise Deck A's channel fader above 60% so you can hear it",
        check: (c) => c.snap.decks.A.playing && c.snap.decks.A.volume >= 0.6,
        hint: (c) => (c.snap.decks.A.volume < 0.6 ? "Slide Deck A's volume fader up. It starts low on purpose." : null),
      },
      {
        id: "cue",
        target: "A-cue",
        text: "Press CUE: Deck A jumps back to the start and stops",
        check: (c) => {
          const a = c.snap.decks.A;
          if (a.playing) c.memo.armed = true;
          return !!c.memo.armed && !a.playing && Math.abs(a.position - a.cue) < 0.15;
        },
        hint: () => "Tap CUE (or W) while the track is playing. It returns to the cue point.",
      },
      {
        id: "loop",
        target: "A-loops",
        text: "Press PLAY again, then hold a 4-beat loop for 4 seconds",
        progress: (c) => Math.min(1, c.holdTime("loop") / 4),
        check: (c) => {
          const a = c.snap.decks.A;
          return c.hold("loop", a.playing && a.loop.active && a.loop.beats === 4, 4);
        },
        hint: (c) => (!c.snap.decks.A.playing ? "Press PLAY first." : "Press the 4 loop button on Deck A while it plays."),
      },
    ],
  },
  {
    id: "tempo",
    number: 2,
    title: "Tempo matching",
    tagline: "Use the tempo fader to match two songs",
    briefing: {
      why: "Two songs only blend if they run at the same speed. The tempo fader speeds a deck up or down by a percentage until its BPM equals the other's.",
      realWorld:
        "This is beatmatching, the core skill of DJing. Club DJs do it by ear with one deck in their headphones. Here the BPM readouts help you. Sync buttons exist on modern gear, but every DJ should know how to do it by hand.",
      tips: [
        "The tempo fader moves a deck's BPM up or down. The % shows how far.",
        "Deck B is the song you're preparing: the crossfader is on A, so the crowd can't hear it.",
        "Tip: BPM readouts update live under each deck's title.",
      ],
    },
    setup: {
      tempoRange: 16,
      decks: { A: { trackId: "neon-drive", playing: true, startBar: 8, volume: 0.8 }, B: { trackId: "island-time", volume: 0.8 } },
      crossfader: -1,
    },
    weights: { tempo: 3, smoothness: 1 },
    scoreFrom: 2,
    objectives: [
      { id: "startB", target: "B-play", text: "Press PLAY on Deck B (the crowd can't hear it yet)", check: (c) => c.snap.decks.B.playing, hint: () => "Press PLAY on Deck B (the P key)." },
      {
        id: "match",
        target: "B-tempo",
        text: "Match Deck B's tempo to Deck A within 0.5 BPM",
        check: (c) => c.hold("match", c.d.bothPlaying && Math.abs(c.d.tempoDiff) <= 0.5, 1.5),
        progress: (c) => Math.min(1, c.holdTime("match") / 1.5),
        hint: (c) => tempoHint(c, "B", 0.5) ?? "Nearly there: small fader moves.",
      },
      {
        id: "hold",
        text: "Hold the tempo match for 8 seconds",
        check: (c) => c.hold("tempohold", c.d.bothPlaying && Math.abs(c.d.tempoDiff) <= 0.5, 8),
        progress: (c) => Math.min(1, c.holdTime("tempohold") / 8),
        hint: (c) => tempoHint(c, "B", 0.5),
      },
    ],
  },
  {
    id: "phase",
    number: 3,
    title: "Land the beats",
    tagline: "Same tempo is not enough: line up the kicks",
    briefing: {
      why: "Matching tempo makes two decks run at the same speed, but their beats can still land at different moments, like two people walking at the same pace but out of step. Phase is how far apart they are.",
      realWorld:
        "DJs nudge the jog wheel (or the platter) a hair forward or back until the two kicks become one. If you hear a 'flam' (a double kick), the phase is off.",
      tips: [
        "The tempo is already matched here: only the phase is off.",
        "Hold nudge − or + briefly. It changes the speed for a moment and lets go.",
        "Use the Beat-match meter: aim for under 30 ms.",
        "Keyboard: A / S nudge Deck A; K / L nudge Deck B.",
      ],
    },
    setup: {
      decks: {
        A: { trackId: "warehouse-lights", playing: true, startBar: 8, volume: 0.8 },
        B: { trackId: "golden-hour", playing: true, startBar: 8, volume: 0.8, tempoPct: -3.125 },
      },
      crossfader: -1,
      phaseOffsetMs: 160,
    },
    weights: { timing: 3, tempo: 1, smoothness: 1 },
    scoreFrom: 0,
    objectives: [
      {
        id: "nudge",
        target: "B-jog",
        text: "Nudge Deck B until the phase offset is under 30 ms",
        check: (c) => c.hold("nudge", c.d.bothPlaying && Math.abs(c.d.phaseMs) < 30, 1),
        hint: (c) => phaseHint(c, "B", 30),
      },
      {
        id: "lock",
        text: "Keep the beats locked (under 30 ms) for 8 seconds",
        progress: (c) => Math.min(1, c.holdTime("lock") / 8),
        check: (c) => c.hold("lock", c.d.bothPlaying && Math.abs(c.d.phaseMs) < 30, 8),
        hint: (c) => phaseHint(c, "B", 30) ?? (c.d.bothPlaying && Math.abs(c.d.tempoDiff) > 0.3 ? tempoHint(c, "B", 0.3) : null),
      },
    ],
  },
  {
    id: "bass-swap",
    number: 4,
    title: "The bass swap",
    tagline: "Bring a new track in without a muddy low end",
    briefing: {
      why: "Two kick drums and two bass lines at once turn into mush. The classic fix is to blend the new track in with its low EQ cut, then swap: bass out of one, bass into the other.",
      realWorld:
        "Almost every house, techno and hip-hop transition uses an EQ swap. The swap usually happens on a bar line: 'on the one' of the next phrase.",
      tips: [
        "Deck B starts with its low cut (kill). Bring it in with the crossfader first.",
        "Then swap: kill Deck A's low and open Deck B's low within about 2 bars.",
        "Finish with the crossfader all the way to B.",
      ],
    },
    setup: {
      decks: {
        A: { trackId: "warehouse-lights", playing: true, startBar: 8, volume: 0.8 },
        B: { trackId: "golden-hour", playing: true, startBar: 8, volume: 0.8, tempoPct: -3.125, killLow: true },
      },
      crossfader: -1,
      phaseOffsetMs: 0,
    },
    weights: { eq: 3, timing: 1, tempo: 1, key: 1, smoothness: 1 },
    scoreFrom: 1,
    objectives: [
      {
        id: "bring-in",
        target: "M-xfader",
        text: "Bring Deck B in with its low cut: crossfader to the middle",
        check: (c) =>
          c.hold(
            "mid",
            Math.abs(c.snap.mix.crossfader) < 0.35 && c.d.audible.B && (c.snap.decks.B.kill.low || c.snap.decks.B.eq.low <= -20),
            2
          ),
        hint: (c) =>
          !(c.snap.decks.B.kill.low || c.snap.decks.B.eq.low <= -20)
            ? "Cut Deck B's low (the LOW kill button) before the crowd hears it."
            : "Slide the crossfader towards the middle.",
      },
      {
        id: "swap",
        target: "M-eq",
        text: "EQ swap: Deck A's low goes down while Deck B's low comes up, within 2 bars",
        check: (c) => c.eqSwap("A", 2),
        hint: (c) =>
          c.d.bassClash
            ? "Both basses are open: kill Deck A's low and bring Deck B's up at the same moment."
            : "Press LOW kill on Deck A and release it on Deck B together: the 'swap'.",
      },
      {
        id: "finish",
        text: "Finish the transition: crossfader to Deck B",
        check: (c) => c.hold("finish", c.snap.mix.crossfader >= 0.75, 2),
        hint: () => "Slide the crossfader all the way to Deck B.",
      },
    ],
  },
  {
    id: "harmonic",
    number: 5,
    title: "Mix in key",
    tagline: "Pick a next track that sounds good with this one",
    briefing: {
      why: "Even at a perfect tempo, songs in clashing keys sound sour when blended: the melodies fight. The Camelot wheel labels every key with a code, such as 5A. Tracks with the same number, a number ±1, or the same number with the other letter blend well.",
      realWorld:
        "Harmonic mixing is how DJs choose their next record. This sim has no key lock: changing tempo also shifts pitch (small changes only detune; big ones change the key). That's why DJs prefer tracks that are close in BPM.",
      tips: [
        "Deck A's key is shown as a Camelot code. Look for the same code, ±1, or the A/B swap.",
        "Library cards show each track's key and BPM.",
        "Then match the tempo and blend for 10 seconds.",
      ],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 8, volume: 0.8 } }, crossfader: -1 },
    weights: { key: 3, timing: 1, tempo: 1, eq: 1, smoothness: 1 },
    scoreFrom: 2,
    objectives: [
      {
        id: "load",
        text: "Load a key-compatible track on Deck B (same Camelot code, ±1, or A/B twin)",
        check: (c) => {
          const a = c.snap.decks.A.track;
          const b = c.snap.decks.B.track;
          return !!a && !!b && fitOk(keyFit(a.key, b.key));
        },
        hint: (c) => {
          const b = c.snap.decks.B.track;
          const a = c.snap.decks.A.track;
          if (!b || !a) return `Open the library on Deck B and pick a track. Look for a Camelot code next to ${a?.camelot ?? "Deck A's"} (tick "Fits the other deck").`;
          return `${b.camelot} is too far from ${a.camelot}. Try a track coded ${camelotNeighbours(a.camelot).join(", ")}.`;
        },
      },
      {
        id: "match",
        text: "Start Deck B and match its tempo to within 1 BPM",
        check: (c) => c.hold("m", c.d.bothPlaying && Math.abs(c.d.tempoDiff) <= 1, 2),
        hint: (c) => (!c.snap.decks.B.playing ? "Press PLAY on Deck B." : tempoHint(c, "B", 1) ?? phaseHint(c, "B", 40)),
      },
      {
        id: "blend",
        text: "Blend both decks for 10 seconds: in time, in key, bass swapped",
        progress: (c) => Math.min(1, c.holdTime("blend") / 10),
        check: (c) =>
          c.hold(
            "blend",
            c.d.bothAudible && Math.abs(c.d.phaseMs) < 45 && Math.abs(c.d.tempoDiff) < 1.5 && c.d.keyFit !== "clash" && c.d.keyFit !== "far" && !c.d.bassClash,
            10
          ),
        hint: (c) => {
          if (!c.d.bothAudible) return "Bring Deck B into the mix with the crossfader.";
          if (c.d.bassClash) return "Both basses are open: cut one deck's low EQ.";
          if (c.d.keyFit === "clash" || c.d.keyFit === "far") return `The keys (${c.d.key?.camelotA} and ${c.d.key?.camelotB}) don't blend: load a closer track on Deck B.`;
          return phaseHint(c, c.d.adjust, 45) ?? tempoHint(c, c.d.adjust, 1.5);
        },
      },
    ],
  },
  {
    id: "acapella",
    number: 6,
    title: "Acapella over instrumental",
    tagline: "Use stem kills to build a mashup live",
    briefing: {
      why: "This is what stems are for. Mute everything but the vocal on one deck and everything but the beat on the other and you have a live mashup: one song's voice over another's groove.",
      realWorld:
        "Producers have long done this with acapellas and instrumentals. With stem separation, any song can become either. Both parts must be in the same tempo and compatible keys, as in the Match step of the Examples lab.",
      tips: [
        "Use the stem buttons under each deck: drums, bass, chords, vocal. Lit means killed.",
        "The two songs here are tempo-matched and in compatible keys (with demo songs: 5A and 5B, relative keys).",
        "Keep the beats locked while you blend.",
      ],
    },
    setup: {
      decks: {
        A: { trackId: "golden-hour", playing: true, startBar: 12, volume: 0.8 },
        B: { trackId: "warehouse-lights", playing: true, startBar: 12, volume: 0.8, tempoPct: 3.226 },
      },
      crossfader: 0,
      phaseOffsetMs: 0,
    },
    weights: { timing: 2, tempo: 1, key: 2, eq: 1, smoothness: 1 },
    scoreFrom: 2,
    objectives: [
      {
        id: "vocal-only",
        target: "A-stems",
        text: "Deck A: kill drums, bass and chords: leave only the vocal",
        check: (c) => {
          const s = c.snap.decks.A.stems;
          return s.drums && s.bass && s.chords && !s.vocal;
        },
        hint: (c) => {
          const s = c.snap.decks.A.stems;
          if (s.vocal) return "You killed the vocal on Deck A. Release it: the vocal is the part we're keeping.";
          return "On Deck A press DRUMS, BASS and CHORDS under the deck so they light up.";
        },
      },
      {
        id: "beat-only",
        target: "B-stems",
        text: "Deck B: kill the vocal: leave the instrumental",
        check: (c) => {
          const s = c.snap.decks.B.stems;
          return s.vocal && !s.drums && !s.bass && !s.chords;
        },
        hint: () => "On Deck B press VOCAL under the deck so it lights up, and leave the rest alone.",
      },
      {
        id: "mashup",
        text: "Run the mashup for 10 seconds, in time and in key",
        progress: (c) => Math.min(1, c.holdTime("mash") / 10),
        check: (c) => c.hold("mash", c.d.bothAudible && Math.abs(c.d.phaseMs) < 35 && c.d.keyFit !== "clash" && Math.abs(c.d.tempoDiff) < 1, 10),
        hint: (c) =>
          !c.d.bothAudible
            ? "Both decks must be audible: crossfader near the middle and both volumes up."
            : (phaseHint(c, "B", 35) ?? tempoHint(c, "B", 1)),
      },
    ],
  },
  {
    id: "train-wreck",
    number: 7,
    title: "Train wreck recovery",
    tagline: "The beats drifted: fix it live, don't panic",
    briefing: {
      why: "Even good DJs drift out of sync: a deck slows, a nudge goes too far. A train wreck is two beats clashing in front of the crowd. The goal is to fix it quickly and without stopping the music.",
      realWorld:
        "Never stop and restart. Find which deck is early, nudge it the other way until the kicks merge, then hold. If it's hopeless, pull the offending deck out with the crossfader or its volume and try again off-air.",
      tips: ["Both decks are on air and one is 120 ms out. Move fast.", "Nudge − slows a deck for a moment, nudge + speeds it up.", "A decent fix in under 15 seconds is a good result."],
    },
    setup: {
      decks: {
        A: { trackId: "warehouse-lights", playing: true, startBar: 12, volume: 0.8 },
        B: { trackId: "golden-hour", playing: true, startBar: 12, volume: 0.8, tempoPct: -3.125 },
      },
      crossfader: 0,
      phaseOffsetMs: 120,
    },
    weights: { timing: 3, tempo: 1, smoothness: 1 },
    scoreFrom: 0,
    timeLimit: 60,
    objectives: [
      {
        id: "fix",
        text: "Nudge until the phase offset is under 25 ms",
        check: (c) => c.hold("fix", c.d.bothPlaying && Math.abs(c.d.phaseMs) < 25, 1),
        hint: (c) => phaseHint(c, "B", 25) ?? "Close: tiny taps now.",
      },
      {
        id: "hold",
        text: "Keep it locked for 6 seconds",
        progress: (c) => Math.min(1, c.holdTime("hold") / 6),
        check: (c) => c.hold("hold", c.d.bothPlaying && Math.abs(c.d.phaseMs) < 25, 6),
        hint: (c) => phaseHint(c, "B", 25),
      },
    ],
  },
  {
    id: "loop-roll",
    number: 8,
    title: "Loop roll: build and drop",
    tagline: "Tighten a loop, sweep a filter, then drop",
    briefing: {
      why: "A build-up is tension: a loop getting shorter and shorter while a filter thins the sound. The drop is the release: the loop opens and the full track slams back in. It's one of the most crowd-pleasing moves there is.",
      realWorld:
        "DJs and producers use loop rolls and high-pass filter sweeps before drops. The drop works best exactly on a bar line, so the full groove returns 'on the one'.",
      tips: ["Loop buttons on Deck A: 4 → 2 → 1 → ½ beat.", "The filter knob sweeps from low-pass (left) to high-pass (right).", "For the drop: turn the loop off and centre the filter at the same time."],
    },
    setup: { decks: { A: { trackId: "concrete-run", playing: true, startBar: 12, volume: 0.85 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    scoreFrom: 0,
    objectives: [
      {
        id: "loop",
        text: "Build: engage a 2- or 4-beat loop on Deck A",
        check: (c) => {
          const l = c.snap.decks.A.loop;
          return l.active && l.beats !== null && l.beats >= 2;
        },
        hint: () => "Press a loop button (2 or 4) on Deck A.",
      },
      {
        id: "tighten",
        text: "Tighten the loop to 1 beat or less",
        check: (c) => {
          const l = c.snap.decks.A.loop;
          return l.active && l.beats !== null && l.beats <= 1;
        },
        hint: () => "Press the 1 or ½ loop button: shorter loop, more tension.",
      },
      {
        id: "sweep",
        target: "M-filter-A",
        text: "Sweep the filter into high-pass (past +0.6) while looping",
        check: (c) => c.snap.decks.A.loop.active && c.snap.decks.A.filter >= 0.6,
        hint: () => "Slide Deck A's filter to the right (high-pass) so the sound thins out.",
      },
      {
        id: "drop",
        text: "Drop: loop off and filter back to centre within 2 seconds",
        check: (c) => {
          const a = c.snap.decks.A;
          if (a.loop.active && a.filter >= 0.4) c.memo.armed = true;
          if (!c.memo.armed) return false;
          if (!a.loop.active && c.memo.loopOff === undefined) c.memo.loopOff = c.time;
          if (Math.abs(a.filter) < 0.2 && c.memo.filterBack === undefined) c.memo.filterBack = c.time;
          if (a.loop.active) delete c.memo.loopOff;
          if (a.filter > 0.3) delete c.memo.filterBack;
          const lo = c.memo.loopOff as number | undefined;
          const fb = c.memo.filterBack as number | undefined;
          return lo !== undefined && fb !== undefined && Math.abs(lo - fb) <= 2 && !a.loop.active && Math.abs(a.filter) < 0.2;
        },
        hint: (c) => (c.snap.decks.A.loop.active ? "Turn the loop off, and bring the filter back to centre: together." : "Centre the filter now."),
      },
    ],
  },
  {
    id: "club-night",
    number: 9,
    title: "Club night",
    tagline: "Play a four-song set and keep the floor alive",
    kind: "club",
    briefing: {
      why: "Time to put it together. You have six minutes and a packed floor. The crowd's energy rises with smooth blends and falls when beats, basses or keys clash, or when the music stops.",
      realWorld:
        "A set is a story. A good DJ reads the room, picks the next track for what the crowd needs, and takes requests when they fit. The crowd will ask for things: do them and the floor goes wild.",
      tips: [
        "Play four different songs for at least 20 seconds each. Swap decks as you go.",
        "Smooth blends (in time, in key, bass swapped) raise the energy.",
        "Watch the request cards on the right and answer them within about 30 seconds.",
        "No dead air!",
      ],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "midnight-static", volume: 0.8 } }, crossfader: -1 },
    weights: { crowd: 4, timing: 1, tempo: 1, eq: 1, key: 1, smoothness: 1 },
    scoreFrom: 0,
    timeLimit: 360,
    objectives: [
      {
        id: "open",
        text: "Open the set: start Deck A and bring it on air",
        check: (c) => c.d.audible.A || c.d.audible.B,
        hint: () => "Press PLAY on Deck A and make sure the crossfader and volume let it through.",
      },
      {
        id: "songs",
        text: "Play four different songs for 20 seconds each",
        progress: (c) => Math.min(1, countPlayed(c) / 4),
        check: (c) => {
          for (const id of ["A", "B"] as DeckId[]) {
            const d = c.snap.decks[id];
            if (d.track && c.d.audible[id]) {
              const k = `t:${d.track.id}`;
              c.memo[k] = ((c.memo[k] as number | undefined) ?? 0) + c.dt;
            }
          }
          return countPlayed(c) >= 4;
        },
        hint: (c) => {
          const n = countPlayed(c);
          return `${n} of 4 songs done. Load a new song on the idle deck and mix it in.`;
        },
      },
      {
        id: "floor",
        text: "End with the floor alive: crowd energy above 40%",
        check: (c) => !!c.crowd && c.crowd.energy >= 40,
        hint: (c) => (c.crowd ? `The crowd is at ${Math.round(c.crowd.energy)}%. ${c.crowd.mood}.` : null),
      },
    ],
  },
];

/** Same code, ±1 and the A/B twin: the codes that blend with `code`. */
export function camelotNeighbours(code: string) {
  const n = Number.parseInt(code, 10);
  const l = code.endsWith("B") ? "B" : "A";
  if (!Number.isFinite(n)) return [code];
  const wrap = (v: number) => ((v + 11) % 12) + 1;
  return [`${n}${l}`, `${wrap(n - 1)}${l}`, `${wrap(n + 1)}${l}`, `${n}${l === "A" ? "B" : "A"}`];
}

function countPlayed(c: CheckCtx) {
  let n = 0;
  for (const k of Object.keys(c.memo)) if (k.startsWith("t:") && (c.memo[k] as number) >= 20) n++;
  return n;
}

export function missionById(id: string) {
  return MISSIONS.find((m) => m.id === id);
}
