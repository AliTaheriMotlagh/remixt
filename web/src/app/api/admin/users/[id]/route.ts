import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, deleteTracks, isAdmin } from "@/lib/admin";
import sql from "@/lib/db";

// Deletes an account with everything it owns: its songs (and their stem
// files) and its remixes. Admins can't be deleted from here — take them out
// of ADMIN_EMAILS first.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;

  const [user] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.id === admin.id || isAdmin(user)) {
    return NextResponse.json({ error: "Admins can't be deleted here" }, { status: 400 });
  }

  const tracks = await sql<{ id: string }[]>`SELECT id FROM tracks WHERE owner_id = ${id}`;
  const songs = await deleteTracks(tracks.map((t) => t.id));
  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true, songs });
}
