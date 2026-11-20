// Publishing a remix that uses someone else's private song: its owner is
// asked first (lib/songPrivacy.ts has the rules). The remix is saved
// private meanwhile; on the last owner's "yes" it goes public by itself and
// its maker is told. A "no" is said to the maker, with the owner's note.

import sql from "./db";
import { ensureSchema } from "./schema";
import { notify, notifyRemixCreated } from "./notifications";
import { trackServer } from "./analyticsStore";
import { waitingFor, type ConsentStatus, type UsedSong, type Waiting } from "./songPrivacy";

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    // The maker asked to publish while some owner hadn't agreed yet: published on the last "yes".
    await sql`ALTER TABLE remixes ADD COLUMN IF NOT EXISTS publish_requested BOOLEAN NOT NULL DEFAULT false`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** The songs these stems come from, and whether every part used is in the public library. */
export async function songsOfStems(stemIds: string[]): Promise<UsedSong[]> {
  if (!stemIds.length) return [];
  await ensure();
  const rows = await sql<{ track_id: string; title: string; owner_id: string; owner_name: string; all_public: boolean }[]>`
    SELECT t.id AS track_id, t.title, t.owner_id, u.artist_name AS owner_name,
           bool_and(t.visibility = 'public' AND NOT s.held_back) AS all_public
    FROM stems s JOIN tracks t ON t.id = s.track_id JOIN users u ON u.id = t.owner_id
    WHERE s.id IN ${sql([...new Set(stemIds)])}
    GROUP BY t.id, t.title, t.owner_id, u.artist_name
  `;
  return rows.map((r) => ({ trackId: r.track_id, title: r.title, ownerId: r.owner_id, ownerName: r.owner_name, allPublic: r.all_public }));
}

async function consentsOf(remixId: string): Promise<Map<string, ConsentStatus>> {
  const rows = await sql<{ track_id: string; status: ConsentStatus }[]>`SELECT track_id, status FROM remix_consents WHERE remix_id = ${remixId}`;
  return new Map(rows.map((r) => [r.track_id, r.status]));
}

async function stemsOfRemix(remixId: string): Promise<string[]> {
  const rows = await sql<{ stem_id: string }[]>`SELECT stem_id FROM remix_lanes WHERE remix_id = ${remixId} AND NOT muted`;
  return rows.map((r) => r.stem_id);
}

/** Who still has to agree before this remix can be public (by `publisherId`). */
export async function stillWaiting(remixId: string, publisherId: string, stemIds?: string[]): Promise<Waiting[]> {
  await ensure();
  const songs = await songsOfStems(stemIds ?? (await stemsOfRemix(remixId)));
  return waitingFor(songs, publisherId, await consentsOf(remixId));
}

/**
 * The maker wants it public but some owners haven't agreed: ask the ones not
 * asked yet (a "no" stays a "no" until asked again on purpose), and remember
 * to publish it when they all say yes.
 */
export async function askToPublish(remixId: string, publisherId: string, waiting: Waiting[], { again = false } = {}) {
  await ensure();
  await sql`UPDATE remixes SET publish_requested = true, published = false WHERE id = ${remixId}`;
  for (const w of waiting) {
    if (w.status === "declined" && !again) continue;
    if (w.status === "asked" && !again) continue;
    await sql`
      INSERT INTO remix_consents (remix_id, track_id, owner_id, asked_by, status)
      VALUES (${remixId}, ${w.trackId}, ${w.ownerId}, ${publisherId}, 'asked')
      ON CONFLICT (remix_id, track_id) DO UPDATE SET status = 'asked', asked_by = EXCLUDED.asked_by, decided_at = NULL, note = NULL, created_at = now()
    `;
    await notify({ userId: w.ownerId, actorId: publisherId, type: "consent", remixId, trackId: w.trackId, body: "asked" });
  }
}

export type ConsentRequest = {
  remix_id: string; remix_title: string; track_id: string; track_title: string; asked_by: string; asked_by_name: string;
  status: ConsentStatus; note: string | null; created_at: string; parts: string[];
};

