import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import Studio from "@/components/Studio";
import RemixtMark from "@/components/RemixtMark";

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
