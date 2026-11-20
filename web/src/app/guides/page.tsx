import type { Metadata } from "next";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import GuideCards from "@/components/guides/GuideCards";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { GUIDES, GUIDES_PATH, guidePath } from "@/lib/guides";

// Every guide (lib/guides.ts), newest questions people ask first.

export const metadata: Metadata = pageMetadata({
  title: "Remix guides: stems, mashups, BPM and keys",
  description:
    "Free guides to remixing: make a remix or mashup, isolate vocals, create an acapella, match BPM and keys, DJ with stems and use stems in any DAW.",
  path: GUIDES_PATH,
});

export default function GuidesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Remixt guides",
            itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.h1, url: absoluteUrl(guidePath(g.slug)) })),
          },
          breadcrumbJsonLd([{ name: "Guides", path: GUIDES_PATH }]),
        ]}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: "radial-gradient(circle at 10% 10%, var(--vocals-dim), transparent 45%), radial-gradient(circle at 90% 0%, var(--beat-dim), transparent 45%)" }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-strong">Guides</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-balance sm:text-5xl">Learn to remix, one question at a time</h1>
          <p className="mt-4 max-w-2xl text-muted sm:text-lg">
            Short, practical guides to taking songs apart and putting them back together — and every one shows how to do it with free tools that run in your browser.
          </p>
          <Link href="/tools" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_var(--brand)]">
            <Wand2 className="h-4 w-4" aria-hidden /> Try the free tools
          </Link>
        </div>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <GuideCards guides={GUIDES} headingLevel="h2" />
      </section>
    </div>
  );
}
