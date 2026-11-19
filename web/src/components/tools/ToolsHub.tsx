import type { Metadata } from "next";
import ToolCards from "@/components/landing/ToolCards";
import { LanguageLinks } from "@/components/tools/ToolPageView";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { toolLanguages, toolPages, toolPath, toolsHubPath, type ToolLocale } from "@/lib/tools";
import { TOOL_UI } from "@/lib/toolsUi";

// The list of every tool (/tools, /fa/tools), in any language.

export function toolsHubMetadata(locale: ToolLocale): Metadata {
  const { hub, ogLocale } = TOOL_UI[locale];
  return pageMetadata({
    title: hub.title,
    description: hub.description,
    path: toolsHubPath(locale),
    languages: toolLanguages(),
    locale: ogLocale,
  });
}

export default function ToolsHub({ locale }: { locale: ToolLocale }) {
  const ui = TOOL_UI[locale];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: ui.hub.listName,
            inLanguage: ui.lang,
            itemListElement: toolPages(locale).map((t, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t.name,
              url: absoluteUrl(toolPath(t.slug, locale)),
            })),
          },
          breadcrumbJsonLd([{ name: ui.tools, path: toolsHubPath(locale) }]),
        ]}
      />
      <div className="flex justify-end text-xs text-muted">
        <LanguageLinks locale={locale} />
      </div>
      <h1 className="text-3xl font-black tracking-tight text-balance sm:text-5xl">{ui.hub.h1}</h1>
      <p className="mt-4 max-w-2xl text-muted sm:text-lg">{ui.hub.intro}</p>
      <div className="mt-8">
        <ToolCards locale={locale} headingLevel="h2" />
      </div>
    </div>
  );
}
