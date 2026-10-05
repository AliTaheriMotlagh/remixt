import DjApp from "@/components/dj/DjApp";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "DJ simulator: learn to mix with two decks",
  description:
    "A flight simulator for DJing: two decks, EQ, effects and live stem kills, guided missions from beatmatching to a club night, with a co-pilot that coaches you. Free, in your browser.",
  path: "/dj",
});

export default function DjPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-5 sm:py-10">
      <DjApp />
    </div>
  );
}
