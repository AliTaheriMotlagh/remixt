import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/radio";
import { bodyOf, fail, kindOf, listenerOf, noStore, stationFor } from "@/lib/radioRequest";

// A vote for one of the next song's choices (again: changes it).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await bodyOf(req);
  const who = await listenerOf(body?.sid);
  const kind = kindOf(body?.kind);
  if (!who || !kind || typeof body?.id !== "string" || typeof body.round !== "number") return fail("Bad vote");
  const found = await stationFor(slug);
  if ("error" in found) return found.error;
  try {
    await castVote(found.station, who.me, kind, body.id, body.round);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't vote", 409);
  }
}
