import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import Studio from "@/components/Studio";

export default async function StudioPage() {
  const user = await getCurrentUser();

  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading studio…</div>}>
      <Studio user={user} />
    </Suspense>
  );
}
