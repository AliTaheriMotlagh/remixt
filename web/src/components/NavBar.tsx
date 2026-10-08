"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { User } from "@/lib/auth";
import NotificationBell from "./NotificationBell";
import RemixtMark from "./RemixtMark";
import { NAV_LINKS, NavIcon, isActive } from "./navLinks";

export default function NavBar({ user, isAdmin = false }: { user: User | null; isAdmin?: boolean }) {
  const pathname = usePathname();
  // An embedded player (on someone else's site) is just the player.
  if (pathname?.startsWith("/embed/")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 lg:gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Remixt home">
            <RemixtMark className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">Remixt</span>
          </Link>
          {/* Phones get the tab bar at the bottom instead (MobileTabBar). */}
          <nav className="hidden gap-0.5 md:flex lg:gap-1" aria-label="Main">
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:px-3 ${
                    link.wideOnly ? "hidden lg:flex" : "flex"
                  } ${
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {link.icon === "live" && <span className="live-dot h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
                  {link.label}
                </Link>
              );
            })}
            <MoreLinks pathname={pathname} />
          </nav>
        </div>

        {user ? (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationBell />
            <AccountMenu user={user} isAdmin={isAdmin} />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Become an artist</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

/** The avatar button: your profile, admin, and logging out. */
function AccountMenu({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close when you tap elsewhere, press Escape, or go to another page.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  async function handleLogout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 items-center gap-2 rounded-lg px-1.5 hover:bg-surface sm:px-2"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: user.avatar_color }}
        >
          {user.artist_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium lg:inline">{user.artist_name}</span>
        <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        >
          <p className="truncate px-3 pb-2 pt-1.5 text-xs text-muted">
            Signed in as <span className="font-semibold text-foreground">{user.artist_name}</span>
          </p>
          <Link href={`/artist/${user.id}`} role="menuitem" className={item}>
            <NavIcon name="profile" className="h-4 w-4 text-muted" />
            Your artist page
          </Link>
          <Link href="/storage" role="menuitem" className={item}>
            <NavIcon name="storage" className="h-4 w-4 text-muted" />
            Saved on this device
          </Link>
          {isAdmin && (
            <Link href="/admin" role="menuitem" className={item}>
              <NavIcon name="admin" className="h-4 w-4 text-muted" />
              Admin
            </Link>
          )}
          <div className="my-1 border-t border-border" />
          <button onClick={handleLogout} role="menuitem" className={`${item} hover:!text-danger`}>
            <NavIcon name="logout" className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** Tablets: the links that don't fit in the header, in one menu. Laptops show them all. */
function MoreLinks({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = NAV_LINKS.filter((l) => l.wideOnly);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const active = hidden.some((l) => isActive(pathname, l.href));
  return (
    <div ref={ref} className="relative hidden md:block lg:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
          active ? "bg-surface-raised text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        More <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
          {hidden.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <NavIcon name={link.icon} className="h-4 w-4 text-muted" />
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
