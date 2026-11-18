import ToolCards from "@/components/landing/ToolCards";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { TOOL_PAGES, toolPath } from "@/lib/tools";

export const metadata = pageMetadata({
  title: "Free AI music tools: vocal remover, stems & more",
  description:
    "Free AI music tools in your browser: vocal remover, acapella extractor, karaoke maker, stem splitter, drum and bass extractor, and a mashup maker.",
  path: "/tools",
});

export default function ToolsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Remixt music tools",
            itemListElement: TOOL_PAGES.map((t, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t.name,
              url: absoluteUrl(toolPath(t.slug)),
            })),
          },
          breadcrumbJsonLd([{ name: "Tools", path: "/tools" }]),
        ]}
      />
      <h1 className="text-3xl font-black tracking-tight text-balance sm:text-5xl">Free AI music tools</h1>
      <p className="mt-4 max-w-2xl text-muted sm:text-lg">
        Every tool here uses the same AI splitter, running in your browser: it takes a finished song apart into vocals,
        drums, bass and melody. Pick what you want to do with the parts.
      </p>
      <div className="mt-8">
        <ToolCards headingLevel="h2" />
      </div>
    </div>
  );
}
