import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publishState } from "@/lib/live";
import { requireHost } from "@/lib/liveRequest";

// The host's performance: what's playing, where, and each stem's state.
const stateSchema = z.object({
  playing: z.boolean(),
  position: z.number().min(0).max(6 * 3600),
  lanes: z
    .array(z.object({ muted: z.boolean(), solo: z.boolean(), volume: z.number().min(0).max(2) }))
    .max(32),
  note: z.string().trim().max(80).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await requireHost(id);
  if ("error" in host) return host.error;
  if (host.stream.status !== "live") return NextResponse.json({ error: "Not live" }, { status: 409 });
  const parsed = stateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  await publishState(id, parsed.data);
  return NextResponse.json({ ok: true });
}
