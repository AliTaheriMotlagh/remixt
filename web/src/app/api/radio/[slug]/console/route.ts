import { NextRequest, NextResponse } from "next/server";
import { consoleAction, playlistOf, type ConsoleAction } from "@/lib/radio";
import { bodyOf, fail, kindOf, noStore, requireManager } from "@/lib/radioRequest";

// The station's console: its playlist, and every action the DJ can take.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await requireManager(slug);
  if ("error" in found) return found.error;
  const { station } = found;
  return NextResponse.json({ playlist: await playlistOf(station), settings: station.settings, name: station.name, tagline: station.tagline }, { headers: noStore });
}

const ACTIONS = new Set(["skip", "queue", "unqueue", "move", "playlist-add", "playlist-remove", "playlist-move", "playlist-clear", "accept", "reject", "clear-requests", "settings"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await requireManager(slug);
  if ("error" in found) return found.error;
  const body = await bodyOf(req);
  if (!body || typeof body.action !== "string" || !ACTIONS.has(body.action)) return fail("Unknown action");
  // Items are checked again server side (findItem); ids and kinds just have to look right here.
  if ("kind" in body && !kindOf(body.kind)) return fail("Bad item");
  if ("by" in body && body.by !== 1 && body.by !== -1) return fail("Bad move");
  try {
    await consoleAction(found.station, body as unknown as ConsoleAction);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't do that");
  }
}
