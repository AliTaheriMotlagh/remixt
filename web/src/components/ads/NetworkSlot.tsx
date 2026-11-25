"use client";

// An ad network's ad in a spot (lib/monetize/network.ts): Google AdSense's
// responsive unit, or another network's script + the element it fills.
// It tells the spot whether the network filled it; if not (no ad to give,
// an ad blocker, the script didn't load in time), the spot shows Remixt's
// own ad instead — never an empty hole.

import { useEffect, useRef } from "react";
import type { NetworkAd } from "@/lib/monetize/network";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Waits this long for a network to fill its spot. */
const GIVE_UP_MS = 8_000;

function loadOnce(id: string, src: string, attrs: Record<string, string> = {}): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.state === "ok") return Promise.resolve();
  if (existing?.dataset.state === "failed") return Promise.reject(new Error("blocked"));
  return new Promise((resolve, reject) => {
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("blocked")), { once: true });
    if (existing) return;
    el.id = id;
    el.async = true;
    el.src = src;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.addEventListener("load", () => (el.dataset.state = "ok"), { once: true });
    el.addEventListener("error", () => (el.dataset.state = "failed"), { once: true });
    document.head.appendChild(el);
  });
}

export default function NetworkSlot({ ad, onResult }: { ad: NetworkAd; onResult: (filled: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    done.current = false;
    const finish = (filled: boolean) => {
      if (done.current) return;
      done.current = true;
      report.current(filled);
    };
    const timer = setTimeout(() => finish(false), GIVE_UP_MS);

    let watch: MutationObserver | null = null;
    if (ad.kind === "adsense") {
      const ins = el.querySelector("ins");
      // AdSense marks the unit when it's decided: data-ad-status="filled" | "unfilled".
      watch = new MutationObserver(() => {
        const status = ins?.getAttribute("data-ad-status");
        if (status) finish(status === "filled");
      });
      if (ins) watch.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
      loadOnce("adsbygoogle-js", `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ad.client)}`, { crossorigin: "anonymous" })
        .then(() => {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        })
        .catch(() => finish(false));
    } else {
      const target = el.querySelector(`[id="${CSS.escape(ad.elementId)}"]`);
      // Filled once the network puts something with a size in its element.
      watch = new MutationObserver(() => {
        const child = target?.firstElementChild as HTMLElement | null;
        if (child && (child.offsetHeight > 0 || target!.getBoundingClientRect().height > 20)) finish(true);
      });
      if (target) watch.observe(target, { childList: true, subtree: true, attributes: true });
      // Many networks only look for their element when their script runs, so a page reached
      // without a reload gets a fresh copy of the script (the old one is taken out).
      document.getElementById("adnetwork-js")?.remove();
      const script = document.createElement("script");
      script.id = "adnetwork-js";
      script.async = true;
      script.src = ad.src;
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }
    return () => {
      clearTimeout(timer);
      watch?.disconnect();
      done.current = true;
    };
  }, [ad]);

  return (
    <div ref={box} className="min-h-[8.5rem] w-full">
      {ad.kind === "adsense" ? (
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={ad.client}
          data-ad-slot={ad.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div id={ad.elementId} />
      )}
    </div>
  );
}
