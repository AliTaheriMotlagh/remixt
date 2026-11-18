import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, ChevronRight, Library } from "lucide-react";
import ToolCards from "@/components/landing/ToolCards";
import { getCurrentUser } from "@/lib/auth";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { TOOL_PAGES, toolPage, toolPath } from "@/lib/tools";

// One page per tool in lib/tools.ts; any other /tools/… is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return TOOL_PAGES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tool = toolPage((await params).slug);
  if (!tool) return { title: "Tool not found", robots: { index: false } };
  return pageMetadata({ title: tool.title, description: tool.description, path: toolPath(tool.slug) });
}

export default async function ToolPageView({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolPage((await params).slug);
  if (!tool) notFound();
  const user = await getCurrentUser();
  const related = tool.related.map(toolPage).filter((t) => t !== undefined);
  const url = absoluteUrl(toolPath(tool.slug));

  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: `${SITE_NAME} ${tool.name}`,
            url,
            description: tool.description,
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Any (runs in the browser)",
            browserRequirements: "A modern browser; WebGPU is used when available",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList: tool.sections.map((s) => s.heading),
            publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
          },
          {
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: tool.h1,
            step: tool.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
          },
          faqJsonLd(tool.faq),
          breadcrumbJsonLd([
            { name: "Tools", path: "/tools" },
            { name: tool.name, path: toolPath(tool.slug) },
          ]),
        ]}
      />

      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, var(--vocals-dim), transparent 45%), radial-gradient(circle at 85% 10%, var(--beat-dim), transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-foreground hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight />
              </li>
              <li>
                <Link href="/tools" className="hover:text-foreground hover:underline">
                  Tools
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight />
              </li>
              <li aria-current="page" className="text-foreground">
                {tool.name}
              </li>
            </ol>
          </nav>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-balance sm:text-5xl">{tool.h1}</h1>
          <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">{tool.lead}</p>
          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href={user ? "/upload" : "/signup"}
              className="rounded-xl bg-brand px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.03] hover:bg-brand-strong"
            >
              {tool.cta} — free
            </Link>
            <Link
              href="/examples"
              className="rounded-xl border border-border bg-surface px-6 py-3.5 text-center text-sm font-semibold transition-colors hover:bg-surface-hover"
            >
              Hear a real split first
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {["Free", "Runs in your browser", "Nothing to install", "MP3 or WAV export"].map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <Check className="text-success" aria-hidden /> {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
        <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tool.steps.map((step, i) => (
            <li key={step.name} className="rounded-xl border border-border bg-surface p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{step.name}</h3>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
          {tool.sections.map((section) => (
            <div key={section.heading} className="max-w-3xl">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 text-muted">
                  {p}
                </p>
              ))}
            </div>
          ))}
          {tool.library && (
            <Link
              href={`/library?kind=${tool.library.kind}`}
              className="flex items-center gap-2 self-start rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold hover:bg-surface-hover"
            >
              <Library className="text-brand-strong" aria-hidden /> {tool.library.label}
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions</h2>
        <div className="mt-6 flex max-w-3xl flex-col gap-3">
          {tool.faq.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-surface p-4 open:border-brand/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                <h3>{f.q}</h3>
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">More free tools</h2>
          <div className="mt-6">
            <ToolCards tools={related} />
          </div>
          <p className="mt-6 text-sm text-muted">
            Or open the{" "}
            <Link href="/studio" className="font-medium text-brand-strong hover:underline">
              online remix studio
            </Link>{" "}
            and listen to{" "}
            <Link href="/remixes" className="font-medium text-brand-strong hover:underline">
              remixes made with Remixt
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
