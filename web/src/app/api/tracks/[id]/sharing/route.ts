import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getTrackById } from "@/lib/models";
import { notify } from "@/lib/notifications";
import { ensureSchema } from "@/lib/schema";
import { PART_KINDS, publishPlan } from "@/lib/songPrivacy";
import { trackServer } from "@/lib/analyticsStore";

// Who can see and use a track — its owner decides (rules: lib/songPrivacy.ts).
// A take recorded in the booth starts private ("only me"), and so does any
// song uploaded "only me"; its owner can share it with chosen people, and
// publish it — all of it, or only some parts (the beat, not the vocal).
//
// GET: { visibility, people, parts: [{ kind, public }] }
// PATCH { visibility }: "private" (only me and the people below) or "public" (every part).
// PATCH { parts: ["beat"] }: publish exactly these parts; none = private.
// POST { userId }: share with one more person (they're notified).
// DELETE ?user=<id>: stop sharing with them.

type Params = { params: Promise<{ id: string }> };

type SharePerson = { id: string; artist_name: string; avatar_color: string };

/** The track, if the signed-in user owns it; else the answer to give. */
async function ownTrack(params: Params["params"]) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const { id } = await params;
  await ensureSchema();
  const track = await getTrackById(id);
  if (!track || track.owner_id !== user.id) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user, track };
}

async function state(trackId: string) {
  const [track] = await sql<{ visibility: string }[]>`SELECT visibility FROM tracks WHERE id = ${trackId}`;
  const stems = await sql<{ kind: string; held_back: boolean }[]>`SELECT kind, held_back FROM stems WHERE track_id = ${trackId}`;
  const parts = PART_KINDS.flatMap((kind) => {
    const stem = stems.find((x) => x.kind === kind);
    return stem ? [{ kind, public: track?.visibility === "public" && !stem.held_back }] : [];
  });
  const people = await sql<SharePerson[]>`
    SELECT users.id, users.artist_name, users.avatar_color
    FROM track_shares JOIN users ON users.id = track_shares.user_id
    WHERE track_shares.track_id = ${trackId}
    ORDER BY track_shares.created_at
  `;
  return { visibility: track?.visibility ?? "private", people, parts };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const found = await ownTrack(params);
  if (found.error) return found.error;
  return NextResponse.json(await state(found.track.id), { headers: { "Cache-Control": "private, no-store" } });
}

const patchSchema = z
  .object({ visibility: z.enum(["public", "private"]).optional(), parts: z.array(z.enum(PART_KINDS)).max(PART_KINDS.length).optional() })
  .refine((b) => b.visibility || b.parts, "Say who can hear it");

export async function PATCH(req: NextRequest, { params }: Params) {
  const found = await ownTrack(params);
  if (found.error) return found.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const has = (await sql<{ kind: string }[]>`SELECT kind FROM stems WHERE track_id = ${found.track.id}`).map((r) => r.kind);
  // Everyone = every part; only me = none; or exactly the parts chosen.
  const chosen = parsed.data.parts ?? (parsed.data.visibility === "public" ? has : []);
  const plan = publishPlan(has, chosen);
  await sql.begin(async (tx) => {
    await tx`UPDATE tracks SET visibility = ${plan.visibility} WHERE id = ${found.track.id}`;
    await tx`UPDATE stems SET held_back = (kind = ANY(${plan.heldBack})) WHERE track_id = ${found.track.id}`;
  });
  if (plan.visibility === "public") trackServer("publish", found.user.id, { what: "song", parts: plan.published.join(",") });
  return NextResponse.json(await state(found.track.id));
}

const postSchema = z.object({ userId: z.string().min(1).max(100) });

export async function POST(req: NextRequest, { params }: Params) {
  const found = await ownTrack(params);
  if (found.error) return found.error;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick someone to share with" }, { status: 400 });
  const { userId } = parsed.data;
  if (userId === found.user.id) return NextResponse.json({ error: "It's already yours" }, { status: 400 });
  const [person] = await sql`SELECT 1 FROM users WHERE id = ${userId}`;
  if (!person) return NextResponse.json({ error: "No such artist" }, { status: 404 });
  const added = await sql`
    INSERT INTO track_shares (track_id, user_id) VALUES (${found.track.id}, ${userId})
    ON CONFLICT DO NOTHING RETURNING user_id
  `;
  if (added.length) await notify({ userId, actorId: found.user.id, type: "share", trackId: found.track.id });
  return NextResponse.json(await state(found.track.id));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const found = await ownTrack(params);
  if (found.error) return found.error;
  const userId = req.nextUrl.searchParams.get("user");
  if (!userId) return NextResponse.json({ error: "Who?" }, { status: 400 });
  await sql`DELETE FROM track_shares WHERE track_id = ${found.track.id} AND user_id = ${userId}`;
  return NextResponse.json(await state(found.track.id));
}
