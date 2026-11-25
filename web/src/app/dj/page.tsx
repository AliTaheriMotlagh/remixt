import { Suspense } from "react";
import Link from "next/link";
import DjApp from "@/components/dj/DjApp";
import { pageMetadata } from "@/lib/seo";
import { toolPath } from "@/lib/tools";

export const metadata = pageMetadata({
  title: "DJ decks: mix your songs on two decks",
  description:
    "Two club-style DJ decks in your browser for your own songs: sync, key match, stem kills, Auto-mix, an Auto DJ and set recording. Plus DJ lessons. Free.",
  path: "/dj",
});

export default function DjPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5 sm:py-10">
      {/* The decks read the address (?set=, ?live=): drawn in the browser, the heading first. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold">DJ decks</h1>
            <p className="text-sm text-muted">Setting up the decks…</p>
          </div>
        }
      >
        <DjApp />
      </Suspense>
      {/* The decks only draw in the browser; this says what the page is to
          anyone (and any search engine) reading it before they do. */}
      <section className="mx-auto mt-14 max-w-3xl border-t border-border pt-10 text-sm text-muted">
        <h2 className="text-lg font-bold text-foreground">Online DJ decks for the songs you split</h2>
        <p className="mt-3">
          Two decks with tempo sync, key matching and live stem kills: drop the vocal, the drums or the bass of either
          song while it plays, because every song in your library is already split into stems. Auto-mix blends from one
          deck to the other on the beat, and the Auto DJ picks the next song by tempo and key and keeps the set going.
        </p>
        <p className="mt-3">
          Planning for an event?{" "}
          <Link href="/dj/crate" className="font-medium text-brand-strong hover:underline">
            The set planner
          </Link>{" "}
          lists every song with its key, tempo and energy, builds a set for a wedding, party or club night, and suggests what to play next.
        </p>
        <p className="mt-3">
          Record a set and save it as an MP3 with its track list and cover. New to DJing? Learn to DJ has lessons, drills
          and gigs, step by step.
        </p>
        <p className="mt-3">
          No songs yet?{" "}
          <Link href={toolPath("stem-splitter")} className="font-medium text-brand-strong hover:underline">
            Split a song into stems
          </Link>{" "}
          or pick some from the{" "}
          <Link href="/library" className="font-medium text-brand-strong hover:underline">
            library
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
