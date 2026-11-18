import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSetLyrics, clearLyricsChoice, LRC_MAX, lyricsChoice, setLyricsChoice } from "@/lib/itemLyrics";

// The words chosen for a song or remix, for everyone who hears it on the
// radio (lib/itemLyrics.ts).
//   GET    ?kind=track|remix&id=…   the choice (null when none), and whether you may change it
//   PUT    { kind, id, lrc, shift, noWords, song }   set it (the item's owner or an admin)
//   DELETE ?kind=…&id=…             back to the words found by themselves

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const kindOf = (raw: unknown) => (raw === "track" || raw === "remix" ? raw : null);
const idOf = (raw: unknown) => (typeof raw === "string" && /^[\w-]{1,80}$/.test(raw) ? raw : null);

export async function GET(req: NextRequest) {
  const kind = kindOf(req.nextUrl.searchParams.get("kind"));
  const id = idOf(req.nextUrl.searchParams.get("id"));
  if (!kind || !id) return fail("Bad item");
  const [choice, user] = await Promise.all([lyricsChoice(kind, id), getCurrentUser()]);
  return NextResponse.json({ choice, canSet: await canSetLyrics(user, kind, id) }, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = kindOf(body?.kind);
  const id = idOf(body?.id);
  if (!body || !kind || !id) return fail("Bad item");
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to set the words", 401);
  if (!(await canSetLyrics(user, kind, id))) return fail("Only its owner can set the words for everyone", 403);
  const lrc = typeof body.lrc === "string" ? body.lrc : "";
  if (lrc.length > LRC_MAX) return fail("Those lyrics are too long");
  const noWords = body.noWords === true;
  if (!noWords && !lrc.trim()) return fail("No words to save");
  await setLyricsChoice(user, kind, id, { lrc, shift: Number(body.shift) || 0, noWords, song: typeof body.song === "string" ? body.song : "" });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(req: NextRequest) {
  const kind = kindOf(req.nextUrl.searchParams.get("kind"));
  const id = idOf(req.nextUrl.searchParams.get("id"));
  if (!kind || !id) return fail("Bad item");
  const user = await getCurrentUser();
  if (!(await canSetLyrics(user, kind, id))) return fail("Only its owner can change the words for everyone", 403);
  await clearLyricsChoice(kind, id);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
