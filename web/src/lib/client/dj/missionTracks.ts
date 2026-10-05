// Missions with your own music: which songs from the library suit each
// mission (a tempo gap to close, keys that blend, a track long enough to
// start a few bars in), and the mission's starting setup rewritten for the
// songs chosen. Library songs may not have a known tempo or key until
// they've been analysed, so the picker ranks pairs by what it knows; the
// caller analyses the top pair, checks it for real with `pickFits`, and
// tries the next (or falls back to the demo songs). Pure.

import { DEFAULT_TEMPO_RANGE, type DeckId, type TrackInfo } from "./djTypes";
import { clamp, rateToMatch } from "./djMath";
import { keyCompatible, tempoGap } from "./djLibrary";
import type { MusicalKey } from "../musicKey";
import type { DeckSetup, Mission, MissionSetup } from "./scenarios";

export type PickCandidate = {
  id: string;
  title: string;
  bpm: number | null;
  key: MusicalKey | null;
  duration: number | null;
};

export type MissionNeeds = {
  /** Decks the mission loads. */
  decks: DeckId[];
  /** The tempo gap between A and B (fraction, half/double time read as equal) must be within this. */
  tempoGap?: { min: number; max: number };
  /** Keys must blend: "required" (must be known to fit) or "preferred" (a tie-breaker). */
  key?: "required" | "preferred";
  /**
   * Single-deck missions where the learner picks the partner (mix in key):
   * the library must hold a second song that fits, so the mission can be done with it.
   */
  partner?: boolean;
  /** Deck B's tempo fader starts matched to A (only its phase or EQ is the exercise). */
  matchB?: boolean;
  /** Seconds of music the mission needs from its start position. */
  minDuration: number;
  /** In one sentence, why these songs. */
  why: string;
};

const MATCH_GAP = (DEFAULT_TEMPO_RANGE / 100) * 0.9;

export const MISSION_NEEDS: Record<string, MissionNeeds> = {
  preflight: { decks: ["A", "B"], minDuration: 60, why: "Any two songs will do for learning the controls." },
  tempo: {
    decks: ["A", "B"],
    tempoGap: { min: 0.025, max: 0.14 },
    key: "preferred",
    minDuration: 90,
    why: "Two songs a few BPM apart, so there's a tempo gap to close with the fader.",
  },
  phase: {
    decks: ["A", "B"],
    tempoGap: { min: 0, max: MATCH_GAP },
    key: "preferred",
    matchB: true,
    minDuration: 90,
    why: "Two songs close enough in tempo to be matched with the fader; their beats start apart.",
  },
  "bass-swap": {
    decks: ["A", "B"],
    tempoGap: { min: 0, max: MATCH_GAP },
    key: "preferred",
    matchB: true,
    minDuration: 90,
    why: "Two songs that can be beat-matched, ideally in keys that blend, for a clean low-end swap.",
  },
  harmonic: {
    decks: ["A"],
    tempoGap: { min: 0, max: 0.14 },
    key: "required",
    partner: true,
    minDuration: 90,
    why: "A song on Deck A and, somewhere in your library, at least one song in a key that blends with it.",
  },
  acapella: {
    decks: ["A", "B"],
    tempoGap: { min: 0, max: 0.08 },
    key: "required",
    matchB: true,
    minDuration: 90,
    why: "Two songs in compatible keys and close tempos, so one's vocal sits on the other's beat.",
  },
  "train-wreck": {
    decks: ["A", "B"],
    tempoGap: { min: 0, max: MATCH_GAP },
    key: "preferred",
    matchB: true,
    minDuration: 90,
    why: "Two beat-matchable songs, knocked out of phase on purpose.",
  },
  "loop-roll": { decks: ["A"], minDuration: 60, why: "Any song with a groove to loop." },
  "club-night": { decks: ["A"], minDuration: 60, why: "Your opener; you choose the rest of the set from the library as you go." },
};

export type MissionPick = {
  A: string;
  B?: string;
  /** For `partner` missions: the song that proves the mission can be done (not loaded). */
  partner?: string;
  /** True when every constraint was checked against known tempo and key. */
  certain: boolean;
};

type Verdict = "yes" | "maybe" | "no";

function tempoVerdict(needs: MissionNeeds, a: PickCandidate, b: PickCandidate): Verdict {
  if (!needs.tempoGap) return "yes";
  if (a.bpm === null || b.bpm === null) return "maybe";
  const g = tempoGap(b.bpm, a.bpm);
  return g >= needs.tempoGap.min - 1e-9 && g <= needs.tempoGap.max + 1e-9 ? "yes" : "no";
}

function keyVerdict(needs: MissionNeeds, a: PickCandidate, b: PickCandidate): Verdict {
  if (!needs.key) return "yes";
  const fit = keyCompatible(a.key, b.key);
  if (fit === null) return "maybe";
  if (fit) return "yes";
  return needs.key === "required" ? "no" : "maybe";
}

