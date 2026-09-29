import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { deleteChallenge } from "@/lib/challenges";

// Deleting a challenge keeps its entries; they just stop being entries.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteChallenge((await params).id);
  return NextResponse.json({ ok: true });
}
