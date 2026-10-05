import Link from "next/link";
import { coverUrl } from "@/lib/models";
import type { FeaturedRemix } from "@/lib/social";

/** The day's spotlight remix, with a straight route into remixing it. */
export default function RemixOfTheDay({ remix }: { remix: FeaturedRemix }) {
  const cover = coverUrl(remix.id, remix.cover_key);
  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/20 via-surface to-vocals/15">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <Link href={`/remixes/${remix.id}`} className="shrink-0">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own storage route, already square and small
            <img src={cover} alt="" className="aspect-square w-full rounded-xl object-cover shadow-lg sm:w-32" />
          ) : (
            <span className="flex aspect-[3/1] w-full items-center justify-center rounded-xl bg-gradient-to-br from-vocals-dim to-beat-dim text-5xl shadow-lg sm:aspect-square sm:w-32">
              🏆
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wider text-brand-strong uppercase">⭐ Remix of the day</p>
          <Link href={`/remixes/${remix.id}`} className="mt-1 block truncate text-xl font-bold hover:underline">
            {remix.title}
          </Link>
          <p className="text-sm text-muted">
            by{" "}
            <Link href={`/artist/${remix.artist_id}`} className="hover:text-foreground hover:underline">
              {remix.artist_name}
            </Link>
            <span className="ml-2 tabular-nums">
              ▶ {remix.plays} · ♥ {remix.likes}
            </span>
          </p>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <Link href={`/remixes/${remix.id}`} className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-strong">
            ▶ Listen
          </Link>
          <Link href={`/studio?remix=${remix.id}`} className="flex-1 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-center text-sm font-semibold hover:bg-surface-hover">
            🎛 Remix it
          </Link>
        </div>
      </div>
    </section>
  );
}
