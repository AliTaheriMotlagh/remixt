import DjCrate from "@/components/dj/DjCrate";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "DJ set planner: build a set by key and BPM",
  description:
    "Plan a DJ set for a wedding, party or club night: every song's BPM, Camelot key and energy, a set that flows key to key, and ideas for what to play next.",
  path: "/dj/crate",
});

const FAQ = [
  {
    q: "How does it choose a set for my event?",
    a: "Each event has a tempo range and a shape — a wedding rises to the dance floor and comes back down, a club night holds high. It picks the songs that suit it and chains them so each one mixes into the next: keys next to each other on the Camelot wheel and tempos within reach.",
  },
  {
    q: "What do the colours and the score mean?",
    a: "Each key has a colour on the Camelot wheel, so neighbouring keys look alike. Between two songs, green means a smooth blend (close tempo, friendly keys), amber an OK one, red a rough one that wants a quick cut. The flow score is the average of every blend in the set.",
  },
  {
    q: "Can I add songs that aren't on Remixt?",
    a: "Yes. Type in a request or the first dance with whatever you know — tempo, key, length. It's rated like any other song when those are known. The decks skip it when playing; upload it to play it here.",
  },
  {
    q: "Where is my set kept?",
    a: "On this device. The DJ decks find it under Build a set → Saved sets, and you can copy the track list or download it as CSV for other DJ software.",
  },
];

export default function DjCratePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5 sm:py-10">
      <JsonLd data={[faqJsonLd(FAQ), breadcrumbJsonLd([{ name: "DJ decks", path: "/dj" }, { name: "Set planner", path: "/dj/crate" }])]} />
      <DjCrate />
      <section className="mx-auto mt-14 max-w-3xl border-t border-border pt-10 text-sm text-muted">
        <h2 className="text-lg font-bold text-foreground">A DJ set planner that knows every song&apos;s key and tempo</h2>
        <p className="mt-3">
          Harmonic mixing means playing songs whose keys sit next to each other on the Camelot wheel, at tempos close enough to beatmatch. This planner
          shows both for every song in your library, rates each blend in your set, and suggests what to play before or after any song.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-xl border border-border bg-surface/60 px-4 py-3">
              <summary className="cursor-pointer font-semibold text-foreground">{f.q}</summary>
              <p className="mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
