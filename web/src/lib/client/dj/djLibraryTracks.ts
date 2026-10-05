"use client";

// Songs from the shared library as DJ tracks: decode the stems (vocals plus
// drums/bass/melody when the song has its parts, else vocals plus beat),
// analyse tempo, key and beat grid with the Studio's analysis, measure the
// frequency bands for the waveform, and hand the deck a LoadedTrack. What
// the analysis found is remembered for the session, so the browser can show
// keys and the mission picker can use them. Decoded audio is let go when no
// deck holds the song any more.

import { analyzeSong, hasParts, listLibrarySongs, loadStem, releaseStem, type LibrarySong } from "../libraryAudio";
import { trackBeats } from "../analysis";
import { camelotCode, isMusicalKey, type MusicalKey } from "../musicKey";
import { peaksOf } from "../demoSongs";
import { DJ_TRACKS } from "./djTrackInfo";
import { PEAK_RATE, loadDjTrack, overviewOf, type LoadedTrack } from "./djTracks";
import { downbeatOffset, entryFromTrack, gridPhase, isLibraryId, libraryTrackId, libraryTrackKey, sectionsFromEnergy, type BrowserEntry } from "./djLibrary";
import type { StemSlot, TrackInfo } from "./djTypes";
import { trackBands } from "./djWaveform";

export type LoadStage = { stage: "download" | "decode" | "analyze" | "waveform"; text: string; progress: number };

/** What analysis found, small enough to keep for the session. */
export type AnalysisSummary = { bpm: number; key: MusicalKey; firstBeat: number; duration: number };

const SUMMARY_KEY = "remixt-dj-analysis-v1";
const summaries = new Map<string, AnalysisSummary>();
let summariesRead = false;

function readSummaries() {
  if (summariesRead) return;
  summariesRead = true;
  try {
    const raw = globalThis.sessionStorage?.getItem(SUMMARY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, AnalysisSummary>;
    for (const [k, v] of Object.entries(data)) {
      if (v && Number.isFinite(v.bpm) && isMusicalKey(v.key) && Number.isFinite(v.firstBeat)) summaries.set(k, v);
    }
  } catch {
    // Storage blocked or garbled: analyse again.
  }
}

function saveSummary(trackId: string, s: AnalysisSummary) {
  summaries.set(trackId, s);
  try {
    globalThis.sessionStorage?.setItem(SUMMARY_KEY, JSON.stringify(Object.fromEntries(summaries)));
  } catch {
    // Not persisted; still known for this page.
  }
}

export function analysisSummary(trackId: string) {
  readSummaries();
  return summaries.get(trackId) ?? null;
}

export function libraryEntry(song: LibrarySong): BrowserEntry {
  const s = analysisSummary(song.trackId);
  return {
    id: libraryTrackId(song.trackId),
    source: "library",
    title: song.title,
    artist: song.artist,
    genre: song.tags[0] ?? "Your library",
    bpm: s?.bpm ?? song.bpm,
    key: s?.key ?? null,
    duration: s?.duration ?? song.duration,
    layout: hasParts(song) ? "four" : "two",
    analyzed: !!s,
  };
}

export const DEMO_ENTRIES: BrowserEntry[] = DJ_TRACKS.map(entryFromTrack);

/** The library as browser rows (fetched once per page). */
export async function libraryEntries(fresh = false) {
  const songs = await listLibrarySongs(fresh);
  return { songs, entries: songs.map(libraryEntry) };
}

export async function librarySong(trackId: string) {
  const songs = await listLibrarySongs();
  return songs.find((s) => s.trackId === trackId) ?? null;
}

/** drums + bass + melody as one quiet mono buffer at 22 kHz: the beat, for analysis, without decoding it again. */
async function sumForAnalysis(parts: AudioBuffer[]) {
  const duration = Math.max(...parts.map((b) => b.duration));
  const rate = 22050;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * rate)), rate);
  for (const b of parts) {
    const src = off.createBufferSource();
    src.buffer = b;
    src.connect(off.destination);
    src.start();
  }
  return off.startRendering();
}

const ready = new Map<string, Promise<LoadedTrack>>();

