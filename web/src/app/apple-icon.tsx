import { appIcon } from "@/lib/appIcon";

// iOS rounds home-screen icons itself, and shows black behind transparency.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180, { rounded: false });
}
