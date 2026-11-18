/**
 * Pages shown inside someone else's frame or a broadcast (a remix's embed,
 * a radio station's embed and its OBS view): no nav bar, tab bar, prompts
 * or background activity — just the player.
 */
export function isBareView(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/embed/") || /^\/radio\/[^/]+\/(embed|broadcast)\/?$/.test(pathname);
}
