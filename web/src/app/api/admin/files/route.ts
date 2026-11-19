import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, deleteStemResults } from "@/lib/admin";
import { ensureSchema } from "@/lib/schema";
import { copyFromLegacyBlob, deleteFromLegacyBlob, deleteObjects, hasLegacyBlob } from "@/lib/storage";
import { findLeftovers, findMissing, legacyLeft, legacyMovedKeys, removeMissing, storageReport } from "@/lib/storageReport";

export const maxDuration = 120;

// The admin's Storage tab: what's stored, how close it is to the plan's
// limit, and the leftovers nothing points at any more (see lib/storageReport.ts).

/** What the store said when it refused (e.g. "This store has been suspended"), for the admin to read. */
function storageError(error: unknown) {
  const message = error instanceof Error ? error.message.replace(/^Vercel Blob:\s*/, "") : "Storage didn't answer";
  return NextResponse.json({ error: `Storage refused: ${message}` }, { status: 503 });
}

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    // Starting over: what would go (a dry run).
    if (req.nextUrl.searchParams.has("missing")) {
      const { songIds, ...rest } = await findMissing();
      return NextResponse.json({ songs: songIds.length, ...rest });
    }
    return NextResponse.json(await storageReport());
  } catch (error) {
    return storageError(error);
  }
}

const deleteSchema = z.union([
  // Every leftover, or just these (each checked again: one that's in use now stays).
  z.object({ leftovers: z.literal(true) }),
  z.object({ keys: z.array(z.string().min(1)).min(1).max(1000) }),
  // Shared beats and analysis: browsers work them out again when a stem is next opened.
  z.object({ results: z.literal(true) }),
  // Moving to R2: the old Blob store's files R2 already holds (deleting from Blob is free).
  z.object({ legacyMoved: z.literal(true) }),
  // Start over with what storage holds: songs, covers, results and queued songs whose files aren't there.
  z.object({ missing: z.literal(true) }),
]);

export async function DELETE(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what to delete" }, { status: 400 });
  try {
    if ("missing" in parsed.data) return NextResponse.json(await removeMissing());
    if ("legacyMoved" in parsed.data) {
      if (!hasLegacyBlob()) return NextResponse.json({ error: "No old Blob store is connected" }, { status: 400 });
      const keys = await legacyMovedKeys();
      await deleteFromLegacyBlob(keys);
      return NextResponse.json({ deleted: keys.length });
    }
    if ("results" in parsed.data) {
      await ensureSchema();
      return NextResponse.json({ deleted: await deleteStemResults({ all: true }) });
    }
    const leftovers = await findLeftovers();
    const wanted = "keys" in parsed.data ? new Set(parsed.data.keys) : null;
    const doomed = leftovers.filter((f) => !wanted || wanted.has(f.key));
    await deleteObjects(doomed.map((f) => f.key));
    return NextResponse.json({ deleted: doomed.length, bytes: doomed.reduce((n, f) => n + f.size, 0) });
  } catch (error) {
    return storageError(error);
  }
}

/** How long one copy request may run: the browser asks again for the rest, so none hits the time limit. */
const COPY_BUDGET_MS = 45_000;

/**
 * Moving to R2: copies the next batch of files from the old Blob store.
 * The Storage tab calls it again until nothing is left.
 */
export async function POST() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!hasLegacyBlob()) return NextResponse.json({ error: "No old Blob store is connected" }, { status: 400 });
  try {
    const legacy = await legacyLeft();
    if (!legacy?.ok) return NextResponse.json({ error: `The old store refused: ${legacy?.error ?? "not connected"}` }, { status: 503 });
    // Songs' stems first: they're what people play.
    const keys = legacy.left.map((f) => f.key).sort((a, b) => Number(b.startsWith("stems/")) - Number(a.startsWith("stems/")));
    const { copied, failed, done } = await copyFromLegacyBlob(keys, COPY_BUDGET_MS);
    return NextResponse.json({ copied, failed: failed.slice(0, 20), failedCount: failed.length, left: keys.length - done });
  } catch (error) {
    return storageError(error);
  }
}
