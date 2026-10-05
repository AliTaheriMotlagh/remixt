"use client";

import { useEffect, useRef } from "react";

/** setInterval that always calls the latest callback and cleans up. */
export function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
