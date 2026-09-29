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

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/upload");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Upload a song</h1>
      <p className="mt-1 text-sm text-muted">
        It&apos;s split into a vocal stem and a beat (instrumental) stem right
        here in your browser — the song itself never leaves your device, only
        the two stems are uploaded to your library.
      </p>
      <UploadManager youtubeImport={youtubeImportEnabled()} />
    </div>
  );
}
