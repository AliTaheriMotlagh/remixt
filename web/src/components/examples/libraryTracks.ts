"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { analyzeStem, beatPhase, findPhrases, refineTempo } from "@/lib/client/analysis";
import { beatStructure } from "@/lib/client/arrange";
import { barLinesFromBeats, constantBarLines, type TimeSpan } from "@/lib/client/examplesLibrary";
import { analyzeSong, listLibrarySongs, loadStem, releaseStem, type LibrarySong } from "@/lib/client/libraryAudio";
import { camelotCode, isMusicalKey, type MusicalKey } from "@/lib/client/musicKey";
import type { StemKind } from "@/lib/stemKinds";

// Real library songs in the Examples lab: decoded only once one is picked,
// analysed with the Studio's own analysis, and let go again as soon as no
// step needs them (a decoded 4-minute stem is ~85 MB). What the analysis
// found (tempo and key, a few bytes) is remembered on this device, so the
// picker, the suggestions and the recipes can show it next time without
// decoding anything.

/** "full": vocals and beat, for the Split step and a vocal to match. "beat": the beat alone, for a beat to match. */
export type TrackNeed = "full" | "beat";

export type LoadedTrack = {
  song: LibrarySong;
  beat: AudioBuffer;
  /** Null when only the beat was asked for. */
  vocals: AudioBuffer | null;
  bpm: number;
  key: MusicalKey;
  camelot: string;
  barSec: number;
  duration: number;
  /** Bar lines (seconds), on the beat's tracked downbeats when they were found. */
  barLines: number[];
  /** Index into `barLines` of the first bar with the beat at full strength. */
  mainBar: number;
  /** Where the vocal sings (empty for a beat-only load). */
  phrases: TimeSpan[];
};

// --- Remembered analysis ------------------------------------------------------

export type SongSummary = { bpm: number; key: MusicalKey };
const STORE_KEY = "remixt.examples.analysis.v1";
const NO_SUMMARIES: ReadonlyMap<string, SongSummary> = new Map();
let summaries: ReadonlyMap<string, SongSummary> | null = null;
const summaryListeners = new Set<() => void>();

function readSummaries(): ReadonlyMap<string, SongSummary> {
  if (summaries) return summaries;
  const map = new Map<string, SongSummary>();
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
    for (const [id, v] of Object.entries(raw)) {
      const s = v as Partial<SongSummary>;
      if (typeof s?.bpm === "number" && s.bpm > 0 && isMusicalKey(s.key)) map.set(id, { bpm: s.bpm, key: s.key });
    }
  } catch {
    // Private mode or blocked storage: start empty, it's only a convenience.
  }
  return (summaries = map);
}

function saveSummary(trackId: string, summary: SongSummary) {
  const next = new Map(readSummaries());
  next.set(trackId, summary);
  summaries = next;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(next)));
  } catch {
    // Not saved for next time; still known for this visit.
  }
  for (const l of summaryListeners) l();
}

/** Tempo and key of every library song analysed on this device so far. */
export function useSongSummaries() {
  return useSyncExternalStore(
    (cb) => {
      summaryListeners.add(cb);
      return () => summaryListeners.delete(cb);
    },
    readSummaries,
    () => NO_SUMMARIES
  );
}

// --- Loading progress -----------------------------------------------------------

const stages = new Map<string, string>();
const stageListeners = new Set<() => void>();
function setStage(trackId: string, stage: string | null) {
  if (stage) stages.set(trackId, stage);
  else stages.delete(trackId);
  for (const l of stageListeners) l();
}

/** What's happening to a library song right now ("Downloading…"), or undefined when nothing is. */
export function useTrackStage(trackId: string | null) {
  return useSyncExternalStore(
    (cb) => {
      stageListeners.add(cb);
      return () => stageListeners.delete(cb);
    },
    () => (trackId ? stages.get(trackId) : undefined),
    () => undefined
  );
}

// --- Decoding and analysis --------------------------------------------------------

let decodeCtx: OfflineAudioContext | null = null;
/** Stems are decoded off the playing context, so nothing needs a tap first. */
const decoder = () => (decodeCtx ??= new OfflineAudioContext(2, 1, 44100));

const entries = new Map<string, { need: TrackNeed; promise: Promise<LoadedTrack> }>();
/** Stem ids decoded per song, to let go of together. */
const held = new Map<string, Set<string>>();
let kept = new Set<string>();

function hold(trackId: string, stemId: string) {
  let set = held.get(trackId);
  if (!set) held.set(trackId, (set = new Set()));
  set.add(stemId);
}

function release(trackId: string) {
  entries.delete(trackId);
  for (const stemId of held.get(trackId) ?? []) releaseStem(stemId);
  held.delete(trackId);
}

/**
 * Lets go of every decoded library song except these (track ids). The lab
 * calls it whenever the picked song or pair changes, and with nothing when
 * it closes.
 */
export function keepOnly(trackIds: Iterable<string>) {
  kept = new Set(trackIds);
  for (const id of [...held.keys(), ...entries.keys()]) if (!kept.has(id)) release(id);
}

function fold(bpm: number) {
  // As libraryAudio's analyzeSong does: DJs think in 70–180 BPM.
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return bpm;
}

