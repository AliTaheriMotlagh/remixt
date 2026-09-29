import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} — remix vocals and beats from any song` };

/**
 * A page's metadata, complete: the tab title (the layout adds "· Remixt"),
 * description, canonical address, and the card shown when it's shared.
 * Next replaces rather than merges a parent's `openGraph`, so every page
 * spells all of it out here instead of inheriting the home page's.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  image = DEFAULT_IMAGE,
  type = "website",
}: {
  title: string;
  description: string;
  /** Canonical path, e.g. "/library". */
  path: string;
  noindex?: boolean;
  /** The share card; defaults to the site-wide one. */
  image?: typeof DEFAULT_IMAGE;
  type?: "website" | "profile" | "music.song";
}): Metadata {
  const images = [image];
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: path, siteName: SITE_NAME, type, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

/**
 * Structured data (schema.org) for search engines, as JSON-LD. `<` is
 * escaped so text from users can't close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/remixt-logo/png/remixt-mark-1024.png"),
  };
}
