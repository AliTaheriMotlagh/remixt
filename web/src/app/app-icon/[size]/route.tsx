import { appIcon } from "@/lib/appIcon";

// Icons for the web app manifest (see app/manifest.ts): /app-icon/192,
// /app-icon/512, and a padded "maskable" one Android can crop to any shape.
const SIZES = new Set([192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const maskable = raw.endsWith("-maskable");
  const size = Number(raw.replace("-maskable", ""));
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const image = appIcon(size, { maskable });
  image.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return image;
}
