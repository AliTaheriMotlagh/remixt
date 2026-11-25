import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publishState } from "@/lib/live";
import { cleanDjStage } from "@/lib/liveDj";
import { requireHost } from "@/lib/liveRequest";

// The host's performance: what's playing, where, and each stem's state.
const stateSchema = z.object({
  playing: z.boolean(),
  position: z.number().min(0).max(6 * 3600),
  lanes: z
    .array(z.object({ muted: z.boolean(), solo: z.boolean(), volume: z.number().min(0).max(2) }))
    .max(64),
  note: z.string().trim().max(80).optional(),
  selected: z.array(z.string().max(64)).max(32).optional(),
  /** DJ sessions: both decks and the mixer; checked and clamped by cleanDjStage. */
  dj: z.unknown().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await requireHost(id);
  if ("error" in host) return host.error;
  if (host.stream.status !== "live") return NextResponse.json({ error: "Not live" }, { status: 409 });
  const parsed = stateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  const { dj, ...state } = parsed.data;
  const stage = host.stream.mode === "dj" && dj !== undefined ? cleanDjStage(dj) : null;
  if (dj !== undefined && host.stream.mode === "dj" && !stage) return NextResponse.json({ error: "Invalid decks" }, { status: 400 });
  await publishState(id, stage ? { ...state, dj: stage } : state);
  return NextResponse.json({ ok: true });
}
