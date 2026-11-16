import { clipEnd, clipStart, clipsOf } from "./clipEdit";
import { isBacking } from "@/lib/stemKinds";
import type { AutoPoint, StudioLane } from "./studioStore";

// Songs together. A mix can hold the lines of two or more songs — each
// with its own vocal and its own beat (or drums, bass and melody) — and
// remixing them together is a plan for who plays when: one song's vocal
// over the other's beat, both singers taking turns, or a DJ blend from
// one song into the next. This is the pure part: which lanes belong to
// which song, and when each one is actually heard (see aiIdeas.ts for the
// ideas, ai/MashupMap.tsx for the picture).

/** A recording's title without the Studio's "(split)" note, for telling songs apart. */
function titleOf(lane: StudioLane) {
  return lane.trackTitle.replace(/\s*\(split\)$/i, "").trim().toLowerCase();
}

/** The lane id of a vocal layer's lead (doubles, octaves follow it). */
function leadOfLayer(laneId: string) {
  const at = laneId.indexOf("~layer-");
  return at > 0 ? laneId.slice(0, at) : null;
}

/** Whether two lanes are lines of one recording: the same title, at the same tempo. */
export function sameSong(a: StudioLane, b: StudioLane) {
  if (titleOf(a) !== titleOf(b)) return false;
  return !a.bpm || !b.bpm || Math.abs(Math.log(a.bpm / b.bpm)) < 0.01;
}

/** A song in the mix: its lines, the vocal and what backs it. */
export type MixSong = {
  id: string;
  title: string;
  /** Its vocals (not their layers), the lead first. */
  vocals: StudioLane[];
  /** Its beat, or its drums, bass and melody. */
  backing: StudioLane[];
  /** Every lane of it, layers included. */
  lanes: StudioLane[];
};

/** The songs the lanes belong to, in the order they first appear. A recorded take is a song of its own. */
export function songsOf(lanes: StudioLane[]): MixSong[] {
  const songs: MixSong[] = [];
  for (const lane of lanes) {
    const lead = leadOfLayer(lane.laneId);
    const owner = lead ? lanes.find((l) => l.laneId === lead) ?? lane : lane;
    // A lane carved out of another (a part of it in a section) belongs with where it came from.
    const origin = lanes.find((l) => owner.laneId.startsWith(`${l.laneId}~`)) ?? owner;
    let song = songs.find((s) => s.lanes.some((l) => l.laneId === origin.laneId || sameSong(l, origin)));
    if (!song) {
      song = { id: origin.laneId, title: lane.trackTitle.replace(/\s*\(split\)$/i, ""), vocals: [], backing: [], lanes: [] };
      songs.push(song);
    }
    song.lanes.push(lane);
    if (lead) continue;
    if (lane.kind === "vocals") song.vocals.push(lane);
    else if (isBacking(lane.kind)) song.backing.push(lane);
  }
  return songs;
}

/** The songs that could be remixed together: those with a vocal or a backing of their own. Two or more makes a mashup. */
export function mashableSongs(lanes: StudioLane[]) {
  return songsOf(lanes).filter((s) => s.vocals.length || s.backing.length);
}

/** The line a song's backing is led by: its full beat, else its drums, else whatever it has. */
export function mainBacking(song: MixSong) {
  return song.backing.find((l) => l.kind === "beat") ?? song.backing.find((l) => l.kind === "drums") ?? song.backing[0] ?? null;
}

/** Below this, an automated level counts as silent. */
const SILENT = 0.05;

/** Where a lane's drawn volume is up: the stretches between its silences (the whole timeline without any). */
function volumeOpen(points: AutoPoint[] | undefined, length: number): { start: number; end: number }[] {
  if (!points?.length) return [{ start: 0, end: length }];
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: { start: number; end: number }[] = [];
  let openAt: number | null = sorted[0].v > SILENT ? 0 : null;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const up = b.v > SILENT;
    const wasUp = a.v > SILENT;
    if (up === wasUp) continue;
    // Where the line between them crosses the threshold.
    const t = a.t + ((SILENT - a.v) / (b.v - a.v)) * (b.t - a.t);
    if (up) openAt = t;
    else if (openAt !== null) {
      out.push({ start: openAt, end: t });
      openAt = null;
    }
  }
  if (openAt !== null) out.push({ start: openAt, end: length });
  return out;
}

/** When a lane is heard on the timeline: its clips that aren't muted, where its drawn volume is up. Empty when muted. */
export function heardSpans(lane: StudioLane): { start: number; end: number }[] {
  if (lane.muted || lane.volume <= 0) return [];
  const clips = clipsOf(lane)
    .filter((c) => !c.muted)
    .map((c) => ({ start: clipStart(lane, c), end: clipEnd(lane, c) }))
    .sort((a, b) => a.start - b.start);
  const length = Math.max(0, ...clips.map((c) => c.end));
  const open = volumeOpen(lane.automation?.volume, length);
  const spans: { start: number; end: number }[] = [];
  for (const c of clips) {
    for (const o of open) {
      const start = Math.max(c.start, o.start);
      const end = Math.min(c.end, o.end);
      if (end - start > 0.05) spans.push({ start, end });
    }
  }
  // Clips that touch are one stretch.
  const merged: { start: number; end: number }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < 0.25) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

/** Seconds two lanes are heard at once. */
export function overlapSeconds(a: StudioLane, b: StudioLane) {
  const sa = heardSpans(a);
  const sb = heardSpans(b);
  let total = 0;
  for (const x of sa) for (const y of sb) total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  return total;
}

export type PlayRow = { songId: string; title: string; part: "Vocal" | "Music"; spans: { start: number; end: number }[] };

/** Who plays when: a row for each song's vocal and each song's music, with the stretches each is heard. */
export function whoPlaysWhen(lanes: StudioLane[]): PlayRow[] {
  const rows: PlayRow[] = [];
  for (const song of songsOf(lanes)) {
    for (const [part, of] of [
      ["Vocal", song.lanes.filter((l) => l.kind === "vocals")],
      ["Music", song.lanes.filter((l) => isBacking(l.kind))],
    ] as const) {
      if (!of.length) continue;
      const spans = of.flatMap(heardSpans).sort((a, b) => a.start - b.start);
      const merged: { start: number; end: number }[] = [];
      for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s.start - last.end < 0.25) last.end = Math.max(last.end, s.end);
        else merged.push({ ...s });
      }
      rows.push({ songId: song.id, title: song.title, part, spans: merged });
    }
  }
  return rows;
}
