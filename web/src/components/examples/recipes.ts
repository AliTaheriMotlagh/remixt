import type { PairSettings } from "@/lib/client/examplesMatch";

export type Recipe = {
  id: string;
  title: string;
  why: string;
  tag: string;
  settings: PairSettings;
};

/** Ready-made vocal + beat pairings, each teaching one idea. */
export const RECIPES: Recipe[] = [
  {
    id: "hiphop-over-house",
    title: "Hip-hop vocal over a house beat: slow the beat down to 92?",
    tag: "Who moves?",
    why: "The vocal is 92 BPM, the house beat 124. Here the vocal keeps its tempo and the beat is stretched 26% slower: try it, then compare with 'Beat keeps tempo'. Moving the song that has the least to lose (usually the vocal) keeps the groove intact.",
    settings: { vocalId: "midnight-static", beatId: "warehouse-lights", mode: "vocal", semitones: "auto" },
  },
  {
    id: "pitch-up-3",
    title: "Pitch a vocal up 3 semitones to fix a clash",
    tag: "Key fix",
    why: "A minor against C minor shares only a few notes, but A minor sits exactly 3 semitones below C minor. Shifting the vocal up 3 puts every note in the beat's key; the two songs meet in the middle on tempo. Hear Raw first, then Matched.",
    settings: { vocalId: "midnight-static", beatId: "warehouse-lights", mode: "middle", semitones: 3 },
  },
  {
    id: "relative",
    title: "Relative minor and major: no shifting at all",
    tag: "Relative keys",
    why: "Golden Hour is E-flat major (5B) and Warehouse Lights is C minor (5A). They are relatives, with exactly the same seven notes. Add a 4% tempo nudge and the pop vocal sits perfectly on the house beat.",
    settings: { vocalId: "golden-hour", beatId: "warehouse-lights", mode: "beat", semitones: "auto" },
  },
  {
    id: "half-time",
    title: "The half-time trick: a slow vocal over a fast trap beat",
    tag: "Half-time",
    why: "92 BPM against 140 looks hopeless as numbers, but a trap beat is felt in half time (70). The card reads the vocal as double-time to find the cheapest match, and meeting in the middle puts the vocal at about 80 BPM over a beat nudged to 160: a roomy, laid-back vocal on busy hats.",
    settings: { vocalId: "midnight-static", beatId: "concrete-run", mode: "middle", semitones: "auto" },
  },
  {
    id: "neighbours",
    title: "Neighbouring keys: a fifth apart still blends",
    tag: "Camelot",
    why: "Island Time is G major (9B); Midnight Static is A minor (8A), which uses the notes of C major, a fifth below G. Six of seven notes are shared, so no shift is needed. DJs call this a harmonic mix.",
    settings: { vocalId: "island-time", beatId: "midnight-static", mode: "middle", semitones: "auto" },
  },
  {
    id: "tempo-only-fails",
    title: "Tempo matched, key ignored: why BPM isn't enough",
    tag: "Clash",
    why: "Forcing 0 semitones lines Neon Drive's vocal (D minor, 7A) up with Warehouse Lights (C minor, 5A) on the grid, yet it still grates: the keys are two steps apart. Switch the pitch to Auto: it finds -2 semitones, which puts the vocal exactly in the beat's key.",
    settings: { vocalId: "neon-drive", beatId: "warehouse-lights", mode: "beat", semitones: 0 },
  },
];

export const PRESET_PAIRS: { label: string; hint: string; settings: PairSettings }[] = [
  {
    label: "Great pair",
    hint: "Relative keys, nearly the same tempo",
    settings: { vocalId: "golden-hour", beatId: "warehouse-lights", mode: "beat", semitones: "auto" },
  },
  {
    label: "Needs a fix",
    hint: "Needs a pitch shift and a big tempo change",
    settings: { vocalId: "midnight-static", beatId: "warehouse-lights", mode: "middle", semitones: "auto" },
  },
  {
    label: "Bad pair",
    hint: "Far apart in tempo and in key",
    settings: { vocalId: "concrete-run", beatId: "island-time", mode: "beat", semitones: 0 },
  },
];
