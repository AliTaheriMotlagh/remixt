"use client";

// A thin bar across the top from the moment a link to another page is
// tapped until that page is there. The loading pages (app/**/loading.tsx)
// show the page's shape; this answers the tap itself, even before them —
// on a slow line (or a VPN) a tap with no answer reads as a broken site.
//
// It listens for clicks on ordinary links (same site, same tab, no
// modifier keys, a different page) — no wrapper for every <Link>.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isPageNavigation } from "@/lib/client/navigation";

export default function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "going" | "done">("idle");
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const going = isPageNavigation(
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") },
        { button: event.button, meta: event.metaKey, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey },
        window.location
      );
      if (!going) return;
      clear();
      setState("going");
      setWidth(0.15);
      // Creeps towards the end without reaching it, quickly at first.
      [[150, 0.4], [600, 0.6], [1500, 0.75], [3500, 0.85], [8000, 0.92]].forEach(([ms, w]) =>
        timers.current.push(setTimeout(() => setWidth(w), ms))
      );
      // Never stuck: a navigation that didn't happen (a link whose own handler
      // cancelled it, an error) lets go.
      timers.current.push(setTimeout(() => setState("idle"), 10_000));
    }
    // Capture phase: next/link cancels the browser's own navigation
    // (preventDefault) to route itself, so by the bubble phase every link
    // click looks cancelled.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  // The new page is here.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (state === "going") {
      setState("done");
      setWidth(1);
    }
  }
  useEffect(() => {
    if (state !== "done") return;
    clear();
    timers.current.push(setTimeout(() => setState("idle"), 450));
  }, [state]);

  if (state === "idle") return null;
  return (
    <div
      aria-hidden
      className="nav-progress"
      style={{ transform: `scaleX(${width})`, opacity: state === "done" ? 0 : 1 }}
    />
  );
}
