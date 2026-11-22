// The site's public address, for things that must be absolute: canonical
// links, the sitemap, robots.txt, structured data and link previews.
// PUBLIC_BASE_URL wins (set it to your own domain); on Vercel the
// production domain is known without it.

export const SITE_NAME = "Remixt";
export const SITE_TAGLINE = "Remix vocals and beats from any song";
// Search results cut descriptions at about 160 characters (tests/seo.test.ts).
export const SITE_DESCRIPTION =
  "Split any song into vocals, drums, bass and beat with AI in your browser, then put any vocal over any beat in a free online remix studio and share it.";

/**
 * Who makes Remixt: named in the footer, the pages' author tag and the
 * Organization's structured data, so search engines know the person
 * behind the product (their site links back to Remixt).
 */
export const SITE_CREATOR = {
  name: "Ali Taheri Motlagh",
  url: "https://alitaherimotlagh.remixt.app/",
  sameAs: ["https://www.youtube.com/@Alitaherimotlagh"],
};

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

/** Search results cut descriptions at about this many characters (tests/seo.test.ts). */
export const DESCRIPTION_MAX = 160;

/**
 * A remix page's description, fitted to a search result: the remix and
 * who made it always; then what it's built from and an invitation, as
 * room allows (fewer source songs first, then no invitation); a very long
 * title is shortened last.
 */
export function remixDescription(title: string, artist: string, sources: string[]): string {
  const head = (t: string) => `Listen to “${t}”, a remix by ${artist} on Remixt.`;
  const tail = " Open it in the studio and make your own.";
  const built = (n: number) => (n ? ` Built from ${sources.slice(0, n).join(" + ")}.` : "");
  for (const withTail of [true, false]) {
    for (let n = Math.min(3, sources.length); n >= 0; n--) {
      const text = head(title) + built(n) + (withTail ? tail : "");
      if (text.length <= DESCRIPTION_MAX) return text;
    }
  }
  // Even the remix alone is too long: shorten the title (and, failing that, the whole line).
  const room = DESCRIPTION_MAX - head("").length - 1;
  const short = room > 10 ? head(`${title.slice(0, room).trimEnd()}…`) : head(title);
  return short.length <= DESCRIPTION_MAX ? short : `${short.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}
