import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";

const patchSchema = z.object({ published: z.boolean() });

// Hide (unpublish) or delete anyone's remix.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const rows = await sql`
    UPDATE remixes SET published = ${parsed.data.published}, updated_at = now()
    WHERE id = ${(await params).id} RETURNING id
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await sql`DELETE FROM remixes WHERE id = ${(await params).id} RETURNING id`;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
