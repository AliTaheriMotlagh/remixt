"use client";

import { audioEngine } from "./audioEngine";
import { useStudioStore, type StudioLane } from "./studioStore";
import { borrowTimes, isSung, isSynced, parseLyrics, placeOnLane, serializeLyrics, type Envelope, type LyricLine, type LyricsPage, type LyricsResult } from "@/lib/lyrics";
import type { ImportedLyrics } from "@/lib/lyricsImport";

// Where lyrics and their timing come from, for the Studio: the lyrics
// library and Genius (api/lyrics/search), any lyrics page or embed code
// (api/lyrics/import), and the vocals in the mix — whose loudness shows
// where each line is sung.

export type SearchAnswer = { results: LyricsResult[]; web: LyricsPage[] };

export async function searchLyrics(params: URLSearchParams): Promise<SearchAnswer> {
  const res = await fetch(`/api/lyrics/search?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't search");
  return { results: (data.results ?? []) as LyricsResult[], web: (data.web ?? []) as LyricsPage[] };
}

/** The words from a lyrics page, a Genius embed code, or a lyrics file's address. */
export async function importLyricsLink(link: string): Promise<ImportedLyrics> {
  const res = await fetch("/api/lyrics/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link: link.slice(0, 8000) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't read that link");
  return data as ImportedLyrics;
}

/** The same song's timed lyrics from the library, if it has them, and the length of the recording they're timed to. */
export async function findTimedVersion(title: string, artist: string, duration?: number | null): Promise<{ lines: LyricLine[]; duration: number | null } | null> {
  if (!title.trim()) return null;
  const params = new URLSearchParams({ track: title.trim().slice(0, 200) });
  if (artist.trim()) params.set("artist", artist.trim().slice(0, 200));
  if (duration) params.set("duration", String(Math.round(duration)));
  try {
    const { results } = await searchLyrics(params);
    const timed = results.find((r) => r.synced);
    return timed?.synced ? { lines: parseLyrics(timed.synced), duration: timed.duration } : null;
  } catch {
    return null;
  }
}

/** The mix lane playing a recording this long (within a few seconds) — the song the lyrics are timed to — if any. */
export function laneOfRecording(result: { duration: number | null }, lanes: StudioLane[]) {
  if (!result.duration) return null;
  return lanes.find((l) => l.artistName !== "You" && !l.clips && Math.abs(l.originalDuration - result.duration!) <= 3) ?? null;
}

/**
 * Untimed words get their times from the library's timed copy of the same
 * song, put where that song plays in the mix if it's there. The sheet's
 * new text and whether it's lined up with the mix — or null, when there's
 * no timed copy that matches the words.
 */
export async function timeFromLibrary(
  text: string,
  title: string,
  artist: string
): Promise<{ text: string; aligned: boolean; matched: number; total: number } | null> {
  const words = parseLyrics(text);
  if (!words.some(isSung)) return null;
  // Times already there are replaced: this is asked for on purpose.
  const plain = isSynced(words) ? words.map((l) => ({ ...l, time: null })) : words;
  const lanes = useStudioStore.getState().lanes;
  const song = lanes.find((l) => l.artistName !== "You" && !l.clips);
  const timed = await findTimedVersion(title, artist, song?.originalDuration);
  if (!timed) return null;
  const borrowed = borrowTimes(plain, timed.lines);
  if (!borrowed) return null;
  const lane = laneOfRecording(timed, lanes);
  const lines = lane ? placeOnLane(borrowed.lines, lane.offsetSeconds, lane.tempoRatio) : borrowed.lines;
  return { text: serializeLyrics(lines), aligned: !!lane, matched: borrowed.matched, total: borrowed.total };
}

/** Vocal lanes in the mix whose singing can time lyrics: the song's own vocal stem, or a take. */
export function vocalLanes(lanes: StudioLane[]): StudioLane[] {
  return lanes.filter((l) => l.kind === "vocals" && !l.clips && l.originalDuration > 0);
}

const RATE = 50;

/**
 * A lane's loudness on the timeline, 50 times a second, from its decoded
 * audio — or, when that isn't loaded, from the waveform it draws (coarser).
 */
export async function laneEnvelope(lane: StudioLane): Promise<Envelope> {
  const tempo = lane.tempoRatio > 0 ? lane.tempoRatio : 1;
  let buffer: AudioBuffer | null = null;
  try {
    await audioEngine.ensureLane(lane.laneId, lane.stemId);
    buffer = await audioEngine.getRawBuffer(lane.laneId);
  } catch {
    buffer = null;
  }
  if (!buffer) {
    const peaks = lane.peaks;
    return { values: peaks, start: lane.offsetSeconds, step: lane.originalDuration / Math.max(1, peaks.length) / tempo };
  }
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(buffer.sampleRate / RATE));
  const values = new Float32Array(Math.floor(data.length / size));
  for (let b = 0; b < values.length; b++) {
    let sum = 0;
    // Every 4th sample is plenty for a loudness curve, and 4× quicker.
    for (let i = b * size; i < (b + 1) * size; i += 4) sum += data[i] * data[i];
    values[b] = Math.sqrt(sum / (size / 4));
  }
  return { values, start: lane.offsetSeconds, step: size / buffer.sampleRate / tempo };
}

/** The mix's loudness at `rate` points a second, for drawing behind the lyrics: the lanes' waveforms, laid where they play. */
export function mixEnvelope(lanes: StudioLane[], rate = 20): Envelope {
  const end = lanes.reduce((top, l) => Math.max(top, l.offsetSeconds + (l.duration || l.originalDuration)), 0);
  const values = new Float32Array(Math.ceil(end * rate) + 1);
  const solo = lanes.some((l) => l.solo);
  for (const lane of lanes) {
    if (lane.muted || (solo && !lane.solo) || lane.peaks.length === 0) continue;
    if (lane.clips) {
      for (const clip of lane.clips) addPeaks(values, lane, clip.at, clip.from, clip.to, rate, clip.stretch ?? 1);
    } else {
      addPeaks(values, lane, lane.offsetSeconds, 0, lane.originalDuration, rate);
    }
  }
  let top = 0;
  for (const v of values) top = Math.max(top, v);
  if (top > 0) for (let i = 0; i < values.length; i++) values[i] /= top;
  return { values, start: 0, step: 1 / rate };
}

/** A piece of a lane's stem (from `from` to `to` seconds into it) played from `at` on the timeline. */
function addPeaks(values: Float32Array, lane: StudioLane, at: number, from: number, to: number, rate: number, stretch = 1) {
  const tempo = (lane.tempoRatio > 0 ? lane.tempoRatio : 1) * (stretch > 0 ? stretch : 1);
  const per = lane.peaks.length / Math.max(0.001, lane.originalDuration);
  const length = (to - from) / tempo;
  const gain = Math.min(1.5, Math.max(0, lane.volume));
  for (let i = Math.max(0, Math.floor(at * rate)); i < Math.min(values.length, Math.ceil((at + length) * rate)); i++) {
    const intoStem = from + (i / rate - at) * tempo;
    const p = lane.peaks[Math.min(lane.peaks.length - 1, Math.max(0, Math.floor(intoStem * per)))] ?? 0;
    values[i] = Math.max(values[i], p * gain);
  }
}

/** The mix lanes now, for code outside React. */
export function currentLanes() {
  return useStudioStore.getState().lanes;
}
