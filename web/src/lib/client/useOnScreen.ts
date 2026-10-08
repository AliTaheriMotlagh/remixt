"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a popover that hangs off a button inside the window. A toolbar
 * that wraps (a docked AI panel, a narrow window) can leave a right-aligned
 * popover's button near the left edge, or a left-aligned one near the
 * right; this slides the popover back in by just enough. Phones show these
 * as bottom sheets (position: fixed, see .popover-sheet), which are left
 * alone.
 *
 *   const [onScreen, onScreenStyle] = useOnScreen<HTMLDivElement>(open);
 *   <div ref={onScreen} style={onScreenStyle} className="popover-sheet absolute …">
 */
export function useOnScreen<T extends HTMLElement>(open: boolean, margin = 8) {
  // A callback ref (kept in state), so the popover is measured once it's in the page.
  const [el, setEl] = useState<T | null>(null);
  const [shift, setShift] = useState(0);
  const applied = useRef(0);
  useLayoutEffect(() => {
    if (!open || !el) return;
    const place = () => {
      if (getComputedStyle(el).position === "fixed") {
        applied.current = 0;
        setShift(0);
        return;
      }
      // Where it would be without the shift already applied.
      const r = el.getBoundingClientRect();
      const left = r.left - applied.current;
      const right = r.right - applied.current;
      const max = document.documentElement.clientWidth - margin;
      const x = left < margin ? margin - left : right > max ? max - right : 0;
      applied.current = x;
      setShift(x);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, el, margin]);
  return [setEl, shift ? { translate: `${shift}px 0` } : undefined] as const;
}
