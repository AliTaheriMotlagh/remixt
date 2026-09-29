import { getLibraryStems } from "@/lib/models";
import { getCurrentUser } from "@/lib/auth";
import LibraryBrowser from "@/components/LibraryBrowser";
import { pageMetadata } from "@/lib/seo";

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
  const [stems, user, params] = await Promise.all([getLibraryStems(), getCurrentUser(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Library</h1>
      <p className="mt-1 text-sm text-muted">
        Every stem split from an uploaded song — vocals, beats, and on newer songs the drums, bass and melody on
        their own. Preview anything, then send it to the studio to start remixing.
      </p>
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
