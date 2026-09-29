"use client";

import { useEffect } from "react";

/** Marks everything read once the page has shown it. */
export default function MarkNotificationsRead() {
  useEffect(() => {
    void fetch("/api/notifications", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
