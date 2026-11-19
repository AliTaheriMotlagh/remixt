import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";
import EarningsDashboard from "@/components/earnings/EarningsDashboard";
import HowEarningWorks from "@/components/earnings/HowEarningWorks";

export const metadata = pageMetadata({
  title: "Earn from your remixes — how ads pay artists",
  description: "Ads on a remix pay its remixers, the artists of the songs it uses and Remixt. See the shares, claim your songs and get paid.",
  path: "/earnings",
});

export default async function EarningsPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {user ? (
        <EarningsDashboard artistName={user.artist_name} />
      ) : (
        <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/25 via-vocals/10 to-beat/10 p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-strong">Remixt for artists</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Every remix pays the people who made the music</h1>
          <p className="mt-3 max-w-2xl text-muted sm:text-lg">
            Ads on a remix are shared between its remixers, the artists of the songs it uses, and Remixt. Artists who haven&apos;t joined yet have
            their share kept for them.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">
              Start earning
            </Link>
            <Link href="/login" className="rounded-full border border-border bg-surface/70 px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover">
              Log in
            </Link>
          </div>
        </header>
      )}
      <HowEarningWorks />
    </div>
  );
}
