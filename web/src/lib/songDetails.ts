// A song's details as one short line — "Hichkas · Jangale Asfalt (2006) ·
// Rap" — from what its uploader filled in (Upload → Details). Null when
// nothing was. Pure.

export function songDetailsLine(t: { track_song_artist?: string | null; track_album?: string | null; track_year?: number | null; track_genre?: string | null }): string | null {
  const album = t.track_album ? `${t.track_album}${t.track_year ? ` (${t.track_year})` : ""}` : t.track_year ? String(t.track_year) : null;
  const parts = [t.track_song_artist, album, t.track_genre].map((p) => (typeof p === "string" ? p.trim() : p)).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
