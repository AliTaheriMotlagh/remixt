import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createStation, listStations, NAME_MAX, TAGLINE_MAX } from "@/lib/radio";
import { bodyOf, fail, noStore } from "@/lib/radioRequest";

// Every station (the busiest first), and starting a new one.
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ stations: await listStations(user?.id ?? null) }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to start a station", 401);
  const body = await bodyOf(req);
  const name = typeof body?.name === "string" ? body.name.slice(0, NAME_MAX) : "";
  const tagline = typeof body?.tagline === "string" ? body.tagline.slice(0, TAGLINE_MAX) : "";
  try {
    return NextResponse.json({ slug: await createStation(user, name, tagline) }, { headers: noStore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't start the station");
  }
}
