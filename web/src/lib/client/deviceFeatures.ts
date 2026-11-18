// What each heavy feature does on this kind of device — said once, here,
// so every screen says the same thing (DeviceNotice shows it). Labels come
// from measurements (scripts/phone-measure.mjs and the notes in PLAN.md,
// phase 3): an emulated phone with its CPU slowed 4×, plus what the code
// does on phones (no neural beat model, renders in pieces, no splitting).
//
//   works    — fine here; nothing is shown
//   slow     — works, but takes a while or leans on a helper computer
//   computer — needs a computer; the phone would run out of memory

import type { DeviceClass } from "./device";

export type Support = "works" | "slow" | "computer";

export type FeatureId = "split" | "laneSplit" | "aiProducer" | "mashup" | "newSong" | "proMix" | "master" | "lyricsTiming" | "clipExport" | "export";

type Entry = {
  /** What it's called on screen. */
  name: string;
  phone: Support;
  tablet: Support;
  /** Many songs at once (mashups, a new song from everything) weigh more: from this many on, one step heavier on phones. */
  heavyFrom?: number;
  /** What happens on a phone or tablet when it's slow or computer-only, in plain words. */
  slow?: string;
  computer?: string;
};

/**
 * Measured 2026-11-18, two songs (≈4 min each), Chrome as an Android phone
 * with its CPU slowed 4×: adding the songs 6 s, first sound 4 s, the AI
 * producer hearing both songs 4.4 s (a computer takes ~47 s — it runs the
 * neural beat model, which phones skip), Make it sound good + Pro mix 2 s,
 * a WAV export 13 s; the page peaked at about 650 MB.
 */
export const FEATURES: Record<FeatureId, Entry> = {
  split: {
    name: "Splitting a song",
    phone: "slow",
    tablet: "slow",
    slow: "Splitting a song into vocals and beat needs more memory than a phone gives a page, so a computer helping Remixt splits it for you — usually within minutes, longer when none is helping.",
  },
  laneSplit: {
    name: "Splitting a lane",
    phone: "computer",
    tablet: "computer",
    computer: "Splitting a lane runs the model on this device, and a phone or tablet would run out of memory and reload the page.",
  },
  aiProducer: { name: "The AI producer", phone: "works", tablet: "works" },
  mashup: {
    name: "Mashups",
    phone: "works",
    tablet: "works",
    heavyFrom: 3,
    slow: "Three or more songs at once is a lot for a phone: hearing them takes longer, and an older phone may reload the page.",
  },
  newSong: {
    name: "A new song from everything",
    phone: "slow",
    tablet: "works",
    heavyFrom: 4,
    slow: "Building a new song from several songs takes a while on a phone, and with many songs an older phone may reload the page.",
    computer: "Four or more songs at once is more than a phone can hold — build it on a computer.",
  },
  proMix: { name: "Pro mix", phone: "works", tablet: "works" },
  master: { name: "Master to target", phone: "works", tablet: "works" },
  lyricsTiming: { name: "Timing lyrics", phone: "works", tablet: "works" },
  clipExport: { name: "Clip export", phone: "works", tablet: "works" },
  export: { name: "Export", phone: "works", tablet: "works" },
};

const STEP: Support[] = ["works", "slow", "computer"];

/** How `feature` does on `device`; `songs`, how many songs it works on, when that matters. */
export function supportFor(feature: FeatureId, device: Pick<DeviceClass, "kind">, songs = 0): Support {
  const entry = FEATURES[feature];
  if (device.kind === "computer") return "works";
  let level = entry[device.kind];
  if (entry.heavyFrom && songs >= entry.heavyFrom && device.kind === "phone") level = STEP[Math.min(2, STEP.indexOf(level) + 1)];
  return level;
}

/** What to tell the person, or null when it just works. */
export function featureNotice(feature: FeatureId, device: Pick<DeviceClass, "kind">, songs = 0): { level: Exclude<Support, "works">; title: string; text: string } | null {
  const level = supportFor(feature, device, songs);
  if (level === "works") return null;
  const entry = FEATURES[feature];
  const where = device.kind === "tablet" ? "tablets" : "phones";
  return level === "slow"
    ? { level, title: `${entry.name} is slow on ${where}`, text: entry.slow ?? `${entry.name} takes a while on a ${device.kind}.` }
    : { level, title: `${entry.name} needs a computer`, text: entry.computer ?? entry.slow ?? `${entry.name} needs more than a ${device.kind} can give.` };
}
