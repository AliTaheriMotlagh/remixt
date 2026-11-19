import Link from "next/link";
import RemixtMark from "@/components/RemixtMark";
import { SITE_CREATOR, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { TOOL_PAGES, toolPath } from "@/lib/tools";

// The site's footer: every tool and section, one link each, so people (and
// search engines) can reach any of them from any page. Shown by FooterGate.

const COLUMNS: { heading: string; links: { href: string; label: string; lang?: string }[] }[] = [
  {
    heading: "Free tools",
    links: [...TOOL_PAGES.map((t) => ({ href: toolPath(t.slug), label: t.name })), { href: "/tools", label: "All tools" }, { href: "/fa/tools", label: "ابزارها به فارسی", lang: "fa" }],
  },
  {
    heading: "Make",
    links: [
      { href: "/studio", label: "Remix studio" },
      { href: "/library", label: "Vocals & beats library" },
      { href: "/dj", label: "DJ decks" },
      { href: "/examples", label: "Splitting examples" },
      { href: "/challenges", label: "Remix challenges" },
    ],
  },
  {
    heading: "Listen",
    links: [
      { href: "/remixes", label: "Remixes & mashups" },
      { href: "/radio", label: "Radio" },
      { href: "/live", label: "Live sessions" },
      { href: "/leaderboard", label: "Top artists" },
    ],
  },
  {
    heading: SITE_NAME,
    links: [
      { href: "/signup", label: "Create a free account" },
      { href: "/takedown", label: "Copyright & takedowns" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <RemixtMark className="h-7 w-7" /> {SITE_NAME}
          </Link>
          <p className="mt-2 max-w-xs text-sm text-muted">{SITE_TAGLINE}, with an AI splitter that runs in your browser.</p>
          <p className="mt-4 text-xs text-muted">
            Made by{" "}
            <a href={SITE_CREATOR.url} rel="author" className="font-medium text-foreground hover:underline">
              {SITE_CREATOR.name}
            </a>
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{col.heading}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} lang={link.lang} hrefLang={link.lang} className="text-muted hover:text-foreground hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
