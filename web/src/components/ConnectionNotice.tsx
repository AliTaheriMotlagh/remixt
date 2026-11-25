"use client";

import { Wifi, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isBareView } from "@/lib/bareView";
import { onReconnect } from "@/lib/client/connection";

/**
 * A small notice while the device is offline — "what you were doing carries
 * on when the line is back" — and a moment of "Back online" when it is. The
 * work itself picks up by itself (lib/client/connection.ts wakes every wait):
 * this only says so, so nobody reloads and loses it.
 */
export default function ConnectionNotice() {
  const pathname = usePathname() ?? "/";
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const stop = onReconnect(() => {
      setState((s) => (s === "offline" ? "back" : s));
      clearTimeout(timer);
      timer = setTimeout(() => setState((s) => (s === "back" ? "online" : s)), 2500);
    });
    window.addEventListener("offline", offline);
    if (navigator.onLine === false) offline();
    return () => {
      stop();
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
    };
  }, []);

  if (state === "online" || isBareView(pathname)) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-[env(safe-area-inset-top)] z-[70] mx-auto mt-2 flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg ${
        state === "offline" ? "bg-surface-raised text-foreground ring-1 ring-border" : "bg-success text-white"
      }`}
    >
      {state === "offline" ? <WifiOff className="h-4 w-4 shrink-0 text-danger" /> : <Wifi className="h-4 w-4 shrink-0" />}
      {state === "offline" ? "You're offline — playing, uploads and downloads carry on when you're back" : "Back online — picking up where you were"}
    </div>
  );
}
