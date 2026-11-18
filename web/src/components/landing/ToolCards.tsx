import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TOOL_PAGES, toolPath, type ToolPage } from "@/lib/tools";

/**
 * Cards linking to the tool pages (/tools/…), with the search words as the
 * link text. Used on the home page, the tools hub and under each tool page.
 */
export default function ToolCards({ tools = TOOL_PAGES, headingLevel = "h3" }: { tools?: ToolPage[]; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            href={toolPath(tool.slug)}
            className="group flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-surface-hover"
          >
            <Heading className="flex items-center justify-between gap-2 font-semibold">
              {tool.name}
              <ArrowRight className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Heading>
            <p className="mt-1 text-sm text-muted">{tool.h1}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
