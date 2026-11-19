import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { ensureMonetizeSchema } from "@/lib/monetize/store";
import { serveObject } from "@/lib/storage";

// An ad's uploaded picture (?f=image) or sound (?f=audio). The key in the
// query (?v=) changes when it's replaced, so it can be cached for long.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureMonetizeSchema();
  const [c] = await sql<{ image_key: string | null; audio_key: string | null }[]>`SELECT image_key, audio_key FROM ad_campaigns WHERE id = ${id}`;
  const key = req.nextUrl.searchParams.get("f") === "audio" ? c?.audio_key : c?.image_key;
  if (!key) return new Response("Not found", { status: 404 });
  const res = await serveObject(key, req.headers.get("range"));
  if (res.status < 300) res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
