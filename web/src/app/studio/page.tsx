import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import Studio from "@/components/Studio";
import RemixtMark from "@/components/RemixtMark";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Online remix studio — mix vocals over any beat",
  description:
    "A free remix studio in your browser: put a vocal from one song over the beat of another, match tempo and key automatically, add effects and export an MP3.",
  path: "/studio",
});

export default async function StudioPage() {
  const user = await getCurrentUser();

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-sm text-muted">
          <RemixtMark className="h-12 w-12 animate-pulse-glow" />
          Loading studio…
        </div>
      }
    >
      <Studio user={user} />
    </Suspense>
  );
}
