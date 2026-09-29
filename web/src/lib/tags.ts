// Genre and mood tags on songs and remixes. Free-form, but normalised so
// "Hip Hop", "hip-hop " and "HIP HOP" are one tag, with a suggested set so
// most people pick the same words.

export const GENRE_TAGS = [
  "hip hop", "pop", "r&b", "rap", "trap", "drill", "afrobeats", "reggaeton",
  "dance", "house", "techno", "edm", "drum & bass", "lo-fi", "rock", "indie",
  "jazz", "soul", "funk", "latin", "k-pop", "persian", "arabic", "classical",
] as const;

export const MOOD_TAGS = [
  "chill", "happy", "sad", "dark", "energetic", "romantic", "dreamy", "aggressive", "party", "workout",
] as const;

export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

export function normaliseTag(raw: string): string | null {
  const tag = raw
    .toLowerCase()
    .replace(/[_-]+/g, (m) => (m === "-" ? "-" : " "))
    .replace(/[^\p{L}\p{N} &'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
  // "hip-hop" and "hip hop" are the same genre.
  const spaced = tag.replace(/-/g, " ");
  const known = [...GENRE_TAGS, ...MOOD_TAGS].find((t) => t.replace(/-/g, " ") === spaced);
  return known ?? (tag || null);
}

export function normaliseTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const tag = normaliseTag(value);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
