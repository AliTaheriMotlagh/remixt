import { NextRequest } from "next/server";
import { getStemById } from "@/lib/models";
import { publicUrl, serveBlobRange, servesThroughApp, serveStorageFile } from "@/lib/storage";

// Plays a stem. Stems with a public URL (a public Blob store, R2, rows from
// older builds) redirect there, so the audio streams from the CDN rather
// than through this server. A private Blob store's stems are proxied here
// in slices; local-disk stems are streamed with Range support.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stem = await getStemById(id);
  if (!stem) return Response.json({ error: "Not found" }, { status: 404 });

  if (/^https?:\/\//.test(stem.file_url)) {
    return Response.redirect(stem.file_url, 302);
  }
  const remote = publicUrl(stem.file_url);
  if (remote) return Response.redirect(remote, 302);
  if (servesThroughApp(stem.file_url)) {
    return serveBlobRange(stem.file_url, req.headers.get("range"));
  }
  return serveStorageFile(stem.file_url, req.headers.get("range"));
}
