// Which link clicks open another page of this site in this tab (the bar
// across the top, components/NavProgress.tsx, starts for those). Pure.

/** Whether a click on this link opens another page of this site in this tab. */
export function isPageNavigation(
  anchor: { href: string; target?: string; hasDownload?: boolean },
  click: { button: number; meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean },
  here: { origin: string; pathname: string }
): boolean {
  if (click.button !== 0 || click.meta || click.ctrl || click.shift || click.alt) return false;
  if (anchor.hasDownload || (anchor.target && anchor.target !== "_self")) return false;
  let url: URL;
  try {
    url = new URL(anchor.href, here.origin);
  } catch {
    return false;
  }
  if (url.origin !== here.origin) return false;
  // API routes (an ad's click, a download) aren't pages.
  if (url.pathname.startsWith("/api/")) return false;
  // Only the ?query or #fragment changes: the page stays (filters, tabs), and
  // the bar couldn't tell when it's done.
  return url.pathname !== here.pathname;
}
