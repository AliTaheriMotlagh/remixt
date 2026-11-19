import { Megaphone, Music } from "lucide-react";
import sql from "@/lib/db";
import { stemCoverUrl } from "@/lib/cover";
import { promoteToken } from "@/lib/monetize/store";
import { pickPromoted } from "@/lib/monetize/adStore";
import SeenOnce from "./SeenOnce";

// A song its uploader paid to promote: first in the library, marked
// "Promoted" (see PromotedRemix — the same rules). Its click finds the song
// in the library.
export default async function PromotedSong({ lang = "en" }: { lang?: "en" | "fa" }) {
  const found = await pickPromoted(lang, "track").catch(() => null);
  if (!found?.target) return null;
  const [song] = await sql<{ id: string; title: string; artist_name: string; stem: string | null }[]>`
    SELECT t.id, t.title, u.artist_name, (SELECT s.id FROM stems s WHERE s.track_id = t.id ORDER BY s.kind LIMIT 1) AS stem
    FROM tracks t JOIN users u ON u.id = t.owner_id WHERE t.id = ${found.target.id} AND t.status = 'ready'
  `.catch(() => []);
  if (!song) return null;
  const token = promoteToken(found.target, found.campaign.id);
  return (
    <SeenOnce token={token} className="mt-6">
      <a
        href={`/api/ads/click?t=${encodeURIComponent(token)}`}
        className="flex items-center gap-4 rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/15 via-surface to-surface p-4 transition-colors hover:border-brand"
      >
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-vocals-dim to-beat-dim">
          <Music className="h-6 w-6 text-white/80" />
          {song.stem && (
            // eslint-disable-next-line @next/next/no-img-element -- our own route; 204 (no cover) leaves the note showing
            <img src={stemCoverUrl(song.stem)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-strong">
            <Megaphone className="h-3 w-3" /> Promoted song
          </span>
          <span className="mt-1 block truncate font-semibold">{song.title}</span>
          <span className="block truncate text-sm text-muted">uploaded by {song.artist_name}</span>
        </span>
      </a>
    </SeenOnce>
  );
}
