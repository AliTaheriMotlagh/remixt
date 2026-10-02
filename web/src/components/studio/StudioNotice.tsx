"use client";

import { useStudioView } from "@/lib/client/studioView";

/** A short line after an edit — "Copied 3 clips", or why something couldn't be done. */
export default function StudioNotice() {
  const notice = useStudioView((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      key={notice.id}
      role="status"
      className={`bottom-float pointer-events-none fixed left-1/2 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-medium shadow-xl backdrop-blur-md ${
        notice.tone === "error" ? "border-danger/50 bg-danger/20 text-foreground" : "border-border bg-surface-raised/95 text-foreground"
      }`}
      style={{ animation: "sheet-in 0.18s ease-out" }}
    >
      {notice.text}
    </div>
  );
}
