import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { houseAdInput } from "@/lib/monetize/houseAds";
import { houseAdsReport, saveHouseAd } from "@/lib/monetize/houseStore";

// Admin → Remixt ads (admin only): GET every one of Remixt's own ads with how
// it did (?days=7|30|90); POST makes a new one.

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return notFound();
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  return NextResponse.json({ days, ads: await houseAdsReport(days) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return notFound();
  const parsed = houseAdInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  return NextResponse.json({ id: await saveHouseAd(null, parsed.data) });
}
