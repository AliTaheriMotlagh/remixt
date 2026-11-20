// The server side of who decides about ads (a remix's maker, a song's
// verified artist), the advertisers' own campaigns and their payments, and
// what each person's page shows. The rules are in adRules.ts (pure).

import { randomUUID } from "crypto";
import sql from "../db";
import { notify } from "../notifications";
import { deleteObject } from "../storage";
import {
  cleanSettings, effectiveAds, FORMATS, microsOfToman, TOPIC_IDS,
  type AdKind, type AdSpot, type AdStyle, type EffectiveAds, type Format, type RemixAdSettings, type SongPolicy,
} from "./adRules";
import { MICROS, type Placement } from "./policy";
import { ensureMonetizeSchema, monetizeSettings, numbers, parseTarget, type Campaign, type Target } from "./store";
import { getSettings } from "../settings/server";

const n = (x: unknown) => Number(x ?? 0);

// ——— a remix's ads: its maker's settings and its artists' choices ———

export async function remixAdSettings(remixId: string): Promise<RemixAdSettings> {
  await ensureMonetizeSchema();
  const [row] = await sql<{ ads_on: boolean; kinds: string[]; blocked_topics: string[]; spots: string[]; style: string; house: boolean }[]>`
    SELECT ads_on, kinds, blocked_topics, spots, style, house FROM remix_ad_settings WHERE remix_id = ${remixId}
  `;
  return cleanSettings(
    row
      ? { on: row.ads_on, kinds: row.kinds as AdKind[], blockedTopics: row.blocked_topics, spots: row.spots as AdSpot[], style: row.style as AdStyle, house: row.house }
      : null
  );
}

export async function saveRemixAdSettings(ownerId: string, remixId: string, input: Partial<RemixAdSettings>): Promise<{ error: string } | null> {
  await ensureMonetizeSchema();
  const [remix] = await sql`SELECT 1 FROM remixes WHERE id = ${remixId} AND owner_id = ${ownerId}`;
  if (!remix) return { error: "Not your remix" };
  const s = cleanSettings(input);
  await sql`
    INSERT INTO remix_ad_settings (remix_id, ads_on, kinds, blocked_topics, spots, style, house)
    VALUES (${remixId}, ${s.on}, ${s.kinds}, ${s.blockedTopics}, ${s.spots}, ${s.style}, ${s.house})
    ON CONFLICT (remix_id) DO UPDATE SET ads_on = EXCLUDED.ads_on, kinds = EXCLUDED.kinds, blocked_topics = EXCLUDED.blocked_topics,
      spots = EXCLUDED.spots, style = EXCLUDED.style, house = EXCLUDED.house, updated_at = now()
  `;
  return null;
}

/** The songs a remix uses (unmuted lanes) and what each song's artist chose. */
export async function remixSongPolicies(remixId: string): Promise<{ trackId: string; title: string; policy: SongPolicy | null; verified: boolean }[]> {
  await ensureMonetizeSchema();
  const rows = await sql<{ track_id: string; title: string; policy: SongPolicy | null; verified: boolean }[]>`
    SELECT DISTINCT t.id AS track_id, t.title, p.policy,
           EXISTS (SELECT 1 FROM rights_claims rc WHERE rc.track_id = t.id AND rc.status = 'verified') AS verified
    FROM remix_lanes l JOIN stems s ON s.id = l.stem_id JOIN tracks t ON t.id = s.track_id
    LEFT JOIN track_ad_policy p ON p.track_id = t.id
    WHERE l.remix_id = ${remixId} AND NOT l.muted
  `;
  return rows.map((r) => ({ trackId: r.track_id, title: r.title, policy: r.policy, verified: r.verified }));
}

/** What really shows on a remix (its maker's choice and its artists'), with the reasons. */
export async function remixAds(remixId: string): Promise<EffectiveAds & { settings: RemixAdSettings; songs: Awaited<ReturnType<typeof remixSongPolicies>> }> {
  const [settings, songs] = await Promise.all([remixAdSettings(remixId), remixSongPolicies(remixId)]);
  return { ...effectiveAds(settings, songs.map((s) => s.policy)), settings, songs };
}

