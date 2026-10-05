import type { MetadataRoute } from "next";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { coverUrl, ensureRemixStats } from "@/lib/models";
import { absoluteUrl } from "@/lib/site";

// Rebuilt at most once an hour: new remixes and artists show up without
// every crawler visit hitting the database.
export const revalidate = 3600;

/** Every public page: the main sections, each published remix (with its cover), and each artist with one. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/remixes"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/library"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/studio"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/live"), lastModified: now, changeFrequency: "hourly", priority: 0.7 },
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
  return pages;
}
