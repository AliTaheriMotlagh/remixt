import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, deleteStemResults } from "@/lib/admin";
import { ensureSchema } from "@/lib/schema";
import { deleteObjects } from "@/lib/storage";
import { findLeftovers, storageReport } from "@/lib/storageReport";

export const maxDuration = 120;

// The admin's Storage tab: what's stored, how close it is to the plan's
// limit, and the leftovers nothing points at any more (see lib/storageReport.ts).

/** What the store said when it refused (e.g. "This store has been suspended"), for the admin to read. */
function storageError(error: unknown) {
  const message = error instanceof Error ? error.message.replace(/^Vercel Blob:\s*/, "") : "Storage didn't answer";
  return NextResponse.json({ error: `Storage refused: ${message}` }, { status: 503 });
}

export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
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
]);

export async function DELETE(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what to delete" }, { status: 400 });
  try {
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
