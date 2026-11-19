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
import RemixCover from "@/components/RemixCover";
import AdCard from "@/components/ads/AdCard";
import PrerollGate from "@/components/ads/PrerollGate";
import WhereTheMoneyGoes from "@/components/ads/WhereTheMoneyGoes";
import WrongInfoButton from "@/components/WrongInfoButton";
import { remixAds } from "@/lib/monetize/adStore";
import { namesFor, remixParties } from "@/lib/monetize/store";
import { remixShares } from "@/lib/monetize/policy";
import { getRemixCredits } from "@/lib/credits";
import { getArtistProgress, getComments } from "@/lib/social";
import { coverUrl, ensureRemixStats, getRemixCard, getRemixStats, shareImageUrl } from "@/lib/models";
import type { Metadata } from "next";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_NAME, absoluteUrl, remixDescription } from "@/lib/site";

type RemixRow = {
  id: string;
  title: string;
  published: boolean;
  created_at: string;
  owner_id: string;
  artist_name: string;
  artist_id: string;
  cover_key: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const remix = await getRemixCard(id);
  // Private (or missing): nothing to show a search engine.
  if (!remix?.published) return { title: "Remix", robots: { index: false } };
  const description = remixDescription(remix.title, remix.artist_name, remix.source_titles);
  return pageMetadata({
    title: `${remix.title} — remix by ${remix.artist_name}`,
    description,
    path: `/remixes/${id}`,
    type: "music.song",
    // The card this route draws (opengraph-image.tsx), named outright:
    // setting openGraph here would otherwise drop it.
    image: { url: shareImageUrl(id, remix.cover_key), width: 1200, height: 630, alt: `${remix.title} — remix by ${remix.artist_name}` },
  });
}

export default async function RemixDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await ensureRemixStats();
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
  const [stats, comments, artistProgress, credits, ads, parties] = await Promise.all([
    getRemixStats(remix.id, user?.id ?? null),
    getComments(remix.id),
    getArtistProgress(remix.artist_id),
    getRemixCredits(remix.id),
    // Ads never break the page: on any trouble, as if they were off.
    remixAds(remix.id).catch(() => null),
    remixParties(remix.id).catch(() => null),
  ]);
  const shares = parties ? await namesFor(remixShares(parties)).catch(() => []) : [];

  const url = absoluteUrl(`/remixes/${remix.id}`);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      {remix.published && (
        <JsonLd
          data={[{
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            name: remix.title,
            url,
            // The square cover first (what search results show beside a song), then the share card.
            image: [coverUrl(remix.id, remix.cover_key), shareImageUrl(remix.id, remix.cover_key)]
              .filter((src): src is string => !!src)
              .map((src) => absoluteUrl(src)),
            datePublished: new Date(remix.created_at).toISOString(),
            byArtist: { "@type": "Person", name: remix.artist_name, url: absoluteUrl(`/artist/${remix.artist_id}`) },
            genre: credits.tags.length ? credits.tags : undefined,
            interactionStatistic: [
              { "@type": "InteractionCounter", interactionType: "https://schema.org/ListenAction", userInteractionCount: stats.plays },
              { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: stats.likes },
              { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: comments.length },
            ],
            isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absoluteUrl("/") },
          },
          breadcrumbJsonLd([
            { name: "Remixes", path: "/remixes" },
            { name: remix.title, path: `/remixes/${remix.id}` },
          ]),
          ]}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <RemixCover remixId={remix.id} src={coverUrl(remix.id, remix.cover_key)} title={remix.title} artist={remix.artist_name} editable={isOwner} />
          <div className="min-w-0 pt-1">
          <h1 className="text-2xl font-bold">{remix.title}</h1>
          <p className="mt-1 text-sm text-muted">
            by{" "}
            <Link
              href={`/artist/${remix.artist_id}`}
              className="text-brand-strong underline decoration-brand-strong/40 underline-offset-2 hover:decoration-brand-strong"
            >
              {remix.artist_name}
            </Link>
            {artistProgress && (
              <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[11px]">
                Lv {artistProgress.level.level} · {artistProgress.level.title}
              </span>
            )}
          </p>
          </div>
        </div>
        {isOwner ? (
          <RemixOwnerControls remixId={remix.id} initialPublished={remix.published} initialTags={credits.tags} />
        ) : (
          <ReportButton kind="remix" targetId={remix.id} signedIn={!!user} />
        )}
      </div>

      <RemixCredits credits={credits} remixId={remix.id} />
      <div className="mt-2 flex justify-end">
        <WrongInfoButton kind="remix" id={remix.id} title={remix.title} />
      </div>

      <RemixStatsBar remixId={remix.id} title={remix.title} initial={stats} signedIn={!!user} />

      <RemixDetailPlayer
        remixId={remix.id}
        title={remix.title}
        artistName={remix.artist_name}
        cover={coverUrl(remix.id, remix.cover_key)}
        user={user}
      />

      {/* The audio ad before it plays, where its maker (or an artist's Monetize) allows one. */}
      {remix.published && ads?.on && ads.kinds.includes("preroll") && !isOwner && <PrerollGate remixId={remix.id} />}

      {/* This remix's spot: a view pays its remixer(s), the songs' artists and the site (lib/monetize/policy.ts). */}
      {remix.published && ads?.on && ads.kinds.includes("card") && (
        <AdCard placement="remix" target={`remix:${remix.id}`} seed={remix.title.length} className="mt-6" />
      )}
      {remix.published && ads && shares.length > 0 && <WhereTheMoneyGoes shares={shares} ads={ads} remixId={remix.id} isOwner={isOwner} />}

      <RemixComments remixId={remix.id} initial={comments} userId={user?.id ?? null} isRemixOwner={isOwner} />
    </div>
  );
}
