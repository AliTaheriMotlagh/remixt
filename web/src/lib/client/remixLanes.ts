"use client";

import {
  DEFAULT_FX,
  type LaneFx,
  type ProjectSettings,
  type StudioLane,
} from "./studioStore";

export type RemixLaneApi = {
  stem_id: string;
  kind: "vocals" | "beat";
  peaks_json: string;
  volume: number;
  muted: boolean;
  offset_seconds: number | null;
  pitch_semitones: number;
  tempo_ratio: number;
  settings_json: string | null;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  stem_artist_name: string;
};

export type RemixApi = {
  id: string;
  title: string;
  published: boolean;
  project_json: string | null;
};

type LaneSettings = {
  fx?: Partial<LaneFx>;
  bpm?: number | null;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

/** Turns one API lane row into the lane shape the Studio works with. */
export function laneFromApi(lane: RemixLaneApi): StudioLane {
  const settings = parseJson<LaneSettings>(lane.settings_json, {});
  const originalDuration = lane.track_duration ?? 0;
  const tempoRatio = lane.tempo_ratio || 1;
  return {
    laneId: crypto.randomUUID(),
    stemId: lane.stem_id,
    kind: lane.kind,
    trackTitle: lane.track_title,
    artistName: lane.stem_artist_name,
    volume: lane.volume,
    muted: lane.muted,
    solo: false,
    peaks: JSON.parse(lane.peaks_json || "[]"),
    originalDuration,
    duration: originalDuration / tempoRatio,
    offsetSeconds: lane.offset_seconds ?? 0,
    bpm: settings.bpm ?? lane.track_bpm,
    pitchSemitones: lane.pitch_semitones || 0,
    tempoRatio,
    fx: { ...DEFAULT_FX, ...(settings.fx ?? {}) },
  };
}

export function projectFromApi(remix: RemixApi | undefined): Partial<ProjectSettings> {
  return parseJson<Partial<ProjectSettings>>(remix?.project_json, {});
}

/** Serialises lanes for POST /api/remixes. */
export function lanesToPayload(lanes: StudioLane[]) {
  return lanes.map((lane) => ({
    stemId: lane.stemId,
    volume: lane.volume,
    muted: lane.muted,
    offsetSeconds: lane.offsetSeconds,
    pitchSemitones: lane.pitchSemitones,
    tempoRatio: lane.tempoRatio,
    settings: { fx: lane.fx, bpm: lane.bpm },
  }));
}
