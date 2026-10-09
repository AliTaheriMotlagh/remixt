"use client";

import { findParts, swapInParts } from "./beatParts";
import { startNewStep } from "./studioHistory";
import { useStudioStore, type LoadableStem, type StudioLane } from "./studioStore";
import { useStudioView } from "./studioView";
import { STEM_KINDS, kindLabel, type StemKind } from "@/lib/stemKinds";

// Remixing every line of a song, not just its vocal and its beat. Every
// upload is split into vocals, drums, bass and melody ("other") — and the
// beat, which is those three summed. These group the library's stems by
// song, put a song in the mix as all of its lines at once, and take a beat
// that's already in the mix apart into its drums, bass and melody.

/** A library stem, with the song (track) it was split from. */
export type SongStem = LoadableStem & { track_id: string; track_tags?: string[] | null };

export type Song = {
  trackId: string;
  title: string;
  artist: string;
  bpm: number | null;
  duration: number | null;
  tags: string[];
  /** Its stems, one per kind. */
  stems: Partial<Record<StemKind, SongStem>>;
};

/** The library's stems as songs, in the order the songs first appear. */
export function groupSongs(stems: SongStem[]): Song[] {
  const songs = new Map<string, Song>();
  for (const stem of stems) {
    if (!stem.track_id) continue;
    let song = songs.get(stem.track_id);
    if (!song) {
      song = {
        trackId: stem.track_id,
        title: stem.track_title,
        artist: stem.artist_name,
        bpm: stem.track_bpm ?? null,
        duration: stem.track_duration,
        tags: stem.track_tags ?? [],
        stems: {},
      };
      songs.set(stem.track_id, song);
    }
    song.stems[stem.kind] ??= stem;
  }
  return [...songs.values()];
}

/** Whether a song has the beat's own parts (drums, bass, melody) — songs split since the 4-stem update do. */
export function hasParts(song: Song) {
  return !!(song.stems.drums || song.stems.bass || song.stems.other);
}

/**
 * The lines a song is remixed with: its vocal, and the beat's own drums,
 * bass and melody when it has them (they add up to the beat, and each can
 * then be changed on its own) — else its vocal and its beat.
 */
export function allLines(song: Song): SongStem[] {
  const kinds: StemKind[] = hasParts(song) ? ["vocals", "drums", "bass", "other"] : ["vocals", "beat"];
  return kinds.flatMap((kind) => song.stems[kind] ?? []);
}

/** The kinds a song has, in the library's order. */
export function kindsOf(song: Song): StemKind[] {
  return STEM_KINDS.filter((kind) => !!song.stems[kind]);
}

/**
 * Puts stems in the mix as lanes — one undo step. A song's lines all start
 * together at their own speed, so they line up by themselves. Stems already
 * in the mix aren't added twice. Returns the new lanes' ids.
 */
export function addLines(stems: LoadableStem[]): string[] {
  const store = useStudioStore.getState();
  const fresh = stems.filter((stem) => !store.lanes.some((l) => l.stemId === stem.id));
  if (!fresh.length) return [];
  startNewStep();
  // Plain library rows can carry more than a lane needs (tags, the track's id): only what addStem reads.
  return fresh.map((stem) =>
    store.addStem({
      id: stem.id,
      kind: stem.kind,
      track_title: stem.track_title,
      artist_name: stem.artist_name,
      peaks_json: stem.peaks_json,
      track_duration: stem.track_duration,
      track_bpm: stem.track_bpm,
    })
  );
}

/** Whether a lane is a whole beat that could be taken apart into its own lines. */
export function canSeparate(lane: Pick<StudioLane, "kind">) {
  return lane.kind === "beat";
}

/**
 * A beat in the mix taken apart into its drums, bass and melody, lined up
 * exactly where it was (same place, speed, pitch, clips and sound) — one
 * undo step. Straight from the library when its song has them; otherwise
 * the "Split with Demucs" dialog opens to make them on this device.
 * Resolves with what happened.
 */
export async function separateBeat(laneId: string): Promise<"separated" | "splitting" | "gone"> {
  const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
  if (!lane) return "gone";
  const parts = await findParts(lane);
  // The mix may have moved on while the library answered.
  if (!useStudioStore.getState().lanes.some((l) => l.laneId === laneId)) return "gone";
  if (!parts.length) {
    useStudioView.getState().setSplitLane(laneId);
    return "splitting";
  }
  swapInParts(laneId, parts);
  useStudioView.getState().notify(`Separated into ${parts.map((p) => kindLabel(p.kind).toLowerCase()).join(", ")} — ⌘Z puts the beat back`);
  return "separated";
}