async function load(song: LibrarySong, need: TrackNeed): Promise<LoadedTrack> {
  const id = song.trackId;
  const ctx = decoder();
  const beatId = song.stems.beat!.id;
  const vocalsId = song.stems.vocals!.id;
  hold(id, beatId);
  let vocals: AudioBuffer | null = null;
  let beat: AudioBuffer;
  let bpm: number;
  let key: MusicalKey;
  let firstBeat: number;
  let beatA;
  let phrases: TimeSpan[] = [];
  if (need === "full") {
    hold(id, vocalsId);
    setStage(id, "Downloading the vocals and beat…");
    [beat, vocals] = await Promise.all([loadStem(ctx, beatId), loadStem(ctx, vocalsId)]);
    setStage(id, "Listening for tempo, key and bars…");
    const a = await analyzeSong(song, beat, vocals);
    ({ bpm, key, firstBeat } = a);
    beatA = a.beat;
    phrases = findPhrases(a.vocals);
  } else {
    setStage(id, "Downloading the beat…");
    beat = await loadStem(ctx, beatId);
    setStage(id, "Listening for tempo and key…");
    beatA = await analyzeStem(beatId, beat);
    bpm = fold(refineTempo(beatA, song.bpm ?? beatA.bpmEstimate ?? 120));
    key = beatA.key;
    const period = 60 / bpm;
    firstBeat = ((beatPhase(beatA, period) % period) + period) % period;
  }
  const barSec = 240 / bpm;
  const duration = beat.duration;
  const structure = beatStructure(beatA, bpm);
  const barLines = structure ? barLinesFromBeats(structure.grid.times, structure.downbeat) : constantBarLines(firstBeat, barSec, duration);
  const mainBar = structure ? Math.min(barLines.length - 1, Math.floor(structure.downbeat / 4) + structure.introBars) : 0;
  saveSummary(id, { bpm, key });
  return { song, beat, vocals, bpm, key, camelot: camelotCode(key), barSec, duration, barLines, mainBar, phrases };
}

/** Decodes and analyses a library song (shared between steps; a "full" load serves a "beat" request too). */
export function loadTrack(song: LibrarySong, need: TrackNeed): Promise<LoadedTrack> {
  const id = song.trackId;
  const existing = entries.get(id);
  if (existing && (existing.need === "full" || need === "beat")) return existing.promise;
  const promise = load(song, need);
  const entry = { need, promise };
  entries.set(id, entry);
  promise.then(
    () => setStage(id, null),
    () => {
      if (entries.get(id) === entry) entries.delete(id);
      setStage(id, null);
    }
  );
  return promise;
}

/** A library song's tempo and key: remembered, or found from its beat alone (then let go of, unless a step is using it). */
export async function summarize(song: LibrarySong): Promise<SongSummary> {
  const known = readSummaries().get(song.trackId);
  if (known) return known;
  const track = await loadTrack(song, "beat");
  if (!kept.has(song.trackId)) release(song.trackId);
  return { bpm: track.bpm, key: track.key };
}

/** The drums, bass and other stems of a song that has them, decoded. */
export async function loadParts(song: LibrarySong): Promise<Record<"drums" | "bass" | "other", AudioBuffer>> {
  const kinds = ["drums", "bass", "other"] as const satisfies readonly StemKind[];
  const ctx = decoder();
  setStage(song.trackId, "Downloading drums, bass and other…");
  try {
    const buffers = await Promise.all(
      kinds.map((k) => {
        const stemId = song.stems[k]!.id;
        hold(song.trackId, stemId);
        return loadStem(ctx, stemId);
      })
    );
    return { drums: buffers[0], bass: buffers[1], other: buffers[2] };
  } finally {
    setStage(song.trackId, null);
  }
}

// --- Hooks -----------------------------------------------------------------------

/** The library's songs (with vocals and beat), fetched once per page. */
export function useLibrarySongs() {
  const [state, setState] = useState<{ songs: LibrarySong[] | null; error: string | null }>({ songs: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    listLibrarySongs(attempt > 0)
      .then((songs) => alive && setState({ songs, error: null }))
      .catch((e: unknown) => alive && setState({ songs: null, error: e instanceof Error ? e.message : "Couldn't load the library" }));
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => {
    setState({ songs: null, error: null });
    setAttempt((n) => n + 1);
  }, []);
  return { songs: state.songs ?? [], loading: !state.songs && !state.error, error: state.error, reload };
}

export type LibraryState = ReturnType<typeof useLibrarySongs>;

/** A library song decoded and analysed for a step; `retry` asks again after an error. */
export function useLibraryTrack(song: LibrarySong | null, need: TrackNeed) {
  const [state, setState] = useState<{ key: string; track?: LoadedTrack; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = song ? `${song.trackId}|${need}|${attempt}` : null;
  const stage = useTrackStage(song?.trackId ?? null);

  useEffect(() => {
    if (!song || !key) return;
    let alive = true;
    loadTrack(song, need).then(
      (track) => alive && setState({ key, track }),
      (e: unknown) => alive && setState({ key, error: e instanceof Error ? e.message : "Couldn't load this song" })
    );
    return () => {
      alive = false;
    };
  }, [song, need, key]);

  const current = state && state.key === key ? state : null;
  return {
    track: current?.track ?? null,
    error: current?.error ?? null,
    loading: !!song && !current,
    stage,
    retry: () => setAttempt((n) => n + 1),
  };
}
