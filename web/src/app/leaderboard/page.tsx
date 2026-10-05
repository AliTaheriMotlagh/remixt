import Link from "next/link";
import { Flame, Headphones, Heart, MessageCircle, Pickaxe, Play, type LucideIcon } from "lucide-react";
import { PlaceMedal } from "@/components/Icon";
import type { Metadata } from "next";
import { coverUrl } from "@/lib/models";
import { rankedRemixes, topArtists, type RankedRemix } from "@/lib/social";
import { pageMetadata } from "@/lib/seo";
import { topMiners } from "@/lib/splitQueue";

export const metadata: Metadata = pageMetadata({
  title: "Top remix artists & trending remixes",
  description: "The top remix artists on Remixt, and the remixes everyone's listening to this week.",
  path: "/leaderboard",
});

function Rank({ index }: { index: number }) {
  return (
    <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-muted">
      <PlaceMedal rank={index + 1} className="text-base" />
    </span>
  );
}

/** The remix's cover, or a gradient tile with its initial when it has none. */
function RemixThumb({ remix }: { remix: RankedRemix }) {
  const cover = coverUrl(remix.id, remix.cover_key);
  return (
    <Link href={`/remixes/${remix.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own storage route, already square and small
        <img src={cover} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-vocals-dim to-beat-dim text-sm font-bold text-white/80">
          {remix.title.slice(0, 1).toUpperCase()}
        </span>
      )}
    </Link>
  );
}

function RemixBoard({
  icon: BoardIcon,
  title,
  hint,
  remixes,
  metric,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  remixes: RankedRemix[];
  metric: (r: RankedRemix) => React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">
        <BoardIcon className="text-brand-strong" /> {title}
      </h2>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      {remixes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {remixes.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2">
              <Rank index={i} />
              <RemixThumb remix={r} />
              <div className="min-w-0 flex-1">
                <Link href={`/remixes/${r.id}`} className="block truncate text-sm font-medium hover:underline">
                  {r.title}
                </Link>
                <Link href={`/artist/${r.artist_id}`} className="block truncate text-xs text-muted hover:underline">
                  {r.artist_name}
                </Link>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">{metric(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function LeaderboardPage() {
  const [artists, trending, played, miners] = await Promise.all([
    topArtists(20),
    rankedRemixes("trending", 10),
    rankedRemixes("played", 10),
    topMiners(10),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted">
        Earn XP by publishing remixes, uploading songs, mining (splitting songs for people on phones), and getting likes,
        plays and followers. Level up and collect badges.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Top artists</h2>
          <p className="mt-0.5 text-xs text-muted">By XP, all time</p>
          {artists.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No artists yet.{" "}
              <Link href="/upload" className="text-brand-strong hover:underline">
                Upload a song
              </Link>{" "}
              to get on the board.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {artists.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3">
                  <Rank index={i} />
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white"
                    style={{ background: a.avatar_color }}
                  >
                    {a.artist_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/artist/${a.id}`} className="block truncate text-sm font-medium hover:underline">
                      {a.artist_name}
                    </Link>
                    <span className="text-xs text-muted">
                      Lv {a.level.level} {a.level.title} · {a.badges} badge{a.badges === 1 ? "" : "s"} · {a.published} remix
                      {a.published === 1 ? "" : "es"}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{a.level.xp.toLocaleString()} XP</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <RemixBoard
            icon={Flame}
            title="Trending this week"
            hint="Most liked and talked about in the last 7 days"
            remixes={trending}
            metric={(r) => (
              <>
                <Heart /> {r.likes} · <MessageCircle /> {r.comments}
              </>
            )}
          />
          <RemixBoard
            icon={Headphones}
            title="Most played"
            hint="All time"
            remixes={played}
            metric={(r) => (
              <>
                <Play /> {r.plays.toLocaleString()}
              </>
            )}
          />
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">
              <Pickaxe className="text-brand-strong" /> Top miners this week
            </h2>
            <p className="mt-0.5 text-xs text-muted">XP from splitting songs for people on phones, last 7 days</p>
            {miners.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Nobody yet this week —{" "}
                <Link href="/upload" className="text-brand-strong hover:underline">
                  start mining
                </Link>{" "}
                on a computer to take the top spot.
              </p>
            ) : (
              <ol className="mt-4 flex flex-col gap-2">
                {miners.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Rank index={i} />
                    <Link href={`/artist/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {m.artist_name}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {m.songs} song{m.songs === 1 ? "" : "s"} · {m.xp} XP
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
