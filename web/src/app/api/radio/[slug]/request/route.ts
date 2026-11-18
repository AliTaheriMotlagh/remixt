import { NextRequest, NextResponse } from "next/server";
import { makeRequest, withdrawRequest } from "@/lib/radio";
import { bodyOf, fail, kindOf, listenerOf, noStore, stationFor } from "@/lib/radioRequest";

// A listener asks for a song (many asking for the same one moves it up),
// or takes their request back.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await bodyOf(req);
  const who = await listenerOf(body?.sid);
  const kind = kindOf(body?.kind);
  if (!who || !kind || typeof body?.id !== "string") return fail("Bad request");
  const found = await stationFor(slug);
  if ("error" in found) return found.error;
  try {
    const result = await makeRequest(found.station, {
      me: who.me,
      user: who.user,
      kind,
      id: body.id,
      name: typeof body.name === "string" ? body.name : "",
      message: typeof body.message === "string" ? body.message : "",
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't send the request", 409);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await bodyOf(req);
  const who = await listenerOf(body?.sid);
  const kind = kindOf(body?.kind);
  if (!who || !kind || typeof body?.id !== "string") return fail("Bad request");
  const found = await stationFor(slug);
  if ("error" in found) return found.error;
  await withdrawRequest(found.station, who.me, kind, body.id);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