async function buildLibraryTrack(song: LibrarySong, ctx: BaseAudioContext, onStage?: (s: LoadStage) => void): Promise<LoadedTrack> {
  const parts = hasParts(song);
  const plan: [StemSlot, string][] = parts
    ? [
        ["vocal", song.stems.vocals!.id],
        ["drums", song.stems.drums!.id],
        ["bass", song.stems.bass!.id],
        ["chords", song.stems.other!.id],
      ]
    : [
        ["vocal", song.stems.vocals!.id],
        ["beat", song.stems.beat!.id],
      ];
  let done = 0;
  onStage?.({ stage: "download", text: `Downloading ${plan.length} stems…`, progress: 0.02 });
  const decoded = await Promise.all(
    plan.map(async ([slot, id]) => {
      const buf = await loadStem(ctx, id);
      done++;
      onStage?.({ stage: "decode", text: `Stems ready: ${done} of ${plan.length}`, progress: 0.05 + 0.55 * (done / plan.length) });
      return [slot, buf] as const;
    })
  );
  const stems: Partial<Record<StemSlot, AudioBuffer>> = Object.fromEntries(decoded);
  const duration = Math.min(...decoded.map(([, b]) => b.duration));

  onStage?.({ stage: "analyze", text: "Analysing tempo, key and beat grid…", progress: 0.65 });
  const beatBuf = parts ? await sumForAnalysis([stems.drums!, stems.bass!, stems.chords!]) : stems.beat!;
  const a = await analyzeSong(song, beatBuf, stems.vocal!);
  const bpm = Math.round(a.bpm * 100) / 100;
  const period = 60 / bpm;
  // A straight grid at the analysed tempo, anchored where the tracked beats agree.
  const tracked = trackBeats(a.beat, bpm);
  const phase = gridPhase(tracked, bpm, a.firstBeat);
  const lowAt = (t: number) => {
    const i = Math.round(t * a.beat.onsetRate);
    return (a.beat.lowOnsets[i] ?? 0) + 0.5 * ((a.beat.lowOnsets[i - 1] ?? 0) + (a.beat.lowOnsets[i + 1] ?? 0));
  };
  const firstBeat = phase + downbeatOffset(phase, bpm, duration, lowAt) * period;
  const barSec = period * 4;
  const bars = Math.max(1, Math.floor((duration - firstBeat) / barSec));
  const barEnergy = new Float32Array(bars);
  const { energy, onsetRate } = a.beat;
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((firstBeat + b * barSec) * onsetRate);
    const to = Math.min(energy.length, Math.floor((firstBeat + (b + 1) * barSec) * onsetRate));
    let sum = 0;
    for (let i = from; i < to; i++) sum += energy[i];
    barEnergy[b] = to > from ? Math.sqrt(sum / (to - from)) : 0;
  }
  saveSummary(song.trackId, { bpm, key: a.key, firstBeat, duration });

  onStage?.({ stage: "waveform", text: "Drawing the waveform…", progress: 0.85 });
  const bins = Math.ceil(duration * PEAK_RATE);
  const peaks: Partial<Record<StemSlot, Float32Array>> = {};
  for (const [slot, buf] of decoded) peaks[slot] = peaksOf(buf, bins);
  const { bands, loudnessDb } = await trackBands<StemSlot>(stems, duration);

  const info: TrackInfo = {
    id: libraryTrackId(song.trackId),
    title: song.title,
    artist: song.artist,
    genre: song.tags[0] ?? "Your library",
    bpm,
    key: a.key,
    camelot: camelotCode(a.key),
    duration,
    firstBeat,
    bars,
    sections: sectionsFromEnergy(barEnergy),
    source: "library",
    layout: parts ? "four" : "two",
  };
  onStage?.({ stage: "waveform", text: "Ready", progress: 1 });
  return { info, stems, peaks, overview: overviewOf(peaks), bands, loudnessDb, stemIds: plan.map(([, id]) => id) };
}

/** A library song on a deck. Cached while a deck holds it; analysis is remembered for the session. */
export function loadLibraryTrack(trackId: string, ctx: BaseAudioContext, onStage?: (s: LoadStage) => void): Promise<LoadedTrack> {
  const id = libraryTrackId(trackId);
  const hit = ready.get(id);
  if (hit) return hit;
  const promise = (async () => {
    const song = await librarySong(trackId);
    if (!song) throw new Error("That song is no longer in the library.");
    return buildLibraryTrack(song, ctx, onStage);
  })();
  ready.set(id, promise);
  promise.catch(() => ready.delete(id));
  return promise;
}

/** Any track id: a demo song's, or "lib:<trackId>" for the library. */
export function loadAnyTrack(id: string, ctx: BaseAudioContext, onStage?: (s: LoadStage) => void): Promise<LoadedTrack> {
  if (isLibraryId(id)) return loadLibraryTrack(libraryTrackKey(id), ctx, onStage);
  onStage?.({ stage: "decode", text: "Rendering the demo song…", progress: 0.3 });
  return loadDjTrack(id);
}

/**
 * Lets go of every library song not in `keep` (the ids on the decks): its
 * decoded stems (~85 MB each) and the loaded track.
 */
export function retainTracks(keep: (string | null | undefined)[]) {
  const wanted = new Set(keep.filter(Boolean) as string[]);
  for (const [id, p] of [...ready]) {
    if (wanted.has(id)) continue;
    ready.delete(id);
    p.then((t) => t.stemIds?.forEach(releaseStem)).catch(() => {});
  }
}
