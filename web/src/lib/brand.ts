// The Remixt mark — a waveform splitting into a vocal half (pink, on top)
// and a beat half (cyan, below) — as geometry, so the nav bar, the app
// icons, link previews and the social-clip video all draw the same thing.
// Matches public/remixt-logo/*.svg (a 512×512 canvas).

/** [x, y, height] of each 36-wide bar. The first two are whole; the rest are split pairs. */
export const MARK_BARS: [number, number, number][] = [
  [88, 197, 118],
  [138, 158, 196],
  [188, 115, 135],
  [188, 262, 135],
  [238, 78, 165],
  [238, 269, 165],
  [288, 105, 131],
  [288, 276, 131],
  [338, 135, 95],
  [338, 282, 95],
  [388, 163, 62],
  [388, 287, 62],
];
export const MARK_BAR_WIDTH = 36;
export const MARK_TILE_RADIUS = 116;
/** The tile's diagonal gradient. */
export const MARK_GRADIENT = ["#ec4899", "#8b5cf6", "#06b6d4"] as const;

/**
 * - `tile`: white bars on the rounded gradient tile (the app icon)
 * - `square`: the same, full-bleed — for iOS and Android, which round icons themselves
 * - `bars`: the bars alone in pink and cyan, on a transparent background
 */
export type MarkVariant = "tile" | "square" | "bars";

/** Colour of a bar in the transparent variant: whole bars fade, top halves pink, bottom halves cyan. */
export function barFill(index: number, gradientRef: string) {
  if (index < 2) return gradientRef;
  return index % 2 === 0 ? MARK_GRADIENT[0] : MARK_GRADIENT[2];
}

export function markSvg(variant: MarkVariant = "tile") {
  const [from, via, to] = MARK_GRADIENT;
  const tile =
    variant === "bars"
      ? ""
      : `<rect width="512" height="512" rx="${variant === "tile" ? MARK_TILE_RADIUS : 0}" fill="url(#t)"/>`;
  const bars = MARK_BARS.map(
    ([x, y, h], i) =>
      `<rect x="${x}" y="${y}" width="${MARK_BAR_WIDTH}" height="${h}" rx="18" fill="${
        variant === "bars" ? barFill(i, "url(#w)") : "#fff"
      }"/>`
  ).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>` +
    `<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset=".55" stop-color="${via}"/><stop offset="1" stop-color="${to}"/></linearGradient>` +
    `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>` +
    `</defs>${tile}${bars}</svg>`
  );
}

/** The mark as an image URL, for <img>, canvas and next/og. */
export function markDataUri(variant: MarkVariant = "tile") {
  const svg = markSvg(variant);
  const base64 = typeof btoa === "function" ? btoa(svg) : Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/** Square, opaque artwork for the lock screen / media notification while something plays. */
export const NOW_PLAYING_ARTWORK: MediaImage[] = [
  { src: "/app-icon/192-maskable", sizes: "192x192", type: "image/png" },
  { src: "/app-icon/512-maskable", sizes: "512x512", type: "image/png" },
  { src: "/remixt-logo/png/remixt-avatar-800.png", sizes: "800x800", type: "image/png" },
];
