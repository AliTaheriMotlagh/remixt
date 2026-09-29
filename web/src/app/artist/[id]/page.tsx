import Link from "next/link";
import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";
import ArtistBioEditor from "@/components/ArtistBioEditor";
import ArtistProgressCard from "@/components/ArtistProgressCard";
import FollowButton from "@/components/FollowButton";
import { getArtistProgress, getFollowState } from "@/lib/social";
import type { Metadata } from "next";
import { JsonLd, pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

type ArtistRow = {
  id: string;
  artist_name: string;
  bio: string;
  avatar_color: string;
  created_at: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [artist] = await sql<{ artist_name: string; bio: string; published: number }[]>`
    SELECT artist_name, bio,
           (SELECT COUNT(*) FROM remixes WHERE owner_id = users.id AND published)::int AS published
    FROM users WHERE id = ${id}
  `;
  if (!artist) return { title: "Artist not found" };
  const description =
    artist.bio?.trim() ||
    `Listen to ${artist.published} remix${artist.published === 1 ? "" : "es"} by ${artist.artist_name} on Remixt, and remix their vocals and beats.`;
  return pageMetadata({
    title: `${artist.artist_name} — remixes & stems`,
    description,
    path: `/artist/${id}`,
    type: "profile",
    // A profile with nothing published is a thin page; keep it out of search.
    noindex: artist.published === 0,
  });
}

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

  const [follow, progress] = await Promise.all([
    getFollowState(artist.id, currentUser?.id ?? null),
    getArtistProgress(artist.id),
  ]);

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

  const published = remixes.filter((r) => r.published);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: absoluteUrl(`/artist/${artist.id}`),
          dateCreated: new Date(artist.created_at).toISOString(),
          mainEntity: {
            "@type": "Person",
            name: artist.artist_name,
            description: artist.bio || undefined,
            url: absoluteUrl(`/artist/${artist.id}`),
          },
          hasPart: published.slice(0, 20).map((r) => ({
            "@type": "MusicRecording",
            name: r.title,
            url: absoluteUrl(`/remixes/${r.id}`),
          })),
        }}
      />
      <div className="flex items-center gap-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black text-white"
          style={{ background: artist.avatar_color }}
        >
          {artist.artist_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold">{artist.artist_name}</h1>
          <p className="text-sm text-muted">
            {progress && `Level ${progress.level.level} ${progress.level.title} · `}
            Joined {new Date(artist.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <FollowButton artistId={artist.id} initial={follow} signedIn={!!currentUser} isSelf={isOwner} />
      </div>

      <div className="mt-4 max-w-xl">
        {isOwner ? (
          <ArtistBioEditor initialBio={artist.bio} />
        ) : (
          <p className="text-sm text-muted">{artist.bio || "No bio yet."}</p>
        )}
      </div>

      {progress && <ArtistProgressCard progress={progress} isOwner={isOwner} />}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          Remixes {remixes.length > 0 && `(${remixes.length})`}
        </h2>
        {remixes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No remixes yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <span className="min-w-0 truncate font-medium">{track.title}</span>
                <span className="shrink-0 text-right text-xs text-muted">
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
