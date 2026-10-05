// The flight-school curriculum: five levels, each with lessons (a guided
// tour that spotlights the control to touch and says why), practice drills
// (repeatable, timed, with live feedback) and a checkride (a theory quiz
// plus a practical; passing it unlocks the next level). Then real gigs:
// the situations DJs actually play in. All of it is the same Mission shape
// the original training missions use, so one runner and one session drive
// everything. Pure data and checks.

import { beatIndex } from "./djControls";
import { effBpm, energyAt } from "./djMath";
import type { DeckId, DjSnapshot } from "./djTypes";
import { MISSIONS, type CheckCtx, type Mission, type Objective } from "./scenarios";
import { QUIZ_BASICS, QUIZ_BEATMATCH, QUIZ_CREATIVE, QUIZ_GIGS, QUIZ_MIXING, camelotQuestions } from "./quiz";

const PHRASE_BEATS = 32;

/** Bar number (1-based) a deck is on. */
function barOf(c: CheckCtx, id: DeckId) {
  const d = c.snap.decks[id];
  return d.track ? Math.floor(beatIndex(d.track, d.position) / 4) + 1 : 0;
}

/** fx counter now, against what it was when the objective started. */
function fxSince(c: CheckCtx, key: string) {
  const now = c.snap.fx[key] ?? 0;
  const base = `fx0:${key}`;
  if (c.memo[base] === undefined) c.memo[base] = now;
  return now - (c.memo[base] as number);
}

/**
 * Detects the moment a deck starts and reports where the other deck was, in
 * beats from its nearest phrase line (negative: early). Works out the start
 * from how far the starting deck has played since its cue point, so the
 * 100 ms tick doesn't blur it.
 */
function startOffsetOnPhrase(c: CheckCtx, starter: DeckId, other: DeckId): number | null {
  const s = c.snap.decks[starter];
  const o = c.snap.decks[other];
  const key = `was:${starter}`;
  const was = !!c.memo[key];
  c.memo[key] = s.playing;
  if (!s.playing || was || !s.track || !o.track || !o.playing) return null;
  const realElapsed = Math.max(0, (s.position - s.cue) / Math.max(0.01, s.rate));
  const oPos = o.position - realElapsed * o.rate;
  const b = beatIndex(o.track, oPos);
  return b - Math.round(b / PHRASE_BEATS) * PHRASE_BEATS;
}

const tracksPlayed = (c: CheckCtx, need: number, minSec: number, filter?: (d: DjSnapshot["decks"]["A"]) => boolean) => {
  for (const id of ["A", "B"] as DeckId[]) {
    const d = c.snap.decks[id];
    if (d.track && c.d.audible[id] && (!filter || filter(d))) {
      const k = `t:${d.track.id}`;
      c.memo[k] = ((c.memo[k] as number | undefined) ?? 0) + c.dt;
    }
  }
  let n = 0;
  for (const k of Object.keys(c.memo)) if (k.startsWith("t:") && (c.memo[k] as number) >= minSec) n++;
  return n >= need;
};
const countTracks = (c: CheckCtx, minSec: number) => Object.keys(c.memo).filter((k) => k.startsWith("t:") && (c.memo[k] as number) >= minSec).length;

function songsObjective(id: string, need: number, minSec: number, text: string, filter?: (d: DjSnapshot["decks"]["A"]) => boolean): Objective {
  return {
    id,
    text,
    progress: (c) => Math.min(1, countTracks(c, minSec) / need),
    check: (c) => tracksPlayed(c, need, minSec, filter),
    hint: (c) => `${countTracks(c, minSec)} of ${need} done. Load the next song on the idle deck and mix it in.`,
  };
}

const locked = (c: CheckCtx, ms: number, bpm: number) => c.d.bothPlaying && Math.abs(c.d.phaseMs) < ms && Math.abs(c.d.tempoDiff) < bpm;

// ------------------------------------------------------------------ lessons