/** What this person has been asked (and has answered), newest first. */
export async function requestsFor(ownerId: string): Promise<ConsentRequest[]> {
  await ensure();
  return sql<ConsentRequest[]>`
    SELECT c.remix_id, r.title AS remix_title, c.track_id, t.title AS track_title, c.asked_by, u.artist_name AS asked_by_name,
           c.status, c.note, c.created_at,
           coalesce((SELECT array_agg(DISTINCT s.kind) FROM remix_lanes l JOIN stems s ON s.id = l.stem_id
                     WHERE l.remix_id = c.remix_id AND s.track_id = c.track_id), '{}') AS parts
    FROM remix_consents c
    JOIN remixes r ON r.id = c.remix_id JOIN tracks t ON t.id = c.track_id JOIN users u ON u.id = c.asked_by
    WHERE c.owner_id = ${ownerId}
    ORDER BY (c.status = 'asked') DESC, c.created_at DESC
    LIMIT 100
  `;
}

/** The remix maker's view: each owner asked and their answer. */
export async function consentsForMaker(remixId: string, makerId: string) {
  await ensure();
  const [remix] = await sql<{ owner_id: string; publish_requested: boolean; published: boolean }[]>`
    SELECT owner_id, publish_requested, published FROM remixes WHERE id = ${remixId}
  `;
  if (!remix || remix.owner_id !== makerId) return null;
  const rows = await sql<{ track_id: string; track_title: string; owner_name: string; status: ConsentStatus; note: string | null; decided_at: string | null }[]>`
    SELECT c.track_id, t.title AS track_title, u.artist_name AS owner_name, c.status, c.note, c.decided_at
    FROM remix_consents c JOIN tracks t ON t.id = c.track_id JOIN users u ON u.id = c.owner_id
    WHERE c.remix_id = ${remixId} ORDER BY c.created_at
  `;
  return { requested: remix.publish_requested, published: remix.published, waiting: await stillWaiting(remixId, makerId), answers: rows };
}

/**
 * A song's owner answers. On the last "yes" for a remix whose maker asked to
 * publish, it goes public now. Returns what happened, or an error.
 */
export async function decide(
  remixId: string,
  trackId: string,
  ownerId: string,
  agree: boolean,
  note: string | null
): Promise<{ error: string } | { status: ConsentStatus; published: boolean }> {
  await ensure();
  const [c] = await sql<{ asked_by: string }[]>`
    UPDATE remix_consents SET status = ${agree ? "agreed" : "declined"}, note = ${note}, decided_at = now()
    WHERE remix_id = ${remixId} AND track_id = ${trackId} AND owner_id = ${ownerId}
    RETURNING asked_by
  `;
  if (!c) return { error: "Nothing to answer" };
  const [remix] = await sql<{ owner_id: string; publish_requested: boolean; published: boolean }[]>`
    SELECT owner_id, publish_requested, published FROM remixes WHERE id = ${remixId}
  `;
  if (!remix) return { error: "That remix is gone" };
  if (!agree) {
    await notify({ userId: remix.owner_id, actorId: ownerId, type: "consent", remixId, trackId, body: `declined|${note ?? ""}` });
    return { status: "declined", published: false };
  }
  let published = false;
  if (remix.publish_requested && !remix.published && (await stillWaiting(remixId, remix.owner_id)).length === 0) {
    await sql`UPDATE remixes SET published = true, publish_requested = false, updated_at = now() WHERE id = ${remixId}`;
    published = true;
    trackServer("publish", remix.owner_id, { what: "remix", after: "consent" });
    await notifyRemixCreated(remixId, remix.owner_id).catch(() => {});
  }
  await notify({ userId: remix.owner_id, actorId: ownerId, type: "consent", remixId, trackId, body: published ? "published" : "agreed" });
  return { status: "agreed", published };
}

/** Whether `userId` was asked about this remix (they may open it, private as it is, to listen first). */
export async function wasAsked(remixId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  await ensure();
  const [row] = await sql`SELECT 1 FROM remix_consents WHERE remix_id = ${remixId} AND owner_id = ${userId}`;
  return !!row;
}
