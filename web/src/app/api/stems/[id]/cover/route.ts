import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchCoverImage, findCoverOnline } from "@/lib/coverLookup";
import sql from "@/lib/db";
import { imageExtension } from "@/lib/imageType";
import { ensureSchema } from "@/lib/schema";
import { putObject, serveObject } from "@/lib/storage";
import { canHearStem } from "@/lib/trackAccess";

// A song's cover picture, by one of its stems — all a Studio lane, a
// library preview or a DJ deck knows of the song. 204 (nothing, and no
// error in the console for every song without one) when it has none
// (the page then draws one from the song's waveform, see SongArt), kept
// a while either way so a lane doesn't ask again on every render.
//
// A song added before covers were looked for online (or whose look-up
// failed at upload) gets one the first time it's shown: found by its
// artist and name (lib/coverLookup.ts) and kept with the song. When none
// is surely the song, that's remembered for a month.

const SEARCH_AGAIN_DAYS = 30;

type Row = { track_id: string; title: string; original_filename: string; cover_key: string | null; searched: boolean };

/** Looks the song's cover up online and keeps it. The key kept, null when none, undefined to try later. */
async function lookUp(row: Row): Promise<string | null | undefined> {
  // The title the uploader gave is usually the cleaner name; the file's name is the fallback.
  let found = await findCoverOnline(row.title);
  if (found === null && row.original_filename && row.original_filename !== row.title) found = await findCoverOnline(row.original_filename);
  if (found === undefined) return undefined;
  if (!found) {
    await sql`UPDATE tracks SET cover_searched_at = now() WHERE id = ${row.track_id}`;
    return null;
  }
  const body = await fetchCoverImage(found.url);
  const ext = body && imageExtension(body);
  if (!body || !ext) return undefined;
  const key = `track-covers/${row.track_id}/${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  // Unless one was set meanwhile (the owner, another request).
  const [set] = await sql<{ id: string }[]>`UPDATE tracks SET cover_key = ${key} WHERE id = ${row.track_id} AND cover_key IS NULL RETURNING id`;
  return set ? key : undefined;
}

/** Songs being looked up right now, so a page showing a song twice doesn't look it up twice. */
const looking = new Map<string, Promise<string | null | undefined>>();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSchema();
  const [row] = await sql<Row[]>`
    SELECT tracks.id AS track_id, tracks.title, tracks.original_filename, tracks.cover_key,
      (tracks.cover_searched_at IS NOT NULL AND tracks.cover_searched_at > now() - make_interval(days => ${SEARCH_AGAIN_DAYS})) AS searched
    FROM stems JOIN tracks ON tracks.id = stems.track_id WHERE stems.id = ${id}
  `;
  const none = (seconds = 600) => new NextResponse(null, { status: 204, headers: { "Cache-Control": `private, max-age=${seconds}` } });
  if (!row) return none();
  if (!(await canHearStem(id, await getCurrentUser()))) return none();
  let key = row.cover_key;
  if (!key && !row.searched) {
    let pending = looking.get(row.track_id);
    if (!pending) {
      pending = lookUp(row).catch(() => undefined).finally(() => looking.delete(row.track_id));
      looking.set(row.track_id, pending);
    }
    const found = await pending;
    // Couldn't ask just now: the page asks again on its next visit.
    if (found === undefined) return none(60);
    key = found;
  }
  if (!key) return none();
  const res = await serveObject(key, req.headers.get("range"));
  // Kept, but its file isn't in storage (not moved from an old store yet): no picture for now,
  // as for a song without one, rather than a 404 in the console of every page that shows it.
  if (res.status === 404) return none(300);
  // A replaced cover shows within the hour.
  if (res.ok && !res.headers.has("location")) res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
