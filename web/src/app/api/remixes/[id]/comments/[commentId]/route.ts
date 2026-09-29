import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSocialSchema, getComments } from "@/lib/social";

// Deletes a comment — its author can, and so can the remix's owner.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureSocialSchema();
  const deleted = await sql`
    DELETE FROM remix_comments
    WHERE id = ${commentId} AND remix_id = ${id}
      AND (user_id = ${user.id} OR EXISTS (SELECT 1 FROM remixes WHERE id = ${id} AND owner_id = ${user.id}))
    RETURNING id
  `;
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ comments: await getComments(id) });
}
