"use client";

import { RefreshCw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 10 * 60_000;
// Coming back to the app checks again, but not more than once a minute.
const MIN_GAP_MS = 60_000;
const LATER = "remixt-update-later";

function readLater(): string | null {
  try {
    return sessionStorage.getItem(LATER);
  } catch {
    return null;
  }
}

// A script of the build this tab came from that the server no longer has.
function isStaleChunk(reason: unknown): boolean {
  const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? "");
  return /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(text);
}

/**
 * "A new version of Remixt is ready". An installed app (or a tab left
 * open for days) keeps running the code it started with, so this asks the
 * server which build is live — on open, on coming back to the app, every
 * ten minutes while it's showing, and straight away when a script fails to
 * load — and offers a reload when it's newer. "Later" holds off until the
 * next launch or the next new version.
 */
export default function UpdatePrompt() {
  const pathname = usePathname() ?? "/";
  const [ready, setReady] = useState<string | null>(null);
  // An embedded player sits on someone else's site: not ours to prompt on.
  const embed = pathname.startsWith("/embed/");

  useEffect(() => {
    // next.config.ts deploymentId, as this page's build has it; unset in dev.
    const mine = process.env.NEXT_DEPLOYMENT_ID;
    // Nothing to check while it's showing; "Later" starts the checks again.
    if (!mine || embed || ready) return;
    let last = 0;
    let busy = false;
    let stopped = false;

    const check = async (now = false) => {
      if (busy) return;
      if (!now && (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP_MS)) return;
      busy = true;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { id } = (await res.json()) as { id: string | null };
        if (!stopped && id && id !== mine && readLater() !== id) setReady(id);
      } catch {
        // Offline or mid-deploy: the next check will do.
      } finally {
        busy = false;
      }
    };
    const onVisible = () => void check();
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleChunk(e.reason)) void check(true);
    };
    const onError = (e: Event) => {
      const target = e.target as HTMLScriptElement | null;
      const scriptFailed = target?.tagName === "SCRIPT" && target.src.includes("/_next/");
      if (scriptFailed || isStaleChunk((e as ErrorEvent).error ?? (e as ErrorEvent).message)) void check(true);
    };

    void check(true);
    const timer = setInterval(onVisible, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("unhandledrejection", onRejection);
    // Capturing: a <script> that fails to load doesn't bubble.
    window.addEventListener("error", onError, true);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError, true);
    };
  }, [embed, ready]);

  if (!ready || embed) return null;

  function later() {
    try {
      sessionStorage.setItem(LATER, ready!);
    } catch {}
    setReady(null);
  }

  return (
    <div
      role="dialog"
      aria-label="Update Remixt"
      className="bottom-float fixed inset-x-3 z-[71] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-2xl backdrop-blur-md"
      style={{ animation: "sheet-in 0.25s ease-out" }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
        <RefreshCw className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-sm font-semibold">A new version of Remixt is ready</p>
        <p className="text-muted">Reload to get it. Your Studio draft is kept.</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-strong"
      >
        Update
      </button>
      <button onClick={later} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label="Later">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
