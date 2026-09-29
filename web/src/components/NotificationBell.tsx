"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_MS = 60_000;

/** The bell in the nav bar: unread count, checked every minute while the tab is open. */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/notifications?count=1").catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!cancelled && typeof data?.unread === "number") setUnread(data.unread);
    }
    void check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
    // Re-checked on navigation, so opening the notifications page clears the badge.
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
      aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      title="Notifications"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-vocals px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
