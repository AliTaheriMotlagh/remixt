import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Public pages are open to search engines; the API, private pages and the
// bare embed player (which would compete with the remix page) are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/notifications", "/upload", "/login", "/embed/", "/r/", "/studio?"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
