import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { COMMENT_MAX, ensureSocialSchema, getComments } from "@/lib/social";
import { notify } from "@/lib/notifications";

// A remix's comments: anyone who can see the remix can read them; signed-in
// listeners can post.

const postSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_MAX),
  /** Pins the comment to a moment in the song. */
  atSeconds: z.number().min(0).max(4 * 3600).nullable().optional(),
});

async function visible(remixId: string, userId: string | null) {
  const [row] = await sql`SELECT 1 FROM remixes WHERE id = ${remixId} AND (published OR owner_id = ${userId ?? ""})`;
  return !!row;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!(await visible(id, user?.id ?? null))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ comments: await getComments(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to comment" }, { status: 401 });
  if (!(await visible(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `A comment is 1 to ${COMMENT_MAX} characters` }, { status: 400 });
  }
  await ensureSocialSchema();
  // A little flood protection: at most 5 comments a minute per person.
  const [recent] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM remix_comments
    WHERE user_id = ${user.id} AND created_at > now() - interval '1 minute'
  `;
  if (recent.n >= 5) return NextResponse.json({ error: "Slow down a little — try again in a minute" }, { status: 429 });
  await sql`
    INSERT INTO remix_comments (id, remix_id, user_id, body, at_seconds)
    VALUES (${randomUUID()}, ${id}, ${user.id}, ${parsed.data.body}, ${parsed.data.atSeconds ?? null})
  `;
  const [remix] = await sql<{ owner_id: string }[]>`SELECT owner_id FROM remixes WHERE id = ${id}`;
  if (remix) {
    const body = parsed.data.body;
    await notify({
      userId: remix.owner_id,
      actorId: user.id,
      type: "comment",
      remixId: id,
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    });
  }
  return NextResponse.json({ comments: await getComments(id) });
}