function longEnough(needs: MissionNeeds, c: PickCandidate) {
  return c.duration === null || c.duration >= needs.minDuration + 30;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Candidate songs for a mission, best first. Pairs that are known to break
 * a requirement are left out; known-good beats unknown. `seed` varies the
 * order among equals, so a retry can bring different songs. An empty list
 * means the library can't host this mission.
 */
export function rankMissionPicks(missionId: string, pool: PickCandidate[], seed = 1, limit = 12): MissionPick[] {
  const needs = MISSION_NEEDS[missionId];
  if (!needs) return [];
  const rng = mulberry(seed);
  const usable = pool.filter((c) => longEnough(needs, c));
  const jitter = new Map(usable.map((c) => [c.id, rng()]));
  const paired = needs.decks.length > 1 || needs.partner;
  if (!paired) {
    return usable
      .map((c) => ({ c, s: (c.bpm !== null ? 1 : 0) + jitter.get(c.id)! }))
      .sort((x, y) => y.s - x.s)
      .slice(0, limit)
      .map(({ c }) => ({ A: c.id, certain: true }));
  }
  const out: { pick: MissionPick; s: number }[] = [];
  for (const a of usable) {
    for (const b of usable) {
      if (a.id === b.id) continue;
      const tv = tempoVerdict(needs, a, b);
      const kv = keyVerdict(needs, a, b);
      if (tv === "no" || kv === "no") continue;
      let s = (tv === "yes" ? 4 : 0) + (kv === "yes" ? (needs.key === "required" ? 4 : 2) : 0);
      // The tempo mission is best with a gap in the middle of its range.
      if (needs.tempoGap && a.bpm !== null && b.bpm !== null && needs.tempoGap.min > 0) {
        const g = tempoGap(b.bpm, a.bpm);
        s += 1 - Math.abs(g - (needs.tempoGap.min + needs.tempoGap.max) / 2) / needs.tempoGap.max;
      }
      s += (jitter.get(a.id)! + jitter.get(b.id)!) * 0.5;
      const certain = tv === "yes" && (kv === "yes" || (needs.key === "preferred" && a.key !== null && b.key !== null) || !needs.key);
      out.push({ pick: needs.partner ? { A: a.id, partner: b.id, certain } : { A: a.id, B: b.id, certain }, s });
    }
  }
  return out
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((o) => o.pick);
}

/** Checks a pick against the analysed tempo and key: every requirement must be known to hold. */
export function pickFits(missionId: string, a: PickCandidate, b?: PickCandidate): boolean {
  const needs = MISSION_NEEDS[missionId];
  if (!needs) return false;
  if (!longEnough(needs, a)) return false;
  if (!b) return needs.decks.length === 1 && !needs.partner;
  if (!longEnough(needs, b) && !needs.partner) return false;
  if (needs.tempoGap && tempoVerdict(needs, a, b) !== "yes") return false;
  if (needs.key === "required" && keyVerdict(needs, a, b) !== "yes") return false;
  return true;
}

/**
 * The mission's setup with library tracks in place of the demo songs:
 * same decks, faders and phase offset, Deck B's tempo matched to A where
 * the original had it matched, start bars pulled in if a song is short.
 */
export function adaptSetup(mission: Mission, tracks: Partial<Record<DeckId, TrackInfo>>): MissionSetup {
  const needs = MISSION_NEEDS[mission.id];
  const setup = mission.setup;
  const range = setup.tempoRange ?? DEFAULT_TEMPO_RANGE;
  const decks: Partial<Record<DeckId, DeckSetup>> = {};
  for (const id of ["A", "B"] as DeckId[]) {
    const orig = setup.decks[id];
    const t = tracks[id];
    if (!orig) continue;
    if (!t) {
      decks[id] = orig;
      continue;
    }
    const barSec = 240 / t.bpm;
    let startBar = orig.startBar ?? 0;
    const room = needs?.minDuration ?? 60;
    while (startBar > 0 && t.firstBeat + startBar * barSec + room > t.duration) startBar = Math.max(0, startBar - 4);
    let tempoPct = 0;
    const a = tracks.A;
    if (id === "B" && needs?.matchB && a) tempoPct = clamp((rateToMatch(t.bpm, a.bpm) - 1) * 100, -range, range);
    decks[id] = { ...orig, trackId: t.id, startBar, tempoPct };
  }
  return { ...setup, decks };
}

/** A line for the briefing about the songs a library mission uses. */
export function describePick(tracks: Partial<Record<DeckId, TrackInfo>>, partner?: TrackInfo | null) {
  const parts: string[] = [];
  for (const id of ["A", "B"] as DeckId[]) {
    const t = tracks[id];
    if (t) parts.push(`Deck ${id}: ${t.title} by ${t.artist} (${t.bpm.toFixed(1)} BPM, ${t.camelot})`);
  }
  if (partner) parts.push(`A song that fits: ${partner.title} (${partner.bpm.toFixed(1)} BPM, ${partner.camelot}). Find it in the library tab.`);
  return parts;
}
