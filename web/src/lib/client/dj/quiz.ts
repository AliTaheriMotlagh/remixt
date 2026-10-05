// Theory questions for the checkrides and the Camelot quiz drill. The
// Camelot questions are generated from a seed, so every attempt differs.
// Pure.

import { ALL_KEYS, camelotCode, keyLabel } from "../musicKey";
import type { QuizQuestion } from "./scenarios";

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], r: () => number) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A question with its options shuffled (the answer index follows). */
export function shuffled(q: QuizQuestion, r: () => number): QuizQuestion {
  const order = shuffle(q.options.map((_, i) => i), r);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

const wrap = (n: number) => ((n + 11) % 12) + 1;

function parseCode(code: string) {
  return { n: Number.parseInt(code, 10), l: code.endsWith("B") ? "B" : "A" };
}

/** `count` Camelot questions: which code blends, what a key's code is, which code clashes. */
export function camelotQuestions(seed: number, count = 6): QuizQuestion[] {
  const r = rng(seed);
  const out: QuizQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const n = 1 + Math.floor(r() * 12);
    const l = r() < 0.5 ? "A" : "B";
    const code = `${n}${l}`;
    const kind = i % 3;
    if (kind === 0) {
      const good = [`${wrap(n + 1)}${l}`, `${wrap(n - 1)}${l}`, `${n}${l === "A" ? "B" : "A"}`][Math.floor(r() * 3)];
      const bad = shuffle([`${wrap(n + 3)}${l}`, `${wrap(n + 5)}${l === "A" ? "B" : "A"}`, `${wrap(n - 4)}${l}`, `${wrap(n + 6)}${l}`], r).slice(0, 3);
      out.push(
        shuffled(
          {
            q: `Deck A is playing a track in ${code}. Which of these will blend smoothly?`,
            options: [good, ...bad],
            answer: 0,
            explain: `Same number, one step either way (${wrap(n - 1)}${l}, ${wrap(n + 1)}${l}), or the same number with the other letter (${n}${l === "A" ? "B" : "A"}) share most of their notes.`,
            wheel: true,
          },
          r
        )
      );
    } else if (kind === 1) {
      const key = ALL_KEYS[Math.floor(r() * ALL_KEYS.length)];
      const right = camelotCode(key);
      const { n: rn, l: rl } = parseCode(right);
      const wrong = shuffle([`${wrap(rn + 2)}${rl}`, `${rn}${rl === "A" ? "B" : "A"}`, `${wrap(rn - 3)}${rl}`, `${wrap(rn + 5)}${rl === "A" ? "B" : "A"}`], r).slice(0, 3);
      out.push(
        shuffled(
          {
            q: `What's the Camelot code for ${keyLabel(key)}?`,
            options: [right, ...wrong],
            answer: 0,
            explain: `${keyLabel(key)} is ${right}. Minor keys are the A ring, major keys the B ring; 8A is A minor and 8B is C major.`,
            wheel: true,
          },
          r
        )
      );
    } else {
      const clash = `${wrap(n + 6)}${l}`;
      const ok = shuffle([`${n}${l}`, `${wrap(n + 1)}${l}`, `${wrap(n - 1)}${l}`, `${n}${l === "A" ? "B" : "A"}`], r).slice(0, 3);
      out.push(
        shuffled(
          {
            q: `Which next track would clash with ${code}?`,
            options: [clash, ...ok],
            answer: 0,
            explain: `${clash} is on the opposite side of the wheel: almost no notes in common. Keep blends between distant keys short, or use an effect to cover the change.`,
            wheel: true,
          },
          r
        )
      );
    }
  }
  return out;
}

