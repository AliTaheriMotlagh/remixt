import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UploadManager from "@/components/UploadManager";
import { youtubeImportEnabled } from "@/lib/linkImport";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Upload a song",
  description: "Split a song into vocals and beat in your browser and add the stems to your Remixt library.",
  path: "/upload",
  noindex: true,
});

export default async function UploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  // From a radio station's search ("Not here? Upload it"): which song, and the way back.
  const wanted = one(sp.title).slice(0, 120);
  const back = /^\/radio\/[\w-]{1,80}$/.test(one(sp.next)) ? one(sp.next) : null;
  const user = await getCurrentUser();
  if (!user) {
    const here = `/upload${wanted || back ? `?${new URLSearchParams({ ...(wanted ? { title: wanted } : {}), ...(back ? { next: back } : {}) })}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Upload a song</h1>
      <p className="mt-1 text-sm text-muted">
        It&apos;s split into a vocal stem and a beat (instrumental) stem. On a
        computer that happens right here in your browser — the song itself
        never leaves it, only the stems are uploaded to your library. From a
        phone, the song is sent to a computer that splits it for you.
      </p>
      {back && (
        <p className="mt-4 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
          {wanted ? <>Add “{wanted}” here. </> : null}
          It uploads and splits in the background — you can go back and keep listening meanwhile. Once it&apos;s ready it&apos;s in the
          library, and you can request it.{" "}
          <Link href={back} className="font-semibold text-brand-strong underline">
            Back to the radio
          </Link>
        </p>
      )}
      <UploadManager youtubeImport={youtubeImportEnabled()} />
    </div>
  );
}
