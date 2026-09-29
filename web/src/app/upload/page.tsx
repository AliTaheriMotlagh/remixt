import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UploadManager from "@/components/UploadManager";
import { youtubeImportEnabled } from "@/lib/linkImport";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/upload");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
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