export const QUIZ_BASICS: QuizQuestion[] = [
  {
    q: "The track is playing. What does tapping CUE do on a club player?",
    options: ["Jumps back to the cue point and stops", "Sets a new cue point and keeps playing", "Pauses where it is", "Syncs to the other deck"],
    answer: 0,
    explain: "While playing, CUE returns to the cue point and stops. While stopped, holding CUE previews from it.",
  },
  {
    q: "What is PFL (the headphone CUE button on the mixer) for?",
    options: ["Hearing a channel in your headphones before the crowd hears it", "Making a channel louder", "Starting the track", "Recording the mix"],
    answer: 0,
    explain: "Pre-fader listen sends the channel to your headphones whatever its fader says, so you can prepare the next track silently.",
  },
  {
    q: "A channel's meter keeps hitting the red. What do you turn down first?",
    options: ["The channel's trim (gain)", "The master", "The crossfader", "The high EQ"],
    answer: 0,
    explain: "Set each channel's level with its trim so the meters sit just under the red; then the faders and the master have room.",
  },
  {
    q: "How many beats are in one bar of most dance music?",
    options: ["4", "3", "8", "16"],
    answer: 0,
    explain: "Four beats to the bar, and phrases of 8 or 16 bars (32 or 64 beats).",
  },
  {
    q: "A 4-beat loop on a track at 120 BPM lasts how long?",
    options: ["2 seconds", "4 seconds", "1 second", "0.5 seconds"],
    answer: 0,
    explain: "120 BPM is two beats a second, so four beats take two seconds.",
  },
];

export const QUIZ_BEATMATCH: QuizQuestion[] = [
  {
    q: "Deck A is at 124 BPM. Deck B's track is 128 BPM. Roughly what tempo setting matches B to A?",
    options: ["−3.1 %", "+3.1 %", "−4 %", "+4 %"],
    answer: 0,
    explain: "124 ÷ 128 = 0.969, so B must slow down by about 3.1 %.",
  },
  {
    q: "The tempos match, but you hear a 'flam' (two kicks close together). What's wrong?",
    options: ["The beats are out of phase: nudge one deck", "The keys clash", "The tempo is still off", "The EQ is wrong"],
    answer: 0,
    explain: "Matching tempo keeps the decks running together; the phase is whether the kicks land at the same moment. Nudge with the jog wheel.",
  },
  {
    q: "Without key lock, speeding a track up by 6 % does what to its pitch?",
    options: ["Raises it by about a semitone", "Nothing", "Lowers it", "Raises it an octave"],
    answer: 0,
    explain: "Speed and pitch go together on vinyl: +6 % is about +1 semitone. Key lock (master tempo) keeps the pitch while the tempo changes.",
  },
  {
    q: "Deck B's kicks keep drifting ahead of A's. Which way do you move B's tempo fader?",
    options: ["Slower (towards −)", "Faster (towards +)", "Leave it, just nudge forever", "Change the range"],
    answer: 0,
    explain: "Drifting ahead means B is slightly fast. Nudging fixes the phase once; the fader fixes the drift.",
  },
  {
    q: "A 70 BPM hip-hop track and a 140 BPM drum & bass track:",
    options: ["Can be mixed: 70 is half of 140", "Can never be mixed", "Need key lock to mix", "Need a 100 % tempo change"],
    answer: 0,
    explain: "Half and double time line up: every beat of the 70 BPM track lands on every other beat of the 140.",
  },
];

export const QUIZ_MIXING: QuizQuestion[] = [
  {
    q: "Why do most DJs cut the incoming track's low EQ when blending?",
    options: ["Two kicks and basses at once sound muddy and overload the system", "To make it quieter", "Because the crowd can't hear bass", "To change its key"],
    answer: 0,
    explain: "Only one bass line at a time: blend with the new track's low cut, then swap the lows on a bar line.",
  },
  {
    q: "When should a new track's first beat usually come in?",
    options: ["On bar 1 of a phrase of the playing track", "Anywhere, as long as it's in time", "On the last beat of a bar", "When the playing track stops"],
    answer: 0,
    explain: "Songs move in 8- or 16-bar phrases. Starting the next track on a phrase line makes the change land where the crowd expects one.",
  },
  {
    q: "What does an isolator EQ do at the bottom of its knob?",
    options: ["Removes that band completely", "Lowers it by 3 dB", "Boosts the other bands", "Adds distortion"],
    answer: 0,
    explain: "Club mixers' isolators can cut a band to silence: that's what makes bass swaps and 'drop the bass' moves possible.",
  },
  {
    q: "The crowd's energy is dropping in the middle of a long blend. Best move?",
    options: ["Finish the transition and let the new track play", "Add the air horn", "Turn the master up", "Stop both decks"],
    answer: 0,
    explain: "Long blends need a reason. If it isn't working, complete the mix.",
  },
  {
    q: "Your channel faders are up but nothing is heard. The crossfader is fully left on deck B's channel. Why?",
    options: ["The crossfader cuts B on the left", "B's key lock is on", "Quantize is on", "The tempo range is too small"],
    answer: 0,
    explain: "Check the whole chain: track playing → trim → EQ → channel fader → crossfader → master.",
  },
];

