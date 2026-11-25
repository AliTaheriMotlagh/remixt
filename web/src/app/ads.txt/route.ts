import { getSettings } from "@/lib/settings/server";
import { adsTxt } from "@/lib/monetize/network";

// /ads.txt (IAB): which ad networks may sell this site's ad spots. AdSense and
// most networks hold or cut payment without it. Written from Admin → Settings
// → Ad networks: AdSense's line from the publisher id, plus the owner's lines.
export async function GET() {
  const { network } = await getSettings();
  return new Response(adsTxt(network), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
