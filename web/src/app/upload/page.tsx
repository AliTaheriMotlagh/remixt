import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UploadManager from "@/components/UploadManager";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/upload");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">Upload a song</h1>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll automatically split it into a vocal stem and a beat
        (instrumental) stem, and add both to your library.
      </p>
      <UploadManager />
    </div>
  );
}
