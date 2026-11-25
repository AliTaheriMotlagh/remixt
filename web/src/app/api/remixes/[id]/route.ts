import { NextRequest, NextResponse } from "next/server";
import { blockedMessage, blockedSongsInRemix } from "@/lib/monetize/adStore";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { needsVerifiedEmail } from "@/lib/needsVerified";
import sql from "@/lib/db";
import { notifyRemixCreated } from "@/lib/notifications";
import { ensureSchema } from "@/lib/schema";
import { normaliseTags } from "@/lib/tags";
import { askToPublish, stillWaiting, wasAsked } from "@/lib/publishConsent";
import { waitingMessage } from "@/lib/songPrivacy";
import { trackServer } from "@/lib/analyticsStore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  // A private remix is only its owner's to open (or anyone's, once published) —
  // and the owner of a private song in it who was asked to agree to publishing it (to listen first).
  // An admin may open any remix (moderation, and playing it to check it).
  const asked = isAdmin(user) || (await wasAsked(id, user?.id ?? null).catch(() => false));
  const remixRows = await sql`
    SELECT remixes.*, users.artist_name, users.id as artist_id
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.id = ${id} AND (remixes.published OR remixes.owner_id = ${user?.id ?? ""} OR ${asked})
  `;
  const remix = remixRows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lanes = await sql`
    SELECT remix_lanes.*, stems.kind, stems.file_url, stems.peaks_json,
           tracks.title as track_title, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name as stem_artist_name
    FROM remix_lanes
    JOIN stems ON stems.id = remix_lanes.stem_id
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE remix_lanes.remix_id = ${id}
    ORDER BY remix_lanes.lane_order ASC
  `;

  return NextResponse.json({ remix, lanes });
}

const patchSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  published: z.boolean().optional(),
  /** Ask an owner who said no once more. */
  askAgain: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  await ensureSchema();
  const rows = await sql<{ owner_id: string; published: boolean }[]>`
    SELECT owner_id, published FROM remixes WHERE id = ${id}
  `;
  const remix = rows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { title, published, askAgain } = parsed.data;
  if (published && !remix.published) {
    const unconfirmed = await needsVerifiedEmail(user.id);
    if (unconfirmed) return unconfirmed;
    const blocked = await blockedSongsInRemix(id);
    if (blocked.length) return NextResponse.json({ error: blockedMessage(blocked), blocked }, { status: 409 });
    // Someone else's private song in it: its owner agrees first (lib/publishConsent.ts).
    const waiting = await stillWaiting(id, user.id);
    if (waiting.length) {
      if (waiting.some((w) => w.status === "declined") && !askAgain) {
        return NextResponse.json({ error: waitingMessage(waiting), waitingFor: waiting }, { status: 409 });
      }
      await askToPublish(id, user.id, waiting, { again: !!askAgain });
      if (title || parsed.data.tags) {
        await sql`UPDATE remixes SET title = COALESCE(${title ?? null}, title), tags = COALESCE(${parsed.data.tags ? normaliseTags(parsed.data.tags) : null}, tags) WHERE id = ${id}`;
      }
      return NextResponse.json({ ok: true, published: false, waitingFor: waiting, message: waitingMessage(waiting.map((w) => ({ ...w, status: "asked" as const }))) });
    }
  }
  const tags = parsed.data.tags ? normaliseTags(parsed.data.tags) : null;
  await sql`
    UPDATE remixes SET
      title = COALESCE(${title ?? null}, title),
      published = COALESCE(${published ?? null}, published),
      tags = COALESCE(${tags}, tags),
      updated_at = now()
    WHERE id = ${id}
  `;
  if (published && !remix.published) {
    await sql`UPDATE remixes SET publish_requested = false WHERE id = ${id}`.catch(() => {});
    trackServer("publish", user.id, { what: "remix" });
    await notifyRemixCreated(id, user.id).catch(() => {});
  }

  return NextResponse.json({ ok: true, published: published ?? remix.published });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const rows = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM remixes WHERE id = ${id}
  `;
  const remix = rows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await sql`DELETE FROM remixes WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
