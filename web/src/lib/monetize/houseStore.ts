// Remixt's own ads on the server: the owner's copy of them (Admin → Remixt
// ads), which one fills a spot, and how each does (views, clicks, by day
// and spot). The kinds and the built-in ads are in houseAds.ts.
//
// A view of one of ours pays nobody: it's counted here for the owner's
// report only, through the same signed token as a paying ad's (store.ts),
// so a view can't be booked for an ad that was never shown.

import { randomUUID } from "crypto";
import sql from "../db";
import { ensureSchema } from "../schema";
import { deleteObject } from "../storage";
import {
  BUILTIN_HOUSE_ADS, HOUSE_SPOTS, houseCandidates, pickWeighted, safeHref,
  type HouseAd, type HouseAdInput, type HouseSpot,
} from "./houseAds";

let ready: Promise<void> | null = null;

export function ensureHouseSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS house_ads (
        id TEXT PRIMARY KEY,
        lang TEXT NOT NULL DEFAULT 'en',
        kind TEXT NOT NULL DEFAULT 'card',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        cta TEXT NOT NULL,
        href TEXT NOT NULL,
        tone TEXT NOT NULL DEFAULT 'brand',
        spots TEXT[] NOT NULL DEFAULT '{site}',
        weight INTEGER NOT NULL DEFAULT 10,
        active BOOLEAN NOT NULL DEFAULT true,
        builtin BOOLEAN NOT NULL DEFAULT false,
        -- A built-in sound's file in public/ (media_url), or an upload (media_key).
        media_url TEXT,
        media_key TEXT,
        seconds REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS house_ad_stats (
        ad_id TEXT NOT NULL REFERENCES house_ads(id) ON DELETE CASCADE,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        spot TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ad_id, day, spot)
      )
    `;
    // The built-in ones, added when missing (the first time, and ones added to
    // the list in a later version). They can't be deleted, only changed or
    // turned off, so the owner's changes to them are never undone here.
    for (const a of BUILTIN_HOUSE_ADS) {
      await sql`
        INSERT INTO house_ads (id, lang, kind, title, body, cta, href, tone, spots, weight, active, builtin, media_url, seconds)
        VALUES (${a.id}, ${a.lang}, ${a.kind}, ${a.title}, ${a.body}, ${a.cta}, ${a.href}, ${a.tone}, ${a.spots}, ${a.weight}, ${a.active}, true, ${a.media}, ${a.seconds})
        ON CONFLICT (id) DO NOTHING
      `;
    }
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

type Row = {
  id: string; lang: HouseAd["lang"]; kind: HouseAd["kind"]; title: string; body: string; cta: string; href: string; tone: HouseAd["tone"];
  spots: string[]; weight: number; active: boolean; builtin: boolean; media_url: string | null; media_key: string | null; seconds: number | null;
  updated_at: string;
};

/** The address a page plays or shows an ad's media from. */
export function houseMediaUrl(r: Pick<Row, "id" | "media_url" | "media_key">): string | null {
  if (r.media_key) return `/api/ads/house/${r.id}/media?v=${encodeURIComponent(r.media_key.split("/").pop() ?? "")}`;
  return r.media_url;
}

function toAd(r: Row): HouseAd {
  return {
    id: r.id, lang: r.lang, kind: r.kind, title: r.title, body: r.body, cta: r.cta, href: r.href, tone: r.tone,
    spots: r.spots.filter((s): s is HouseSpot => (HOUSE_SPOTS as readonly string[]).includes(s)),
    weight: Number(r.weight), active: r.active, builtin: r.builtin, media: houseMediaUrl(r), seconds: r.seconds === null ? null : Number(r.seconds),
  };
}

// Every spot on every page asks; the list changes only when the owner edits it.
let cache: { at: number; ads: HouseAd[] } | null = null;
const CACHE_MS = 10_000;

export async function allHouseAds(): Promise<HouseAd[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ads;
  await ensureHouseSchema();
  const rows = await sql<Row[]>`SELECT * FROM house_ads ORDER BY builtin DESC, created_at, id`;
  const ads = rows.map(toAd);
  cache = { at: Date.now(), ads };
  return ads;
}

function forget() {
  cache = null;
}

/** One of ours for this spot; the built-in list when the database can't answer. */
export async function pickHouseAd(spot: HouseSpot, lang: "en" | "fa", sense: "visual" | "audio", rand = Math.random()): Promise<HouseAd | null> {
  const ads = await allHouseAds().catch(() => BUILTIN_HOUSE_ADS);
  return pickWeighted(houseCandidates(ads, spot, lang, sense), rand);
}

/** A view of one of ours (the page saw it on screen, or the sound played through). */
export async function countHouseView(adId: string, spot: string) {
  await ensureHouseSchema();
  await sql`
    INSERT INTO house_ad_stats (ad_id, spot, views) SELECT id, ${spot}, 1 FROM house_ads WHERE id = ${adId}
    ON CONFLICT (ad_id, day, spot) DO UPDATE SET views = house_ad_stats.views + 1
  `;
}

/** A click: counted, and where it goes (only a page here or an https address). */
export async function countHouseClick(adId: string, spot: string): Promise<string | null> {
  await ensureHouseSchema();
  const [ad] = await sql<{ href: string }[]>`SELECT href FROM house_ads WHERE id = ${adId}`;
  if (!ad || !safeHref(ad.href)) return null;
  await sql`
    INSERT INTO house_ad_stats (ad_id, spot, clicks) VALUES (${adId}, ${spot}, 1)
    ON CONFLICT (ad_id, day, spot) DO UPDATE SET clicks = house_ad_stats.clicks + 1
  `;
  return ad.href;
}

export type HouseAdReport = HouseAd & {
  views: number;
  clicks: number;
  /** Views per day, oldest first, for the last `days`. */
  daily: number[];
  bySpot: { spot: string; views: number; clicks: number }[];
};

/** Every ad with how it did over the last `days` days (Admin → Remixt ads). */
export async function houseAdsReport(days = 30): Promise<HouseAdReport[]> {
  await ensureHouseSchema();
  forget();
  const ads = await allHouseAds();
  const stats = await sql<{ ad_id: string; day: string; spot: string; views: number; clicks: number }[]>`
    SELECT ad_id, to_char(day, 'YYYY-MM-DD') AS day, spot, views, clicks FROM house_ad_stats
    WHERE day > CURRENT_DATE - ${days}::int
  `;
  const today = new Date();
  const dayIndex = (d: string) => days - 1 - Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
  return ads.map((a) => {
    const mine = stats.filter((s) => s.ad_id === a.id);
    const daily = new Array<number>(days).fill(0);
    const spots = new Map<string, { views: number; clicks: number }>();
    for (const s of mine) {
      const i = dayIndex(s.day);
      if (i >= 0 && i < days) daily[i] += Number(s.views);
      const sp = spots.get(s.spot) ?? { views: 0, clicks: 0 };
      sp.views += Number(s.views);
      sp.clicks += Number(s.clicks);
      spots.set(s.spot, sp);
    }
    return {
      ...a,
      views: mine.reduce((n, s) => n + Number(s.views), 0),
      clicks: mine.reduce((n, s) => n + Number(s.clicks), 0),
      daily,
      bySpot: [...spots].map(([spot, v]) => ({ spot, ...v })).sort((x, y) => y.views - x.views),
    };
  });
}

/** Makes a new one (id given back) or changes one. A built-in one keeps its sound file. */
export async function saveHouseAd(id: string | null, input: HouseAdInput): Promise<string> {
  await ensureHouseSchema();
  const newId = id ?? `own-${randomUUID().slice(0, 8)}`;
  if (id) {
    await sql`
      UPDATE house_ads SET lang = ${input.lang}, kind = ${input.kind}, title = ${input.title}, body = ${input.body}, cta = ${input.cta},
        href = ${input.href}, tone = ${input.tone}, spots = ${input.spots}, weight = ${input.weight}, active = ${input.active}, updated_at = now()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      INSERT INTO house_ads (id, lang, kind, title, body, cta, href, tone, spots, weight, active)
      VALUES (${newId}, ${input.lang}, ${input.kind}, ${input.title}, ${input.body}, ${input.cta}, ${input.href}, ${input.tone}, ${input.spots}, ${input.weight}, ${input.active})
    `;
  }
  forget();
  return newId;
}

export async function setHouseAdActive(id: string, active: boolean) {
  await ensureHouseSchema();
  await sql`UPDATE house_ads SET active = ${active}, updated_at = now() WHERE id = ${id}`;
  forget();
}

/** Deletes one the owner made; a built-in one can only be turned off. */
export async function deleteHouseAd(id: string): Promise<{ error: string } | null> {
  await ensureHouseSchema();
  const [row] = await sql<{ builtin: boolean; media_key: string | null }[]>`SELECT builtin, media_key FROM house_ads WHERE id = ${id}`;
  if (!row) return { error: "No such ad" };
  if (row.builtin) return { error: "A built-in ad can be turned off, not deleted" };
  await sql`DELETE FROM house_ads WHERE id = ${id}`;
  if (row.media_key) await deleteObject(row.media_key).catch(() => {});
  forget();
  return null;
}

/** An uploaded picture, video or sound for one of ours. */
export async function setHouseAdMedia(id: string, key: string, seconds: number | null) {
  await ensureHouseSchema();
  const [old] = await sql<{ media_key: string | null }[]>`SELECT media_key FROM house_ads WHERE id = ${id}`;
  await sql`UPDATE house_ads SET media_key = ${key}, seconds = COALESCE(${seconds}, seconds), updated_at = now() WHERE id = ${id}`;
  if (old?.media_key && old.media_key !== key) await deleteObject(old.media_key).catch(() => {});
  forget();
}

export async function houseAdMediaKey(id: string): Promise<string | null> {
  await ensureHouseSchema();
  const [row] = await sql<{ media_key: string | null }[]>`SELECT media_key FROM house_ads WHERE id = ${id}`;
  return row?.media_key ?? null;
}
