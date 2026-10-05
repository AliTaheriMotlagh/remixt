import DjApp from "@/components/dj/DjApp";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "DJ simulator: learn to mix with two decks",
  description:
    "A flight simulator for DJing: club players, a controller or turntables, with jog wheels, hot cues, key lock, isolator EQs and live stem kills. Lessons, drills and checkrides from beatmatching to real gigs, with your own songs or ours. Free, in your browser.",
  path: "/dj",
});

export default function DjPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5 sm:py-10">
      <DjApp />
    </div>
  );
}
