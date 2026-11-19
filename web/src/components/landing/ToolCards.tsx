import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toolPages, toolPath, type ToolLocale, type ToolPage } from "@/lib/tools";

/**
 * Cards linking to the tool pages (/tools/…, /fa/tools/…), with the search
 * words as the link text. Used on the home page, the tools hubs and under
 * each tool page. The arrow points the way the page reads.
 */
export default function ToolCards({
  locale = "en",
  tools = toolPages(locale),
  headingLevel = "h3",
}: {
  locale?: ToolLocale;
  tools?: ToolPage[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            href={toolPath(tool.slug, locale)}
            className="group flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-surface-hover"
          >
            <Heading className="flex items-center justify-between gap-2 font-semibold">
              {tool.name}
              <ArrowRight
                className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                aria-hidden
              />
            </Heading>
            <p className="mt-1 text-sm text-muted">{tool.h1}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
