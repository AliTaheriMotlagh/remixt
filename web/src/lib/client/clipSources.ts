"use client";

// What the clip editor takes from the mix: who to credit (whose voice is
// heard, whose beat), and the shape of the vocals and of the beat to pick
// a part by.

import { clipCredits } from "@/lib/clipDesign";
import { splitSongTitle } from "@/lib/lyrics";
import { isTakeLane } from "./lyricsSources";
import { mixPeaks } from "./mixPeaks";
import { clipsOf, getAudibleLaneIds, type StudioLane } from "./studioStore";

/** Heard in the mix: not muted or soloed out, with at least one clip playing. */
function heard(lanes: StudioLane[]): StudioLane[] {
  const audible = getAudibleLaneIds(lanes);
  return lanes.filter((l) => audible.has(l.laneId) && l.volume > 0 && clipsOf(l).some((c) => !c.muted));
}

/** The artist a lane is credited to: the user for a take they recorded, else the artist in the song's title. */
export function laneArtist(lane: StudioLane, me: string): string {
  if (isTakeLane(lane)) return me;
  return splitSongTitle(lane.trackTitle).artist;
}

/**
 * "Vocals by" and "Beat by" for a clip of this mix: the artists of the
 * vocals heard and of everything else heard, first lane first. Empty when
 * it's one artist's song (the artist line says it all) or one side is
 * unknown.
 */
export function laneCredits(lanes: StudioLane[], me: string): { vocalBy: string; beatBy: string } {
  const on = heard(lanes);
  const voices = on.filter((l) => l.kind === "vocals").map((l) => laneArtist(l, me));
  const beats = on.filter((l) => l.kind !== "vocals").map((l) => laneArtist(l, me));
  return clipCredits(voices, beats);
}

/** The vocals' and the beat's waveforms across the song, each scaled to its own loudest point. */
export function groupPeaks(lanes: StudioLane[], duration: number, points: number): { vocals: number[]; beat: number[] } {
  return {
    vocals: mixPeaks(lanes, duration, points, (l) => l.kind === "vocals"),
    beat: mixPeaks(lanes, duration, points, (l) => l.kind !== "vocals"),
  };
}
