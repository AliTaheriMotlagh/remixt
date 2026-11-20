import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Clock, ListOrdered, Wand2 } from "lucide-react";
import GuideCards from "@/components/guides/GuideCards";
import ToolCards from "@/components/landing/ToolCards";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_CREATOR, SITE_NAME, absoluteUrl } from "@/lib/site";
import { GUIDES, GUIDES_PATH, guide, guidePath } from "@/lib/guides";
import { toolPage, toolPath } from "@/lib/tools";

// One guide (lib/guides.ts). Every slug is known at build time; any other is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guide((await params).slug);
  if (!g) return { title: "Guide not found", robots: { index: false } };
  return pageMetadata({ title: g.title, description: g.description, path: guidePath(g.slug), type: "article" });
}

/** "how-to-…#match-them": an id for a section heading. */
const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const tools = g.tools.map((slug) => toolPage(slug)).filter((t) => t !== undefined);
  const main = tools[0];
  const related = g.related.map(guide).filter((x) => x !== undefined);
  const url = absoluteUrl(guidePath(g.slug));

  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: g.h1,
            description: g.description,
            inLanguage: "en",
            url,
            mainEntityOfPage: url,
            datePublished: g.updated,
            dateModified: g.updated,
            author: { "@type": "Person", name: SITE_CREATOR.name, url: SITE_CREATOR.url },
            publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
            image: absoluteUrl("/opengraph-image"),
          },
          faqJsonLd(g.faq),
          breadcrumbJsonLd([
            { name: "Guides", path: GUIDES_PATH },
            { name: g.name, path: guidePath(g.slug) },
          ]),
        ]}
      />

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: "radial-gradient(circle at 12% 15%, var(--vocals-dim), transparent 45%), radial-gradient(circle at 88% 5%, var(--beat-dim), transparent 45%)" }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-foreground hover:underline">Home</Link>
              </li>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <li>
                <Link href={GUIDES_PATH} className="hover:text-foreground hover:underline">Guides</Link>
              </li>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <li aria-current="page" className="text-foreground">{g.name}</li>
            </ol>
          </nav>
          <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-balance sm:text-5xl">{g.h1}</h1>
          <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">{g.lead}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden /> {g.minutes} min read
            </span>
            <span>
              Updated <time dateTime={g.updated}>{new Date(`${g.updated}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time>
            </span>
            {main && (
              <Link
                href={`${toolPath(main.slug)}#try`}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 font-semibold text-white shadow-[0_0_24px_-6px_var(--brand)]"
              >
                <Wand2 className="h-4 w-4" aria-hidden /> Try the {main.name.toLowerCase()}
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1fr_15rem]">
        <article className="min-w-0 max-w-3xl">
          {g.sections.map((s) => (
            <section key={s.heading} id={anchor(s.heading)} className="mb-10 scroll-mt-24">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-muted">
                  {p}
                </p>
              ))}
              {s.steps && (
                <ol className="mt-5 grid gap-3">
                  {s.steps.map((step, i) => (
                    <li key={step.name} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                      <span>
                        <span className="block font-semibold">{step.name}</span>
                        <span className="mt-0.5 block text-sm text-muted">{step.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}

          {tools.length > 0 && (
            <section className="mb-10 rounded-3xl border border-brand/30 bg-brand/5 p-5 sm:p-6" aria-labelledby="do-it">
              <h2 id="do-it" className="text-xl font-bold tracking-tight">Do it now, free</h2>
              <p className="mt-1 text-sm text-muted">Every tool runs in your browser: nothing to install, and your song stays on your device.</p>
              <div className="mt-4">
                <ToolCards tools={tools} />
              </div>
            </section>
          )}

          <section aria-labelledby="questions">
            <h2 id="questions" className="text-xl font-bold tracking-tight sm:text-2xl">Questions</h2>
            <div className="mt-4 flex flex-col gap-3">
              {g.faq.map((f) => (
                <details key={f.q} className="group rounded-xl border border-border bg-surface p-4 open:border-brand/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                    <h3>{f.q}</h3>
                    <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </article>

        <aside className="order-first lg:order-none">
          <nav aria-label="On this page" className="rounded-2xl border border-border bg-surface p-4 text-sm lg:sticky lg:top-24">
            <p className="flex items-center gap-2 font-semibold">
              <ListOrdered className="h-4 w-4 text-brand-strong" aria-hidden /> On this page
            </p>
            <ol className="mt-3 flex flex-col gap-2">
              {g.sections.map((s) => (
                <li key={s.heading}>
                  <a href={`#${anchor(s.heading)}`} className="text-muted hover:text-foreground hover:underline">
                    {s.heading.replace(/^\d+\.\s*/, "")}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <h2 className="flex items-center justify-between gap-3 text-2xl font-bold tracking-tight">
              Read next
              <Link href={GUIDES_PATH} className="flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
                All guides <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </h2>
            <div className="mt-6">
              <GuideCards guides={related} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
