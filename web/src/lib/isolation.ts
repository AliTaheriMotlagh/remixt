// Which pages are "cross-origin isolated" (COOP + COEP headers,
// next.config.ts). Isolation lets the song splitter use every CPU core
// (SharedArrayBuffer), but it also blocks ad networks: their ads are iframes
// from other sites, which an isolated page refuses. So only the pages where
// the heavy work happens are isolated, and they show no network ads; every
// other page (remixes, radio, tools, guides, home) can carry them.
//
// A document keeps the headers it was loaded with, so moving between the two
// kinds of page is a full page load (components/IsolationBoundary.tsx) —
// except while a split or upload runs in the background, which a reload
// would stop.
//
// Tool pages split in the browser too, but they're the pages people arrive at
// from search, so they carry ads: without isolation the splitter there uses
// the GPU (WebGPU) or one CPU core.

export const ISOLATED_ROOTS = ["studio", "upload", "library", "dj", "live", "examples", "storage"] as const;

/** Whether a page at `pathname` is served isolated. */
export function isIsolatedPath(pathname: string): boolean {
  const root = pathname.split("/")[1] ?? "";
  return (ISOLATED_ROOTS as readonly string[]).includes(root);
}

/** Whether going from the page this document was loaded as to `to` needs a full page load. */
export function crossesIsolation(loadedAs: string, to: string): boolean {
  return isIsolatedPath(loadedAs) !== isIsolatedPath(to);
}
