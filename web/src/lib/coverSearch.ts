// A song's cover picture found online, by its artist and name — for a song
// whose file has no picture inside and whose page had none either. Pure:
// the search route and the tests share it.
//
// The catalogue searched is Apple's (the iTunes Search API: free, no key,
// and its pictures may be drawn on a canvas). It keeps Persian songs under
// Finglish names, as the lyrics library does, so the search is asked the
// same ways (lyricsSearch.libraryQueries): "هیچکس فیروز" as "Hichkas
// Firooz". A wrong cover is worse than the drawn one, so a result has to
// match the song's name — and its artist, when one is known.

import { splitSongTitle } from "./lyrics";
import { findArtist, hasPersian, libraryQueries, matchScore, normalizePersian } from "./lyricsSearch";

/** A song as the catalogue lists it (the fields used). */
export type StoreSong = {
  kind?: string;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
};

export type FoundCover = { url: string; title: string; artist: string };

/** The song's name and artist from a track's title (and an artist known some other way). */
export function songOf(title: string, artist = ""): { song: string; artist: string } {
  const split = splitSongTitle(title);
  let song = split.song;
  let by = artist.trim() || split.artist;
  // "Hichkas Firooz" with no dash: a known artist's name inside it is the artist.
  if (!by) {
    const words = normalizePersian(song).toLowerCase().split(" ").filter(Boolean);
    const known = findArtist(words);
    if (known && known.rest.length) {
      by = known.artist;
      song = known.rest.join(" ");
    }
  }
  return { song, artist: by };
}

const MAX_TERMS = 3;

/** What to ask the catalogue, best first: the artist and the name, then other spellings of them. */
export function coverTerms(title: string, artist = ""): string[] {
  const { song, artist: by } = songOf(title, artist);
  if (!song) return [];
  const out: string[] = [];
  // A known artist's name as the catalogue spells it ("محسن چاوشی" → "Mohsen Chavoshi").
  const latinBy = by ? (findArtist(normalizePersian(by).toLowerCase().split(" ").filter(Boolean))?.artist ?? by) : "";
  for (const q of libraryQueries(song, { track: song, artist: latinBy || undefined })) {
    const term = "q" in q ? q.q : [q.artist_name, q.track_name].filter(Boolean).join(" ");
    const clean = term.replace(/\s+/g, " ").trim();
    // Just the artist on their own finds their songs, not this one.
    if (latinBy && normalizePersian(clean).toLowerCase() === normalizePersian(latinBy).toLowerCase()) continue;
    // The catalogue has nothing in Persian letters: those terms find nothing.
    if (clean && !hasPersian(clean) && !out.some((o) => o.toLowerCase() === clean.toLowerCase())) out.push(clean);
  }
  // A name in Persian letters is only guessed at in Finglish: the artist's own songs are asked for too,
  // and matched by how the name sounds (bestCover reads both scripts alike).
  if (hasPersian(song) && latinBy && !hasPersian(latinBy)) {
    out.splice(Math.min(out.length, MAX_TERMS - 1), 0, latinBy);
  }
  return out.slice(0, MAX_TERMS);
}

/** Other people's versions: their covers are of other records. */
const NOT_THE_RECORD = /\b(karaoke|instrumental|tribute|cover|piano|made famous|in the style of|originally performed|8-?bit|lullaby)\b/i;

/** The catalogue's picture at `size` px (it lists a 100 px one; the same address gives any size). */
export function artworkAt(url: string, size = 600): string {
  return url.replace(/\/\d+x\d+(bb)?(\.\w+)$/, `/${size}x${size}bb$2`);
}

/**
 * The cover of the song meant, from the catalogue's answers — or null when
 * none is surely it. The name has to match well; a known artist has to
 * match too. With no artist known, only a name of two words or more that
 * matches exactly is trusted (a one-word name is many songs).
 */
export function bestCover(found: StoreSong[], title: string, artist = ""): FoundCover | null {
  const { song, artist: by } = songOf(title, artist);
  if (!song) return null;
  let best: { cover: FoundCover; score: number } | null = null;
  for (const item of found) {
    if (!item?.artworkUrl100 || !item.trackName || (item.kind && item.kind !== "song")) continue;
    if (NOT_THE_RECORD.test(`${item.trackName} ${item.collectionName ?? ""}`) && !NOT_THE_RECORD.test(song)) continue;
    const name = Math.max(matchScore(song, item.trackName, ""), matchScore(song, item.trackName.replace(/\s*[([].*$/, ""), ""));
    if (name < 0.7) continue;
    let score = name;
    // A version ("(Live)", "- Acoustic", "(Remix)") the name didn't ask for comes after the record itself.
    if (/[([]|\s[-–]\s/.test(item.trackName) && !/[([]/.test(song)) score -= 0.2;
    if (by) {
      const who = matchScore(by, item.artistName ?? "", "");
      if (who < 0.5) continue;
      score += who;
    } else if (name < 0.95 || song.trim().split(/\s+/).length < 2) {
      continue;
    }
    if (!best || score > best.score + 0.001) {
      best = { cover: { url: artworkAt(item.artworkUrl100), title: item.trackName, artist: item.artistName ?? "" }, score };
    }
  }
  return best?.cover ?? null;
}
