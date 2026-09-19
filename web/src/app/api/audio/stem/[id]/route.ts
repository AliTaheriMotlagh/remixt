import { NextRequest } from "next/server";
import { getStemById } from "@/lib/models";
import { serveStorageFile } from "@/lib/storage";

// Stems live on local disk; stream them with Range support so the player can
// seek. Rows written by an older cloud-storage build hold an absolute URL
// instead of a storage key — redirect those rather than 404.
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
  return serveStorageFile(stem.file_url, req.headers.get("range"));
}
