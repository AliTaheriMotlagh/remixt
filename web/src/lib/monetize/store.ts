// The money side of ads, on the server: the campaigns, every view, the
// ledger of who earned what, artists' claims to their songs, collaborator
// splits, payouts. The rules themselves are in policy.ts.
//
// The ledger (`earnings`) is append-only: a paid view writes one row per
// recipient, adding up to exactly what the advertiser was charged. A row's
// state is read off its columns — waiting (available_at in the future),
// available, held for an artist not verified yet (held_track_id), part of a
// payout (payout_id) — so nothing is ever rewritten but the owner of held
// money (when an artist is verified) and the payout a row belongs to.

import { createHmac, randomUUID } from "crypto";
import sql from "../db";
import { ensureSchema } from "../schema";
import {
  HOLD_DAYS, isOwnView, MICROS, PAID_VIEWS_PER_ADDRESS_PER_DAY, PAYOUT_MIN_MICROS, payOut, remixShares, siteShares, songShares,
  type Placement, type RemixParties, type Role, type Share, type SourceSong,
} from "./policy";

let ready: Promise<void> | null = null;

export function ensureMonetizeSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS ad_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        advertiser TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        cta TEXT NOT NULL DEFAULT 'Learn more',
        link TEXT NOT NULL,
        image_url TEXT,
        lang TEXT NOT NULL DEFAULT 'any',
        placements TEXT[] NOT NULL DEFAULT '{site,remix,radio}',
        cpm_micros BIGINT NOT NULL,
        budget_micros BIGINT NOT NULL,
        spent_micros BIGINT NOT NULL DEFAULT 0,
        views BIGINT NOT NULL DEFAULT 0,
        clicks BIGINT NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ends_at TIMESTAMPTZ,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS ad_views (
        id BIGSERIAL PRIMARY KEY,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        placement TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        campaign_id TEXT REFERENCES ad_campaigns(id) ON DELETE SET NULL,
        visitor TEXT NOT NULL,
        address TEXT NOT NULL,
        viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        paid BOOLEAN NOT NULL DEFAULT false,
        micros BIGINT NOT NULL DEFAULT 0,
        why_not TEXT,
        UNIQUE (visitor, placement, target, day)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ad_views_address_day ON ad_views (address, day) WHERE paid`;
    await sql`
      CREATE TABLE IF NOT EXISTS earnings (
        id BIGSERIAL PRIMARY KEY,
        view_id BIGINT REFERENCES ad_views(id) ON DELETE SET NULL,
        platform BOOLEAN NOT NULL DEFAULT false,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        held_track_id TEXT,
        role TEXT NOT NULL,
        remix_id TEXT,
        track_id TEXT,
        micros BIGINT NOT NULL,
        available_at TIMESTAMPTZ NOT NULL,
        payout_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS earnings_user ON earnings (user_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS earnings_held ON earnings (held_track_id) WHERE held_track_id IS NOT NULL`;
    await sql`
      CREATE TABLE IF NOT EXISTS rights_claims (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        evidence TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ,
        UNIQUE (track_id, user_id)
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS rights_claims_one_verified ON rights_claims (track_id) WHERE status = 'verified'`;
    await sql`
      CREATE TABLE IF NOT EXISTS remix_splits (
        remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bp INTEGER NOT NULL CHECK (bp > 0 AND bp <= 9000),
        PRIMARY KEY (remix_id, user_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS payout_accounts (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        method TEXT NOT NULL,
        details TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        micros BIGINT NOT NULL,
        method TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ
      )
    `;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// ——— who an ad pays ———

/** "remix:<id>" | "track:<id>" | "" (an ordinary page). */
export type Target = { kind: "remix" | "track"; id: string } | null;

export function parseTarget(text: string | null | undefined): Target {
  const m = /^(remix|track):([\w-]{1,64})$/.exec(text ?? "");
  return m ? { kind: m[1] as "remix" | "track", id: m[2] } : null;
}

type SongRow = { track_id: string; kind: string; take: boolean; holder: string | null };

function songsOf(rows: SongRow[]): SourceSong[] {
  const songs = new Map<string, SourceSong>();
  for (const r of rows) {
    const s = songs.get(r.track_id) ?? { trackId: r.track_id, parts: [], holderId: r.holder, take: r.take };
    if (!s.parts.includes(r.kind)) s.parts.push(r.kind);
    songs.set(r.track_id, s);
  }
  return [...songs.values()];
}

/** Who holds a song's rights: a take's singer, the verified claimant — or nobody yet. */
const holder = () => sql`
  CASE WHEN 'studio recording' = ANY(tracks.tags) THEN tracks.owner_id
       ELSE (SELECT rc.user_id FROM rights_claims rc WHERE rc.track_id = tracks.id AND rc.status = 'verified') END
`;

export async function remixParties(remixId: string): Promise<RemixParties | null> {
  await ensureMonetizeSchema();
  const [remix] = await sql<{ owner_id: string; parent_id: string | null; parent_owner: string | null }[]>`
    SELECT remixes.owner_id, parent.id AS parent_id, parent.owner_id AS parent_owner
    FROM remixes LEFT JOIN remixes parent ON parent.id = remixes.parent_id
    WHERE remixes.id = ${remixId}
  `;
  if (!remix) return null;
  const [songs, collaborators] = await Promise.all([
    sql<SongRow[]>`
      SELECT tracks.id AS track_id, stems.kind, ('studio recording' = ANY(tracks.tags)) AS take, ${holder()} AS holder
      FROM remix_lanes JOIN stems ON stems.id = remix_lanes.stem_id JOIN tracks ON tracks.id = stems.track_id
      WHERE remix_lanes.remix_id = ${remixId} AND NOT remix_lanes.muted
    `,
    sql<{ user_id: string; bp: number }[]>`SELECT user_id, bp FROM remix_splits WHERE remix_id = ${remixId}`,
  ]);
  return {
    remixId,
    ownerId: remix.owner_id,
    collaborators: collaborators.map((c) => ({ userId: c.user_id, bp: c.bp })),
    parent: remix.parent_id && remix.parent_owner ? { remixId: remix.parent_id, ownerId: remix.parent_owner } : null,
    sources: songsOf(songs),
  };
}

/** What an ad in `placement` about `target` pays to whom. A target that doesn't exist: the site's. */
export async function sharesFor(placement: Placement, target: Target): Promise<Share[]> {
  if (placement === "site" || !target) return siteShares();
  if (target.kind === "remix") {
    const parties = await remixParties(target.id);
    return parties ? remixShares(parties) : siteShares();
  }
  await ensureMonetizeSchema();
  const rows = await sql<SongRow[]>`
    SELECT tracks.id AS track_id, stems.kind, ('studio recording' = ANY(tracks.tags)) AS take, ${holder()} AS holder
    FROM stems JOIN tracks ON tracks.id = stems.track_id WHERE tracks.id = ${target.id}
  `;
  const [song] = songsOf(rows);
  return song ? songShares(song) : siteShares();
}

/** The names behind shares, for the "your view supports…" line under an ad. */
export async function namesFor(shares: Share[]): Promise<{ name: string; role: Role; bp: number; held: boolean }[]> {
  const userIds = shares.flatMap((s) => (s.to.kind === "user" ? [s.to.userId] : []));
  const trackIds = shares.flatMap((s) => (s.trackId ? [s.trackId] : []));
  const [users, tracks] = await Promise.all([
    userIds.length ? sql<{ id: string; artist_name: string }[]>`SELECT id, artist_name FROM users WHERE id IN ${sql(userIds)}` : [],
    trackIds.length ? sql<{ id: string; title: string }[]>`SELECT id, title FROM tracks WHERE id IN ${sql(trackIds)}` : [],
  ]);
  const user = new Map(users.map((u) => [u.id, u.artist_name]));
  const track = new Map(tracks.map((t) => [t.id, t.title]));
  return shares.map((s) => ({
    name:
      s.to.kind === "platform"
        ? "Remixt"
        : s.to.kind === "user"
          ? (user.get(s.to.userId) ?? "An artist")
          : `The artist of “${track.get(s.to.trackId) ?? "a song"}”`,
    role: s.role,
    bp: s.weight,
    held: s.to.kind === "held",
  }));
}

// ——— serving ———

export type Campaign = {
  id: string; name: string; advertiser: string; title: string; body: string; cta: string; link: string; image_url: string | null;
  lang: string; placements: string[]; cpm_micros: number; budget_micros: number; spent_micros: number; views: number; clicks: number;
  starts_at: string; ends_at: string | null; active: boolean; created_at: string;
};

/** A paying ad for this spot, weighted by what it pays (a dearer one shows more often); null when none fits. */
export async function pickCampaign(placement: Placement, lang: string): Promise<Campaign | null> {
  await ensureMonetizeSchema();
  const [row] = await sql<Campaign[]>`
    SELECT * FROM ad_campaigns
    WHERE active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      AND spent_micros + GREATEST(1, cpm_micros / 1000) <= budget_micros
      AND ${placement} = ANY(placements) AND (lang = 'any' OR lang = ${lang})
    -- Weighted random (exponential keys); 1 - random() is never 0, whose log Postgres refuses.
    ORDER BY -ln(1 - random()) / GREATEST(1, cpm_micros)
    LIMIT 1
  `.then((rows) => rows.map(numbers));
  return row ?? null;
}

function numbers(c: Campaign): Campaign {
  return { ...c, cpm_micros: Number(c.cpm_micros), budget_micros: Number(c.budget_micros), spent_micros: Number(c.spent_micros), views: Number(c.views), clicks: Number(c.clicks) };
}

function tokenKey() {
  return `ads:${process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me"}`;
}

/**
 * What the page hands back when the ad was seen (or clicked): which ad, in
 * which spot, about what — signed, so a view can't be booked for a spot or
 * an ad that was never served.
 */
export function viewToken(placement: Placement, target: Target, campaignId: string | null, now = Date.now()): string {
  const body = [placement, target ? `${target.kind}:${target.id}` : "", campaignId ?? "", Math.floor(now / 1000) + 30 * 60].join("|");
  const mac = createHmac("sha256", tokenKey()).update(body).digest("base64url").slice(0, 32);
  return `${Buffer.from(body).toString("base64url")}.${mac}`;
}

export function readToken(token: string, now = Date.now()): { placement: Placement; target: Target; campaignId: string | null } | null {
  const [body64, mac] = String(token).split(".");
  if (!body64 || !mac) return null;
  const body = Buffer.from(body64, "base64url").toString("utf8");
  if (createHmac("sha256", tokenKey()).update(body).digest("base64url").slice(0, 32) !== mac) return null;
  const [placement, target, campaignId, expires] = body.split("|");
  if (!["site", "remix", "radio"].includes(placement) || Number(expires) * 1000 < now) return null;
  return { placement: placement as Placement, target: parseTarget(target), campaignId: campaignId || null };
}

const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|python|curl|wget|httpclient/i;

export type ViewResult = { counted: boolean; paid: boolean; whyNot?: string };

/**
 * Books one view of a served ad. Paid only when it's a paying ad, the
 * viewer isn't one of those it would pay, it isn't a robot, the address is
 * under its daily cap and the campaign has budget left. Each visitor's view
 * of a spot counts once a day.
 */
export async function recordView(input: { token: string; visitor: string; address: string; viewerId: string | null; userAgent: string }): Promise<ViewResult> {
  const t = readToken(input.token);
  if (!t || !/^[\w-]{6,64}$/.test(input.visitor)) return { counted: false, paid: false, whyNot: "bad view" };
  await ensureMonetizeSchema();
  const shares = await sharesFor(t.placement, t.target);
  const target = t.target ? `${t.target.kind}:${t.target.id}` : "";

  let whyNot: string | null = null;
  if (!t.campaignId) whyNot = "house ad";
  else if (BOTS.test(input.userAgent)) whyNot = "robot";
  else if (isOwnView(input.viewerId, shares)) whyNot = "own work";

  return sql.begin(async (tx) => {
    if (!whyNot) {
      const [n] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM ad_views WHERE address = ${input.address} AND day = CURRENT_DATE AND paid`;
      if ((n?.n ?? 0) >= PAID_VIEWS_PER_ADDRESS_PER_DAY) whyNot = "address cap";
    }
    let micros = 0;
    let campaign: { cpm_micros: number } | undefined;
    if (!whyNot && t.campaignId) {
      // Charged only while the budget lasts (taken in the same step, so two views can't both take the last of it).
      [campaign] = await tx<{ cpm_micros: number }[]>`
        UPDATE ad_campaigns SET spent_micros = spent_micros + GREATEST(1, cpm_micros / 1000), views = views + 1
        WHERE id = ${t.campaignId} AND active AND spent_micros + GREATEST(1, cpm_micros / 1000) <= budget_micros
        RETURNING cpm_micros
      `;
      if (campaign) micros = Math.max(1, Math.floor(Number(campaign.cpm_micros) / 1000));
      else whyNot = "budget spent";
    }
    const [view] = await tx<{ id: string }[]>`
      INSERT INTO ad_views (placement, target, campaign_id, visitor, address, viewer_id, paid, micros, why_not)
      VALUES (${t.placement}, ${target}, ${t.campaignId}, ${input.visitor}, ${input.address}, ${input.viewerId}, ${micros > 0}, ${micros}, ${whyNot})
      ON CONFLICT (visitor, placement, target, day) DO NOTHING
      RETURNING id
    `;
    if (!view) {
      // Seen already today: not charged after all.
      if (campaign) throw new AlreadyCounted();
      return { counted: false, paid: false, whyNot: "seen today" };
    }
    if (micros > 0) {
      const availableAt = new Date(Date.now() + HOLD_DAYS * 86_400_000);
      for (const p of payOut(micros, shares)) {
        await tx`
          INSERT INTO earnings (view_id, platform, user_id, held_track_id, role, remix_id, track_id, micros, available_at)
          VALUES (${view.id}, ${p.to.kind === "platform"}, ${p.to.kind === "user" ? p.to.userId : null},
                  ${p.to.kind === "held" ? p.to.trackId : null}, ${p.role}, ${p.remixId ?? (t.target?.kind === "remix" ? t.target.id : null)},
                  ${p.trackId ?? null}, ${p.micros}, ${availableAt})
        `;
      }
    }
    return { counted: true, paid: micros > 0, whyNot: whyNot ?? undefined };
  }).catch((err) => {
    if (err instanceof AlreadyCounted) return { counted: false, paid: false, whyNot: "seen today" };
    throw err;
  }) as Promise<ViewResult>;
}

class AlreadyCounted extends Error {}

/** A click on a paying ad: counted (never paid — pay is per view, so clicking earns nobody anything) and where it goes. */
export async function recordClick(token: string): Promise<string | null> {
  const t = readToken(token);
  if (!t?.campaignId) return null;
  await ensureMonetizeSchema();
  const [c] = await sql<{ link: string }[]>`UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = ${t.campaignId} RETURNING link`;
  return c && /^https?:\/\//.test(c.link) ? c.link : null;
}

// ——— a member's earnings ———

export type EarningsSummary = {
  /** When this was read (the server's clock): the page draws "the last 30 days" back from it. */
  asOf: number;
  available: number; waiting: number; requested: number; paid: number; lifetime: number; heldForYourUploads: number;
  paidViews: number; last30: { day: string; micros: number }[];
  sources: { key: string; kind: "remix" | "track"; id: string; title: string; roles: Role[]; micros: number; views: number }[];
  claims: { id: string; trackId: string; title: string; status: string; note: string | null; created_at: string; heldMicros: number }[];
  payouts: { id: string; micros: number; method: string; status: string; note: string | null; created_at: string; decided_at: string | null }[];
  account: { method: string; details: string } | null;
  remixes: { id: string; title: string; splits: { userId: string; name: string; bp: number }[] }[];
  uploads: { id: string; title: string; heldMicros: number; claim: string | null }[];
  facts: { verifiedSongs: number; collaborations: number; earningRemixes: number; payouts: number };
};

const n = (x: unknown) => Number(x ?? 0);

export async function earningsFor(userId: string): Promise<EarningsSummary> {
  await ensureMonetizeSchema();
  const [totals, last30, sources, claims, payouts, account, remixes, uploads] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(micros) FILTER (WHERE payout_id IS NULL AND available_at <= now()), 0) AS available,
        COALESCE(SUM(micros) FILTER (WHERE payout_id IS NULL AND available_at > now()), 0) AS waiting,
        COALESCE(SUM(micros), 0) AS lifetime,
        COUNT(DISTINCT view_id) AS views
      FROM earnings WHERE user_id = ${userId}
    `,
    sql<{ day: string; micros: string }[]>`
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, SUM(micros) AS micros FROM earnings
      WHERE user_id = ${userId} AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1
    `,
    sql<{ remix_id: string | null; track_id: string | null; title: string | null; roles: Role[]; micros: string; views: string }[]>`
      SELECT e.remix_id, CASE WHEN e.remix_id IS NULL THEN e.track_id END AS track_id,
             COALESCE(r.title, t.title) AS title, array_agg(DISTINCT e.role) AS roles, SUM(e.micros) AS micros, COUNT(DISTINCT e.view_id) AS views
      FROM earnings e LEFT JOIN remixes r ON r.id = e.remix_id LEFT JOIN tracks t ON t.id = e.track_id AND e.remix_id IS NULL
      WHERE e.user_id = ${userId}
      GROUP BY 1, 2, 3 ORDER BY SUM(e.micros) DESC LIMIT 50
    `,
    sql<{ id: string; track_id: string; title: string; status: string; note: string | null; created_at: string; held: string }[]>`
      SELECT c.id, c.track_id, t.title, c.status, c.note, c.created_at,
             (SELECT COALESCE(SUM(micros), 0) FROM earnings WHERE held_track_id = c.track_id) AS held
      FROM rights_claims c JOIN tracks t ON t.id = c.track_id WHERE c.user_id = ${userId} ORDER BY c.created_at DESC
    `,
    sql<EarningsSummary["payouts"]>`SELECT id, micros, method, status, note, created_at, decided_at FROM payouts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20`,
    sql<{ method: string; details: string }[]>`SELECT method, details FROM payout_accounts WHERE user_id = ${userId}`,
    sql<{ id: string; title: string; splits: { userId: string; name: string; bp: number }[] | null }[]>`
      SELECT r.id, r.title,
             (SELECT json_agg(json_build_object('userId', s.user_id, 'name', u.artist_name, 'bp', s.bp) ORDER BY u.artist_name)
              FROM remix_splits s JOIN users u ON u.id = s.user_id WHERE s.remix_id = r.id) AS splits
      FROM remixes r WHERE r.owner_id = ${userId} AND r.published ORDER BY r.updated_at DESC LIMIT 50
    `,
    // Songs this member uploaded that hold money for their artist (if it's them, they can claim it).
    sql<{ id: string; title: string; held: string; claim: string | null }[]>`
      SELECT t.id, t.title, COALESCE(SUM(e.micros), 0) AS held,
             (SELECT status FROM rights_claims WHERE track_id = t.id AND user_id = ${userId}) AS claim
      FROM tracks t LEFT JOIN earnings e ON e.held_track_id = t.id
      WHERE t.owner_id = ${userId} AND NOT ('studio recording' = ANY(t.tags))
      GROUP BY t.id, t.title ORDER BY COALESCE(SUM(e.micros), 0) DESC, t.created_at DESC LIMIT 50
    `,
  ]);
  const t = totals[0] ?? {};
  const payoutRows = payouts.map((p) => ({ ...p, micros: n(p.micros) }));
  return {
    asOf: Date.now(),
    available: n(t.available),
    waiting: n(t.waiting),
    lifetime: n(t.lifetime),
    requested: payoutRows.filter((p) => p.status === "requested").reduce((s, p) => s + p.micros, 0),
    paid: payoutRows.filter((p) => p.status === "paid").reduce((s, p) => s + p.micros, 0),
    heldForYourUploads: uploads.reduce((s, u) => s + n(u.held), 0),
    paidViews: n(t.views),
    last30: last30.map((d) => ({ day: d.day, micros: n(d.micros) })),
    sources: sources.map((s) => ({
      key: `${s.remix_id ? "remix" : "track"}:${s.remix_id ?? s.track_id}`,
      kind: s.remix_id ? "remix" : "track",
      id: (s.remix_id ?? s.track_id)!,
      title: s.title ?? "Removed",
      roles: s.roles,
      micros: n(s.micros),
      views: n(s.views),
    })),
    claims: claims.map((c) => ({ id: c.id, trackId: c.track_id, title: c.title, status: c.status, note: c.note, created_at: c.created_at, heldMicros: n(c.held) })),
    payouts: payoutRows,
    account: account[0] ?? null,
    remixes: remixes.map((r) => ({ id: r.id, title: r.title, splits: r.splits ?? [] })),
    uploads: uploads.map((u) => ({ id: u.id, title: u.title, heldMicros: n(u.held), claim: u.claim })),
    facts: {
      verifiedSongs: claims.filter((c) => c.status === "verified").length,
      collaborations: remixes.filter((r) => r.splits?.length).length,
      earningRemixes: sources.filter((s) => s.remix_id && n(s.micros) > 0).length,
      payouts: payoutRows.filter((p) => p.status === "paid").length,
    },
  };
}

export const PAYOUT_METHODS = ["PayPal", "Bank transfer (IBAN / Sheba)", "Crypto (USDT)", "Other"] as const;

export async function setPayoutAccount(userId: string, method: string, details: string) {
  await ensureMonetizeSchema();
  await sql`
    INSERT INTO payout_accounts (user_id, method, details) VALUES (${userId}, ${method}, ${details})
    ON CONFLICT (user_id) DO UPDATE SET method = EXCLUDED.method, details = EXCLUDED.details, updated_at = now()
  `;
}

/** Asks for everything available to be paid out: the rows are set aside under the payout, so they can't be asked for twice. */
export async function requestPayout(userId: string): Promise<{ id: string; micros: number } | { error: string }> {
  await ensureMonetizeSchema();
  return sql.begin(async (tx) => {
    const [account] = await tx<{ method: string; details: string }[]>`SELECT method, details FROM payout_accounts WHERE user_id = ${userId}`;
    if (!account) return { error: "Add how you'd like to be paid first" };
    const [open] = await tx`SELECT 1 FROM payouts WHERE user_id = ${userId} AND status = 'requested'`;
    if (open) return { error: "You have a payout on its way already" };
    const id = randomUUID();
    const rows = await tx<{ micros: string }[]>`
      UPDATE earnings SET payout_id = ${id}
      WHERE user_id = ${userId} AND payout_id IS NULL AND available_at <= now()
      RETURNING micros
    `;
    const micros = rows.reduce((s, r) => s + Number(r.micros), 0);
    if (micros < PAYOUT_MIN_MICROS) throw new TooLittle();
    await tx`INSERT INTO payouts (id, user_id, micros, method, details) VALUES (${id}, ${userId}, ${micros}, ${account.method}, ${account.details})`;
    return { id, micros };
  }).catch((err) => {
    if (err instanceof TooLittle) return { error: `Payouts start from $${PAYOUT_MIN_MICROS / MICROS}` };
    throw err;
  }) as Promise<{ id: string; micros: number } | { error: string }>;
}

class TooLittle extends Error {}

/** A remix owner's collaborators and their parts of the remixers' share (basis points; the owner keeps the rest, at least 10%). */
export async function setSplits(ownerId: string, remixId: string, splits: { userId: string; bp: number }[]): Promise<{ error: string } | null> {
  await ensureMonetizeSchema();
  const [remix] = await sql`SELECT 1 FROM remixes WHERE id = ${remixId} AND owner_id = ${ownerId}`;
  if (!remix) return { error: "Not your remix" };
  const clean = splits.filter((s) => s.userId !== ownerId && s.bp > 0);
  if (clean.reduce((s, x) => s + x.bp, 0) > 9000) return { error: "You keep at least 10% of the remixers' share" };
  await sql.begin(async (tx) => {
    await tx`DELETE FROM remix_splits WHERE remix_id = ${remixId}`;
    for (const s of clean) await tx`INSERT INTO remix_splits (remix_id, user_id, bp) VALUES (${remixId}, ${s.userId}, ${Math.round(s.bp)})`;
  });
  return null;
}

/** "This song is mine": waits for an admin to check it. */
export async function claimSong(userId: string, trackId: string, evidence: string): Promise<{ error: string } | null> {
  await ensureMonetizeSchema();
  const [track] = await sql<{ take: boolean }[]>`SELECT ('studio recording' = ANY(tags)) AS take FROM tracks WHERE id = ${trackId}`;
  if (!track) return { error: "Song not found" };
  if (track.take) return { error: "A take recorded in the Studio already pays whoever sang it" };
  const [verified] = await sql`SELECT 1 FROM rights_claims WHERE track_id = ${trackId} AND status = 'verified'`;
  if (verified) return { error: "This song's artist is verified already — write to us if that's wrong" };
  await sql`
    INSERT INTO rights_claims (id, track_id, user_id, evidence) VALUES (${randomUUID()}, ${trackId}, ${userId}, ${evidence})
    ON CONFLICT (track_id, user_id) DO UPDATE SET evidence = EXCLUDED.evidence, status = 'pending', decided_at = NULL, note = NULL
  `;
  return null;
}

// ——— the owner's side ———

export async function monetizeOverview() {
  await ensureMonetizeSchema();
  const [[money], [views], campaigns, claims, payouts] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(micros) FILTER (WHERE platform), 0) AS platform,
             COALESCE(SUM(micros) FILTER (WHERE user_id IS NOT NULL), 0) AS members,
             COALESCE(SUM(micros) FILTER (WHERE held_track_id IS NOT NULL), 0) AS held,
             COALESCE(SUM(micros) FILTER (WHERE created_at > date_trunc('month', now())), 0) AS month
      FROM earnings
    `,
    sql`
      SELECT COUNT(*) FILTER (WHERE day = CURRENT_DATE) AS today, COUNT(*) FILTER (WHERE day = CURRENT_DATE AND paid) AS paid_today,
             COUNT(*) FILTER (WHERE at > date_trunc('month', now())) AS month, COUNT(*) FILTER (WHERE at > date_trunc('month', now()) AND paid) AS paid_month
      FROM ad_views WHERE at > now() - interval '40 days'
    `,
    sql<Campaign[]>`SELECT * FROM ad_campaigns ORDER BY active DESC, created_at DESC LIMIT 100`,
    sql<{ id: string; track_id: string; title: string; user_id: string; artist_name: string; email: string; evidence: string; status: string; created_at: string; held: string }[]>`
      SELECT c.id, c.track_id, t.title, c.user_id, u.artist_name, u.email, c.evidence, c.status, c.created_at,
             (SELECT COALESCE(SUM(micros), 0) FROM earnings WHERE held_track_id = c.track_id) AS held
      FROM rights_claims c JOIN tracks t ON t.id = c.track_id JOIN users u ON u.id = c.user_id
      ORDER BY (c.status = 'pending') DESC, c.created_at DESC LIMIT 100
    `,
    sql<{ id: string; user_id: string; artist_name: string; email: string; micros: string; method: string; details: string; status: string; created_at: string }[]>`
      SELECT p.id, p.user_id, u.artist_name, u.email, p.micros, p.method, p.details, p.status, p.created_at
      FROM payouts p JOIN users u ON u.id = p.user_id ORDER BY (p.status = 'requested') DESC, p.created_at DESC LIMIT 100
    `,
  ]);
  return {
    money: { platform: n(money.platform), members: n(money.members), held: n(money.held), month: n(money.month) },
    views: { today: n(views.today), paidToday: n(views.paid_today), month: n(views.month), paidMonth: n(views.paid_month) },
    campaigns: campaigns.map(numbers),
    claims: claims.map((c) => ({ ...c, held: n(c.held) })),
    payouts: payouts.map((p) => ({ ...p, micros: n(p.micros) })),
  };
}

export type CampaignInput = {
  name: string; advertiser: string; title: string; body: string; cta: string; link: string; image_url: string | null; lang: string;
  placements: string[]; cpm_micros: number; budget_micros: number; ends_at: string | null;
};

export async function saveCampaign(id: string | null, c: CampaignInput) {
  await ensureMonetizeSchema();
  if (id) {
    await sql`
      UPDATE ad_campaigns SET name = ${c.name}, advertiser = ${c.advertiser}, title = ${c.title}, body = ${c.body}, cta = ${c.cta},
        link = ${c.link}, image_url = ${c.image_url}, lang = ${c.lang}, placements = ${c.placements}, cpm_micros = ${c.cpm_micros},
        budget_micros = ${c.budget_micros}, ends_at = ${c.ends_at}
      WHERE id = ${id}
    `;
    return id;
  }
  const newId = randomUUID();
  await sql`
    INSERT INTO ad_campaigns (id, name, advertiser, title, body, cta, link, image_url, lang, placements, cpm_micros, budget_micros, ends_at)
    VALUES (${newId}, ${c.name}, ${c.advertiser}, ${c.title}, ${c.body}, ${c.cta}, ${c.link}, ${c.image_url}, ${c.lang}, ${c.placements},
            ${c.cpm_micros}, ${c.budget_micros}, ${c.ends_at})
  `;
  return newId;
}

export async function setCampaignActive(id: string, active: boolean) {
  await ensureMonetizeSchema();
  await sql`UPDATE ad_campaigns SET active = ${active} WHERE id = ${id}`;
}

/** An artist checked and accepted: the money held for their song becomes theirs (it still waits out its hold). */
export async function decideClaim(id: string, verify: boolean, note: string | null) {
  await ensureMonetizeSchema();
  await sql.begin(async (tx) => {
    const [claim] = await tx<{ track_id: string; user_id: string }[]>`
      UPDATE rights_claims SET status = ${verify ? "verified" : "rejected"}, note = ${note}, decided_at = now()
      WHERE id = ${id} RETURNING track_id, user_id
    `;
    if (!claim || !verify) return;
    await tx`UPDATE rights_claims SET status = 'rejected', note = 'Another artist was verified for this song', decided_at = now()
             WHERE track_id = ${claim.track_id} AND id <> ${id} AND status = 'pending'`;
    await tx`UPDATE earnings SET user_id = ${claim.user_id}, held_track_id = NULL WHERE held_track_id = ${claim.track_id}`;
  });
}

/** A payout sent (paid) — or turned down, which gives the money back to the member's balance. */
export async function decidePayout(id: string, paid: boolean, note: string | null) {
  await ensureMonetizeSchema();
  await sql.begin(async (tx) => {
    const [p] = await tx`UPDATE payouts SET status = ${paid ? "paid" : "rejected"}, note = ${note}, decided_at = now() WHERE id = ${id} AND status = 'requested' RETURNING id`;
    if (p && !paid) await tx`UPDATE earnings SET payout_id = NULL WHERE payout_id = ${id}`;
  });
}
