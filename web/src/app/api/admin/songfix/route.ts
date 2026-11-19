import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { fetchCoverImage } from "@/lib/coverLookup";
import { imageExtension } from "@/lib/imageType";
import { setLyricsChoice } from "@/lib/itemLyrics";
import { deleteObject, putObject } from "@/lib/storage";
import { closeFieldReports, closeReports, markChecked, remixReports, renameSong, songsToFix } from "@/lib/songFixes";

// Admin → Fix songs: the songs most likely to have a wrong name, artist,
// cover or lyrics (reported ones first), and the fixes to apply. The page
// gathers suggestions itself from the cover and lyrics searches the Studio
// uses (/api/covers/search, /api/lyrics/search); here they're applied.
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = req.nextUrl.searchParams;
  const only = (["doubtful", "reported", "all"].includes(p.get("only") ?? "") ? p.get("only") : "doubtful") as "doubtful" | "reported" | "all";
  const [songs, remixes] = await Promise.all([songsToFix({ q: p.get("q")?.slice(0, 100) ?? "", only }), remixReports()]);
  return NextResponse.json({ songs, remixes }, { headers: { "Cache-Control": "no-store" } });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), id: z.string().max(64), title: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("checked"), id: z.string().max(64) }),
  /** A cover from Apple's catalogue (the address the cover search gave). */
  z.object({ action: z.literal("cover-url"), id: z.string().max(64), url: z.string().url().max(1000) }),
  z.object({ action: z.literal("cover-remove"), id: z.string().max(64) }),
  z.object({ action: z.literal("lyrics"), id: z.string().max(64), lrc: z.string().max(60_000), song: z.string().max(200), noWords: z.boolean().default(false) }),
  z.object({ action: z.literal("reports"), ids: z.array(z.string().max(64)).max(100), status: z.enum(["done", "dismissed"]) }),
]);

async function setCover(id: string, body: Buffer) {
  const ext = imageExtension(body);
  if (!ext) return "Not a JPEG or PNG picture";
  const [track] = await sql<{ cover_key: string | null }[]>`SELECT cover_key FROM tracks WHERE id = ${id}`;
  if (!track) return "Song not found";
  const key = `track-covers/${id}/${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  // cover_searched_at too, so the lazy online search doesn't replace it.
  await sql`UPDATE tracks SET cover_key = ${key}, cover_searched_at = now() WHERE id = ${id}`;
  if (track.cover_key) await deleteObject(track.cover_key).catch(() => {});
  await closeFieldReports(id, ["cover"]);
  return null;
}

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const a = parsed.data;
  if (a.action === "rename") await renameSong(a.id, a.title);
  if (a.action === "checked") await markChecked(a.id);
  if (a.action === "cover-url") {
    const body = await fetchCoverImage(a.url);
    if (!body) return NextResponse.json({ error: "Couldn't fetch that picture" }, { status: 400 });
    const problem = await setCover(a.id, body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  if (a.action === "cover-remove") {
    const [t] = await sql<{ cover_key: string | null }[]>`SELECT cover_key FROM tracks WHERE id = ${a.id}`;
    // Searched "now": the lazy online search won't put a wrong one back for 30 days.
    await sql`UPDATE tracks SET cover_key = NULL, cover_searched_at = now() WHERE id = ${a.id}`;
    if (t?.cover_key) await deleteObject(t.cover_key).catch(() => {});
  }
  if (a.action === "lyrics") {
    await setLyricsChoice(admin, "track", a.id, { lrc: a.lrc, shift: 0, noWords: a.noWords, song: a.song });
    await closeFieldReports(a.id, ["lyrics"]);
  }
  if (a.action === "reports") await closeReports(a.ids, a.status);
  return NextResponse.json({ ok: true });
}