/** Whether ads of `kind` may show for `target` (a remix: its settings; a song as it is, or an ordinary page: yes). */
export async function adsAllowed(
  target: Target,
  kind: AdKind,
  /** A picture ad's spot on the page; left out, any. */
  spot?: AdSpot | null
): Promise<{ allowed: boolean; blockedTopics: string[]; style: AdStyle; house: boolean }> {
  if (!target || target.kind !== "remix") return { allowed: true, blockedTopics: [], style: "full", house: true };
  const e = await remixAds(target.id);
  const inSpot = kind !== "card" || !spot || e.spots.includes(spot);
  return { allowed: e.on && e.kinds.includes(kind) && inSpot, blockedTopics: e.blockedTopics, style: e.style, house: e.house };
}

/** Songs among these stems whose artist chose Block (publishing a remix of them is refused). */
export async function blockedSongs(stemIds: string[]): Promise<string[]> {
  if (!stemIds.length) return [];
  await ensureMonetizeSchema();
  const rows = await sql<{ title: string }[]>`
    SELECT DISTINCT t.title FROM stems s JOIN tracks t ON t.id = s.track_id JOIN track_ad_policy p ON p.track_id = t.id
    WHERE s.id IN ${sql(stemIds)} AND p.policy = 'block'
  `;
  return rows.map((r) => r.title);
}

export async function blockedSongsInRemix(remixId: string): Promise<string[]> {
  return (await remixSongPolicies(remixId)).filter((s) => s.policy === "block").map((s) => s.title);
}

export function blockedMessage(titles: string[]): string {
  return `The artist of “${titles[0]}”${titles.length > 1 ? ` (and ${titles.length - 1} more)` : ""} doesn't allow remixes of it to be public. Take that song out to publish.`;
}

// ——— an artist's songs ———

/** Who may choose for a song: its verified artist, or the singer of a take recorded in the Studio. */
async function songHolder(trackId: string): Promise<string | null> {
  const [row] = await sql<{ holder: string | null }[]>`
    SELECT CASE WHEN 'studio recording' = ANY(t.tags) THEN t.owner_id
                ELSE (SELECT rc.user_id FROM rights_claims rc WHERE rc.track_id = t.id AND rc.status = 'verified') END AS holder
    FROM tracks t WHERE t.id = ${trackId}
  `;
  return row?.holder ?? null;
}

/**
 * The artist's choice for their song. Block: every public remix using it
 * goes private, and its maker is told why (they can take the song out and
 * publish again).
 */
export async function setSongPolicy(userId: string, trackId: string, policy: SongPolicy): Promise<{ error: string } | { hidden: number }> {
  await ensureMonetizeSchema();
  if ((await songHolder(trackId)) !== userId) return { error: "Only the song's verified artist can choose this" };
  await sql`
    INSERT INTO track_ad_policy (track_id, user_id, policy) VALUES (${trackId}, ${userId}, ${policy})
    ON CONFLICT (track_id) DO UPDATE SET policy = EXCLUDED.policy, user_id = EXCLUDED.user_id, updated_at = now()
  `;
  if (policy !== "block") return { hidden: 0 };
  const hidden = await sql<{ id: string; owner_id: string; title: string; song: string }[]>`
    UPDATE remixes r SET published = false, updated_at = now()
    FROM (
      SELECT DISTINCT l.remix_id, t.title AS song FROM remix_lanes l JOIN stems s ON s.id = l.stem_id JOIN tracks t ON t.id = s.track_id
      WHERE t.id = ${trackId} AND NOT l.muted
    ) used
    WHERE r.id = used.remix_id AND r.published AND r.owner_id <> ${userId}
    RETURNING r.id, r.owner_id, r.title, used.song
  `;
  for (const r of hidden) {
    await notify({ userId: r.owner_id, actorId: null, type: "blocked", remixId: r.id, body: r.song });
  }
  return { hidden: hidden.length };
}

export type ArtistSong = {
  id: string; title: string; policy: SongPolicy; take: boolean;
  remixes: number; publicRemixes: number; earned: number; views: number;
  topRemixes: { id: string; title: string; maker: string; published: boolean }[];
};

