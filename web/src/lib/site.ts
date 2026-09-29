// The site's public address, for things that must be absolute: canonical
// links, the sitemap, robots.txt, structured data and link previews.
// PUBLIC_BASE_URL wins (set it to your own domain); on Vercel the
// production domain is known without it.

export const SITE_NAME = "Remixt";
export const SITE_TAGLINE = "Remix vocals and beats from any song";
export const SITE_DESCRIPTION =
  "Split any song into vocals and beat right in your browser, then mix a vocal from one track over the beat of another in a free online remix studio. Publish your remix and share it anywhere.";

export function siteUrl(): URL {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return new URL(configured);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://localhost:${process.env.PORT || 3000}`);
}

/** An absolute URL for a path on this site. */
export function absoluteUrl(path: string) {
  return new URL(path, siteUrl()).toString();
}
