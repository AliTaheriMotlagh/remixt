"use client";

// Moving between an isolated page (Studio, upload, library… — lib/isolation.ts)
// and an ordinary one is a full page load, so each gets its own headers: the
// Studio its every-core splitter, a remix or tool page its ad network. A
// client-side move would keep the first page's headers for the second.
//
// Not while a split or upload runs in the background (leaveGuard): a reload
// would stop it. The page then simply keeps its headers — the Studio splits
// on fewer cores, an ad spot shows Remixt's own ad instead of a network's.

import { useEffect } from "react";
import { isPageNavigation } from "@/lib/client/navigation";
import { workInProgress } from "@/lib/client/leaveGuard";
import { crossesIsolation } from "@/lib/isolation";

/** The path this document was loaded as (client-side moves don't change its headers). */
function loadedAs(): string {
  const entry = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  try {
    return new URL(entry?.name || location.href).pathname;
  } catch {
    return location.pathname;
  }
}

export default function IsolationBoundary() {
  useEffect(() => {
    const first = loadedAs();
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const click = { button: event.button, meta: event.metaKey, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey };
      if (!isPageNavigation({ href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") }, click, location)) return;
      if (!crossesIsolation(first, new URL(anchor.href).pathname) || workInProgress()) return;
      // The link isn't handed to the router (it listens further down): the browser follows it as a plain link.
      event.stopPropagation();
    }
    // Capture, on the document: before React's own listener on the app's root.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
