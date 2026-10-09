import { NextRequest } from "next/server";
import { getStemById } from "@/lib/models";
import { publicUrl, serveBlobRange, servesThroughApp, serveStorageFile } from "@/lib/storage";

// Plays a stem. Stems with a public URL (a public Blob store, R2, rows from
// older builds) redirect there, so the audio streams from the CDN rather
// than through this server. A private Blob store's stems are proxied here
// in slices; local-disk stems are streamed with Range support.
//
// A stem's file never changes under its id, so the browser may keep it for
// as long as the Studio keeps it on disk (see lib/client/localCache.ts) —
// privately, so a shared cache never serves a stem after it's taken down.
const KEEP_FILE = "private, max-age=2592000, immutable";
/** Where a stem lives could move (another storage backend): its redirect is kept a day. */
const KEEP_REDIRECT = "private, max-age=86400";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": KEEP_REDIRECT } });
}

function kept(res: Response) {
  if (res.ok) res.headers.set("Cache-Control", KEEP_FILE);
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stem = await getStemById(id);
  if (!stem) return Response.json({ error: "Not found" }, { status: 404 });

  if (/^https?:\/\//.test(stem.file_url)) return redirect(stem.file_url);
  const remote = publicUrl(stem.file_url);
  if (remote) return redirect(remote);
  if (servesThroughApp(stem.file_url)) {
    return kept(await serveBlobRange(stem.file_url, req.headers.get("range")));
  }
  return kept(await serveStorageFile(stem.file_url, req.headers.get("range")));
}
