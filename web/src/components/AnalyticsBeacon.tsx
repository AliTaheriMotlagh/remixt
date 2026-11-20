"use client";

// Counts each page view and how long it was looked at (lib/client/analytics.ts).
// Time is counted only while the tab is visible; it's sent when the page is
// left, hidden or closed. Embedded players (on other sites) aren't counted.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";
import { isBareView } from "@/lib/bareView";
import { sendEngagement, sendView } from "@/lib/client/analytics";

export default function AnalyticsBeacon() {
  const pathname = usePathname() ?? "/";
  const { features } = useSettings();
  const on = features.analytics;

  useEffect(() => {
    if (!on || isBareView(pathname)) return;
    const id = sendView(pathname);
    if (!id) return;
    let shown = 0;
    let since = document.visibilityState === "visible" ? performance.now() : null;
    const flush = () => {
      if (since !== null) shown += performance.now() - since;
      since = null;
      sendEngagement(id, shown);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else since = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [pathname, on]);

  return null;
}
