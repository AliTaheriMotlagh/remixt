import { NextRequest, NextResponse } from "next/server";
import { getStemById } from "@/lib/models";

// Stems are stored in Vercel Blob, whose CDN already serves Range requests
// correctly for seeking/scrubbing — we just point the browser at it.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stem = await getStemById(id);
  if (!stem) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.redirect(stem.file_url, { status: 302 });
}
