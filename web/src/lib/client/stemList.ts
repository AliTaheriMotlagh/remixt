"use client";

import { cacheGet, cachePut } from "./localCache";

// The library's list of stems (/api/stems), which the Studio's library
// panel and the DJ and examples pages all start from. The last one fetched
// is kept on disk (localCache.ts), so a visit shows the library at once —
// or at all, offline — while a fresh copy loads.

const KEY = "stems";

/** A fresh list from the server, kept on disk for next time. */
export async function fetchStemRows<T>(): Promise<T[]> {
  const res = await fetch("/api/stems");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const { stems } = JSON.parse(text) as { stems: T[] };
  void cachePut("list", KEY, stems, text.length);
  return stems;
}

/** The list as it was last fetched on this device, or null. */
export function keptStemRows<T>(): Promise<T[] | null> {
  return cacheGet<T[]>("list", KEY);
}
