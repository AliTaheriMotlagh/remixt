/**
 * Pages shown inside someone else's frame or a broadcast (a remix's embed,
 * a radio station's embed and its OBS view): no nav bar, tab bar, prompts
 * or background activity — just the player.
 */
export function isBareView(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/embed/") || /^\/radio\/[^/]+\/(embed|broadcast)\/?$/.test(pathname);
}

/**
 * Whether the site footer (links to every section and tool) goes under the
 * page. Not under a bare view, nor under the full-height work screens — the
 * Studio and a station's console — where it would only add a scroll.
 */
export function showsFooter(pathname: string | null | undefined): boolean {
  if (!pathname || isBareView(pathname)) return false;
  return !/^\/studio(\/|$)/.test(pathname) && !/^\/radio\/[^/]+\/console\/?$/.test(pathname);
}
