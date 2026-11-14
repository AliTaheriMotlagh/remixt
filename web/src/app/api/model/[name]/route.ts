import { NextRequest } from "next/server";
import { MODEL_MIRRORS, MIRROR_SLICE_BYTES, MODEL_SIZE_HEADER } from "@/lib/modelMirror";

// The in-browser models (the splitter's htdemucs, the beat tracker),
// relayed through this app a slice at a time for browsers that can't reach
// where they normally come from — Hugging Face refuses visitors from some
// countries (Iran among them), and raw.githubusercontent.com is filtered in
// places. Each slice is its own URL (?part=N), so a CDN in front of the app
// keeps them and only the first visitor's requests reach the source.
//
// Slices rather than one response: Vercel caps a function's response at
// 4.5 MB, and the splitter's model is 172 MB.

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const source = MODEL_MIRRORS[name];
  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const part = Number(req.nextUrl.searchParams.get("part") ?? "0");
  if (!Number.isInteger(part) || part < 0 || part > 10_000) {
    return Response.json({ error: "Bad part" }, { status: 400 });
  }
  const start = part * MIRROR_SLICE_BYTES;
  const end = start + MIRROR_SLICE_BYTES - 1;

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      headers: { Range: `bytes=${start}-${end}` },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the model's source" }, { status: 502 });
  }
  if (upstream.status === 416) return Response.json({ error: "Past the end" }, { status: 416 });
  if (upstream.status !== 206 || !upstream.body) {
    // A source that ignores Range would send the whole file; never relay that.
    await upstream.body?.cancel().catch(() => {});
    return Response.json({ error: `The model's source answered HTTP ${upstream.status}` }, { status: 502 });
  }
  const total = upstream.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  if (!total) {
    await upstream.body.cancel().catch(() => {});
    return Response.json({ error: "The model's source didn't say how big it is" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
      [MODEL_SIZE_HEADER]: total,
      "Access-Control-Expose-Headers": MODEL_SIZE_HEADER,
      // The files are pinned (a fixed commit, or a model that never
      // changes under its name), so a slice can be kept for good.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
