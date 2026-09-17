import Link from "next/link";
import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";
import ArtistBioEditor from "@/components/ArtistBioEditor";

type ArtistRow = {
  id: string;
  artist_name: string;
  bio: string;
  avatar_color: string;
  created_at: string;
};

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artistRows = await sql<ArtistRow[]>`
    SELECT id, artist_name, bio, avatar_color, created_at FROM users WHERE id = ${id}
  `;
  const artist = artistRows[0];

  if (!artist) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === artist.id;

  const ownedTracks = await getTracksByOwner(artist.id);
  const tracks = await Promise.all(
    ownedTracks.map(async (t) => ({
      ...t,
      stems: t.status === "ready" ? await getStemsByTrack(t.id) : [],
    }))
  );

  const remixes = await sql<
    { id: string; title: string; published: boolean; created_at: string }[]
  >`
    SELECT id, title, published, created_at FROM remixes
    WHERE owner_id = ${artist.id} AND (published = true OR ${isOwner})
    ORDER BY created_at DESC
  `;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-4">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black text-white"
          style={{ background: artist.avatar_color }}
        >
          {artist.artist_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{artist.artist_name}</h1>
          <p className="text-sm text-muted">
            Joined {new Date(artist.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-4 max-w-xl">
        {isOwner ? (
          <ArtistBioEditor initialBio={artist.bio} />
        ) : (
          <p className="text-sm text-muted">{artist.bio || "No bio yet."}</p>
        )}
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          Remixes {remixes.length > 0 && `(${remixes.length})`}
        </h2>
        {remixes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No remixes yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {remixes.map((remix) => (
              <Link
                key={remix.id}
                href={`/remixes/${remix.id}`}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/50 hover:bg-surface-hover"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium">{remix.title}</h3>
                  {!remix.published && (
                    <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted">
                      Private
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          Uploaded tracks {tracks.length > 0 && `(${tracks.length})`}
        </h2>
        {tracks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No uploads yet.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
              >
                <span className="font-medium">{track.title}</span>
                <span className="text-xs text-muted">
                  {track.status === "ready"
                    ? "Vocals + Beat available"
                    : track.status === "processing"
                    ? "Splitting…"
                    : "Split failed"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
