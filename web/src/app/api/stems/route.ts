import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLibraryStems, getStemsByKindWithArtist } from "@/lib/models";
import { isStemKind } from "@/lib/stemKinds";

// ?kind=vocals|beat|drums|bass|other → that kind; no kind → every stem.
// Only what the signed-in user can see: private takes are their owner's
// (and whoever they shared them with), so the list is never cached.
export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const viewer = (await getCurrentUser())?.id ?? null;
  const stems = isStemKind(kindParam)
    ? await getStemsByKindWithArtist(kindParam, viewer)
    : await getLibraryStems(viewer);
  return NextResponse.json({ stems }, { headers: { "Cache-Control": "private, no-store" } });
}
