import Link from "next/link";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";

type Tab = "latest" | "trending" | "following";

const TABS: { id: Tab; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "trending", label: "🔥 Trending" },
  { id: "following", label: "Following" },
];

type RemixRow = {
  id: string;
  title: string;
  created_at: string;
  artist_name: string;
  artist_id: string;
  lane_count: number;
  source_titles: string | null;
  play_count: number;
  like_count: number;
  tags: string[];
};

function tabHref(tab: Tab, tag: string | null) {
  const params = new URLSearchParams();
  if (tab !== "latest") params.set("tab", tab);
  if (tag) params.set("tag", tag);
  const query = params.toString();
  return query ? `/remixes?${query}` : "/remixes";
}

export default async function RemixesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tag?: string }>;
}) {
  const { tab: requested, tag: tagParam } = await searchParams;
  const tab: Tab = requested === "trending" || requested === "following" ? requested : "latest";
  const tag = tagParam?.trim().toLowerCase() || null;
  await ensureSchema();
  const popularTags = await sql<{ tag: string; n: number }[]>`
    SELECT tag, COUNT(*)::int AS n FROM remixes, UNNEST(remixes.tags) AS tag
    WHERE remixes.published GROUP BY tag ORDER BY n DESC, tag LIMIT 16
  `;
  const user = tab === "following" ? await getCurrentUser() : null;
  const needsSignIn = tab === "following" && !user;

  // Latest: newest first. Trending: likes (×2) and comments from others in
  // the last 7 days. Following: new remixes by artists you follow.
  const remixes = needsSignIn
    ? []
    : await sql<RemixRow[]>`
    SELECT remixes.id, remixes.title, remixes.created_at, users.artist_name, users.id as artist_id,
           COUNT(DISTINCT remix_lanes.id)::int as lane_count,
           STRING_AGG(DISTINCT tracks.title, ',') as source_titles,
           remixes.play_count, remixes.tags,
           (SELECT COUNT(*) FROM remix_likes WHERE remix_likes.remix_id = remixes.id)::int as like_count
    FROM remixes
    JOIN users ON users.id = remixes.owner_id
    LEFT JOIN remix_lanes ON remix_lanes.remix_id = remixes.id
    LEFT JOIN stems ON stems.id = remix_lanes.stem_id
    LEFT JOIN tracks ON tracks.id = stems.track_id
    WHERE remixes.published = true
      ${tag ? sql`AND ${tag} = ANY(remixes.tags)` : sql``}
      ${
        tab === "following"
          ? sql`AND remixes.owner_id IN (SELECT followee_id FROM follows WHERE follower_id = ${user!.id})`
          : sql``
      }
    GROUP BY remixes.id, users.artist_name, users.id
    ORDER BY ${
      tab === "trending"
        ? sql`(2 * (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id
                 AND l.user_id <> remixes.owner_id AND l.created_at > now() - interval '7 days')
               + (SELECT COUNT(*) FROM remix_comments c WHERE c.remix_id = remixes.id
                 AND c.user_id <> remixes.owner_id AND c.created_at > now() - interval '7 days')) DESC,
              remixes.created_at DESC`
        : sql`remixes.created_at DESC`
    }
  `;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Remixes</h1>
      <p className="mt-1 text-sm text-muted">
        Published remixes from the community — mixes of vocals and beats
        pulled from different songs.
      </p>

      <div className="mt-6 flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id, tag)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id ? "bg-brand text-white" : "border border-border text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {(popularTags.length > 0 || tag) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tag && !popularTags.some((t) => t.tag === tag) && (
            <span className="rounded-full bg-brand px-2.5 py-1 text-xs text-white">#{tag}</span>
          )}
          {popularTags.map((t) => (
            <Link
              key={t.tag}
              href={tabHref(tab, tag === t.tag ? null : t.tag)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                tag === t.tag ? "bg-brand text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              #{t.tag}
            </Link>
          ))}
          {tag && (
            <Link href={tabHref(tab, null)} className="px-1 text-xs text-muted hover:text-foreground">
              clear ✕
            </Link>
          )}
        </div>
      )}

      {needsSignIn ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          <Link href="/login?next=/remixes?tab=following" className="text-brand-strong hover:underline">
            Sign in
          </Link>{" "}
          to see remixes from artists you follow.
        </div>
      ) : remixes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          {tab === "following" ? (
            <>
              Nothing from artists you follow yet. Find some on the{" "}
              <Link href="/leaderboard" className="text-brand-strong hover:underline">
                leaderboard
              </Link>
              .
            </>
          ) : (
            <>
              {tag ? `Nothing tagged #${tag} yet.` : "No published remixes yet."}{" "}
              <Link href="/studio" className="text-brand-strong hover:underline">
                Build the first one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {remixes.map((remix) => (
            <Link
              key={remix.id}
              href={`/remixes/${remix.id}`}
              className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand/50 hover:bg-surface-hover"
            >
              <div className="mb-3 flex h-20 items-center justify-center gap-1 overflow-hidden rounded-lg bg-gradient-to-br from-vocals-dim to-beat-dim">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-white/40 group-hover:bg-white/70"
                    style={{ height: `${20 + Math.sin(i * 1.3) * 15 + 15}%` }}
                  />
                ))}
              </div>
              <h3 className="font-semibold">{remix.title}</h3>
              <p className="mt-1 text-sm text-muted">by {remix.artist_name}</p>
              {remix.source_titles && (
                <p className="mt-2 truncate text-xs text-muted">
                  from {remix.source_titles.split(",").join(" + ")}
                </p>
              )}
              {remix.tags?.length > 0 && (
                <p className="mt-2 truncate text-[11px] text-brand-strong">
                  {remix.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}
                </p>
              )}
              <p className="mt-3 flex gap-3 text-xs text-muted tabular-nums">
                <span title="Plays">▶ {remix.play_count}</span>
                <span title="Likes">♥ {remix.like_count}</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
