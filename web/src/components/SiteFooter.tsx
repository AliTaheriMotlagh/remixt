import Link from "next/link";
import { ArrowRight, BookOpen, Radio, Sparkles, Wand2 } from "lucide-react";
import RemixtMark from "@/components/RemixtMark";
import { SITE_CREATOR, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { TOOL_PAGES, toolPath } from "@/lib/tools";
import { GUIDES, GUIDES_PATH, guidePath } from "@/lib/guides";

// The site's footer: a last invitation (make something, or tune in to the
// radio), then every tool, guide and section, one link each, so people (and
// search engines) can reach any of them from any page. Shown by FooterGate.

type FooterLink = { href: string; label: string; lang?: string; live?: boolean };

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Free tools",
    links: [...TOOL_PAGES.map((t) => ({ href: toolPath(t.slug), label: t.name })), { href: "/tools", label: "All tools" }, { href: "/fa/tools", label: "ابزارها به فارسی", lang: "fa" }],
  },
  {
    heading: "Guides",
    links: [...GUIDES.map((g) => ({ href: guidePath(g.slug), label: g.name })), { href: GUIDES_PATH, label: "All guides" }],
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
      { href: "/radio", label: "Remixt radio", live: true },
      { href: "/remixes", label: "Remixes & mashups" },
      { href: "/live", label: "Live sessions" },
      { href: "/leaderboard", label: "Top artists" },
    ],
  },
  {
    heading: SITE_NAME,
    links: [
      { href: "/signup", label: "Create a free account" },
      { href: "#feedback", label: "Send feedback" },
      { href: "/plus", label: "Remixt Plus" },
      { href: "/earnings", label: "Earn from your remixes" },
      { href: "/advertise", label: "Advertise" },
      { href: "/takedown", label: "Copyright & takedowns" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-border bg-surface/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
        style={{ background: "radial-gradient(ellipse at 20% 0%, var(--vocals-dim), transparent 60%), radial-gradient(ellipse at 80% 0%, var(--beat-dim), transparent 60%)" }}
      />

      {/* The last invitation: make something, or just listen. */}
      <div className="relative mx-auto grid max-w-6xl gap-3 px-4 pt-10 sm:px-6 md:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col justify-between gap-5 rounded-3xl border border-border bg-surface/80 p-6 backdrop-blur sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-strong">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Free, in your browser
            </p>
            <p className="mt-2 text-xl font-black tracking-tight text-balance sm:text-2xl">Make your first remix in minutes.</p>
            <p className="mt-1 text-sm text-muted">Split any song into vocals, drums, bass and melody — nothing to install.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/tools/remix-maker" className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_var(--brand)]">
              <Wand2 className="h-4 w-4" aria-hidden /> Start remixing
            </Link>
            <Link href={GUIDES_PATH} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover">
              <BookOpen className="h-4 w-4" aria-hidden /> Guides
            </Link>
          </div>
        </div>
        <Link
          href="/radio"
          className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-vocals/20 via-surface to-beat/20 p-6 transition-colors hover:border-brand/50"
        >
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_0_28px_-6px_var(--brand)]">
            <Radio className="h-6 w-6" aria-hidden />
            <span className="absolute -end-1 -top-1 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-surface bg-danger" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-widest text-danger">Tune in</span>
            <span className="mt-0.5 block text-lg font-black tracking-tight">Remixt radio</span>
            <span className="block text-sm text-muted">Stations of remixes, mixed like a DJ would.</span>
          </span>
          <ArrowRight className="ms-auto h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>

      <div className="relative mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-[1.3fr_repeat(5,1fr)]">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
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
                  <Link
                    href={link.href}
                    lang={link.lang}
                    hrefLang={link.lang}
                    className={`inline-flex items-center gap-1.5 hover:text-foreground hover:underline ${link.live ? "font-semibold text-foreground" : "text-muted"}`}
                  >
                    {link.live && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="relative border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6">
          <p>
            © {new Date().getFullYear()} {SITE_NAME} · Songs are split on your own device
          </p>
          <p className="flex items-center gap-3">
            <Link href="/" hrefLang="en" className="hover:text-foreground hover:underline">English</Link>
            <Link href="/fa/tools" hrefLang="fa" lang="fa" className="hover:text-foreground hover:underline">فارسی</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
