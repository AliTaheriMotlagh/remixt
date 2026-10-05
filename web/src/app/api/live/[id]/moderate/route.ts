import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hideMessage, pinMessage } from "@/lib/live";
import { requireHost } from "@/lib/liveRequest";

// The host's chat controls: hide a message, hide it and ban who wrote it,
// pin a message to the top (or unpin).
const schema = z.object({
  action: z.enum(["hide", "ban", "pin", "unpin"]),
  eventId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await requireHost(id);
  if ("error" in host) return host.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { action, eventId } = parsed.data;
  if (action === "unpin") {
    await pinMessage(id, null);
    return NextResponse.json({ ok: true });
  }
  if (!eventId) return NextResponse.json({ error: "Pick a message" }, { status: 400 });
  const ok = action === "pin" ? await pinMessage(id, eventId) : await hideMessage(id, eventId, action === "ban");
  if (!ok) return NextResponse.json({ error: "That message is gone" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
