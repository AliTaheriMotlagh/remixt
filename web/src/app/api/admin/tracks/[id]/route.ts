import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, deleteTracks } from "@/lib/admin";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deleted = await deleteTracks([(await params).id]);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
