import Link from "next/link";
import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import RemixDetailPlayer from "@/components/RemixDetailPlayer";
import RemixOwnerControls from "@/components/RemixOwnerControls";
import RemixStatsBar from "@/components/RemixStatsBar";
import RemixComments from "@/components/RemixComments";
import ReportButton from "@/components/ReportButton";
import RemixCredits from "@/components/RemixCredits";
import { getRemixCredits } from "@/lib/credits";
import { getArtistProgress, getComments } from "@/lib/social";
import { getRemixCard, getRemixStats } from "@/lib/models";
import type { Metadata } from "next";

type RemixRow = {
  id: string;
  title: string;
  published: boolean;
  created_at: string;
  owner_id: string;
  artist_name: string;
  artist_id: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const remix = await getRemixCard((await params).id);
  if (!remix?.published) return { title: "Remix — Remixt" };
  const from = remix.source_titles.length ? ` Built from ${remix.source_titles.slice(0, 3).join(" + ")}.` : "";
  const description = `Listen to “${remix.title}”, a remix by ${remix.artist_name} on Remixt.${from}`;
  return {
    title: `${remix.title} — remix by ${remix.artist_name} · Remixt`,
    description,
    openGraph: { title: remix.title, description, type: "music.song", siteName: "Remixt" },
    twitter: { card: "summary_large_image", title: remix.title, description },
  };
}

export default async function RemixDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await sql<RemixRow[]>`
    SELECT remixes.*, users.artist_name, users.id as artist_id
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.id = ${id}
  `;
  const remix = rows[0];

  if (!remix) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === remix.owner_id;

  if (!remix.published && !isOwner) notFound();
  const [stats, comments, artistProgress, credits] = await Promise.all([
    getRemixStats(remix.id, user?.id ?? null),
    getComments(remix.id),
    getArtistProgress(remix.artist_id),
    getRemixCredits(remix.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{remix.title}</h1>
          <p className="mt-1 text-sm text-muted">
            by{" "}
            <Link href={`/artist/${remix.artist_id}`} className="text-brand-strong hover:underline">
              {remix.artist_name}
            </Link>
            {artistProgress && (
              <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[11px]">
                Lv {artistProgress.level.level} · {artistProgress.level.title}
              </span>
            )}
          </p>
        </div>
        {isOwner ? (
          <RemixOwnerControls remixId={remix.id} initialPublished={remix.published} initialTags={credits.tags} />
        ) : (
          <ReportButton kind="remix" targetId={remix.id} signedIn={!!user} />
        )}
      </div>

      <RemixCredits credits={credits} />

      <RemixStatsBar remixId={remix.id} title={remix.title} initial={stats} signedIn={!!user} />

      <RemixDetailPlayer remixId={remix.id} title={remix.title} artistName={remix.artist_name} user={user} />

      <RemixComments remixId={remix.id} initial={comments} userId={user?.id ?? null} isRemixOwner={isOwner} />
    </div>
  );
}
