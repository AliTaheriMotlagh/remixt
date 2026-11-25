import { getLibraryStems } from "@/lib/models";
import { getCurrentUser } from "@/lib/auth";
import LibraryBrowser from "@/components/LibraryBrowser";
import PromotedSong from "@/components/ads/PromotedSong";
import { pageMetadata } from "@/lib/seo";
import { packPeaksJson } from "@/lib/peaksCodec";
import { songDetailsLine } from "@/lib/songDetails";

export const metadata = pageMetadata({
  title: "Free vocal & beat stems library",
  description:
    "Browse acapella vocals, instrumental beats, drums and bass split from real songs. Preview any stem and drop it into the free online remix studio.",
  path: "/library",
});

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; kind?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  // Only what the list draws, and each waveform as a short string (lib/peaksCodec.ts):
  // the full rows made this page's navigation payload grow ~4 KB per stem.
  const stems = (await getLibraryStems(user?.id ?? null)).map((s) => ({
    id: s.id,
    track_id: s.track_id,
    kind: s.kind,
    peaks: packPeaksJson(s.peaks_json),
    track_title: s.track_title,
    track_tags: s.track_tags,
    track_duration: s.track_duration,
    track_bpm: s.track_bpm,
    artist_name: s.artist_name,
    artist_id: s.artist_id,
    track_has_cover: s.track_has_cover,
    track_private: s.track_private,
    track_mine: s.track_mine,
    track_details: songDetailsLine(s),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Library</h1>
      <p className="mt-1 text-sm text-muted">
        Every stem split from an uploaded song — vocals, beats, and on newer songs the drums, bass and melody on
        their own. Preview anything, then send it to the studio to start remixing.
      </p>
      <PromotedSong />
      <LibraryBrowser
        stems={stems}
        signedIn={!!user}
        initialQuery={params.q ?? ""}
        initialTag={params.tag ?? null}
        initialKind={params.kind ?? null}
      />
    </div>
  );
}