/** The songs a member holds the rights to (verified, or their own takes), with what they chose and earned. */
export async function artistSongs(userId: string): Promise<ArtistSong[]> {
  await ensureMonetizeSchema();
  const rows = await sql<{ id: string; title: string; policy: SongPolicy | null; take: boolean; remixes: string; public_remixes: string; earned: string; views: string; top: ArtistSong["topRemixes"] | null }[]>`
    WITH mine AS (
      SELECT t.id, t.title, ('studio recording' = ANY(t.tags)) AS take FROM tracks t
      WHERE ('studio recording' = ANY(t.tags) AND t.owner_id = ${userId})
         OR EXISTS (SELECT 1 FROM rights_claims rc WHERE rc.track_id = t.id AND rc.status = 'verified' AND rc.user_id = ${userId})
    ),
    used AS (
      SELECT DISTINCT m.id AS track_id, r.id, r.title, r.published, u.artist_name, r.updated_at
      FROM mine m JOIN stems s ON s.track_id = m.id JOIN remix_lanes l ON l.stem_id = s.id AND NOT l.muted
      JOIN remixes r ON r.id = l.remix_id JOIN users u ON u.id = r.owner_id
    )
    SELECT m.id, m.title, p.policy, m.take,
      (SELECT COUNT(*) FROM used WHERE used.track_id = m.id) AS remixes,
      (SELECT COUNT(*) FROM used WHERE used.track_id = m.id AND used.published) AS public_remixes,
      (SELECT COALESCE(SUM(e.micros), 0) FROM earnings e WHERE e.user_id = ${userId} AND e.track_id = m.id AND e.role IN ('artist', 'vocalist')) AS earned,
      (SELECT COUNT(DISTINCT e.view_id) FROM earnings e WHERE e.user_id = ${userId} AND e.track_id = m.id AND e.role IN ('artist', 'vocalist')) AS views,
      (SELECT json_agg(x) FROM (SELECT used.id, used.title, used.artist_name AS maker, used.published FROM used WHERE used.track_id = m.id
                                 ORDER BY used.published DESC, used.updated_at DESC LIMIT 5) x) AS top
    FROM mine m LEFT JOIN track_ad_policy p ON p.track_id = m.id
    ORDER BY m.title
  `;
  return rows.map((r) => ({
    id: r.id, title: r.title, policy: r.policy ?? "follow", take: r.take,
    remixes: n(r.remixes), publicRemixes: n(r.public_remixes), earned: n(r.earned), views: n(r.views), topRemixes: r.top ?? [],
  }));
}

// ——— a remixer's panel for one remix ———

export type RemixMoney = {
  remix: { id: string; title: string; published: boolean };
  ads: Awaited<ReturnType<typeof remixAds>>;
  /** What this remix's ads paid this member, and paid everyone. */
  yours: number; everyone: number; views: number;
  byKind: { format: string; placement: string; micros: number; views: number }[];
  last30: { day: string; micros: number }[];
  promotions: { id: string; review: string; active: boolean; budget: number; spent: number; views: number; clicks: number }[];
};

