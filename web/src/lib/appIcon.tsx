import { ImageResponse } from "next/og";
import { markDataUri } from "@/lib/brand";

/**
 * The Remixt mark (lib/brand.ts) as a PNG at any size, for the browser tab
 * and home-screen icons. `rounded` draws the rounded tile with transparent
 * corners; without it the gradient runs to the edges — what iOS wants (it
 * rounds icons itself and shows black through transparency) and what
 * Android's `maskable` icons want (it crops them to its own shape; the bars
 * already sit inside the safe zone).
 */
export function appIcon(size: number, { maskable = false, rounded = true } = {}) {
  const src = markDataUri(rounded && !maskable ? "tile" : "square");
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element -- next/og renders <img>, not next/image
      <img src={src} width={size} height={size} alt="" />
    ),
    { width: size, height: size }
  );
}
