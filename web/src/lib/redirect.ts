import { NextResponse } from "next/server";

/**
 * A redirect to a path on this site, sent as a relative Location so the
 * browser resolves it against the address it's actually on. Behind a proxy
 * (the Cloudflare container) the request's own URL is the server's inner
 * address (https://0.0.0.0:3000), so `new URL(path, req.url)` would send
 * people there and the link would go nowhere. An absolute http(s) URL (an
 * advertiser's site) goes as it is.
 */
export function redirectTo(location: string, status: 302 | 303 | 307 = 302): NextResponse {
  const absolute = /^https?:\/\//i.test(location);
  // Only our own paths: "//evil.example" would leave the site.
  const target = absolute ? location : location.startsWith("/") && !location.startsWith("//") ? location : "/";
  return new NextResponse(null, { status, headers: { Location: target, "Cache-Control": "no-store" } });
}
