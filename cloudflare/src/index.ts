import { Container, getContainer } from "@cloudflare/containers";

// Every setting the app reads. Each is passed to the container when set
// (as a `wrangler secret` or a var in wrangler.jsonc).
const KEYS = [
  "DATABASE_URL", "SESSION_SECRET", "PUBLIC_BASE_URL", "ADMIN_EMAILS",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL",
  "CAPTCHA_SECRET", "AI_KEY_SECRET", "AI_SHARED_ANTHROPIC_KEY", "AI_SHARED_MODEL",
  "AI_SHARED_DAILY_QUESTIONS", "GENIUS_ACCESS_TOKEN", "YTDLP_PROXY", "YTDLP_COOKIES",
  "MUSIC_SITES", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION", "YANDEX_VERIFICATION",
  "STORAGE_LIMIT_GB",
  // Plans and payments, email, the site's AI (each can also be entered in Admin → Plans).
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_MODE",
  "RESEND_API_KEY", "MAIL_FROM", "OPENROUTER_API_KEY",
] as const;

type Env = { REMIXT: DurableObjectNamespace<Remixt>; CF_VERSION_METADATA?: { id: string } } & Partial<Record<(typeof KEYS)[number], string>>;

export class Remixt extends Container<Env> {
  defaultPort = 3000;
  // A container is billed while it's awake. It sleeps after 5 minutes
  // with no request that reaches it (static files are served from the edge
  // cache below and don't count); the next visit wakes it in a few seconds.
  // A radio listener or a live room polls, so those keep it awake as needed.
  sleepAfter = "5m";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = {};
    for (const k of KEYS) if (env[k]) vars[k] = env[k]!;
    this.envVars = vars;
  }
}

/**
 * Files that never change at their address: Next's hashed build files,
 * fonts and the public folder's pictures, sounds and icons. Served from
 * Cloudflare's cache at the visitor's edge once fetched, so they don't wake
 * (or keep awake, or bill) the container, and arrive faster — over a VPN
 * especially. Only answers the app itself marked public are kept.
 */
const STATIC = /^\/(?:_next\/static\/|ads\/|icons?\/|fonts?\/)|\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|ico|mp3|mp4|webmanifest)$/i;

async function fromEdgeCache(request: Request, ctx: ExecutionContext, origin: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) {
    // Said in a header, so a check (the deploy's smoke test, curl -I) can see the edge cache works.
    const served = new Response(hit.body, hit);
    served.headers.set("x-edge-cache", "HIT");
    return served;
  }
  const res = await origin();
  const cc = res.headers.get("cache-control") ?? "";
  if (res.status === 200 && /\bpublic\b|\bimmutable\b/.test(cc) && !/no-store|private/.test(cc) && !res.headers.has("set-cookie")) {
    ctx.waitUntil(cache.put(request, res.clone()));
  }
  return res;
}

/**
 * Public pages as a signed-out visitor (or a search engine's crawler) sees
 * them. Without the session cookie the HTML is the same for everyone, so it
 * is kept at Cloudflare's edge for a few minutes: Googlebot, Bingbot and
 * logged-out visitors get a fast answer (good for Core Web Vitals) and don't
 * wake — or keep awake, or bill — the container. Signed-in visitors always
 * reach the app.
 *
 * Kept per deploy (the Worker's version is in the key): a page cached by the
 * last deploy names its hashed /_next/static files, which the new container
 * no longer has, so serving it after a deploy would load unstyled and dead.
 */
const PUBLIC_PAGE = /^\/(?:$|remixes(?:\/|$)|artist\/|tools(?:\/|$)|fa(?:\/|$)|guides(?:\/|$)|examples$|challenges$|leaderboard$|plus$|earnings$|advertise$|dj(?:\/crate)?$|library$|privacy$|terms$|takedown$|sitemap\.xml$|robots\.txt$|llms\.txt$)/;
const PAGE_TTL = 600; // seconds a page stays at the edge

async function pageFromEdgeCache(request: Request, ctx: ExecutionContext, version: string, origin: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const keyUrl = new URL(request.url);
  keyUrl.searchParams.set("__deploy", version);
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) {
    const served = new Response(request.method === "HEAD" ? null : hit.body, hit);
    served.headers.set("x-edge-cache", "HIT");
    served.headers.set("cache-control", "public, max-age=0, must-revalidate");
    return served;
  }
  const res = await origin();
  const type = res.headers.get("content-type") ?? "";
  if (request.method === "GET" && res.status === 200 && !res.headers.has("set-cookie") && /text\/html|xml|text\/plain/.test(type)) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set("cache-control", `public, s-maxage=${PAGE_TTL}, max-age=${PAGE_TTL}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.remixt.app") {
      url.hostname = "remixt.app";
      return Response.redirect(url.toString(), 301);
    }
    // The visitor's address for the app's rate limits (sign-up, log-in, ads).
    // Without it every visitor looked like the same "unknown" address, so
    // five sign-ups an hour from anyone closed sign-up for everyone.
    // Cloudflare sets CF-Connecting-IP itself; a visitor can't forge it, so
    // whatever X-Real-IP they sent is replaced.
    const headers = new Headers(request.headers);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-real-ip", ip);
    else headers.delete("x-real-ip");
    headers.set("x-forwarded-proto", "https");
    // One shared instance: the app keeps live rooms (radio, DJ) in memory.
    const origin = () => getContainer(env.REMIXT, "main").fetch(new Request(request, { headers }));
    if (request.method === "GET" && !url.search && STATIC.test(url.pathname) && !url.pathname.startsWith("/api/")) {
      return fromEdgeCache(request, ctx, origin);
    }
    const signedIn = /(?:^|;\s*)remix_session=/.test(request.headers.get("cookie") ?? "");
    if ((request.method === "GET" || request.method === "HEAD") && !signedIn && !request.headers.has("rsc") && !url.search && PUBLIC_PAGE.test(url.pathname)) {
      return pageFromEdgeCache(request, ctx, env.CF_VERSION_METADATA?.id ?? "dev", origin);
    }
    return origin();
  },
};
