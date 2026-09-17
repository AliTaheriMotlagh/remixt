import Link from "next/link";
import sql from "@/lib/db";

type RemixRow = {
  id: string;
  title: string;
  created_at: string;
  artist_name: string;
  artist_id: string;
  lane_count: number;
  source_titles: string | null;
};

export default async function RemixesPage() {
  const remixes = await sql<RemixRow[]>`
    SELECT remixes.id, remixes.title, remixes.created_at, users.artist_name, users.id as artist_id,
           COUNT(DISTINCT remix_lanes.id)::int as lane_count,
           STRING_AGG(DISTINCT tracks.title, ',') as source_titles
    FROM remixes
    JOIN users ON users.id = remixes.owner_id
    LEFT JOIN remix_lanes ON remix_lanes.remix_id = remixes.id
    LEFT JOIN stems ON stems.id = remix_lanes.stem_id
    LEFT JOIN tracks ON tracks.id = stems.track_id
    WHERE remixes.published = true
    GROUP BY remixes.id, users.artist_name, users.id
    ORDER BY remixes.created_at DESC
  `;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">Remixes</h1>
      <p className="mt-1 text-sm text-muted">
        Published remixes from the community — mixes of vocals and beats
        pulled from different songs.
      </p>

      {remixes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          No published remixes yet.{" "}
          <Link href="/studio" className="text-brand-strong hover:underline">
            Build the first one
          </Link>
          .
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
