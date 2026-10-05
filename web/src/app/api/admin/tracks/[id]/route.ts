import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, deleteTracks } from "@/lib/admin";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deleted = await deleteTracks([(await params).id]);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Featuring a song as a real-song example on /examples, with its credit line.
const patchSchema = z.object({
  featured: z.boolean(),
  credit: z.string().trim().max(200).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await ensureSchema();
  const [row] = await sql`
    UPDATE tracks SET featured_example = ${parsed.data.featured}, example_credit = ${parsed.data.credit ?? null}
    WHERE id = ${(await params).id} RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
