import { NextRequest, NextResponse } from "next/server";
import { getStemsByKindWithArtist } from "@/lib/models";

export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam === "beat" ? "beat" : "vocals";
  const stems = await getStemsByKindWithArtist(kind);
  return NextResponse.json({ stems });
}
