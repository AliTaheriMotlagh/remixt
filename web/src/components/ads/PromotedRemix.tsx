import { Megaphone, Play } from "lucide-react";
import sql from "@/lib/db";
import { coverUrl } from "@/lib/models";
import { promoteToken } from "@/lib/monetize/store";
import { pickPromoted } from "@/lib/monetize/adStore";
import SeenOnce from "./SeenOnce";

// A remix its maker paid to promote (like SoundCloud Promote): first in the
// remixes list, marked "Promoted". Picked like an ad (dearer bids show more
// often, only while budget lasts), paid per view, all to Remixt. Its click
// goes through /api/ads/click (counted for the promoter) to the remix.
export default async function PromotedRemix({ lang = "en", not = [] }: { lang?: "en" | "fa"; not?: string[] }) {
  const found = await pickPromoted(lang, "remix").catch(() => null);
  if (!found?.target) return null;
  const [remix] = await sql<{ id: string; title: string; cover_key: string | null; artist_name: string }[]>`
    SELECT r.id, r.title, r.cover_key, u.artist_name
    FROM remixes r JOIN users u ON u.id = r.owner_id WHERE r.id = ${found.target.id} AND r.published
  `.catch(() => []);
  if (!remix || not.includes(remix.id)) return null;
  const token = promoteToken(found.target, found.campaign.id);
  const cover = coverUrl(remix.id, remix.cover_key);
  return (
    <SeenOnce token={token}>
      <a
        href={`/api/ads/click?t=${encodeURIComponent(token)}`}
        className="group flex items-center gap-4 rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/15 via-surface to-surface p-4 transition-colors hover:border-brand"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own storage route
          <img src={cover} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vocals-dim to-beat-dim">
            <Play className="h-6 w-6 text-white/80" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-strong">
            <Megaphone className="h-3 w-3" /> Promoted
          </span>
          <span className="mt-1 block truncate font-semibold">{remix.title}</span>
          <span className="block truncate text-sm text-muted">by {remix.artist_name}</span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-brand px-3.5 py-2 text-sm font-semibold text-white sm:inline">Listen</span>
      </a>
    </SeenOnce>
  );
}
