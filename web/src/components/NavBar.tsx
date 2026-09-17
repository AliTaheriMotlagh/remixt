"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/auth";

const links = [
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Studio" },
  { href: "/remixes", label: "Remixes" },
  { href: "/upload", label: "Upload" },
];

export default function NavBar({ user }: { user: User | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-vocals to-beat text-sm font-black text-white">
              R
            </span>
            <span className="text-lg font-bold tracking-tight">Remixt</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <Link
              href={`/artist/${user.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: user.avatar_color }}
              >
                {user.artist_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-sm font-medium sm:inline">
                {user.artist_name}
              </span>
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              Become an artist
            </Link>
          </div>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