export async function remixMoney(userId: string, remixId: string): Promise<RemixMoney | null> {
  await ensureMonetizeSchema();
  const [remix] = await sql<{ id: string; title: string; published: boolean; owner_id: string }[]>`SELECT id, title, published, owner_id FROM remixes WHERE id = ${remixId}`;
  if (!remix || remix.owner_id !== userId) return null;
  const [ads, [totals], byKind, last30, promotions] = await Promise.all([
    remixAds(remixId),
    sql`
      SELECT COALESCE(SUM(e.micros) FILTER (WHERE e.user_id = ${userId}), 0) AS yours, COALESCE(SUM(e.micros), 0) AS everyone, COUNT(DISTINCT e.view_id) AS views
      FROM earnings e JOIN ad_views v ON v.id = e.view_id WHERE v.target = ${`remix:${remixId}`}
    `,
    sql<{ format: string; placement: string; micros: string; views: string }[]>`
      SELECT v.format, v.placement, COALESCE(SUM(e.micros) FILTER (WHERE e.user_id = ${userId}), 0) AS micros, COUNT(DISTINCT v.id) AS views
      FROM ad_views v LEFT JOIN earnings e ON e.view_id = v.id WHERE v.target = ${`remix:${remixId}`} AND v.paid
      GROUP BY 1, 2 ORDER BY 3 DESC
    `,
    sql<{ day: string; micros: string }[]>`
      SELECT to_char(e.created_at::date, 'YYYY-MM-DD') AS day, SUM(e.micros) AS micros
      FROM earnings e WHERE e.user_id = ${userId} AND e.remix_id = ${remixId} AND e.created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1
    `,
    sql<{ id: string; review: string; active: boolean; budget_micros: string; spent_micros: string; views: string; clicks: string }[]>`
      SELECT id, review, active, budget_micros, spent_micros, views, clicks FROM ad_campaigns
      WHERE owner_id = ${userId} AND format = 'promote' AND promote_target = ${`remix:${remixId}`} ORDER BY created_at DESC
    `,
  ]);
  return {
    remix: { id: remix.id, title: remix.title, published: remix.published },
    ads,
    yours: n(totals?.yours), everyone: n(totals?.everyone), views: n(totals?.views),
    byKind: byKind.map((k) => ({ format: k.format, placement: k.placement, micros: n(k.micros), views: n(k.views) })),
    last30: last30.map((d) => ({ day: d.day, micros: n(d.micros) })),
    promotions: promotions.map((p) => ({ id: p.id, review: p.review, active: p.active, budget: n(p.budget_micros), spent: n(p.spent_micros), views: n(p.views), clicks: n(p.clicks) })),
  };
}

// ——— advertisers ———

export type CampaignDraft = {
  name: string; advertiser: string; title: string; body: string; cta: string; link: string;
  format: Format; topic: string; lang: "any" | "en" | "fa"; placements: Placement[];
  cpmMicros: number; endsAt: string | null; promoteTarget: string | null;
};

/** The places a format can go (a promotion goes in lists only). */
export function placementsFor(format: Format, wanted: Placement[]): Placement[] {
  const can: Placement[] = format === "card" ? ["site", "remix", "radio"] : format === "audio" ? ["remix", "radio"] : ["promote"];
  const chosen = wanted.filter((p) => can.includes(p));
  return chosen.length ? chosen : can;
}

/** Checks a draft against the rules; the error to show, or null. */
export async function checkDraft(userId: string, d: CampaignDraft, { isAdmin = false } = {}): Promise<string | null> {
  if (!FORMATS.includes(d.format)) return "Choose a kind of ad";
  if (!TOPIC_IDS.includes(d.topic)) return "Choose what the ad is about";
  const floors = (await monetizeSettings()).floors;
  if (d.cpmMicros < floors[d.format]) return `The lowest price for this kind is $${(floors[d.format] / MICROS).toFixed(2)} per 1,000`;
  if (d.format === "promote") {
    const t = parseTarget(d.promoteTarget);
    if (!t) return "Choose what to promote";
    const [own] =
      t.kind === "remix"
        ? await sql`SELECT 1 FROM remixes WHERE id = ${t.id} AND published AND (owner_id = ${userId} OR ${isAdmin})`
        : await sql`SELECT 1 FROM tracks WHERE id = ${t.id} AND status = 'ready' AND (owner_id = ${userId} OR ${isAdmin})`;
    if (!own) return "You can promote your own published remixes and songs";
  } else if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(d.link)) return "Give the address the ad opens (https://…)";
  return null;
}

/** An advertiser's new ad: a draft until they send it for review. */
export async function createAdvertiserCampaign(userId: string, d: CampaignDraft): Promise<{ id: string } | { error: string }> {
  await ensureMonetizeSchema();
  const problem = await checkDraft(userId, d);
  if (problem) return { error: problem };
  const id = randomUUID();
  await sql`
    INSERT INTO ad_campaigns (id, name, advertiser, title, body, cta, link, lang, placements, cpm_micros, budget_micros, ends_at,
                              format, topic, promote_target, owner_id, review, active)
    VALUES (${id}, ${d.name}, ${d.advertiser}, ${d.title}, ${d.body}, ${d.cta}, ${d.format === "promote" ? "" : d.link}, ${d.lang},
            ${placementsFor(d.format, d.placements)}, ${d.cpmMicros}, 0, ${d.endsAt}, ${d.format}, ${d.topic},
            ${d.format === "promote" ? d.promoteTarget : null}, ${userId}, 'draft', true)
  `;
  return { id };
}

