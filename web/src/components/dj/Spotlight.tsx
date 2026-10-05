"use client";

import { useEffect, useRef } from "react";
import { useRaf } from "./ui";

/**
 * The lesson pointer: a pulsing ring around the control the current step
 * is about (any element with a matching `data-dj` attribute), kept in place
 * every frame as the page scrolls or the layout changes. Calls `onReveal`
 * first so a phone layout can switch to the tab that holds the control,
 * then scrolls it into view.
 */
export default function Spotlight({ target, label, onReveal }: { target: string | null | undefined; label?: string; onReveal?: (target: string) => void }) {
  const ring = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;
    onReveal?.(target);
    const id = setTimeout(() => {
      const el = document.querySelector(`[data-dj="${CSS.escape(target)}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the step changes
  }, [target]);

  useRaf(() => {
    const r = ring.current;
    if (!r) return;
    const el = target ? document.querySelector(`[data-dj="${CSS.escape(target)}"]`) : null;
    const box = el?.getBoundingClientRect();
    if (!box || box.width === 0) {
      r.style.display = "none";
      if (tag.current) tag.current.style.display = "none";
      return;
    }
    r.style.display = "block";
    r.style.left = `${box.left - 6}px`;
    r.style.top = `${box.top - 6}px`;
    r.style.width = `${box.width + 12}px`;
    r.style.height = `${box.height + 12}px`;
    if (tag.current) {
      tag.current.style.display = label ? "block" : "none";
      tag.current.style.left = `${Math.max(8, Math.min(window.innerWidth - 168, box.left))}px`;
      tag.current.style.top = `${box.top > 40 ? box.top - 34 : box.bottom + 10}px`;
    }
  }, !!target);

  if (!target) return null;
  return (
    <>
      <div ref={ring} aria-hidden className="pointer-events-none fixed z-[70] animate-pulse rounded-xl border-[3px] border-drums shadow-[0_0_0_4px_rgba(245,158,11,0.25),0_0_24px_rgba(245,158,11,0.6)]" style={{ display: "none" }} />
      <div ref={tag} aria-hidden className="pointer-events-none fixed z-[71] max-w-40 truncate rounded-md bg-drums px-2 py-1 text-[11px] font-bold text-black shadow-lg" style={{ display: "none" }}>
        {label}
      </div>
    </>
  );
}
