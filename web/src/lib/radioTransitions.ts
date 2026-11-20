// How the radio goes from one song to the next — the styles a station's
// owner (or an admin, for Remixt Radio) chooses in its console. Pure: the
// server schedules with it (how long each change is, on the outgoing song's
// bar lines), the player renders it (lib/client/radioTransition.ts), the
// console explains it, and the tests hold it.
//
// Every style but "blend" is rendered offline into the start of the
// incoming song's file — the outgoing song's tail and the incoming song's
// head, processed and mixed together as a DJ would — so it sounds the same
// on every device, with the screen locked too (no live Web Audio, which
// phones stop in the background). The player then simply hands over at the
// change.

import { crossfadeFor } from "./radioPick";

export const TRANSITIONS = ["auto", "automix", "blend", "bassSwap", "filter", "echo", "rise", "tapeStop"] as const;
export type TransitionChoice = (typeof TRANSITIONS)[number];
/** What actually plays ("auto" picks one of these per pair of songs). */
export type TransitionStyle = Exclude<TransitionChoice, "auto">;

export const TRANSITION_TEXT: Record<TransitionChoice, { en: string; help: string }> = {
  auto: {
    en: "Auto — the best for each pair",
    help: "Songs whose tempos are within reach get AutoMix; far-apart ones an echo out, a filter sweep or a riser, taking turns so it never gets samey.",
  },
  automix: {
    en: "AutoMix",
    help: "Like Apple Music's AutoMix: over a long phrase the outgoing song's tempo glides to the new one's so their beats lock together, and the two blend by frequency — the new song's bass comes in as the old one's leaves. Sounds like one continuous DJ mix.",
  },
  blend: { en: "Smooth blend", help: "An equal-power crossfade, on the beat when the tempos agree. The gentlest." },
  bassSwap: { en: "Bass swap", help: "Both songs play together with only one bass at a time: the new song's low end comes in exactly halfway. What club DJs do." },
  filter: { en: "Filter sweep", help: "The outgoing song thins out to its highs while the new one opens up from a muffled low." },
  echo: { en: "Echo out", help: "The outgoing song's last beat repeats into the distance as the new one lands on the downbeat." },
  rise: { en: "Riser & drop", help: "A noise sweep builds over the outgoing song, a beat of silence, then the new song drops in full." },
  tapeStop: { en: "Tape stop", help: "The outgoing song slows down to a halt like a turntable powered off, then the new one starts." },
};

const BAR_FALLBACK = 2; // seconds, ~120 BPM, when the tempo isn't known

/** A song's bar in seconds (4 beats), from its tempo. */
export function barOf(bpm: number | null | undefined): number {
  return bpm && bpm > 0 ? 240 / bpm : BAR_FALLBACK;
}

/** Tempos within `within` (6% by default; half and double time count). */
export function tempoMatch(a: number | null | undefined, b: number | null | undefined, within = 0.06): boolean {
  return glideRatio(a, b, within) !== null;
}

/**
 * How fast the outgoing song must end up playing for its beats to land on
 * the incoming song's (incoming tempo ÷ outgoing, taking half or double time
 * when closer); null when they're further apart than `within`, or unknown.
 * 8% at most: the glide changes speed (so pitch, by under a semitone),
 * spread over half of a 16-bar phrase where it isn't heard as a bend.
 */
export function glideRatio(outBpm: number | null | undefined, inBpm: number | null | undefined, within = 0.08): number | null {
  if (!(outBpm && outBpm > 0 && inBpm && inBpm > 0)) return null;
  const ratio = [1, 2, 0.5].map((m) => (inBpm * m) / outBpm).sort((x, y) => Math.abs(Math.log(x)) - Math.abs(Math.log(y)))[0];
  return Math.abs(ratio - 1) <= within ? ratio : null;
}

/** "auto" made concrete for a pair; `turn` (the incoming row's id) takes turns among the far-tempo styles. */
export function resolveStyle(choice: TransitionChoice, outBpm: number | null | undefined, inBpm: number | null | undefined, turn = 0): TransitionStyle {
  if (choice !== "auto") return choice;
  if (glideRatio(outBpm, inBpm) !== null) return "automix";
  if (!(outBpm && outBpm > 0)) return "blend";
  return (["echo", "filter", "rise"] as const)[Math.abs(Math.round(turn)) % 3];
}

/**
 * How long the change is (seconds, the overlap of the two songs), on the
 * outgoing song's bar lines and never more than a third of either song:
 * blend as before (radioPick.crossfadeFor); bass swap 8 bars (4 when slow);
 * filter 4 bars; echo out 2; riser 4; tape stop 1.
 */
export function transitionSeconds(style: TransitionStyle, out: { bpm?: number | null; duration: number }, next: { bpm?: number | null; duration: number }): number {
  if (style === "blend") return crossfadeFor(out, next).seconds;
  const bar = barOf(out.bpm);
  const cap = Math.max(1.5, Math.min(out.duration / 3, next.duration / 3, 20));
  // AutoMix takes a long phrase (16 bars, 8 when slow) so the tempo glide is never heard as one.
  const want = { automix: bar * 16 <= 20 ? 16 : 8, bassSwap: bar * 8 <= 20 ? 8 : 4, filter: 4, echo: 2, rise: 4, tapeStop: 1 }[style];
  const bars = Math.max(1, Math.min(want, Math.floor(cap / bar + 1e-6)));
  return Math.min(cap, bars * bar);
}

/** Whether the player hands over at the start (the change is in the new song's file) rather than crossfading two files. */
export function isRendered(style: TransitionStyle | null | undefined): boolean {
  return !!style && style !== "blend";
}

/**
 * The gain curves a rendered style uses, at `p` (0 → 1 through the change):
 * `out` for the outgoing song, `in` for the incoming. Pure numbers, so the
 * renderer and the tests agree on what each style does to loudness.
 */
export function styleGains(style: TransitionStyle, p: number): { out: number; in: number } {
  const x = Math.max(0, Math.min(1, p));
  const eqOut = Math.cos((x * Math.PI) / 2);
  const eqIn = Math.sin((x * Math.PI) / 2);
  switch (style) {
    case "blend":
    case "bassSwap":
      return { out: eqOut, in: eqIn };
    case "automix": {
      // The old song carries the first quarter, the new one the last; equal power over the middle half. Continuous throughout.
      const half = Math.PI / 4;
      if (x < 0.25) return { out: 1, in: Math.sin((x / 0.25) * half) };
      if (x > 0.75) return { out: Math.cos(((x - 0.75) / 0.25) * (Math.PI / 2)) * Math.cos(half), in: 1 };
      const m = (x - 0.25) / 0.5;
      return { out: Math.cos(m * half), in: Math.sin(m * half + half) };
    }
    case "filter":
      // Both full for most of it (the filters do the work), the outgoing gone by the end.
      return { out: x < 0.7 ? 1 : Math.cos(((x - 0.7) / 0.3) * (Math.PI / 2)), in: x < 0.3 ? Math.sin((x / 0.3) * (Math.PI / 2)) : 1 };
    case "echo":
      // The dry outgoing stops at half (its echoes carry on, rendered separately); the new song lands at half.
      return { out: x < 0.5 ? 1 : 0, in: x < 0.5 ? 0 : 1 };
    case "rise":
      // Outgoing on until the last eighth (the silent beat before the drop); the new song is under it, muffled, then full.
      return { out: x < 0.875 ? 1 : 0, in: x < 0.875 ? 0.35 : x < 1 ? 0 : 1 };
    case "tapeStop":
      return { out: x < 0.85 ? 1 : 0, in: x < 0.85 ? 0 : 1 };
  }
}
