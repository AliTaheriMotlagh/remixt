import { NextRequest, NextResponse } from "next/server";
import { MIX_MAX_BYTES, publishMix } from "@/lib/live";
import { requireHost } from "@/lib/liveRequest";

// A studio session's mix: the host's Studio sends it (a moment after each
// edit) and listeners' tabs pick it up with the feed. The shape is the
// Studio's own (lib/client/liveStudio.ts); here it's only checked for size
// and that it's a mix at all.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await requireHost(id);
  if ("error" in host) return host.error;
  if (host.stream.status !== "live") return NextResponse.json({ error: "Not live" }, { status: 409 });
  if (host.stream.mode !== "studio") return NextResponse.json({ error: "Not a studio session" }, { status: 409 });
  const text = await req.text();
  if (text.length > MIX_MAX_BYTES) return NextResponse.json({ error: "That mix is too big to broadcast" }, { status: 413 });
  let mix: { lanes?: unknown; project?: unknown } | null = null;
  try {
    mix = JSON.parse(text);
  } catch {
    // handled below
  }
  if (!mix || !Array.isArray(mix.lanes) || mix.lanes.length > 64 || typeof mix.project !== "object") {
    return NextResponse.json({ error: "Invalid mix" }, { status: 400 });
  }
  const version = await publishMix(id, text);
  return NextResponse.json({ version });
}
