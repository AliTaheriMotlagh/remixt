"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@/lib/auth";
import { MORE_LINKS, NavIcon, TAB_LINKS, isActive, type NavLink } from "./navLinks";

/**
 * Phones and small tablets: the main sections as a tab bar along the
 * bottom, in thumb reach, like a native app. Tablets and up use the links
 * in the header instead. Its height is published as --tabbar-h (globals.css)
 * so the page and the other bottom bars keep clear of it.
 */
export default function MobileTabBar({ user, isAdmin = false }: { user: User | null; isAdmin?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  if (pathname?.startsWith("/embed/")) return null;

  const moreLinks: NavLink[] = [
    ...MORE_LINKS,
    ...(user ? [{ href: `/artist/${user.id}`, label: "Your artist page", icon: "profile" as const }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "admin" as const }] : []),
  ];
  // The home page has the logo; "More" lights up for the sections inside it.
  const moreActive = moreLinks.some((l) => l.href !== "/" && isActive(pathname, l.href));

  return (
    <>
      {moreOpen && (
        // Above the Studio's sheets and panels (the AI producer, the library), so it never opens behind them.
        <div className="fixed inset-0 z-[76] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/55" />
          <div
            id="more-sheet"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-3 rounded-2xl border border-border bg-surface p-2 shadow-2xl"
            style={{ bottom: "calc(var(--tabbar-h) + 0.75rem)", animation: "sheet-in 0.18s ease-out" }}
          >
            <ul className="flex flex-col">
              {moreLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
                        active ? "bg-surface-raised text-foreground" : "text-foreground hover:bg-surface-hover"
                      }`}
                    >
                      <NavIcon name={link.icon} className={`h-5 w-5 ${active ? "text-brand-strong" : "text-muted"}`} />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        data-tabbar
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur-md md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <ul className="grid h-14 grid-cols-5">
          {TAB_LINKS.map((link) => (
            <li key={link.href}>
              <Tab link={link} active={isActive(pathname, link.href)} />
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-controls="more-sheet"
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                moreOpen || moreActive ? "text-brand-strong" : "text-muted"
              }`}
            >
              <NavIcon name="more" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function Tab({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
        active ? "text-brand-strong" : "text-muted active:text-foreground"
      }`}
    >
      <NavIcon name={link.icon} />
      {link.label}
    </Link>
  );
}