async function ownCampaign(userId: string, id: string): Promise<Campaign | null> {
  await ensureMonetizeSchema();
  const [c] = await sql<Campaign[]>`SELECT * FROM ad_campaigns WHERE id = ${id} AND owner_id = ${userId}`;
  return c ? numbers(c) : null;
}

/** Edits an advertiser's ad. A change to what it says or shows sends it back for review. */
export async function updateAdvertiserCampaign(userId: string, id: string, d: CampaignDraft): Promise<{ error: string } | null> {
  const c = await ownCampaign(userId, id);
  if (!c) return { error: "Not your ad" };
  if (d.format !== c.format) return { error: "The kind of ad can't change — make a new one" };
  const problem = await checkDraft(userId, d);
  if (problem) return { error: problem };
  const changed = c.title !== d.title || c.body !== d.body || c.cta !== d.cta || c.link !== d.link || c.topic !== d.topic || c.advertiser !== d.advertiser;
  await sql`
    UPDATE ad_campaigns SET name = ${d.name}, advertiser = ${d.advertiser}, title = ${d.title}, body = ${d.body}, cta = ${d.cta},
      link = ${d.format === "promote" ? "" : d.link}, lang = ${d.lang}, placements = ${placementsFor(d.format, d.placements)},
      cpm_micros = ${d.cpmMicros}, ends_at = ${d.endsAt}, topic = ${d.topic},
      review = ${changed && c.review === "approved" ? "pending" : c.review}
    WHERE id = ${id}
  `;
  return null;
}

/** "Send for review": the owner looks before it runs. */
export async function submitCampaign(userId: string, id: string): Promise<{ error: string } | null> {
  const c = await ownCampaign(userId, id);
  if (!c) return { error: "Not your ad" };
  if (c.format === "audio" && !c.audio_key) return { error: "Add the ad's sound first" };
  if (c.format !== "promote" && !c.title.trim()) return { error: "Give the ad a title" };
  if (c.review === "approved") return null;
  await sql`UPDATE ad_campaigns SET review = 'pending', review_note = NULL WHERE id = ${id}`;
  return null;
}

export async function setCampaignPaused(userId: string, id: string, paused: boolean): Promise<{ error: string } | null> {
  const c = await ownCampaign(userId, id);
  if (!c) return { error: "Not your ad" };
  await sql`UPDATE ad_campaigns SET active = ${!paused} WHERE id = ${id}`;
  return null;
}

/** An uploaded picture or sound for an ad: stored, and the old one let go. Audio needs its length (checked again by the player). */
export async function setCampaignMedia(id: string, kind: "image" | "audio", key: string, seconds: number | null) {
  await ensureMonetizeSchema();
  const [old] = await sql<{ image_key: string | null; audio_key: string | null }[]>`SELECT image_key, audio_key FROM ad_campaigns WHERE id = ${id}`;
  if (kind === "image") await sql`UPDATE ad_campaigns SET image_key = ${key} WHERE id = ${id}`;
  else {
    const { maxSeconds } = (await getSettings()).audio;
    await sql`UPDATE ad_campaigns SET audio_key = ${key}, audio_seconds = ${seconds !== null ? Math.min(maxSeconds, seconds) : null} WHERE id = ${id}`;
  }
  const was = kind === "image" ? old?.image_key : old?.audio_key;
  if (was && was !== key) await deleteObject(was).catch(() => {});
}

export async function campaignOwner(id: string): Promise<{ owner_id: string | null; format: Format; review: string } | null> {
  await ensureMonetizeSchema();
  const [c] = await sql<{ owner_id: string | null; format: Format; review: string }[]>`SELECT owner_id, format, review FROM ad_campaigns WHERE id = ${id}`;
  return c ?? null;
}

