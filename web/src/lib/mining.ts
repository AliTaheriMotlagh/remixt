// Mining: splitting songs for people on phones, on your own computer, for
// XP. Each song split is a "block" — it pays a base reward, plus bonuses
// that steer helpers to where they're most needed (songs that have been
// waiting a while, long songs) and reward coming back day after day.
//
// Shared by the server (which works the reward out when a split finishes,
// and stores it with the job) and the page (which explains the rules), so
// the two never disagree. No server-only imports here.

import { DEFAULTS, type AppSettings } from "./settings/registry";

/**
 * The rewards (Admin → Settings → Mining rewards): XP for every song split
 * for someone else, more for a long song and for the first one each (UTC)
 * day, times the rush multiplier for a song that had waited long.
 */
export type MiningRules = AppSettings["mining"];

export type RewardFacts = { long: boolean; firstToday: boolean; rush: boolean };

export type Reward = { xp: number; bonuses: string[] };

/** What a finished split pays, and why. */
export function splitReward({ long, firstToday, rush }: RewardFacts, rules: MiningRules = DEFAULTS.mining): Reward {
  const bonuses: string[] = [];
  let xp = rules.base;
  if (long) {
    xp += rules.longSong;
    bonuses.push(`long song +${rules.longSong}`);
  }
  if (firstToday) {
    xp += rules.firstToday;
    bonuses.push(`first today +${rules.firstToday}`);
  }
  if (rush) {
    xp = Math.round(xp * rules.rushMultiplier);
    bonuses.push(`rush ×${rules.rushMultiplier}`);
  }
  return { xp, bonuses };
}

/** A helper's own numbers: what they've mined, and how they rank this week. */
export type MiningStats = {
  songs: number;
  xp: number;
  /** Seconds of music split, all told. */
  audioSeconds: number;
  today: number;
  todayXp: number;
  week: number;
  weekXp: number;
  /** Days in a row (up to today, or yesterday) with at least one split. */
  streak: number;
  /** Place among this week's miners, by XP; null before their first split this week. */
  weekRank: number | null;
};

export type TopMiner = { id: string; artist_name: string; avatar_color: string; songs: number; xp: number };

/** Mining badges, by songs split for others — the next one is shown as a goal. */
export const MINING_TIERS = [
  { songs: 1, label: "First Block", icon: "box" },
  { songs: 5, label: "Helping Hand", icon: "pickaxe" },
  { songs: 25, label: "Rig Runner", icon: "monitor" },
  { songs: 100, label: "Mining Legend", icon: "gem" },
] as const;

export function nextTier(songs: number) {
  return MINING_TIERS.find((t) => t.songs > songs) ?? null;
}

/** Consecutive days with a split, from a list of days (YYYY-MM-DD, any order). */
export function streakFrom(days: string[], today = new Date()): number {
  const set = new Set(days);
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const key = () => day.toISOString().slice(0, 10);
  // A streak still counts until the end of the day after its last split.
  if (!set.has(key())) day.setUTCDate(day.getUTCDate() - 1);
  let streak = 0;
  while (set.has(key())) {
    streak++;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}
