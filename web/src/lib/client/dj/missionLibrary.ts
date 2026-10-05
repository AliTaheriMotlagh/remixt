"use client";

// Prepares a mission with songs from the library: ranks candidate songs by
// what's known (stored tempo, keys analysed earlier this session), loads
// and analyses the best pick, checks it against the mission's needs with
// the real tempo and key, and tries the next pick if it doesn't fit. Gives
// up (the caller falls back to the demo songs) after a few tries, so a
// library without fitting songs doesn't mean endless downloads.

import { listLibrarySongs } from "../libraryAudio";
import { analysisSummary, loadLibraryTrack, retainTracks, type LoadStage } from "./djLibraryTracks";
import { libraryTrackId } from "./djLibrary";
import type { LoadedTrack } from "./djTracks";
import type { DeckId, TrackInfo } from "./djTypes";
import { MISSION_NEEDS, adaptSetup, describePick, pickFits, rankMissionPicks, type MissionNeeds, type MissionPick, type PickCandidate } from "./missionTracks";
import type { Mission, MissionSetup } from "./scenarios";

export type LibraryPrep =
  | { ok: true; setup: MissionSetup; lines: string[]; tracks: Partial<Record<DeckId, TrackInfo>> }
  | { ok: false; reason: string };

const MAX_TRIES = 3;

/** Needs for missions outside the original nine: any songs for the decks the setup uses. */
function needsFor(mission: Mission): MissionNeeds | null {
  const known = MISSION_NEEDS[mission.id];
  if (known) return known;
  const decks = (Object.keys(mission.setup.decks) as DeckId[]).filter((d) => mission.setup.decks[d]);
  if (!mission.libraryFriendly || decks.length === 0) return null;
  return { decks, minDuration: 60, why: "Songs from your library for this set." };
}

export function libraryApplies(mission: Mission) {
  return needsFor(mission) !== null;
}

export async function prepareLibraryMission(mission: Mission, ctx: BaseAudioContext, seed: number, onStage: (s: LoadStage) => void): Promise<LibraryPrep> {
  const needs = needsFor(mission);
  if (!needs) return { ok: false, reason: "This exercise is built around the demo songs." };
  let songs;
  try {
    songs = await listLibrarySongs();
  } catch {
    return { ok: false, reason: "Couldn't reach the library, so the demo songs are used." };
  }
  const pool: PickCandidate[] = songs.map((s) => {
    const a = analysisSummary(s.trackId);
    return { id: s.trackId, title: s.title, bpm: a?.bpm ?? s.bpm, key: a?.key ?? null, duration: a?.duration ?? s.duration };
  });
  const byId = new Map(pool.map((c) => [c.id, c]));
  const missionNeeds = MISSION_NEEDS[mission.id] ? mission.id : null;
  const rank = (): MissionPick[] =>
    missionNeeds
      ? rankMissionPicks(mission.id, pool, seed)
      : pool
          .filter((c) => c.duration === null || c.duration >= needs.minDuration + 30)
          .map((c, i) => ({ c, order: (i * 7919 + seed) % 1009 }))
          .sort((x, y) => x.order - y.order)
          .slice(0, 6)
          .map(({ c }) => ({ A: c.id, certain: true }));
  const tried = new Set<string>();

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const pick = rank().find((p) => !tried.has(`${p.A}|${p.B ?? p.partner ?? ""}`));
    if (!pick) break;
    tried.add(`${pick.A}|${pick.B ?? pick.partner ?? ""}`);
    const ids = [pick.A, pick.B, pick.partner].filter(Boolean) as string[];
    const loaded: Record<string, LoadedTrack> = {};
    try {
      for (const [i, id] of ids.entries()) {
        const title = byId.get(id)?.title ?? "a song";
        loaded[id] = await loadLibraryTrack(id, ctx, (s) => onStage({ ...s, text: `${title}: ${s.text}`, progress: (i + s.progress) / ids.length }));
        // What analysis found improves the next ranking too.
        const info = loaded[id].info;
        byId.set(id, Object.assign(byId.get(id) ?? { id, title }, { bpm: info.bpm, key: info.key, duration: info.duration }));
      }
    } catch {
      retainTracks([]);
      continue;
    }
    const a = byId.get(pick.A)!;
    const b = pick.B ? byId.get(pick.B) : pick.partner ? byId.get(pick.partner) : undefined;
    const fits = missionNeeds ? pickFits(mission.id, a, b) : true;
    if (!fits) {
      retainTracks([]);
      continue;
    }
    const tracks: Partial<Record<DeckId, TrackInfo>> = { A: loaded[pick.A].info };
    if (pick.B) tracks.B = loaded[pick.B].info;
    const partner = pick.partner ? loaded[pick.partner].info : null;
    // The partner was only loaded to prove the mission can be done; let it go.
    retainTracks(ids.filter((id) => id !== pick.partner).map(libraryTrackId));
    return { ok: true, setup: adaptSetup(mission, tracks), lines: describePick(tracks, partner), tracks };
  }
  const why = songs.length === 0 ? "Your library is empty" : songs.length < needs.decks.length + (needs.partner ? 1 : 0) ? "Your library doesn't have enough songs" : "No songs in your library fit this mission's needs";
  return { ok: false, reason: `${why} (${needs.why.charAt(0).toLowerCase()}${needs.why.slice(1)}), so the demo songs are used.` };
}
