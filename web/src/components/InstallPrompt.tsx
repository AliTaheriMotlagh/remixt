"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SEEN = "remixt-visits";
const DISMISSED = "remixt-install-dismissed";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * "Add Remixt to your home screen" — offered from the second visit on (a
 * first-time visitor hasn't decided they like it yet), once, dismissible.
 * Android/desktop Chrome get the real install button; iPhone and iPad,
 * which have none, get the Share → Add to Home Screen steps.
 */
export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone || read(DISMISSED)) return;
    const visits = Number(read(SEEN) ?? 0) + 1;
    write(SEEN, String(visits));
    if (visits < 2) return;
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Not on the Studio's first seconds: let people look around first.
    const timer = apple
      ? setTimeout(() => {
          setIos(true);
          setShow(true);
        }, 20000)
      : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    write(DISMISSED, "1");
    setShow(false);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => null);
    dismiss();
  }

  return (
    <div
      role="dialog"
      aria-label="Install Remixt"
      className="bottom-float fixed inset-x-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-2xl backdrop-blur-md"
      style={{ animation: "sheet-in 0.25s ease-out" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon route */}
      <img src="/app-icon/192" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-sm font-semibold">Get the Remixt app</p>
        <p className="text-muted">
          {ios ? (
            <>
              Tap <span aria-label="Share">⎋ Share</span>, then <b>Add to Home Screen</b> — full screen, one tap away.
            </>
          ) : (
            "Full screen, one tap from your home screen — no store needed."
          )}
        </p>
      </div>
      {!ios && (
        <button onClick={install} className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-strong">
          Install
        </button>
      )}
      <button onClick={dismiss} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label="Not now">
        ✕
      </button>
    </div>
  );
}
