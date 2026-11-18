import DjApp from "@/components/dj/DjApp";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "DJ decks: mix your songs on two decks",
  description:
    "Two club-style decks in your browser for the songs in your library: sync, key, live stem kills, Auto-mix and an Auto DJ that keeps the set going, and set recording. Plus lessons, drills and gigs to learn DJing. Free.",
  path: "/dj",
});

export default function DjPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5 sm:py-10">
      <DjApp />
    </div>
  );
}
