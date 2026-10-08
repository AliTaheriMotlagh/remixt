import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { deleteObject, putObject, serveObject } from "@/lib/storage";
import { MAX_RESULT_BYTES, RESULT_VERSIONS, isAnalysisPack, isResultKind, parseBeats } from "@/lib/stemResults";

// A result one browser worked out from a stem (lib/stemResults.ts), for
// every other browser: GET hands it out, PUT keeps the first one sent for
// each stem, kind and version. The file sits in stem storage next to the
// stems; this table says where, and who sent it.

type Params = { params: Promise<{ id: string; kind: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  if (!isResultKind(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  await ensureSchema();
  const [row] = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM stem_results WHERE stem_id = ${id} AND kind = ${kind} AND version = ${RESULT_VERSIONS[kind]}
  `;
  // Not worked out yet: whoever asked works it out and sends it.
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return serveObject(row.storage_key, req.headers.get("range"));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  if (!isResultKind(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  // Sent by a tab from before the code that makes it changed: not this version.
  if (Number(req.nextUrl.searchParams.get("v")) !== RESULT_VERSIONS[kind]) {
    return NextResponse.json({ error: "Out of date" }, { status: 409 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const max = MAX_RESULT_BYTES[kind];
  if (Number(req.headers.get("content-length")) > max) return NextResponse.json({ error: "Too big" }, { status: 413 });

  await ensureSchema();
  const [stem] = await sql<{ ok: boolean; known: boolean }[]>`
    SELECT tracks.status = 'ready' AS ok,
           EXISTS (SELECT 1 FROM stem_results
                   WHERE stem_id = stems.id AND kind = ${kind} AND version = ${RESULT_VERSIONS[kind]}) AS known
    FROM stems JOIN tracks ON tracks.id = stems.track_id
    WHERE stems.id = ${id}
  `;
  if (!stem?.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The first one sent is kept: they're all the same work on the same audio.
  if (stem.known) return NextResponse.json({ stored: false });

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > max) return NextResponse.json({ error: "Wrong size" }, { status: 413 });
  const valid = kind === "beats" ? parseBeats(bytes) !== null : isAnalysisPack(bytes);
  if (!valid) return NextResponse.json({ error: "Not a valid result" }, { status: 400 });

  const key = `results/${id}/${kind}-v${RESULT_VERSIONS[kind]}-${randomUUID()}.bin`;
  await putObject(key, Buffer.from(bytes));
  const inserted = await sql`
    INSERT INTO stem_results (stem_id, kind, version, storage_key, bytes, created_by)
    VALUES (${id}, ${kind}, ${RESULT_VERSIONS[kind]}, ${key}, ${bytes.length}, ${user.id})
    ON CONFLICT DO NOTHING
    RETURNING stem_id
  `;
  // Someone else's arrived first, in between: theirs stays.
  if (inserted.length === 0) await deleteObject(key).catch(() => {});
  return NextResponse.json({ stored: inserted.length > 0 });
}
