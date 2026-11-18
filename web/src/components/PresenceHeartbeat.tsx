"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendHeartbeat } from "@/lib/client/presence";
import { isBareView } from "@/lib/bareView";

const HEARTBEAT_MS = 30_000; // lib/presence.ts HEARTBEAT_SECONDS

// Reports this tab as online — on every page change and every half minute
// while it's visible. A hidden tab goes quiet and drops off the count
// within a minute or so; showing it again reports straight back in.
export default function PresenceHeartbeat() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    // An embedded player sits on someone else's site: not a visit here.
    if (isBareView(pathname)) return;

    // The page's first beat once it's on screen counts as a view (and
    // the day's first, as a visit) — a tab opened in the background
    // counts when it's first looked at.
    let viewed = false;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void sendHeartbeat(pathname, !viewed);
      viewed = true;
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [pathname]);

  return null;
}
