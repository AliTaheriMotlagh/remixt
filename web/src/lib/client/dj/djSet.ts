// A recorded DJ set: its track list as text (for the file's comment and a
// .txt beside it) and the credits it's tagged with. Pure (see
// djSetExport.ts for the file itself); tested in tests/dj-pick.test.ts.

import type { TrackCredit } from "../audioTags";

export type SetTrack = { at: number; title: string; artist: string };

/** "4:05" or "1:02:09". */
export function setClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** One line per song: "0:00 Title — Artist". */
export function setListText(tracks: SetTrack[]) {
  return tracks.map((t) => `${setClock(t.at)} ${t.title}${t.artist ? ` — ${t.artist}` : ""}`).join("\n");
}

/** The set's songs as the file's credits, each with the time it came in. */
export function setCredits(tracks: SetTrack[]): TrackCredit[] {
  return tracks.map((t) => ({ role: setClock(t.at), track: t.title, artist: t.artist }));
}

/** Longer than this, a set isn't turned into an MP3 here: decoding it whole would take more memory than a page should (≈420 MB at 20 min). */
export const MP3_SET_LIMIT_SECONDS = 20 * 60;
