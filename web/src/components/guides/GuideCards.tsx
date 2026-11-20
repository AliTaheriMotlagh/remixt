import Link from "next/link";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { guidePath, type Guide } from "@/lib/guides";

/** Cards linking to guides (/guides/…): the question as the link text, how long it takes to read. */
export default function GuideCards({ guides, headingLevel = "h3" }: { guides: Guide[]; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {guides.map((g) => (
        <li key={g.slug}>
          <Link
            href={guidePath(g.slug)}
            className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand/40 hover:bg-surface-hover"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-vocals/25 to-beat/25 text-brand-strong">
              <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <Heading className="mt-3 flex items-start justify-between gap-2 font-semibold">
              {g.name}
              <ArrowRight className="mt-0.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Heading>
            <p className="mt-1 line-clamp-3 text-sm text-muted">{g.description}</p>
            <p className="mt-auto flex items-center gap-1 pt-3 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden /> {g.minutes} min read
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
