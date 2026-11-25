import Link from "next/link";
import type { Metadata } from "next";
import { Check, ChevronRight, Languages, Library } from "lucide-react";
import ToolCards from "@/components/landing/ToolCards";
import { getCurrentUser } from "@/lib/auth";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { TOOL_LOCALES, toolLanguages, toolPage, toolPath, toolsHubPath, type ToolLocale, type ToolPage } from "@/lib/tools";
import AdCard from "@/components/ads/AdCard";
import ToolWorkbench from "./ToolWorkbench";
import KeyBpmFinder from "./KeyBpmFinder";
import KeyTempoChanger from "./KeyTempoChanger";
import GuideCards from "@/components/guides/GuideCards";
import { guidesForTool } from "@/lib/guides";
import { workbenchFor } from "@/lib/toolWorkbench";
import { TOOL_UI } from "@/lib/toolsUi";

// One tool page (/tools/<slug>, /fa/tools/<slug>), in any language: the
// routes only pick the page and the language. Text comes from lib/tools.ts
// (and its translations), the words around it from lib/toolsUi.ts.

export function toolMetadata(slug: string, locale: ToolLocale): Metadata {
  const tool = toolPage(slug, locale);
  if (!tool) return { title: "Tool not found", robots: { index: false } };
  return pageMetadata({
    title: tool.title,
    description: tool.description,
    path: toolPath(tool.slug, locale),
    languages: toolLanguages(tool.slug),
    locale: TOOL_UI[locale].ogLocale,
  });
}

/** Links to this page in the other languages, each named in its own language. */
export function LanguageLinks({ locale, slug }: { locale: ToolLocale; slug?: string }) {
  const others = TOOL_LOCALES.filter((l) => l !== locale);
  return (
    <span className="flex items-center gap-2">
      <Languages aria-hidden />
      {others.map((other) => (
        <Link
          key={other}
          href={slug ? toolPath(slug, other) : toolsHubPath(other)}
          hrefLang={TOOL_UI[other].lang}
          lang={TOOL_UI[other].lang}
          className="hover:text-foreground hover:underline"
        >
          {TOOL_UI[other].selfName}
        </Link>
      ))}
    </span>
  );
}

export default async function ToolPageView({ tool, locale }: { tool: ToolPage; locale: ToolLocale }) {
  const ui = TOOL_UI[locale];
  const user = await getCurrentUser();
  const related = tool.related.map((slug) => toolPage(slug, locale)).filter((t) => t !== undefined);
  const hub = toolsHubPath(locale);
  const url = absoluteUrl(toolPath(tool.slug, locale));
  // The guides are in English: linked from the English pages only.
  const guides = locale === "en" ? guidesForTool(tool.slug).slice(0, 3) : [];

  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: `${SITE_NAME} ${tool.name}`,
            url,
            inLanguage: ui.lang,
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
            inLanguage: ui.lang,
            step: tool.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
          },
          faqJsonLd(tool.faq),
          breadcrumbJsonLd([
            { name: ui.tools, path: hub },
            { name: tool.name, path: toolPath(tool.slug, locale) },
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
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <nav aria-label={ui.breadcrumb}>
              <ol className="flex flex-wrap items-center gap-1">
                <li>
                  <Link href="/" className="hover:text-foreground hover:underline">
                    {ui.home}
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="rtl:rotate-180" />
                </li>
                <li>
                  <Link href={hub} className="hover:text-foreground hover:underline">
                    {ui.tools}
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="rtl:rotate-180" />
                </li>
                <li aria-current="page" className="text-foreground">
                  {tool.name}
                </li>
              </ol>
            </nav>
            <LanguageLinks locale={locale} slug={tool.slug} />
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-balance sm:text-5xl">{tool.h1}</h1>
          <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">{tool.lead}</p>
          {/* The tool itself, working right here: drop a song, get what this page is for (lib/toolWorkbench.ts). */}
          <div className="mt-7" id="try">
            {workbenchFor(tool.slug).analyze ? (
              <KeyBpmFinder locale={locale} />
            ) : workbenchFor(tool.slug).transform ? (
              <KeyTempoChanger locale={locale} />
            ) : (
              <ToolWorkbench slug={tool.slug} locale={locale} />
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            <Link href="/examples" className="font-medium text-brand-strong hover:underline">
              {ui.hearFirst}
            </Link>
            {!user && (
              <>
                {" · "}
                <Link href="/signup" className="font-medium text-brand-strong hover:underline">
                  {ui.ctaFree(tool.cta)}
                </Link>
              </>
            )}
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {(tool.points ?? ui.points).map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <Check className="text-success" aria-hidden /> {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{ui.howItWorks}</h2>
        <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tool.steps.map((step, i) => (
            <li key={step.name} className="rounded-xl border border-border bg-surface p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {ui.number(i + 1)}
              </span>
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
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{ui.questions}</h2>
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
        {/* After the answers, not in the way of the steps: the site's own spot. */}
        <AdCard placement="site" lang={locale === "fa" ? "fa" : "en"} seed={tool.faq.length} className="mt-10 max-w-3xl" />
      </section>

      {guides.length > 0 && (
        <section className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6 sm:pb-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Learn how</h2>
          <div className="mt-6">
            <GuideCards guides={guides} />
          </div>
        </section>
      )}

      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{ui.moreTools}</h2>
          <div className="mt-6">
            <ToolCards locale={locale} tools={related} />
          </div>
          <p className="mt-6 text-sm text-muted">
            {ui.outro.before}
            <Link href="/studio" className="font-medium text-brand-strong hover:underline">
              {ui.outro.studio}
            </Link>
            {ui.outro.middle}
            <Link href="/remixes" className="font-medium text-brand-strong hover:underline">
              {ui.outro.remixes}
            </Link>
            {ui.outro.after}
          </p>
        </div>
      </section>
    </div>
  );
}
