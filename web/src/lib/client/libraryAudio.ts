"use client";

import { analyzeStem, beatPhase, refineTempo, type StemAnalysis } from "./analysis";
import { fetchStem } from "./stemFetch";
import type { MusicalKey } from "./musicKey";
import type { StemKind } from "@/lib/stemKinds";

// Songs from the shared library, for the pages that play real music outside
// the Studio (the DJ simulator, the examples): the list, grouped by song,
// each stem decoded on demand, and the tempo/key/first beat worked out by
// the same analysis the Studio uses.

export type LibraryStemRef = { id: string; peaks: number[] };

export type LibrarySong = {
  trackId: string;
  title: string;
  artist: string;
  artistId: string;
  /** The tempo stored when the song was split, if any. */
  bpm: number | null;
  duration: number | null;
  tags: string[];
  stems: Partial<Record<StemKind, LibraryStemRef>>;
  /** Picked by an admin as a real-song example for /examples. */
  featured: boolean;
  /** Who made it and under what terms, shown with a featured song. */
  credit: string | null;
};

type StemRow = {
  id: string;
  track_id: string;
  kind: StemKind;
  peaks_json: string;
  track_title: string;
  track_tags: string[] | null;
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
  artist_id: string;
  track_featured?: boolean | null;
  track_credit?: string | null;
};

let listing: Promise<LibrarySong[]> | null = null;

/** Every ready song in the library, newest first. Asked once per page load (pass `fresh` to ask again). */
export function listLibrarySongs(fresh = false): Promise<LibrarySong[]> {
  if (listing && !fresh) return listing;
  listing = (async () => {
    const res = await fetch("/api/stems");
    if (!res.ok) throw new Error("Couldn't load the library");
    const { stems } = (await res.json()) as { stems: StemRow[] };
    const songs = new Map<string, LibrarySong>();
    for (const row of stems) {
      let song = songs.get(row.track_id);
      if (!song) {
        song = {
          trackId: row.track_id,
          title: row.track_title,
          artist: row.artist_name,
          artistId: row.artist_id,
          bpm: row.track_bpm,
          duration: row.track_duration,
          tags: row.track_tags ?? [],
          stems: {},
          featured: !!row.track_featured,
          credit: row.track_credit ?? null,
        };
        songs.set(row.track_id, song);
      }
      let peaks: number[] = [];
      try {
        peaks = JSON.parse(row.peaks_json || "[]");
      } catch {
        // No overview: the waveform is drawn from the audio once it's loaded.
      }
      song.stems[row.kind] = { id: row.id, peaks };
    }
    // Only songs with both halves are useful here.
    return [...songs.values()].filter((s) => s.stems.vocals && s.stems.beat);
  })();
  listing.catch(() => (listing = null));
  return listing;
}

/** Whether a song has its beat split further into drums, bass and melody. */
export function hasParts(song: LibrarySong) {
  return !!(song.stems.drums && song.stems.bass && song.stems.other);
}

// Decoded stems are big (a 4-minute stereo stem is ~85 MB as floats), so
// only the latest few are kept.
const MAX_DECODED = 10;
const decoded = new Map<string, Promise<AudioBuffer>>();

/** A stem as audio, decoded at `ctx`'s sample rate. */
export function loadStem(ctx: BaseAudioContext, stemId: string): Promise<AudioBuffer> {
  const key = `${stemId}@${ctx.sampleRate}`;
  const hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
    decoded.set(key, hit);
    return hit;
  }
  const promise = fetchStem(stemId).then((bytes) => ctx.decodeAudioData(bytes));
  decoded.set(key, promise);
  promise.catch(() => decoded.delete(key));
  while (decoded.size > MAX_DECODED) decoded.delete(decoded.keys().next().value!);
  return promise;
}

/** Lets go of a decoded stem (a deck unloaded it), so its memory can be reclaimed. */
export function releaseStem(stemId: string) {
  for (const key of [...decoded.keys()]) if (key.startsWith(`${stemId}@`)) decoded.delete(key);
}

export type SongAnalysis = {
  bpm: number;
  key: MusicalKey;
  /** Seconds to the first downbeat-ish beat of the beat stem (the beat grid's anchor). */
  firstBeat: number;
  beat: StemAnalysis;
  vocals: StemAnalysis;
};

/**
 * Tempo, key and beat grid of a library song. Tempo comes from the stored
 * BPM when there is one (sharpened against the drums), else from the
 * audio; key from the beat (instruments carry the harmony more reliably
 * than a voice).
 */
export async function analyzeSong(song: LibrarySong, beat: AudioBuffer, vocals: AudioBuffer): Promise<SongAnalysis> {
  const [beatA, vocalA] = await Promise.all([
    analyzeStem(song.stems.beat!.id, beat),
    analyzeStem(song.stems.vocals!.id, vocals),
  ]);
  const source = song.bpm ?? beatA.bpmEstimate ?? vocalA.bpmEstimate ?? 120;
  let bpm = refineTempo(beatA, source);
  // DJs think in 70–180 BPM: fold half/double readings into that range.
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  const period = 60 / bpm;
  let firstBeat = beatPhase(beatA, period) % period;
  if (firstBeat < 0) firstBeat += period;
  return { bpm, key: beatA.key, firstBeat, beat: beatA, vocals: vocalA };
}
