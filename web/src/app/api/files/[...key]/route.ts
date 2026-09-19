import { NextRequest } from "next/server";
import { serveStorageFile } from "@/lib/storage";

// Serves anything under the local storage directory (originals and stems).
// Deliberately unauthenticated: the separation service fetches the original
// over plain HTTP with no session cookie, and this whole app runs on
// localhost. Path traversal is blocked in resolveKey().
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  return serveStorageFile(key.map(decodeURIComponent).join("/"), req.headers.get("range"));
}
