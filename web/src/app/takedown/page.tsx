import { getCurrentUser } from "@/lib/auth";
import TakedownForm from "@/components/TakedownForm";

export const metadata = { title: "Takedown requests — Remixt" };

export default async function TakedownPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">Takedown requests</h1>
      <p className="mt-2 text-sm text-muted">
        Everyone who uploads a song to Remixt confirms they have the right to share it. If your music is here
        without your permission, tell us which remix or song it is and we&apos;ll take it down. Songs are removed
        together with their stems and every remix lane built from them.
      </p>
      <TakedownForm signedInEmail={user?.email ?? null} />
    </div>
  );
}
