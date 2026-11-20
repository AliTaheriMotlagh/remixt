import { NextRequest } from "next/server";
import { houseAdMediaKey } from "@/lib/monetize/houseStore";
import { serveObject } from "@/lib/storage";

// The uploaded picture, video or sound of one of Remixt's own ads. The key in
// the query (?v=) changes when it's replaced, so it can be cached for long.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = await houseAdMediaKey((await params).id).catch(() => null);
  if (!key) return new Response("Not found", { status: 404 });
  const res = await serveObject(key, req.headers.get("range"));
  if (res.status < 300) res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
