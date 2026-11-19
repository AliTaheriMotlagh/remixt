import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ToolPageView, { toolMetadata } from "@/components/tools/ToolPageView";
import { toolPage, toolPages } from "@/lib/tools";

// One page per tool in lib/tools.ts; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return toolPages("fa").map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return toolMetadata((await params).slug, "fa");
}

export default async function ToolPageFa({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolPage((await params).slug, "fa");
  if (!tool) notFound();
  return <ToolPageView tool={tool} locale="fa" />;
}
