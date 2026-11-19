"use client";

// Books one view of a served ad (`token`) once at least half of it has been
// on screen for a second in a visible tab (the IAB/MRC standard), like
// AdCard does for its own box. For promoted remixes and songs in lists.

import { useEffect, useRef, type ReactNode } from "react";
import { VIEWABLE } from "@/lib/monetize/policy";
import { visitorId } from "@/lib/client/presence";

export default function SeenOnce({ token, children, className = "" }: { token: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const seen = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (done || !entry || entry.intersectionRatio < VIEWABLE.fraction || document.hidden) return;
        timer = setTimeout(() => {
          if (document.hidden || done) return;
          done = true;
          seen.disconnect();
          fetch("/api/ads/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, visitor: visitorId() }),
            keepalive: true,
          }).catch(() => {});
        }, VIEWABLE.ms);
      },
      { threshold: [0, VIEWABLE.fraction, 1] }
    );
    seen.observe(el);
    return () => {
      clearTimeout(timer);
      seen.disconnect();
    };
  }, [token]);
  return (
    <div ref={box} className={className}>
      {children}
    </div>
  );
}