/** "I've paid": the advertiser's reference; the owner checks it arrived and presses Payment received. */
export async function addPayment(
  userId: string,
  campaignId: string,
  input: { amount: number; currency: "USD" | "IRT"; method: string; reference: string }
): Promise<{ error: string } | { id: string }> {
  const c = await ownCampaign(userId, campaignId);
  if (!c) return { error: "Not your ad" };
  const rate = (await monetizeSettings()).tomanRate;
  if (input.currency === "IRT" && !rate) return { error: "Paying in Toman opens once Remixt sets the rate" };
  const micros = input.currency === "IRT" ? microsOfToman(input.amount, rate) : Math.round(input.amount * MICROS);
  if (micros < MICROS) return { error: "Add at least $1" };
  const [open] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ad_payments WHERE user_id = ${userId} AND status = 'pending'`;
  if ((open?.n ?? 0) >= 5) return { error: "Wait for your earlier payments to be checked" };
  const id = randomUUID();
  await sql`
    INSERT INTO ad_payments (id, campaign_id, user_id, micros, currency, toman, method, reference)
    VALUES (${id}, ${campaignId}, ${userId}, ${micros}, ${input.currency}, ${input.currency === "IRT" ? Math.round(input.amount) : null}, ${input.method}, ${input.reference})
  `;
  return { id };
}

export type AdvertiserCampaign = Campaign & {
  payments: { id: string; micros: number; currency: string; toman: number | null; method: string; reference: string; status: string; note: string | null; created_at: string }[];
  days: { day: string; views: number; clicks?: number }[];
  promoteTitle: string | null;
};

export async function advertiserCampaigns(userId: string): Promise<AdvertiserCampaign[]> {
  await ensureMonetizeSchema();
  const rows = (await sql<Campaign[]>`SELECT * FROM ad_campaigns WHERE owner_id = ${userId} ORDER BY created_at DESC LIMIT 100`).map(numbers);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [payments, days, titles] = await Promise.all([
    sql<(AdvertiserCampaign["payments"][number] & { campaign_id: string })[]>`
      SELECT id, campaign_id, micros, currency, toman, method, reference, status, note, created_at FROM ad_payments
      WHERE campaign_id IN ${sql(ids)} ORDER BY created_at DESC
    `,
    sql<{ campaign_id: string; day: string; views: string }[]>`
      SELECT campaign_id, to_char(day, 'YYYY-MM-DD') AS day, COUNT(*) FILTER (WHERE paid) AS views FROM ad_views
      WHERE campaign_id IN ${sql(ids)} AND day > CURRENT_DATE - 14 GROUP BY 1, 2 ORDER BY 2
    `,
    sql<{ target: string; title: string }[]>`
      SELECT 'remix:' || id AS target, title FROM remixes WHERE 'remix:' || id IN ${sql(rows.map((r) => r.promote_target ?? "-"))}
      UNION ALL SELECT 'track:' || id, title FROM tracks WHERE 'track:' || id IN ${sql(rows.map((r) => r.promote_target ?? "-"))}
    `,
  ]);
  const title = new Map(titles.map((t) => [t.target, t.title]));
  return rows.map((c) => ({
    ...c,
    payments: payments.filter((p) => p.campaign_id === c.id).map((p) => ({ ...p, micros: n(p.micros), toman: p.toman === null ? null : n(p.toman) })),
    days: days.filter((d) => d.campaign_id === c.id).map((d) => ({ day: d.day, views: n(d.views) })),
    promoteTitle: c.promote_target ? (title.get(c.promote_target) ?? null) : null,
  }));
}

/** What a member can promote: their published remixes and their ready songs. */
export async function promotable(userId: string): Promise<{ target: string; title: string; kind: "remix" | "track" }[]> {
  await ensureMonetizeSchema();
  const rows = await sql<{ target: string; title: string; kind: "remix" | "track" }[]>`
    (SELECT 'remix:' || id AS target, title, 'remix' AS kind FROM remixes WHERE owner_id = ${userId} AND published ORDER BY updated_at DESC LIMIT 50)
    UNION ALL
    (SELECT 'track:' || id, title, 'track' FROM tracks WHERE owner_id = ${userId} AND status = 'ready' ORDER BY created_at DESC LIMIT 50)
  `;
  return rows;
}

// ——— the owner's side ———

/** Approve or turn down an advertiser's ad. The advertiser is told. */
export async function reviewCampaign(id: string, approve: boolean, note: string | null) {
  await ensureMonetizeSchema();
  const [c] = await sql<{ owner_id: string | null; title: string; name: string }[]>`
    UPDATE ad_campaigns SET review = ${approve ? "approved" : "rejected"}, review_note = ${note} WHERE id = ${id} RETURNING owner_id, title, name
  `;
  if (c?.owner_id) {
    await notify({ userId: c.owner_id, actorId: null, type: "ad", body: [approve ? "approved" : "rejected", c.title || c.name, note ?? ""].join("|") });
  }
}

/** A payment checked: received adds it to the ad's budget (in the same step); not received is marked and the advertiser told. */
export async function decideAdPayment(id: string, received: boolean, note: string | null) {
  await ensureMonetizeSchema();
  const p = await sql.begin(async (tx) => {
    const [row] = await tx<{ campaign_id: string; user_id: string | null; micros: string }[]>`
      UPDATE ad_payments SET status = ${received ? "received" : "rejected"}, note = ${note}, decided_at = now()
      WHERE id = ${id} AND status = 'pending' RETURNING campaign_id, user_id, micros
    `;
    if (row && received) await tx`UPDATE ad_campaigns SET budget_micros = budget_micros + ${n(row.micros)} WHERE id = ${row.campaign_id}`;
    return row ?? null;
  });
  if (p?.user_id) {
    await notify({ userId: p.user_id, actorId: null, type: "ad", body: [received ? "paid" : "unpaid", `$${(n(p.micros) / MICROS).toFixed(2)}`, note ?? ""].join("|") });
  }
}

export async function adReviewQueue() {
  await ensureMonetizeSchema();
  const [campaigns, payments] = await Promise.all([
    sql<(Campaign & { artist_name: string | null; email: string | null; promote_title: string | null })[]>`
      SELECT c.*, u.artist_name, u.email,
             COALESCE((SELECT title FROM remixes WHERE 'remix:' || id = c.promote_target), (SELECT title FROM tracks WHERE 'track:' || id = c.promote_target)) AS promote_title
      FROM ad_campaigns c LEFT JOIN users u ON u.id = c.owner_id
      WHERE c.review = 'pending' ORDER BY c.created_at
    `,
    sql<{ id: string; campaign_id: string; campaign: string; artist_name: string | null; email: string | null; micros: string; currency: string; toman: string | null; method: string; reference: string; created_at: string }[]>`
      SELECT p.id, p.campaign_id, COALESCE(NULLIF(c.title, ''), c.name) AS campaign, u.artist_name, u.email, p.micros, p.currency, p.toman, p.method, p.reference, p.created_at
      FROM ad_payments p JOIN ad_campaigns c ON c.id = p.campaign_id LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = 'pending' ORDER BY p.created_at
    `,
  ]);
  return {
    campaigns: campaigns.map((c) => ({ ...numbers(c), artist_name: c.artist_name, email: c.email, promote_title: c.promote_title })),
    payments: payments.map((p) => ({ ...p, micros: n(p.micros), toman: p.toman === null ? null : n(p.toman) })),
  };
}

// ——— promoted ———

/** A promoted remix for a list (served like an ad: weighted by price, budget taken per paid view). */
export async function pickPromoted(lang: string, kind: "remix" | "track"): Promise<{ campaign: Campaign; target: Target } | null> {
  await ensureMonetizeSchema();
  const [row] = await sql<Campaign[]>`
    SELECT c.* FROM ad_campaigns c
    WHERE c.active AND c.review = 'approved' AND c.format = 'promote' AND c.promote_target LIKE ${`${kind}:%`}
      AND c.starts_at <= now() AND (c.ends_at IS NULL OR c.ends_at > now())
      AND c.spent_micros + GREATEST(1, c.cpm_micros / 1000) <= c.budget_micros AND (c.lang = 'any' OR c.lang = ${lang})
      AND (${kind} <> 'remix' OR EXISTS (SELECT 1 FROM remixes r WHERE 'remix:' || r.id = c.promote_target AND r.published))
    ORDER BY -ln(1 - random()) / GREATEST(1, c.cpm_micros)
    LIMIT 1
  `;
  if (!row) return null;
  return { campaign: numbers(row), target: parseTarget(row.promote_target) };
}