export const LESSONS: Mission[] = [
  {
    id: "lesson-player",
    number: 1,
    category: "lesson",
    level: 1,
    minutes: 4,
    title: "Meet the player",
    tagline: "Play, cue, hot cues and the overview",
    briefing: {
      why: "Every DJ setup starts with a player: a deck that plays one track and lets you find your place in it fast.",
      realWorld: "Club players, controllers and DJ software all share these buttons. Learn them once and you can play anywhere.",
      tips: ["Follow the glowing outline: it shows the control for each step.", "Each step explains why it matters."],
    },
    setup: { decks: { A: { trackId: "neon-drive", volume: 0.8 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    objectives: [
      { id: "play", target: "A-play", text: "Press PLAY on Deck A", why: "PLAY starts the track. On a club player it's the big round button.", check: (c) => c.snap.decks.A.playing },
      {
        id: "cue",
        target: "A-cue",
        text: "Tap CUE: the deck jumps back to the cue point and stops",
        why: "The cue point marks where the track should start. A DJ cues the first beat so it starts exactly on time.",
        check: (c) => {
          const a = c.snap.decks.A;
          if (a.playing) c.memo.armed = true;
          return !!c.memo.armed && !a.playing && Math.abs(a.position - a.cue) < 0.15;
        },
      },
      {
        id: "overview",
        target: "A-overview",
        text: "Tap the strip overview of the whole track about halfway along to jump there",
        why: "The overview shows the whole song: quiet parts and big parts. Tapping it is 'needle search', like dropping the needle on a record.",
        check: (c) => {
          const a = c.snap.decks.A;
          return !!a.track && a.position > a.track.duration * 0.3;
        },
      },
      {
        id: "hotcue-set",
        target: "A-pads",
        text: "Press an empty hot cue pad to save this spot",
        why: "Hot cues are bookmarks. Save the drop, the vocal, the breakdown, and jump to them instantly.",
        check: (c) => c.snap.decks.A.hotCues.some((h) => h !== null),
      },
      {
        id: "hotcue-jump",
        target: "A-pads",
        text: "Play, then press the same pad again to jump back to it",
        why: "With quantize on, the jump keeps the beat, so the crowd hears a deliberate edit, not a skip.",
        check: (c) => {
          const a = c.snap.decks.A;
          const h = a.hotCues.find((v) => v !== null);
          if (h === undefined || h === null) return false;
          if (a.playing && a.position > h + 1) c.memo.away = true;
          return !!c.memo.away && a.playing && Math.abs(a.position - h) < 0.6;
        },
      },
      {
        id: "loop",
        target: "A-loops",
        text: "Hold a 4-beat loop for 4 seconds",
        why: "A loop stretches a section while you get the next track ready.",
        progress: (c) => Math.min(1, c.holdTime("loop") / 4),
        check: (c) => c.hold("loop", c.snap.decks.A.playing && c.snap.decks.A.loop.active, 4),
      },
    ],
  },
  {
    id: "lesson-mixer",
    number: 2,
    category: "lesson",
    level: 1,
    minutes: 5,
    title: "Meet the mixer",
    tagline: "Headphone cue, faders, EQ and the crossfader",
    briefing: {
      why: "The mixer is where two tracks become one mix. You prepare the next track in your headphones while the crowd hears the other.",
      realWorld: "A club mixer has a channel per deck: trim, three-band EQ, filter, a CUE button for headphones and a fader, then the crossfader and master.",
      tips: ["Deck A is playing to the crowd. Deck B is playing too, but its fader is down.", "Headphones (or the split-cue option) make this real."],
    },
    setup: {
      decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 8, volume: 0.8 }, B: { trackId: "golden-hour", playing: true, startBar: 8, volume: 0, tempoPct: -3.125 } },
      crossfader: -1,
      phaseOffsetMs: 0,
    },
    weights: { smoothness: 1 },
    objectives: [
      {
        id: "pfl",
        target: "M-pfl-B",
        text: "Press CUE (headphones) on channel B",
        why: "You hear B in your headphones before the crowd does. That's how DJs check the next track.",
        check: (c) => c.snap.decks.B.pfl,
      },
      {
        id: "cuemix",
        target: "M-cuemix",
        text: "Turn the headphone CUE/MASTER knob towards CUE",
        why: "Cue mix sets how much of the cued channel versus the master you hear in your headphones.",
        check: (c) => c.snap.mix.cueMix < 0.35,
      },
      {
        id: "eq",
        target: "M-eq-B",
        text: "Cut channel B's LOW EQ all the way down",
        why: "Bringing a track in with its bass cut avoids two bass lines fighting.",
        check: (c) => c.snap.decks.B.kill.low || c.snap.decks.B.eq.low <= -20,
      },
      {
        id: "fader",
        target: "M-fader-B",
        text: "Raise channel B's fader to the top",
        why: "The channel fader sets the level; the crossfader decides which side the crowd hears.",
        check: (c) => c.snap.decks.B.volume > 0.7,
      },
      {
        id: "xfader",
        target: "M-xfader",
        text: "Slide the crossfader to the middle",
        why: "Now both tracks play to the crowd: a blend.",
        check: (c) => c.hold("x", Math.abs(c.snap.mix.crossfader) < 0.3 && c.d.audible.B, 1.5),
      },
      {
        id: "swap",
        target: "M-eq",
        text: "Swap the bass: A's low down, B's low up",
        why: "The bass swap is the backbone of a smooth club transition.",
        check: (c) => c.eqSwap("A", 4),
      },
      {
        id: "finish",
        target: "M-xfader",
        text: "Crossfader all the way to B",
        why: "Transition done: B is the track now. Next you'd load a new track on A.",
        check: (c) => c.hold("f", c.snap.mix.crossfader > 0.8, 1),
      },
    ],
  },
  {
    id: "lesson-tempo",
    number: 3,
    category: "lesson",
    level: 2,
    minutes: 4,
    title: "Tempo, pitch and key lock",
    tagline: "What the tempo fader really does",
    briefing: {
      why: "To mix, two tracks must run at the same tempo. The tempo fader changes speed, and without key lock the pitch too.",
      realWorld: "On a club player, down on the tempo fader is faster. The range button sets how far it goes; master tempo keeps the pitch.",
      tips: ["Deck B is playing quietly on its own. Listen to how it changes."],
    },
    setup: { decks: { B: { trackId: "golden-hour", playing: true, startBar: 4, volume: 0.8 } }, crossfader: 1 },
    weights: { smoothness: 1 },
    objectives: [
      {
        id: "faster",
        target: "B-tempo",
        text: "Move Deck B's tempo fader to about +5 %",
        why: "Faster: the BPM goes up and, listen, the pitch rises too, like a record spun faster.",
        check: (c) => c.snap.decks.B.tempoPct >= 4,
      },
      {
        id: "keylock",
        target: "B-keylock",
        text: "Turn on KEY LOCK (master tempo)",
        why: "Key lock time-stretches the audio: tempo stays, pitch goes back to normal. Great for harmonic mixing, but at big changes it can sound grainy.",
        check: (c) => c.snap.decks.B.keyLock,
      },
      {
        id: "range",
        target: "B-range",
        text: "Change the tempo range to ±16 %",
        why: "A narrow range gives fine control; a wide one reaches far-apart tempos.",
        check: (c) => c.snap.decks.B.tempoRange === 16,
      },
      {
        id: "zero",
        target: "B-tempo",
        text: "Put the tempo back to exactly 0 % (the fader clicks into the centre)",
        why: "The centre detent is how you find the track's original tempo by feel.",
        check: (c) => c.snap.decks.B.tempoPct === 0,
      },
      {
        id: "jog",
        target: "B-jog",
        text: "Spin the outer ring of the jog wheel while it plays",
        why: "Touching the side of the jog bends the speed for a moment: that's how DJs nudge beats into line.",
        check: (c) => {
          if (c.snap.decks.B.bend !== 0) c.memo.bent = true;
          return !!c.memo.bent;
        },
      },
    ],
  },
  {
    id: "lesson-grid",
    number: 4,
    category: "lesson",
    level: 2,
    minutes: 4,
    title: "Beat grid and phase",
    tagline: "See the beats line up",
    briefing: {
      why: "The waveforms show each track's beats as lines. When the decks are matched, the lines of both decks move together.",
      realWorld: "DJ software analyses every track for its beat grid: tempo, the first beat and where bars start (the red markers).",
      tips: ["Watch the two waveforms stacked at the top.", "SYNC is fine to use; knowing what it does is the point."],
    },
    setup: {
      decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 8, volume: 0.8 }, B: { trackId: "golden-hour", playing: true, startBar: 8, volume: 0.8 } },
      crossfader: -1,
    },
    weights: { smoothness: 1 },
    objectives: [
      {
        id: "sync",
        target: "B-sync",
        text: "Press SYNC on Deck B",
        why: "SYNC sets B's tempo to A's and lines up the beats. Look: the grid lines of both waveforms now move together.",
        check: (c) => c.hold("s", locked(c, 15, 0.1), 0.5),
      },
      {
        id: "push",
        target: "B-jog",
        text: "Push Deck B out of line with the jog wheel (over 60 ms)",
        why: "This is what a drift sounds like: the kicks 'flam'. The phase meter and the grids show it too.",
        check: (c) => c.d.bothPlaying && Math.abs(c.d.phaseMs) > 60,
      },
      {
        id: "back",
        target: "B-jog",
        text: "Now bring it back by hand: under 20 ms for 3 seconds",
        why: "Nudging by ear is the skill: small touches, wait, listen.",
        progress: (c) => Math.min(1, c.holdTime("b") / 3),
        check: (c) => c.hold("b", locked(c, 20, 0.3), 3),
      },
      {
        id: "quantize",
        target: "B-quantize",
        text: "Make sure QUANTIZE is on, then set a hot cue on Deck B",
        why: "With quantize, hot cues and loops snap to the grid, so they land on the beat even when your press doesn't.",
        check: (c) => c.snap.decks.B.quantize && c.snap.decks.B.hotCues.some((h) => h !== null),
      },
    ],
  },
  {
    id: "lesson-phrasing",
    number: 5,
    category: "lesson",
    level: 3,
    minutes: 5,
    title: "Phrasing: count to 32",
    tagline: "Start the next track where the music changes",
    briefing: {
      why: "Dance music is built in phrases: 8 bars (32 beats). Changes happen on phrase lines. Start your next track on bar 1 of a phrase and the mix feels intentional.",
      realWorld: "DJs count bars while they listen. The bar counter on the deck (bar.beat) helps; the red markers on the waveform are bar lines.",
      tips: ["Deck B is cued on its first beat and ready.", "Phrase lines on Deck A: bars 1, 9, 17, 25, 33…"],
    },
    setup: {
      decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 4, volume: 0.8 }, B: { trackId: "golden-hour", volume: 0.8, tempoPct: -3.125 } },
      crossfader: 0,
    },
    weights: { smoothness: 1 },
    objectives: [
      {
        id: "watch",
        target: "A-display",
        text: "Watch Deck A's bar counter until it reaches bar 9",
        why: "Bar 9 is the start of the second phrase: listen for something to change there.",
        check: (c) => barOf(c, "A") >= 9,
      },
      {
        id: "drop",
        target: "B-play",
        text: "Start Deck B exactly on bar 1 of one of Deck A's phrases (bar 17, 25, 33…) within half a beat",
        why: "Both tracks now change at the same moments: their phrases are stacked.",
        check: (c) => {
          const off = startOffsetOnPhrase(c, "B", "A");
          if (off === null) return false;
          c.memo.last = off;
          return Math.abs(off) <= 0.5;
        },
        hint: (c) =>
          c.memo.last !== undefined
            ? `Last try was ${Math.abs(c.memo.last as number).toFixed(1)} beats ${(c.memo.last as number) < 0 ? "early" : "late"}. Press CUE on Deck B to go back, and try the next phrase.`
            : `Deck A is on bar ${barOf(c, "A")}. Count: …6, 7, 8, and go on the next "1" of bars 17, 25 or 33.`,
      },
      {
        id: "blend",
        target: "M-xfader",
        text: "Keep both playing in time for 8 seconds (press SYNC on B if needed)",
        why: "Phrase-aligned and beat-matched: this is a proper mix.",
        progress: (c) => Math.min(1, c.holdTime("bl") / 8),
        check: (c) => c.hold("bl", locked(c, 35, 0.6), 8),
      },
    ],
  },
  {
    id: "lesson-stems",
    number: 6,
    category: "lesson",
    level: 4,
    minutes: 4,
    title: "Stems, rolls and echoes",
    tagline: "Performance moves",
    briefing: {
      why: "Modern DJ software can split a track into stems live. Combined with loop rolls and echo, that's a toolkit for building tension and surprises.",
      realWorld: "Stem separation is now built into the big DJ apps. Remixt's splitter makes the same stems from any song you upload.",
      tips: ["One deck is plenty for this lesson."],
    },
    setup: { decks: { A: { trackId: "neon-drive", playing: true, startBar: 8, volume: 0.85 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    objectives: [
      { id: "vocal", target: "A-stems", text: "Kill the vocals on Deck A", why: "An instant instrumental: room for an acapella or an announcement.", check: (c) => c.snap.decks.A.stems.vocal },
      {
        id: "back",
        target: "A-stems",
        text: "Bring the vocals back on a bar line",
        why: "Stems coming back in on the 1 sound like a remix.",
        check: (c) => {
          if (c.snap.decks.A.stems.vocal) c.memo.k = true;
          return !!c.memo.k && !c.snap.decks.A.stems.vocal;
        },
      },
      { id: "roll", target: "A-pads", text: "Hold a loop roll (pad mode ROLL, or the FX panel's Roll pads)", why: "A roll stutters and then drops back exactly where the track would have been.", check: (c) => fxSince(c, "roll") > 0 },
      { id: "echo", target: "FX-echo", text: "Finish with an echo out", why: "Echo out is the classic way to end a track or cover a hard cut.", check: (c) => fxSince(c, "echo") > 0 },
    ],
  },
  {
    id: "lesson-camelot",
    number: 7,
    category: "lesson",
    level: 4,
    minutes: 3,
    title: "The Camelot wheel",
    tagline: "Mixing in key, in six questions",
    briefing: {
      why: "Every key has a code on the Camelot wheel. Same number, ±1, or the other letter: those blend. Opposite sides clash.",
      realWorld: "DJ software shows each track's key, usually as a Camelot code, so you can choose the next track that fits.",
      tips: ["The wheel is shown with each question: find the code, look at its neighbours."],
    },
    setup: { decks: {} },
    weights: {},
    objectives: [],
    quiz: (seed) => camelotQuestions(seed, 6),
  },
  {
    id: "lesson-gig",
    number: 8,
    category: "lesson",
    level: 5,
    minutes: 4,
    title: "Running the booth",
    tagline: "Split cue, talkover and recording",
    briefing: {
      why: "Playing out is more than mixing: you monitor in headphones, talk to the room and often record your set.",
      realWorld:
        "Club mixers send the cue to headphones and the master to the speakers. Here, split cue puts the cue in your left ear and the master in your right, or, if your browser allows it, the cue can go to a second audio output.",
      tips: ["Use headphones for this one."],
    },
    setup: { decks: { A: { trackId: "island-time", playing: true, startBar: 4, volume: 0.8 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    objectives: [
      { id: "split", target: "M-monitor", text: "Switch the headphone mode to SPLIT", why: "Left ear: what you're cueing. Right ear: what the crowd hears.", check: (c) => c.snap.mix.monitor === "split" },
      { id: "single", target: "M-monitor", text: "Switch back to a single output (or pick a second device)", why: "Split cue only makes sense in headphones.", check: (c) => c.snap.mix.monitor !== "split" },
      { id: "rec", target: "M-record", text: "Start recording the mix", why: "Record every set: listening back is how DJs improve.", check: (c) => c.snap.mix.recording },
      {
        id: "talk",
        target: "M-talkover",
        text: "Hold TALKOVER for 2 seconds",
        why: "Talkover ducks the music so your voice cuts through.",
        progress: (c) => Math.min(1, c.holdTime("t") / 2),
        check: (c) => c.hold("t", c.snap.mix.talkover, 2),
      },
      { id: "stop", target: "M-record", text: "Stop the recording (you can download it)", why: "Done: a file of your set.", check: (c) => !c.snap.mix.recording },
    ],
  },
];

// ------------------------------------------------------------------- drills

const PAIRS: [string, string, number][] = [
  ["warehouse-lights", "golden-hour", -3.125],
  ["golden-hour", "warehouse-lights", 3.226],
  ["neon-drive", "warehouse-lights", 0],
];

export const DRILLS: Mission[] = [
  {
    id: "drill-ear",
    number: 1,
    category: "drill",
    level: 2,
    minutes: 3,
    title: "Beatmatch by ear",
    tagline: "No SYNC, no BPM, no meter: just your ears",
    rules: { noSync: true, hideBpm: true, noMeter: true },
    briefing: {
      why: "Sync buttons fail, tracks have no grid, players differ. Beatmatching by ear always works.",
      realWorld: "Cue Deck B in your headphones. If its kicks run ahead, it's fast: tempo down. If they fall behind: tempo up. Then nudge them together.",
      tips: ["Turn on CUE for channel B and use split cue with headphones.", "Big drift = tempo fader. Flam but steady = nudge.", "Each run starts B at a different wrong tempo."],
    },
    setup: { tempoRange: 10, decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 8 }, B: { trackId: "golden-hour", startBar: 8 } }, crossfader: -1 },
    setupFor: (seed) => {
      const [a, b, match] = PAIRS[seed % PAIRS.length];
      const off = (seed % 2 ? 1 : -1) * (1.5 + (seed % 7) * 0.5);
      return { tempoRange: 10, decks: { A: { trackId: a, playing: true, startBar: 8 }, B: { trackId: b, startBar: 8, tempoPct: match + off } }, crossfader: -1 };
    },
    weights: { timing: 2, tempo: 2, smoothness: 1 },
    scoreFrom: 1,
    timeLimit: 150,
    objectives: [
      { id: "start", target: "B-play", text: "Start Deck B and cue it in your headphones", check: (c) => c.snap.decks.B.playing && c.snap.decks.B.pfl, hint: () => "PLAY on Deck B, then CUE on channel B." },
      {
        id: "match",
        target: "B-tempo",
        text: "Match by ear: keep the kicks together for 8 seconds",
        progress: (c) => Math.min(1, c.holdTime("m") / 8),
        check: (c) => c.hold("m", locked(c, 25, 0.3), 8),
        hint: (c) =>
          !c.d.bothPlaying
            ? "Both decks need to play."
            : Math.abs(c.d.tempoDiff) > 0.3
              ? "Listen: do B's kicks keep sliding the same way? That's tempo. Move the fader a little, wait, listen."
              : "The drift has stopped. Now nudge B with the jog until the kicks are one.",
      },
    ],
  },
  {
    id: "drill-eq",
    number: 2,
    category: "drill",
    level: 3,
    minutes: 2,
    title: "EQ swap drill",
    tagline: "Three clean bass swaps against the clock",
    briefing: {
      why: "A bass swap should be automatic: on the bar line, one hand down, one hand up.",
      realWorld: "Club DJs swap lows on almost every transition. Speed and timing both count.",
      tips: ["Swap A→B, then B→A, then A→B.", "Do each swap within 2 bars, on a bar line."],
    },
    setup: {
      decks: {
        A: { trackId: "warehouse-lights", playing: true, startBar: 8 },
        B: { trackId: "golden-hour", playing: true, startBar: 8, tempoPct: -3.125, killLow: true },
      },
      crossfader: 0,
      phaseOffsetMs: 0,
    },
    weights: { eq: 3, smoothness: 1 },
    timeLimit: 90,
    objectives: [
      { id: "s1", target: "M-eq", text: "Swap 1: A's low out, B's low in", check: (c) => c.eqSwap("A", 2), hint: () => "Kill A's low and open B's low together." },
      { id: "s2", target: "M-eq", text: "Swap 2: back again, B's low out, A's low in", check: (c) => c.eqSwap("B", 2), hint: () => "Now the other way." },
      { id: "s3", target: "M-eq", text: "Swap 3: A's low out, B's low in", check: (c) => c.eqSwap("A", 2), hint: () => "One more." },
    ],
  },
  {
    id: "drill-phrase",
    number: 3,
    category: "drill",
    level: 3,
    minutes: 3,
    title: "Phrase drops",
    tagline: "Drop the next track on bar 1 of the phrase, three times",
    briefing: {
      why: "Starting the next track on a phrase line is what makes a mix sound planned.",
      realWorld: "Count bars while you listen: phrases are 8 bars (32 beats).",
      tips: ["Deck B is cued on its first beat.", "After each try, tap CUE on Deck B to go back.", "Scored on how close each start is."],
    },
    setup: {
      decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 6, volume: 0.8 }, B: { trackId: "golden-hour", volume: 0.8, tempoPct: -3.125 } },
      crossfader: 0,
    },
    weights: { smoothness: 1 },
    timeLimit: 180,
    objectives: [
      {
        id: "drops",
        target: "B-play",
        text: "Land 3 drops within ½ beat of a phrase line on Deck A",
        progress: (c) => Math.min(1, ((c.memo.hits as number) ?? 0) / 3),
        check: (c) => {
          const off = startOffsetOnPhrase(c, "B", "A");
          if (off !== null) {
            c.memo.last = off;
            if (Math.abs(off) <= 0.5) c.memo.hits = ((c.memo.hits as number) ?? 0) + 1;
          }
          return ((c.memo.hits as number) ?? 0) >= 3;
        },
        hint: (c) =>
          c.memo.last !== undefined
            ? `${(c.memo.hits as number) ?? 0} of 3. Last: ${Math.abs(c.memo.last as number).toFixed(2)} beats ${(c.memo.last as number) < 0 ? "early" : "late"}${Math.abs(c.memo.last as number) <= 0.5 ? " ✓" : ""}. CUE on B, then wait for the next phrase.`
            : `Deck A is on bar ${barOf(c, "A")}. Phrases start on bars 9, 17, 25, 33…`,
      },
    ],
  },
  {
    id: "drill-cue",
    number: 4,
    category: "drill",
    level: 1,
    minutes: 2,
    title: "Cue-point drill",
    tagline: "Find the downbeat by hand, quantize off",
    rules: { noQuantize: true },
    briefing: {
      why: "Without a grid (vinyl, old tracks, live recordings) you find the first beat by hand: play, pause near it, then rock the jog until the kick starts right at the playhead.",
      realWorld: "On a player: pause, turn the jog to search, press CUE to set. On vinyl: find the kick with your hand on the record.",
      tips: ["The bar.beat counter shows where you are.", "When paused, turning the jog searches the track (you'll hear it).", "CUE sets the cue point when the deck is stopped away from it."],
    },
    setup: { decks: { A: { trackId: "neon-drive", volume: 0.8 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    timeLimit: 120,
    objectives: [
      {
        id: "bar9",
        target: "A-jog",
        text: "Set Deck A's cue point on the first beat of bar 9 (within 30 ms)",
        check: (c) => {
          const a = c.snap.decks.A;
          if (!a.track) return false;
          const want = a.track.firstBeat + 8 * 4 * (60 / a.track.bpm);
          return Math.abs(a.cue - want) < 0.03;
        },
        hint: (c) => {
          const a = c.snap.decks.A;
          if (!a.track) return null;
          const want = a.track.firstBeat + 32 * (60 / a.track.bpm);
          const ms = Math.round((a.cue - want) * 1000);
          return a.cue === 0 ? "Play, pause near bar 9, then search with the jog." : `Your cue is ${Math.abs(ms)} ms ${ms < 0 ? "early" : "late"}.`;
        },
      },
      {
        id: "bar17",
        target: "A-jog",
        text: "Now bar 17, within 20 ms",
        check: (c) => {
          const a = c.snap.decks.A;
          if (!a.track) return false;
          return Math.abs(a.cue - (a.track.firstBeat + 64 * (60 / a.track.bpm))) < 0.02;
        },
      },
    ],
  },
  {
    id: "drill-loops",
    number: 5,
    category: "drill",
    level: 1,
    minutes: 2,
    title: "Loop and roll drill",
    tagline: "Loop, halve, double, exit, roll",
    briefing: {
      why: "Loops are your safety net and your build-up tool. Your hands should know them without looking.",
      realWorld: "Every player and controller has auto loop, loop ½×/2× and exit. Rolls are on the pads.",
      tips: ["Start with a 4-beat loop."],
    },
    setup: { decks: { A: { trackId: "concrete-run", playing: true, startBar: 8, volume: 0.85 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    timeLimit: 90,
    objectives: [
      { id: "l4", target: "A-loops", text: "Set a 4-beat loop", check: (c) => c.snap.decks.A.loop.active && c.snap.decks.A.loop.beats === 4 },
      { id: "half", target: "A-loopsize", text: "Halve it twice to 1 beat (½×)", check: (c) => c.snap.decks.A.loop.active && c.snap.decks.A.loop.beats === 1 },
      { id: "double", target: "A-loopsize", text: "Double it back to 8 beats (2×)", check: (c) => c.snap.decks.A.loop.active && c.snap.decks.A.loop.beats === 8 },
      { id: "exit", target: "A-loops", text: "Exit the loop", check: (c) => !c.snap.decks.A.loop.active },
      { id: "roll", target: "A-pads", text: "Two loop rolls", check: (c) => fxSince(c, "roll") >= 2 },
    ],
  },
  {
    id: "drill-camelot",
    number: 6,
    category: "drill",
    level: 4,
    minutes: 3,
    title: "Harmonic mixing quiz",
    tagline: "Camelot codes against the clock",
    briefing: {
      why: "Knowing which keys blend lets you pick the next track in seconds.",
      realWorld: "Read the Camelot code, think ±1 or the other letter.",
      tips: ["New questions every run."],
    },
    setup: { decks: {} },
    weights: {},
    objectives: [],
    quiz: (seed) => camelotQuestions(seed, 8),
  },
  {
    id: "drill-scratch",
    number: 7,
    category: "drill",
    level: 4,
    minutes: 3,
    gear: "turntables",
    title: "Scratch basics",
    tagline: "Baby scratches on the turntables",
    briefing: {
      why: "Scratching starts with the baby scratch: the record pushed forward and pulled back, in rhythm, crossfader open.",
      realWorld: "Turntablists practise baby scratches for hours. Then come cuts with the crossfader (the cut curve is set for you).",
      tips: ["Put a finger on the record (the middle of the platter) to grab it.", "Move it forward and back, about a beat each way.", "Let go and the record plays on."],
    },
    setup: { decks: { A: { trackId: "midnight-static", playing: true, startBar: 4, volume: 0.85 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    timeLimit: 120,
    objectives: [
      { id: "grab", target: "A-jog", text: "Grab the record (press and hold the middle of the platter)", check: (c) => c.snap.decks.A.scratching },
      { id: "baby", target: "A-jog", text: "8 baby scratches: forward, back, forward, back…", progress: (c) => Math.min(1, fxSince(c, "scratchTurn") / 8), check: (c) => fxSince(c, "scratchTurn") >= 8 },
      {
        id: "release",
        target: "A-jog",
        text: "Let go and let it play for 3 seconds",
        progress: (c) => Math.min(1, c.holdTime("r") / 3),
        check: (c) => c.hold("r", c.snap.decks.A.playing && !c.snap.decks.A.scratching, 3),
      },
      {
        id: "cut",
        target: "M-xfader",
        text: "Cut: scratch again and snap the crossfader shut at least 4 times while you do",
        check: (c) => {
          const x = c.snap.mix.crossfader;
          const closed = x > 0.9;
          if (c.snap.decks.A.scratching && closed && !c.memo.closed) c.memo.cuts = ((c.memo.cuts as number) ?? 0) + 1;
          c.memo.closed = closed;
          return ((c.memo.cuts as number) ?? 0) >= 4;
        },
        hint: (c) => `${(c.memo.cuts as number) ?? 0} of 4 cuts. Hold the record with one hand, flick the crossfader to B and back with the other.`,
      },
    ],
  },
];

// --------------------------------------------------------------- checkrides

export const CHECKRIDES: Mission[] = [
  {
    id: "test-1",
    number: 1,
    category: "test",
    level: 1,
    minutes: 4,
    title: "Checkride 1: Booth basics",
    tagline: "Theory, then play, cue and loop",
    briefing: {
      why: "Prove you know the controls. Pass to unlock Level 2.",
      realWorld: "Every DJ booth check starts here: can you start, stop, cue and hold a track?",
      tips: ["Pass: 80 % in the quiz and every practical step done."],
    },
    quiz: QUIZ_BASICS,
    setup: { decks: { A: { trackId: "island-time", volume: 0.8 } }, crossfader: -1 },
    weights: { smoothness: 1 },
    timeLimit: 90,
    objectives: [
      { id: "play", text: "Start Deck A on air", check: (c) => c.d.audible.A },
      { id: "loop", text: "Hold a 4-beat loop for 3 seconds", check: (c) => c.hold("l", c.snap.decks.A.loop.active && c.snap.decks.A.loop.beats === 4, 3) },
      { id: "exit", text: "Exit the loop and let the track run", check: (c) => !c.snap.decks.A.loop.active && c.snap.decks.A.playing },
      { id: "hot", text: "Set a hot cue", check: (c) => c.snap.decks.A.hotCues.some((h) => h !== null) },
    ],
  },
  {
    id: "test-2",
    number: 2,
    category: "test",
    level: 2,
    minutes: 5,
    title: "Checkride 2: Beatmatching",
    tagline: "By ear, no sync",
    rules: { noSync: true, hideBpm: true, noMeter: true },
    briefing: { why: "Beatmatch by ear and hold it. Pass to unlock Level 3.", realWorld: "The classic DJ test: two records, no screens.", tips: ["Two minutes. Hold within 25 ms for 10 s."] },
    quiz: QUIZ_BEATMATCH,
    setup: { tempoRange: 10, decks: { A: { trackId: "golden-hour", playing: true, startBar: 8 }, B: { trackId: "warehouse-lights", startBar: 8, tempoPct: 0 } }, crossfader: -1 },
    weights: { timing: 2, tempo: 2 },
    timeLimit: 120,
    objectives: [
      { id: "start", text: "Start Deck B", check: (c) => c.snap.decks.B.playing },
      { id: "lock", text: "Hold the beats together for 10 seconds", progress: (c) => Math.min(1, c.holdTime("k") / 10), check: (c) => c.hold("k", locked(c, 25, 0.3), 10) },
    ],
  },
  {
    id: "test-3",
    number: 3,
    category: "test",
    level: 3,
    minutes: 5,
    title: "Checkride 3: The transition",
    tagline: "On the phrase, with a bass swap",
    briefing: { why: "A full club transition. Pass to unlock Level 4.", realWorld: "Phrase, beatmatch, EQ, fader: the whole job.", tips: ["Start B on a phrase line of A, swap the lows, end on B."] },
    quiz: QUIZ_MIXING,
    setup: {
      decks: { A: { trackId: "warehouse-lights", playing: true, startBar: 6, volume: 0.8 }, B: { trackId: "golden-hour", volume: 0.8, tempoPct: -3.125, killLow: true } },
      crossfader: -1,
    },
    weights: { timing: 2, eq: 2, smoothness: 1 },
    timeLimit: 180,
    objectives: [
      {
        id: "drop",
        text: "Start Deck B within 1 beat of a phrase line of Deck A",
        check: (c) => {
          const off = startOffsetOnPhrase(c, "B", "A");
          return off !== null && Math.abs(off) <= 1;
        },
      },
      { id: "in", text: "Bring B in (crossfader to the middle) in time", check: (c) => c.hold("i", c.d.bothAudible && locked(c, 40, 0.6), 3) },
      { id: "swap", text: "Swap the lows", check: (c) => c.eqSwap("A", 4) },
      { id: "out", text: "Finish on Deck B", check: (c) => c.hold("o", c.snap.mix.crossfader > 0.8 && c.d.audible.B, 2) },
    ],
  },
  {
    id: "test-4",
    number: 4,
    category: "test",
    level: 4,
    minutes: 5,
    title: "Checkride 4: Creative mixing",
    tagline: "A live mashup in key",
    briefing: { why: "Stems, keys and timing together. Pass to unlock Level 5.", realWorld: "Mashups are a signature of many big DJs.", tips: ["Vocal from A, instrumental from B, in time, 10 s."] },
    quiz: QUIZ_CREATIVE,
    setup: {
      decks: { A: { trackId: "golden-hour", playing: true, startBar: 12 }, B: { trackId: "warehouse-lights", playing: true, startBar: 12, tempoPct: 3.226 } },
      crossfader: 0,
      phaseOffsetMs: 0,
    },
    weights: { timing: 2, key: 2 },
    timeLimit: 120,
    objectives: [
      { id: "a", text: "Deck A: vocal only", check: (c) => c.snap.decks.A.stems.drums && c.snap.decks.A.stems.bass && c.snap.decks.A.stems.chords && !c.snap.decks.A.stems.vocal },
      { id: "b", text: "Deck B: no vocal", check: (c) => c.snap.decks.B.stems.vocal && !c.snap.decks.B.stems.drums },
      { id: "run", text: "Run the mashup in time for 10 seconds", progress: (c) => Math.min(1, c.holdTime("r") / 10), check: (c) => c.hold("r", c.d.bothAudible && locked(c, 35, 1), 10) },
    ],
  },
  {
    id: "test-5",
    number: 5,
    category: "test",
    level: 5,
    kind: "club",
    minutes: 6,
    title: "Final checkride: The set",
    tagline: "Four minutes, three songs, a live crowd",
    briefing: { why: "Your DJ licence. Pass and you've finished flight school.", realWorld: "A short club set, judged on flow and the floor.", tips: ["Three songs, 20 s each on air, floor above 50 % at the end."] },
    quiz: QUIZ_GIGS,
    setup: { tempoRange: 16, decks: { A: { trackId: "neon-drive", volume: 0.8 } }, crossfader: -1 },
    weights: { crowd: 3, timing: 1, eq: 1, smoothness: 1 },
    timeLimit: 240,
    libraryFriendly: true,
    objectives: [
      { id: "open", text: "Open the set", check: (c) => c.d.audible.A || c.d.audible.B },
      songsObjective("songs", 3, 20, "Play three songs, 20 s each on air"),
      { id: "floor", text: "Floor above 50 %", check: (c) => !!c.crowd && c.crowd.energy >= 50 },
    ],
  },
];

// --------------------------------------------------------------------- gigs

export const GIGS: Mission[] = [
  {
    id: "gig-warmup",
    number: 1,
    category: "gig",
    kind: "club",
    level: 3,
    minutes: 4,
    title: "Warm-up set at a bar",
    tagline: "Build a mood, don't peak",
    libraryFriendly: true,
    briefing: {
      why: "The opener sets the room up for the headliner. Too much energy too early is a classic mistake.",
      realWorld: "Warm-up DJs play below 120 BPM, avoid big drops and effects, and keep the room comfortable.",
      tips: ["Keep the crowd between 30 % and 70 %.", "Stay under 120 BPM.", "No horns, sirens or sampler hits."],
    },
    setup: { tempoRange: 10, decks: { A: { trackId: "island-time", volume: 0.8 } }, crossfader: -1 },
    weights: { crowd: 2, timing: 1, eq: 1, smoothness: 2 },
    timeLimit: 240,
    objectives: [
      { id: "open", text: "Start the music", check: (c) => c.d.audible.A || c.d.audible.B },
      {
        id: "mood",
        text: "Hold the room between 30 % and 70 % for 2 minutes: under 120 BPM, no FX hits",
        progress: (c) => Math.min(1, c.holdTime("mood") / 120),
        check: (c) => {
          const hits = fxSince(c, "horn") + fxSince(c, "siren") + Object.keys(c.snap.fx).filter((k) => k.startsWith("sample:")).reduce((t, k) => t + fxSince(c, k), 0);
          const bpmOk = (["A", "B"] as DeckId[]).every((id) => !c.d.audible[id] || effBpm(c.snap.decks[id]) <= 120.5);
          const e = c.crowd?.energy ?? 50;
          if (hits > ((c.memo.hitsSeen as number) ?? 0)) {
            c.memo.hitsSeen = hits;
            c.memo.warn = "That FX hit was too much for a warm-up.";
            return c.hold("mood", false, 120);
          }
          return c.hold("mood", (c.d.audible.A || c.d.audible.B) && bpmOk && e >= 30 && e <= 70, 120);
        },
        hint: (c) => {
          const e = c.crowd?.energy ?? 50;
          if (c.memo.warn) return c.memo.warn as string;
          if (e > 70) return "Too hot for a warm-up: pick a calmer track or pull the energy back (filter, fewer stems).";
          if (e < 30) return "The room is going cold: blend in something with a groove.";
          return null;
        },
      },
    ],
  },
  {
    id: "gig-peak",
    number: 2,
    category: "gig",
    kind: "club",
    level: 4,
    minutes: 5,
    title: "Peak-time club set",
    tagline: "Fast, tight, full floor",
    libraryFriendly: true,
    briefing: {
      why: "Peak time is when the room is full and wants energy. Keep it above 122 BPM and keep the transitions tight.",
      realWorld: "Peak-time DJs mix every 1 to 2 minutes, use EQ and FX to build, and read requests.",
      tips: ["Four songs on air, 20 s each.", "End with the floor above 70 %."],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "warehouse-lights", volume: 0.8 } }, crossfader: -1 },
    weights: { crowd: 4, timing: 1, tempo: 1, eq: 1, smoothness: 1 },
    timeLimit: 300,
    objectives: [
      { id: "open", text: "Start the set", check: (c) => c.d.audible.A || c.d.audible.B },
      songsObjective("songs", 4, 20, "Four songs on air, at 122 BPM or faster", (d) => effBpm(d) >= 121.5),
      { id: "floor", text: "Floor above 70 %", check: (c) => !!c.crowd && c.crowd.energy >= 70 },
    ],
  },
  {
    id: "gig-wedding",
    number: 3,
    category: "gig",
    kind: "club",
    level: 3,
    minutes: 5,
    title: "Wedding party",
    tagline: "Requests, an announcement, everyone dancing",
    briefing: {
      why: "Weddings and private parties: a mixed crowd, constant requests, and the host needs the mic.",
      realWorld: "Talkover ducks the music for announcements. Requests come in all night; play the ones that fit.",
      tips: ["Answer at least two requests.", "When asked, hold TALKOVER for 4 s for the announcement (with a mic if you like).", "Keep the floor moving."],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "golden-hour", volume: 0.8, playing: true, startBar: 4 } }, crossfader: -1 },
    weights: { crowd: 3, smoothness: 2 },
    timeLimit: 300,
    objectives: [
      { id: "req", text: "Answer two requests from the crowd", progress: (c) => Math.min(1, (c.crowd?.completed ?? 0) / 2), check: (c) => (c.crowd?.completed ?? 0) >= 2 },
      {
        id: "announce",
        target: "M-talkover",
        text: "Announcement: the host is ready. Hold TALKOVER for 4 seconds while the music keeps playing",
        progress: (c) => Math.min(1, c.holdTime("t") / 4),
        check: (c) => c.hold("t", c.snap.mix.talkover && (c.d.audible.A || c.d.audible.B), 4),
      },
      songsObjective("songs", 3, 20, "Play three songs, 20 s each"),
    ],
  },
  {
    id: "gig-radio",
    number: 4,
    category: "gig",
    level: 3,
    minutes: 5,
    title: "Radio / podcast mix",
    tagline: "Clean levels, no dead air, a voice link",
    briefing: {
      why: "On air, silence and distortion are the two sins. Mix cleanly, talk briefly over an intro, record it.",
      realWorld: "Radio DJs ride levels carefully and talk over intros.",
      tips: ["Record the show.", "Never clip the master (keep it out of the red).", "Do a voice link: talkover for 3 s.", "Three songs."],
    },
    setup: { tempoRange: 10, decks: { A: { trackId: "neon-drive", volume: 0.75 } }, crossfader: -1 },
    weights: { smoothness: 3, timing: 1, eq: 1 },
    timeLimit: 300,
    objectives: [
      { id: "rec", target: "M-record", text: "Start recording", check: (c) => c.snap.mix.recording },
      { id: "talk", target: "M-talkover", text: "Voice link: talkover for 3 s over the music", check: (c) => c.hold("t", c.snap.mix.talkover && (c.d.audible.A || c.d.audible.B), 3) },
      {
        id: "songs",
        text: "Three songs, 20 s each on air, without clipping the master",
        progress: (c) => Math.min(1, countTracks(c, 20) / 3),
        check: (c) => {
          if (c.snap.mix.masterLevel > 0.98) {
            c.memo.clip = true;
            for (const k of Object.keys(c.memo)) if (k.startsWith("t:")) delete c.memo[k];
          }
          return tracksPlayed(c, 3, 20);
        },
        hint: (c) => (c.memo.clip ? "The master clipped, so the count restarted. Lower the trims or master." : `${countTracks(c, 20)} of 3 songs.`),
      },
      { id: "stop", target: "M-record", text: "Stop the recording", check: (c) => !c.snap.mix.recording },
    ],
  },
  {
    id: "gig-b2b",
    number: 5,
    category: "gig",
    level: 3,
    minutes: 5,
    aiDeck: "B",
    title: "Back-to-back with an AI DJ",
    tagline: "Take turns on the decks",
    briefing: {
      why: "In a back-to-back set two DJs share the decks, one track each, responding to each other.",
      realWorld: "B2B sets are a festival favourite. Leave the other DJ room: your deck is A, theirs is B.",
      tips: ["Start Deck A. The AI DJ mixes its track in on B.", "Then load a new song on A, match it to B and mix it in."],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "warehouse-lights", volume: 0.8 } }, crossfader: -1 },
    weights: { timing: 2, tempo: 1, eq: 1, smoothness: 1 },
    scoreFrom: 2,
    timeLimit: 360,
    objectives: [
      { id: "open", text: "Start your track on Deck A", check: (c) => c.d.audible.A },
      { id: "ai", text: "Let the AI DJ mix its track in on Deck B (keep A going)", check: (c) => c.d.audible.B && c.snap.mix.crossfader > 0.6 },
      {
        id: "yours",
        text: "Your turn: load a new song on A, match it to B and mix it in (crossfader back to A)",
        check: (c) => {
          const a = c.snap.decks.A;
          if (c.memo.first === undefined && a.track) c.memo.first = a.track.id;
          if (a.track && a.track.id !== c.memo.first) c.memo.changed = true;
          return !!c.memo.changed && c.hold("y", c.d.audible.A && c.snap.mix.crossfader < -0.6, 3);
        },
        hint: (c) => (!c.memo.changed ? "Load a different song on Deck A (Load button)." : "Match it to B, start it on a phrase, bring the crossfader to A."),
      },
    ],
  },
  {
    id: "gig-recovery",
    number: 6,
    category: "gig",
    level: 2,
    minutes: 3,
    events: [{ at: 14, kind: "stop-a" }],
    title: "Live mistake: dead air",
    tagline: "The music stops. Recover in seconds",
    briefing: {
      why: "Cables get kicked, tracks end, someone hits stop. What matters is how fast the music comes back.",
      realWorld: "Always have the next track ready. If the music dies, start the other deck at once, then fix the problem.",
      tips: ["Deck B is loaded and ready. Something will go wrong soon…"],
    },
    setup: { decks: { A: { trackId: "concrete-run", playing: true, startBar: 8, volume: 0.8 }, B: { trackId: "neon-drive", volume: 0.8, startBar: 0 } }, crossfader: -1 },
    weights: { smoothness: 3 },
    timeLimit: 60,
    objectives: [
      { id: "wait", text: "Keep the set going…", check: (c) => c.time > 14.2 },
      {
        id: "recover",
        text: "Dead air! Get music back on air within 5 seconds",
        check: (c) => {
          if (c.memo.t0 === undefined) c.memo.t0 = c.time;
          return c.d.audible.A || c.d.audible.B;
        },
        hint: () => "Start Deck B and move the crossfader to it, or restart Deck A.",
      },
      { id: "steady", text: "Keep it playing for 10 seconds", check: (c) => c.hold("s", c.d.audible.A || c.d.audible.B, 10) },
    ],
  },
  {
    id: "gig-library",
    number: 7,
    category: "gig",
    kind: "club",
    level: 2,
    minutes: 5,
    title: "Your own set",
    tagline: "Play three songs from the library",
    libraryFriendly: true,
    briefing: {
      why: "Real DJs play their own collection. Here you play songs from the Remixt library, analysed live for tempo, key and beat grid.",
      realWorld: "Preparing a set means knowing your tracks: their BPM, key and where the drops are. Set hot cues as you go.",
      tips: ["Open the browser's Library tab.", "Use 'Fits the other deck' to find the next song.", "Three library songs, 20 s each on air."],
    },
    setup: { tempoRange: 16, decks: {}, crossfader: 0 },
    weights: { crowd: 2, timing: 1, tempo: 1, eq: 1, key: 1, smoothness: 1 },
    timeLimit: 420,
    objectives: [songsObjective("songs", 3, 20, "Play three library songs, 20 s each on air", (d) => d.track?.source === "library")],
  },
  {
    id: "gig-festival",
    number: 8,
    category: "gig",
    kind: "club",
    level: 4,
    minutes: 4,
    title: "Festival quick mixes",
    tagline: "Five songs in three minutes",
    libraryFriendly: true,
    briefing: {
      why: "Festival sets are short and loud: quick mixes, big moments, no long blends.",
      realWorld: "Fast cuts on the crossfader, echo outs and hot-cue drops keep it moving.",
      tips: ["Five songs on air, 15 s each.", "The crossfader curve is set to cut.", "End with the floor above 60 %."],
    },
    setup: { tempoRange: 16, decks: { A: { trackId: "concrete-run", volume: 0.85, playing: true, startBar: 4 } }, crossfader: -1 },
    weights: { crowd: 3, smoothness: 1 },
    timeLimit: 180,
    objectives: [songsObjective("songs", 5, 15, "Five songs on air, 15 s each"), { id: "floor", text: "Floor above 60 %", check: (c) => !!c.crowd && c.crowd.energy >= 60 }],
  },
];

// ---------------------------------------------------------------- the rest

export type Level = { level: number; title: string; blurb: string };

export const LEVELS: Level[] = [
  { level: 1, title: "Booth basics", blurb: "Players, the mixer, cues and loops." },
  { level: 2, title: "Beatmatching", blurb: "Tempo, pitch, phase: by ear and by eye." },
  { level: 3, title: "Mixing", blurb: "Phrasing and EQ: real transitions." },
  { level: 4, title: "Harmonic & creative", blurb: "Keys, stems, rolls and scratching." },
  { level: 5, title: "Playing out", blurb: "Running the booth and your final checkride." },
];

/** Practice: the original missions plus the drills, placed in levels. */
export const MISSION_LEVEL: Record<string, number> = {
  preflight: 1,
  tempo: 2,
  phase: 2,
  "train-wreck": 2,
  "bass-swap": 3,
  "loop-roll": 4,
  harmonic: 4,
  acapella: 4,
  "club-night": 5,
};

export const ALL_SCENARIOS: Mission[] = [...MISSIONS, ...LESSONS, ...DRILLS, ...CHECKRIDES, ...GIGS];

export function scenarioById(id: string) {
  return ALL_SCENARIOS.find((m) => m.id === id);
}

/** The curriculum level of anything (missions included). */
export function levelOf(m: Mission) {
  return m.level ?? MISSION_LEVEL[m.id] ?? 1;
}

/** Items of a level in the order they're meant to be done. */
export function levelItems(level: number) {
  const of = (list: Mission[]) => list.filter((m) => levelOf(m) === level);
  return { lessons: of(LESSONS), practice: [...of(DRILLS), ...of(MISSIONS)], test: CHECKRIDES.find((t) => t.level === level) ?? null };
}

/** A level is open when it's the first or the previous checkride has been passed. */
export function levelUnlocked(level: number, passed: (testId: string) => boolean) {
  if (level <= 1) return true;
  const prev = CHECKRIDES.find((t) => t.level === level - 1);
  return !prev || passed(prev.id);
}

/** Energy of the crowd-facing deck: used by the AI DJ to pick a follow-up. */
export function deckEnergy(snap: DjSnapshot, id: DeckId) {
  const d = snap.decks[id];
  return d.track ? energyAt(d.track, d.position) : 0;
}

/** The quiz for an attempt, with the seed resolved. */
export function quizFor(m: Mission, seed: number) {
  if (!m.quiz) return [];
  return typeof m.quiz === "function" ? m.quiz(seed) : m.quiz;
}

/** Quiz pass mark for checkrides. */
export const QUIZ_PASS = 0.8;
