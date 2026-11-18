import { NextRequest, NextResponse } from "next/server";
import { playPayload } from "@/lib/radio";
import { fail, kindOf } from "@/lib/radioRequest";

// What a listener's browser plays for one item: a remix's lanes, or a song's vocal and beat as lanes.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const kind = kindOf(q.get("kind"));
  const id = q.get("id");
  if (!kind || !id) return fail("Bad item");
  const payload = await playPayload(kind, id);
  if (!payload) return fail("That can't be played any more", 404);
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=60" } });
}
