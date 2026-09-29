import { NextRequest } from "next/server";
import { getStemById } from "@/lib/models";
import { publicUrl, serveStorageFile } from "@/lib/storage";

// Plays a stem. With R2 the browser is sent to the bucket's public URL, so
// the audio streams from Cloudflare rather than through this server; on
// local disk it's streamed here with Range support so the player can seek.
// Rows from an older cloud-storage build hold an absolute URL — redirect
// those too.
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
  return serveStorageFile(stem.file_url, req.headers.get("range"));
}
