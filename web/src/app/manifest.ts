import type { MetadataRoute } from "next";

// Lets Remixt be installed to a phone's home screen (or as a desktop app):
// it opens full-screen, without the browser's address bar, straight into
// the Studio's space.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Remixt — remix vocals and beats",
    short_name: "Remixt",
    description:
      "Split any song into vocals and beat, then remix them with other tracks in a studio in your browser.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Studio", url: "/studio" },
      { name: "Library", url: "/library" },
      { name: "Upload a song", url: "/upload" },
    ],
  };
}
