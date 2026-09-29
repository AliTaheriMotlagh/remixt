import { ImageResponse } from "next/og";

/**
 * The Remixt mark — the "R" on the vocals→beat gradient from the nav bar —
 * drawn at any size, for the home-screen icon and the browser tab.
 * `maskable` leaves the safe-zone padding Android crops icons to.
 */
export function appIcon(size: number, { maskable = false, rounded = true } = {}) {
  const inset = maskable ? size * 0.1 : 0;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#0a0a0f" : "transparent",
        }}
      >
        <div
          style={{
            width: size - inset * 2,
            height: size - inset * 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: rounded && !maskable ? size * 0.22 : 0,
            background: "linear-gradient(135deg, #ec4899, #06b6d4)",
            color: "white",
            fontSize: (size - inset * 2) * 0.58,
            fontWeight: 900,
          }}
        >
          R
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
