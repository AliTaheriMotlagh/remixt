// Which songs' info looks wrong, and the tidied name suggested for them —
// pure, for Admin → Fix songs (lib/songFixes.ts) and the tests.
import { splitSongTitle } from "./lyrics";

export const INFO_FIELDS = ["name", "artist", "cover", "lyrics", "other"] as const;
export type InfoField = (typeof INFO_FIELDS)[number];

// ——— how likely a song's info is wrong ———

/** Download sites, bitrates, track numbers, underscores: a name straight off a file. */
const MESSY = /(_|\b(320|128|256|kbps|mp3|www|\.com|\.ir|ganja2music|radiojavan|nex1music|upmusic|musicfa|remix\s*by)\b|^\d{1,3}[\s.\-_]|\(\d+\)|\[.*?\])/i;

/** Reasons a song's info looks doubtful, most serious first — pure, for the list and the tests. */
export function doubts(t: { title: string; hasCover: boolean; hasLyrics: boolean; reports: number }): string[] {
  const out: string[] = [];
  if (t.reports) out.push(`${t.reports} report${t.reports > 1 ? "s" : ""}`);
  const { song, artist } = splitSongTitle(t.title);
  if (MESSY.test(t.title)) out.push("name looks like a file name");
  if (!artist) out.push("no artist in the name");
  if (song && song === song.toLowerCase() && /[a-z]/.test(song)) out.push("name all in small letters");
  if (!t.hasCover) out.push("no cover");
  if (!t.hasLyrics) out.push("no lyrics chosen");
  return out;
}

/** A name tidied: "01_dorcci-moft_320" → "Dorcci - Moft" (a suggestion; the admin approves it). */
export function tidyName(title: string): string {
  // Underscores are spaces in file names: "01_dorcci-moft_320" reads as "01 dorcci-moft 320",
  // and its one dash with no spaces round it is the gap between artist and song.
  let spaced = title.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!/\s[-–—]\s/.test(spaced) && (spaced.match(/-/g) ?? []).length === 1) spaced = spaced.replace(/\s*-\s*/, " - ");
  const { song, artist } = splitSongTitle(spaced);
  const clean = (x: string) =>
    x
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^|\s)([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase());
  return artist ? `${clean(artist)} - ${clean(song)}` : clean(song || title);
}

