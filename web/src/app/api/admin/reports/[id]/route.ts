import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { closeReport } from "@/lib/reports";

const schema = z.object({ action: z.enum(["resolve", "dismiss", "remove"]) });

// Close a report: dismiss it, mark it handled, or remove what was reported.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const ok = await closeReport((await params).id, parsed.data.action);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
