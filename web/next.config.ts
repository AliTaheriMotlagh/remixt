import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import fs from "fs";
import path from "path";
import { ISOLATED_ROOTS } from "./src/lib/isolation";

// Hosts that ../share.sh can put in front of the dev server. Without these the
// dev server treats tunnelled requests as cross-origin and blocks /_next/*.
// TUNNEL_HOSTNAME comes from ../.share.env, for a Cloudflare tunnel on your
// own domain.
const tunnelHost = process.env.TUNNEL_HOSTNAME?.trim();

// This build's name (scripts/build-id.mjs). The page knows the one it was
// built from, and /api/version reports the live one, so an open tab or
// installed app can tell it's out of date (components/UpdatePrompt). It also
// makes a client-side navigation into a newer build a full reload instead
// of a broken one.
function buildId(): string | undefined {
  if (process.env.NEXT_DEPLOYMENT_ID) return process.env.NEXT_DEPLOYMENT_ID;
  try {
    return fs.readFileSync(path.join(__dirname, ".build-id"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

const nextConfig = (phase: string): NextConfig => ({
  deploymentId: phase === PHASE_DEVELOPMENT_SERVER ? undefined : buildId(),
  // Emits .next/standalone — a self-contained server.js plus only the
  // node_modules it uses — which is what the Docker image ships.
  output: "standalone",
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    const isolated = ISOLATED_ROOTS.join("|");
    // Cross-origin isolation lets the song splitter use SharedArrayBuffer,
    // i.e. every CPU core instead of one when there's no WebGPU. The
    // `credentialless` flavour still lets the page load cross-origin audio
    // (stems on R2) and the model (Hugging Face) without them opting in.
    // Only on the pages that do the heavy work (lib/isolation.ts): it also
    // blocks ad networks' iframes, which every other page may carry. Script
    // files (the splitter's workers) carry it too, so a worker started from
    // an isolated page is isolated as well.
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Browsers keep to https for two years (ignored over plain http, so local dev is unaffected).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // The microphone (the vocal booth) and camera (clip photos) only for this site; nothing else.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()" },
        ],
      },
      // No other site may frame Remixt (clickjacking: a hidden "Delete" or "Pay" under a decoy) —
      // except the pages made to be embedded: /embed/<remix>, a station's /embed and /broadcast.
      {
        source: "/:path((?!embed(?:/|$)|radio/[^/]+/(?:embed|broadcast)(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      { source: `/:root(${isolated})`, headers: isolation },
      { source: `/:root(${isolated})/:rest*`, headers: isolation },
      { source: "/_next/static/:path*", headers: [{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" }] },
      // ONNX Runtime's own thread workers (pthreads) start from /ort/*.mjs
      // inside the isolated splitter worker; without the header the browser
      // refuses them and the splitter dies with "Uncaught [object Event]".
      { source: "/ort/:path*", headers: [{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" }] },
    ];
  },
  // yt-dlp for link import (downloaded into bin/ by scripts/fetch-ytdlp.mjs)
  // isn't imported by any code, so tell the bundler to ship it with the
  // route that runs it.
  outputFileTracingIncludes: {
    "/api/import": ["./bin/yt-dlp*"],
    // The share cards' font, read from disk (lib/ogText.tsx).
    "/opengraph-image": ["./assets/fonts/*.ttf"],
    "/remixes/\\[id\\]/opengraph-image": ["./assets/fonts/*.ttf"],
  },
  turbopack: {
    root: path.join(__dirname),
  },
  allowedDevOrigins: [
    "*.serveousercontent.com",
    "*.serveo.net",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.trycloudflare.com",
    ...(tunnelHost ? [tunnelHost] : []),
  ],
});

export default nextConfig;
