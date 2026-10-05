import Link from "next/link";
import { redirect } from "next/navigation";
import GoLiveForm from "@/components/live/GoLiveForm";
import { getCurrentUser } from "@/lib/auth";
import { currentStreamOf, performableRemixes } from "@/lib/live";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Go live",
  description: "Perform a remix live for anyone to watch, chat and react.",
  path: "/live/new",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function NewLivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/live/new");
  const existing = await currentStreamOf(user.id);
  if (existing) redirect(`/live/${existing.id}`);
  const remixes = await performableRemixes(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/live" className="text-sm text-muted hover:text-foreground">
        ← Live
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Go live</h1>
      <p className="mt-2 text-muted">
        Perform a remix for anyone to watch. Listeners hear the same stems you play — in step with you — and chat and react while you do.
      </p>
      <div className="mt-8">
        <GoLiveForm remixes={remixes} defaultTitle={`${user.artist_name}'s live set`} />
      </div>
    </div>
  );
}
