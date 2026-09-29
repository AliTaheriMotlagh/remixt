import { NextRequest, NextResponse } from "next/server";
import { getLibraryStems, getStemsByKindWithArtist } from "@/lib/models";
import { isStemKind } from "@/lib/stemKinds";

// ?kind=vocals|beat|drums|bass|other → that kind; no kind → every stem.
export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const stems = isStemKind(kindParam) ? await getStemsByKindWithArtist(kindParam) : await getLibraryStems();
  return NextResponse.json({ stems });
}
