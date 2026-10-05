import Link from "next/link";
import { CalendarClock, Radio } from "lucide-react";
import AutoRefresh from "@/components/live/AutoRefresh";
import LiveCard from "@/components/live/LiveCard";
import { getCurrentUser } from "@/lib/auth";
import { currentStreamOf, liveDirectory } from "@/lib/live";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Live sessions",
  description:
    "Watch artists perform their remixes live: hear the stems being played, chat with the room and send reactions — no account needed to watch.",
  path: "/live",
});

// Always fresh: who's live changes by the minute.
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [user, directory] = await Promise.all([getCurrentUser(), liveDirectory()]);
  const mine = user ? await currentStreamOf(user.id) : null;
  const { live, upcoming, recent } = directory;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Radio className="h-7 w-7 text-danger" /> Live
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Artists perform their remixes in real time — you hear the stems being played, chat with the room and send reactions.
            Anyone can watch; sign in to follow and chat under your name.
          </p>
        </div>
        {user ? (
          <Link
            href={mine ? `/live/${mine.id}` : "/live/new"}
            className="flex h-11 items-center gap-2 rounded-xl bg-danger px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Radio className="h-4 w-4" /> {mine ? "Back to your session" : "Go live"}
          </Link>
        ) : (
          <Link href="/login?next=/live/new" className="flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong">
            Sign in to go live
          </Link>
        )}
      </div>

      <section className="mt-8" aria-labelledby="live-now">
        <h2 id="live-now" className="text-lg font-semibold">
          Live now {live.length > 0 && <span className="text-muted">({live.length})</span>}
        </h2>
        {live.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">Nobody is live right now</p>
            <p className="mt-1 text-sm text-muted">
              {upcoming.length ? "Something's coming up below — " : ""}
              or be the first: perform one of your remixes and invite people in.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.map((s) => (
              <LiveCard key={s.id} stream={s} />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mt-10" aria-labelledby="upcoming">
          <h2 id="upcoming" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-5 w-5 text-muted" /> Coming up
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {upcoming.map((s) => (
              <LiveCard key={s.id} stream={s} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="recent">
          <h2 id="recent" className="text-lg font-semibold">
            Recently ended
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recent.map((s) => (
              <LiveCard key={s.id} stream={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
