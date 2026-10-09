import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import fs from "fs";
import path from "path";

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
  // Cross-origin isolation lets the song splitter use SharedArrayBuffer,
  // i.e. every CPU core instead of one when there's no WebGPU. The
  // `credentialless` flavour still lets the page load cross-origin audio
  // (stems on R2) and the model (Hugging Face) without them opting in.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
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
