import type { NextConfig } from "next";
import path from "path";

// Hosts that ../share.sh can put in front of the dev server. Without these the
// dev server treats tunnelled requests as cross-origin and blocks /_next/*.
// TUNNEL_HOSTNAME comes from ../.share.env, for a Cloudflare tunnel on your
// own domain.
const tunnelHost = process.env.TUNNEL_HOSTNAME?.trim();

const nextConfig: NextConfig = {
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
};

export default nextConfig;
