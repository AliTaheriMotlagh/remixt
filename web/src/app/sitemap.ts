import type { MetadataRoute } from "next";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { coverUrl, ensureRemixStats } from "@/lib/models";
import { absoluteUrl } from "@/lib/site";
import { TOOL_LOCALES, TOOL_PAGES, toolLanguages, toolPath, toolsHubPath } from "@/lib/tools";

// Rebuilt at most once an hour: new remixes and artists show up without
// every crawler visit hitting the database.
export const revalidate = 3600;

function absolute(paths: Record<string, string>) {
  return Object.fromEntries(Object.entries(paths).map(([lang, path]) => [lang, absoluteUrl(path)]));
}

/** Every public page: the main sections, each published remix (with its cover), and each artist with one. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/remixes"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/library"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/studio"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    // The tool pages answer the searches people make most ("vocal remover"…),
    // in every language they're written in, each listing its twins (hreflang).
    ...TOOL_LOCALES.map((locale) => ({
      url: absoluteUrl(toolsHubPath(locale)),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      alternates: { languages: absolute(toolLanguages()) },
    })),
    ...TOOL_LOCALES.flatMap((locale) =>
      TOOL_PAGES.map((t) => ({
        url: absoluteUrl(toolPath(t.slug, locale)),
        changeFrequency: "monthly" as const,
        priority: 0.9,
        alternates: { languages: absolute(toolLanguages(t.slug)) },
      })),
    ),
    { url: absoluteUrl("/live"), lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: absoluteUrl("/radio"), lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    // The money pages in both languages, each listing its twin (as their own heads do).
    ...[
      ["/earnings", "/fa/earnings"],
      ["/advertise", "/fa/advertise"],
    ].flatMap(([en, fa]) =>
      [en, fa].map((path) => ({
        url: absoluteUrl(path),
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
        alternates: { languages: absolute({ en, fa, "x-default": en }) },
      }))
    ),
    { url: absoluteUrl("/dj"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/examples"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/challenges"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/leaderboard"), lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: absoluteUrl("/signup"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/takedown"), changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    await ensureSchema();
    await ensureRemixStats();
    const [remixes, artists, tags] = await Promise.all([
      sql<{ id: string; updated_at: Date; cover_key: string | null }[]>`
        SELECT id, updated_at, cover_key FROM remixes WHERE published ORDER BY updated_at DESC LIMIT 45000
      `,
      sql<{ id: string; updated_at: Date }[]>`
        SELECT users.id, MAX(remixes.updated_at) AS updated_at
        FROM users JOIN remixes ON remixes.owner_id = users.id AND remixes.published
        GROUP BY users.id LIMIT 4000
      `,
      sql<{ tag: string }[]>`
        SELECT tag FROM remixes, UNNEST(remixes.tags) AS tag
        WHERE remixes.published GROUP BY tag HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC LIMIT 500
      `,
    ]);
    for (const r of remixes) {
      const cover = coverUrl(r.id, r.cover_key);
      pages.push({
        url: absoluteUrl(`/remixes/${r.id}`),
        lastModified: r.updated_at,
        changeFrequency: "weekly",
        priority: 0.7,
        images: cover ? [absoluteUrl(cover)] : undefined,
      });
    }
    for (const a of artists) {
      pages.push({ url: absoluteUrl(`/artist/${a.id}`), lastModified: a.updated_at, changeFrequency: "weekly", priority: 0.5 });
    }
    for (const { tag } of tags) {
      pages.push({ url: absoluteUrl(`/remixes?tag=${encodeURIComponent(tag)}`), changeFrequency: "daily", priority: 0.5 });
    }
  } catch {
    // Database unreachable: still serve the main pages.
  }
  try {
    // Stations on their own: the radio's tables may not exist yet, and that
    // mustn't drop the remixes above.
    const stations = await sql<{ slug: string; created_at: Date }[]>`
      SELECT slug, created_at FROM radio_stations ORDER BY created_at LIMIT 1000
    `;
    for (const s of stations) {
      pages.push({ url: absoluteUrl(`/radio/${s.slug}`), lastModified: s.created_at, changeFrequency: "daily", priority: 0.5 });
    }
  } catch {
    // No radio yet.
  }
  return pages;
}