export const QUIZ_CREATIVE: QuizQuestion[] = [
  {
    q: "For an acapella-over-instrumental mashup, what must match?",
    options: ["Tempo and (closely) key", "Only the genre", "Only the length", "Nothing: stems fix it"],
    answer: 0,
    explain: "The voice sits on the beat only if they're in time, and sounds right only if the keys blend.",
  },
  {
    q: "What does slip mode do?",
    options: ["Loops, scratches and held hot cues leave the track running underneath; letting go rejoins it", "Slows the deck down", "Makes the loop longer", "Syncs the decks"],
    answer: 0,
    explain: "In slip mode the track keeps its place silently, so a roll or scratch doesn't knock you off the phrase.",
  },
  {
    q: "A loop roll is:",
    options: ["A short loop while the pad is held, then back to where the track would be", "A reverse effect", "A type of EQ", "A tempo change"],
    answer: 0,
    explain: "Rolls are slip loops: a stutter for build-ups that doesn't lose your place.",
  },
  {
    q: "Quantize being on means:",
    options: ["Cues, loops and jumps snap to the beat grid", "The tempo is locked", "The key is locked", "Effects are synced"],
    answer: 0,
    explain: "Quantize makes cue, loop and hot cue presses land on the grid even if your timing is a little off.",
  },
  {
    q: "Two tracks are 5A and 6A. Mixing them is:",
    options: ["Harmonic: a neighbour on the wheel", "A clash", "Only possible with key lock off", "Impossible"],
    answer: 0,
    explain: "One step round the wheel shares six of seven notes.",
  },
];

export const QUIZ_GIGS: QuizQuestion[] = [
  {
    q: "You're the warm-up DJ. The headliner is on in an hour. You should:",
    options: ["Keep the energy and tempo moderate and leave room for the headliner", "Play your biggest tracks", "Play as loud as possible", "Use every effect"],
    answer: 0,
    explain: "Warm-up is about building a mood, not peaking early.",
  },
  {
    q: "The music stops by accident. First thing to do?",
    options: ["Get something playing immediately: the other deck, a loop", "Apologise on the mic", "Restart the laptop", "Wait for the crowd to notice"],
    answer: 0,
    explain: "Dead air is the worst mistake; recover fast and fix the cause afterwards.",
  },
  {
    q: "At a wedding the host wants to announce the first dance. You:",
    options: ["Use talkover to duck the music, hand over the mic, then bring the music back", "Stop the music dead", "Keep the music loud", "Turn the crowd's request down"],
    answer: 0,
    explain: "Talkover lowers the music smoothly so speech is clear, then returns it.",
  },
  {
    q: "Recording a radio mix, which matters most?",
    options: ["No dead air, no clipping, clean intros and outros", "As many effects as possible", "Long silences between tracks", "Loudness above 0 dB"],
    answer: 0,
    explain: "Broadcast mixes need clean levels and seamless flow.",
  },
  {
    q: "Playing back-to-back with another DJ, your track should:",
    options: ["Follow on from theirs: similar tempo and a compatible key", "Be completely different to stand out", "Start before they finish their blend", "Always be faster"],
    answer: 0,
    explain: "B2B is a conversation: respond to what the other DJ played.",
  },
];
