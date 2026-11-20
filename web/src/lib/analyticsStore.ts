// Analytics on the server: page views and events as they arrive, and the
// numbers Admin → Analytics shows. The definitions are in analytics.ts.
//
// One row per page view (`analytics_views`; its time on screen is added when
// the page is left) and one per event (`analytics_events`). Nothing that
// identifies a person beyond what the site already knows: the page's random
// visitor id, the member when signed in, the country the host's edge
// reports (never the address), the browser family and a screen-width bucket.
// Rows older than 400 days are dropped.

import sql from "./db";
import { ensureSchema } from "./schema";
import {
  channelOf, cleanPath, ENGAGED_MS, EVENTS, KEY_EVENTS, parseUserAgent, routeOf, screenBucket, hostOf,
  type EventName,
} from "./analytics";

let ready: Promise<void> | null = null;

export function ensureAnalyticsSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS analytics_views (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        visitor TEXT NOT NULL,
        session TEXT NOT NULL,
        user_id TEXT,
        path TEXT NOT NULL,
        route TEXT NOT NULL,
        entry BOOLEAN NOT NULL DEFAULT false,
        referrer_host TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT 'Direct',
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        country TEXT NOT NULL DEFAULT '',
        device TEXT NOT NULL DEFAULT 'desktop',
        os TEXT NOT NULL DEFAULT '',
        browser TEXT NOT NULL DEFAULT '',
        lang TEXT NOT NULL DEFAULT '',
        screen TEXT NOT NULL DEFAULT '',
        engaged_ms INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS analytics_views_at ON analytics_views (at)`;
    await sql`CREATE INDEX IF NOT EXISTS analytics_views_session ON analytics_views (session)`;
    await sql`CREATE INDEX IF NOT EXISTS analytics_views_visitor ON analytics_views (visitor, at)`;
    await sql`CREATE INDEX IF NOT EXISTS analytics_views_user ON analytics_views (user_id, at) WHERE user_id IS NOT NULL`;
    await sql`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        name TEXT NOT NULL,
        visitor TEXT,
        session TEXT,
        user_id TEXT,
        path TEXT,
        props JSONB NOT NULL DEFAULT '{}'
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS analytics_events_at ON analytics_events (at, name)`;
    await sql`CREATE INDEX IF NOT EXISTS analytics_events_user ON analytics_events (user_id, at) WHERE user_id IS NOT NULL`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// ——— collecting ———

export type ViewInput = {
  id: string;
  visitor: string;
  session: string;
  path: string;
  entry: boolean;
  referrer: string | null;
  utm: { source?: string | null; medium?: string | null; campaign?: string | null };
  lang: string;
  width: number;
};

export type Origin = { userId: string | null; userAgent: string; country: string; ownHost: string };

const ID = /^[\w-]{6,64}$/;
const short = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

/** A page view. False when it isn't kept (a robot, or not well formed). */
export async function recordView(v: ViewInput, o: Origin): Promise<boolean> {
  const client = parseUserAgent(o.userAgent);
  if (client.bot || !ID.test(v.id) || !ID.test(v.visitor) || !ID.test(v.session)) return false;
  await ensureAnalyticsSchema();
  const path = cleanPath(v.path);
  const refHost = v.entry ? hostOf(v.referrer) : "";
  const channel = v.entry ? channelOf(refHost, v.utm, o.ownHost) : "Internal";
  await sql`
    INSERT INTO analytics_views (id, visitor, session, user_id, path, route, entry, referrer_host, channel,
                                 utm_source, utm_medium, utm_campaign, country, device, os, browser, lang, screen)
    VALUES (${v.id}, ${v.visitor}, ${v.session}, ${o.userId}, ${path}, ${routeOf(path)}, ${v.entry}, ${refHost.slice(0, 120)},
            ${channel === "Internal" && v.entry ? "Direct" : channel},
            ${short(v.utm.source, 80)}, ${short(v.utm.medium, 80)}, ${short(v.utm.campaign, 120)},
            ${(o.country || "").slice(0, 2).toUpperCase()}, ${client.device}, ${client.os}, ${client.browser},
            ${(v.lang || "").slice(0, 2).toLowerCase()}, ${screenBucket(v.width)})
    ON CONFLICT (id) DO NOTHING
  `;
  return true;
}

/** Time the page was in view, sent when it's left or hidden (kept as the longest reported, at most 30 minutes). */
export async function recordEngagement(id: string, ms: number) {
  if (!ID.test(id) || !(ms > 0)) return;
  await ensureAnalyticsSchema();
  const capped = Math.min(Math.round(ms), 30 * 60_000);
  await sql`UPDATE analytics_views SET engaged_ms = GREATEST(engaged_ms, ${capped}) WHERE id = ${id} AND at > now() - interval '1 day'`;
}

/** Something done: from a page (with its session) or from the server (a member's sign-up, upload, publish). */
export async function recordEvent(
  name: EventName,
  e: { visitor?: string | null; session?: string | null; userId?: string | null; path?: string | null; props?: Record<string, string | number | boolean> }
) {
  if (!(EVENTS as readonly string[]).includes(name)) return;
  await ensureAnalyticsSchema();
  const props = Object.fromEntries(Object.entries(e.props ?? {}).slice(0, 8).map(([k, v]) => [k.slice(0, 30), typeof v === "string" ? v.slice(0, 120) : v]));
  await sql`
    INSERT INTO analytics_events (name, visitor, session, user_id, path, props)
    VALUES (${name}, ${e.visitor && ID.test(e.visitor) ? e.visitor : null}, ${e.session && ID.test(e.session) ? e.session : null},
            ${e.userId ?? null}, ${e.path ? cleanPath(e.path) : null}, ${sql.json(props)})
  `;
}

/** The server's own events never break what they're counting. */
export function trackServer(name: EventName, userId: string | null, props?: Record<string, string | number | boolean>) {
  void getAnalyticsOn()
    .then((on) => (on ? recordEvent(name, { userId, props }) : undefined))
    .catch(() => {});
}

async function getAnalyticsOn(): Promise<boolean> {
  const { getSettings } = await import("./settings/server");
  return (await getSettings()).features.analytics;
}

let lastPrune = 0;
async function prune() {
  if (Date.now() - lastPrune < 6 * 3600_000) return;
  lastPrune = Date.now();
  await sql`DELETE FROM analytics_views WHERE at < now() - interval '400 days'`;
  await sql`DELETE FROM analytics_events WHERE at < now() - interval '400 days'`;
}

// ——— the report ———

export type Range = { from: Date; to: Date };

/** The `days` days up to now, and the same length just before (for the comparison). */
export function rangeOf(days: number, now = new Date()): { current: Range; previous: Range } {
  const to = now;
  const from = new Date(to.getTime() - days * 86_400_000);
  return { current: { from, to }, previous: { from: new Date(from.getTime() - days * 86_400_000), to: from } };
}

export type Totals = {
  users: number; newUsers: number; sessions: number; views: number; engagedSessions: number; engagedMs: number; members: number;
};

async function totals(r: Range): Promise<Totals> {
  const keys = [...KEY_EVENTS];
  const [row] = await sql<Totals[]>`
    WITH s AS (
      SELECT session, count(*) AS views, sum(engaged_ms) AS engaged
      FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} GROUP BY session
    ),
    k AS (SELECT DISTINCT session FROM analytics_events WHERE at >= ${r.from} AND at < ${r.to} AND name = ANY(${keys}) AND session IS NOT NULL),
    firsts AS (SELECT visitor, min(at) AS first FROM analytics_views GROUP BY visitor)
    SELECT
      (SELECT count(DISTINCT visitor) FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to})::int AS users,
      (SELECT count(*) FROM firsts WHERE first >= ${r.from} AND first < ${r.to})::int AS "newUsers",
      (SELECT count(*) FROM s)::int AS sessions,
      (SELECT coalesce(sum(views), 0) FROM s)::int AS views,
      (SELECT count(*) FROM s WHERE engaged >= ${ENGAGED_MS} OR views >= 2 OR session IN (SELECT session FROM k))::int AS "engagedSessions",
      (SELECT coalesce(sum(engaged), 0) FROM s)::bigint AS "engagedMs",
      (SELECT count(DISTINCT user_id) FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} AND user_id IS NOT NULL)::int AS members
  `;
  return { ...row, engagedMs: Number(row.engagedMs) };
}

type Count = { key: string; users: number; sessions: number; views: number };

async function breakdown(column: "channel" | "referrer_host" | "country" | "device" | "os" | "browser" | "lang" | "screen" | "utm_campaign", r: Range, limit = 12): Promise<Count[]> {
  // Where a session came from is its first page's; the rest are per view.
  const bySession = column === "channel" || column === "referrer_host" || column === "utm_campaign";
  const rows = bySession
    ? await sql<Count[]>`
        SELECT coalesce(nullif(${sql(column)}, ''), '(none)') AS key, count(DISTINCT visitor)::int AS users, count(*)::int AS sessions, 0 AS views
        FROM (SELECT DISTINCT ON (session) * FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} ORDER BY session, at) first_views
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${limit}
      `
    : await sql<Count[]>`
        SELECT coalesce(nullif(${sql(column)}, ''), '(unknown)') AS key, count(DISTINCT visitor)::int AS users,
               count(DISTINCT session)::int AS sessions, count(*)::int AS views
        FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to}
        GROUP BY 1 ORDER BY users DESC LIMIT ${limit}
      `;
  return rows;
}

/** Everything Admin → Analytics shows for the last `days` days. `tz`: the admin's time zone, for the day/hour charts. */
export async function analyticsReport(days: number, tz = "UTC") {
  await ensureAnalyticsSchema();
  void prune().catch(() => {});
  const zone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(tz) ? tz : "UTC";
  const { current: r, previous } = rangeOf(days);
  const [now, before] = await Promise.all([totals(r), totals(previous)]);

  const daily = await sql<{ day: string; users: number; sessions: number; views: number; members: number }[]>`
    SELECT to_char((at AT TIME ZONE ${zone})::date, 'YYYY-MM-DD') AS day, count(DISTINCT visitor)::int AS users,
           count(DISTINCT session)::int AS sessions, count(*)::int AS views, count(DISTINCT user_id)::int AS members
    FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} GROUP BY 1 ORDER BY 1
  `;
  const pages = await sql<{ route: string; views: number; users: number; entries: number; engaged: number }[]>`
    SELECT route, count(*)::int AS views, count(DISTINCT visitor)::int AS users, count(*) FILTER (WHERE entry)::int AS entries,
           coalesce(avg(engaged_ms) FILTER (WHERE engaged_ms > 0), 0)::int AS engaged
    FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} GROUP BY route ORDER BY views DESC LIMIT 25
  `;
  const remixes = await sql<{ id: string; title: string; artist: string; views: number; users: number }[]>`
    SELECT r.id, r.title, u.artist_name AS artist, count(*)::int AS views, count(DISTINCT v.visitor)::int AS users
    FROM analytics_views v JOIN remixes r ON v.path = '/remixes/' || r.id JOIN users u ON u.id = r.owner_id
    WHERE v.at >= ${r.from} AND v.at < ${r.to} AND v.route = '/remixes/[id]'
    GROUP BY r.id, r.title, u.artist_name ORDER BY views DESC LIMIT 10
  `;
  const [channels, referrers, campaigns, countries, devices, os, browsers, langs, screens] = await Promise.all([
    breakdown("channel", r), breakdown("referrer_host", r), breakdown("utm_campaign", r), breakdown("country", r, 20),
    breakdown("device", r), breakdown("os", r), breakdown("browser", r), breakdown("lang", r), breakdown("screen", r),
  ]);
  const hours = await sql<{ dow: number; hour: number; views: number }[]>`
    SELECT extract(isodow FROM at AT TIME ZONE ${zone})::int AS dow, extract(hour FROM at AT TIME ZONE ${zone})::int AS hour, count(*)::int AS views
    FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} GROUP BY 1, 2
  `;
  const events = await sql<{ name: string; now: number; before: number; people: number }[]>`
    SELECT name,
           count(*) FILTER (WHERE at >= ${r.from})::int AS now,
           count(*) FILTER (WHERE at < ${r.from})::int AS before,
           count(DISTINCT coalesce(user_id, visitor)) FILTER (WHERE at >= ${r.from})::int AS people
    FROM analytics_events WHERE at >= ${previous.from} AND at < ${r.to} GROUP BY name ORDER BY now DESC
  `;
  // The path to making something: each step's people in the period (not a strict sequence).
  const [steps] = await sql<{ visitors: number; creators: number; signups: number; uploads: number; publishers: number }[]>`
    SELECT
      (SELECT count(DISTINCT visitor) FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to})::int AS visitors,
      (SELECT count(DISTINCT visitor) FROM analytics_views WHERE at >= ${r.from} AND at < ${r.to} AND route IN ('/studio', '/upload', '/library'))::int AS creators,
      (SELECT count(*) FROM users WHERE created_at >= ${r.from} AND created_at < ${r.to})::int AS signups,
      (SELECT count(DISTINCT owner_id) FROM tracks WHERE created_at >= ${r.from} AND created_at < ${r.to})::int AS uploads,
      (SELECT count(DISTINCT owner_id) FROM remixes WHERE published AND created_at >= ${r.from} AND created_at < ${r.to})::int AS publishers
  `;
  // Weekly cohorts of new visitors (last 6 weeks): who came back in each later week.
  const cohorts = await sql<{ week: string; size: number; back: number[] }[]>`
    WITH firsts AS (
      SELECT visitor, date_trunc('week', min(at)) AS week FROM analytics_views GROUP BY visitor
      HAVING min(at) >= date_trunc('week', now()) - interval '5 weeks'
    ),
    activity AS (
      SELECT DISTINCT f.visitor, f.week, ((extract(epoch FROM date_trunc('week', v.at) - f.week) / 604800))::int AS n
      FROM firsts f JOIN analytics_views v ON v.visitor = f.visitor
    )
    SELECT to_char(week, 'YYYY-MM-DD') AS week, count(DISTINCT visitor) FILTER (WHERE n = 0)::int AS size,
           array[
             count(DISTINCT visitor) FILTER (WHERE n = 1), count(DISTINCT visitor) FILTER (WHERE n = 2),
             count(DISTINCT visitor) FILTER (WHERE n = 3), count(DISTINCT visitor) FILTER (WHERE n = 4),
             count(DISTINCT visitor) FILTER (WHERE n = 5)
           ]::int[] AS back
    FROM activity GROUP BY week ORDER BY week
  `;
  const signups = await sql<{ day: string; n: number }[]>`
    SELECT to_char((created_at AT TIME ZONE ${zone})::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM users WHERE created_at >= ${r.from} GROUP BY 1 ORDER BY 1
  `;
  return {
    days, tz: zone, from: r.from.toISOString(), to: r.to.toISOString(),
    totals: now, previous: before, daily, signups, pages, remixes, channels, referrers, campaigns, countries, devices, os, browsers, langs, screens,
    hours, events, funnel: steps, cohorts,
  };
}

export type AnalyticsReport = Awaited<ReturnType<typeof analyticsReport>>;

/** Who's here now: the last 30 minutes, minute by minute, and the pages open in the last 5. */
export async function realtime() {
  await ensureAnalyticsSchema();
  const minutes = await sql<{ ago: number; views: number; users: number }[]>`
    SELECT floor(extract(epoch FROM now() - at) / 60)::int AS ago, count(*)::int AS views, count(DISTINCT visitor)::int AS users
    FROM analytics_views WHERE at > now() - interval '30 minutes' GROUP BY 1 ORDER BY 1
  `;
  const [active] = await sql<{ users: number; members: number }[]>`
    SELECT count(DISTINCT visitor)::int AS users, count(DISTINCT user_id)::int AS members FROM analytics_views WHERE at > now() - interval '5 minutes'
  `;
  const pages = await sql<{ path: string; users: number }[]>`
    SELECT path, count(DISTINCT visitor)::int AS users FROM analytics_views WHERE at > now() - interval '5 minutes'
    GROUP BY path ORDER BY users DESC LIMIT 10
  `;
  const countries = await sql<{ key: string; users: number }[]>`
    SELECT coalesce(nullif(country, ''), '(unknown)') AS key, count(DISTINCT visitor)::int AS users
    FROM analytics_views WHERE at > now() - interval '30 minutes' GROUP BY 1 ORDER BY users DESC LIMIT 8
  `;
  const events = await sql<{ name: string; at: string; path: string | null; artist: string | null }[]>`
    SELECT e.name, e.at, e.path, u.artist_name AS artist FROM analytics_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.at > now() - interval '30 minutes' ORDER BY e.at DESC LIMIT 15
  `;
  return { active: active ?? { users: 0, members: 0 }, minutes, pages, countries, events };
}

/** One member's trail, for Admin → Users: their devices, places, sessions and the last pages and events. */
export async function memberActivity(userId: string) {
  await ensureAnalyticsSchema();
  const [summary] = await sql<{ first: string | null; last: string | null; views: number; sessions: number; engaged: number }[]>`
    SELECT min(at) AS first, max(at) AS last, count(*)::int AS views, count(DISTINCT session)::int AS sessions,
           coalesce(sum(engaged_ms), 0)::bigint AS engaged
    FROM analytics_views WHERE user_id = ${userId}
  `;
  const clients = await sql<{ device: string; os: string; browser: string; country: string; views: number; last: string }[]>`
    SELECT device, os, browser, country, count(*)::int AS views, max(at) AS last
    FROM analytics_views WHERE user_id = ${userId} GROUP BY 1, 2, 3, 4 ORDER BY last DESC LIMIT 10
  `;
  const recent = await sql<{ at: string; path: string; engaged_ms: number; channel: string; entry: boolean }[]>`
    SELECT at, path, engaged_ms, channel, entry FROM analytics_views WHERE user_id = ${userId} ORDER BY at DESC LIMIT 40
  `;
  const events = await sql<{ at: string; name: string; path: string | null; props: Record<string, unknown> }[]>`
    SELECT at, name, path, props FROM analytics_events WHERE user_id = ${userId} ORDER BY at DESC LIMIT 40
  `;
  const [source] = await sql<{ channel: string; referrer_host: string; utm_campaign: string | null }[]>`
    SELECT channel, referrer_host, utm_campaign FROM analytics_views WHERE user_id = ${userId} AND entry ORDER BY at LIMIT 1
  `;
  return {
    summary: summary ? { ...summary, engaged: Number(summary.engaged) } : null,
    clients, recent, events, firstSource: source ?? null,
  };
}
