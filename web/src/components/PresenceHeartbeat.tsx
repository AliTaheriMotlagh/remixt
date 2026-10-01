"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendHeartbeat } from "@/lib/client/presence";

const HEARTBEAT_MS = 30_000; // lib/presence.ts HEARTBEAT_SECONDS

// Reports this tab as online — on every page change and every half minute
// while it's visible. A hidden tab goes quiet and drops off the count
// within a minute or so; showing it again reports straight back in.
export default function PresenceHeartbeat() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    // An embedded player sits on someone else's site: not a visit here.
    if (pathname.startsWith("/embed/")) return;

    const beat = () => {
      if (document.visibilityState === "visible") void sendHeartbeat(pathname);
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
