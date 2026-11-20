import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { houseAdInput } from "@/lib/monetize/houseAds";
import { deleteHouseAd, saveHouseAd, setHouseAdActive } from "@/lib/monetize/houseStore";

// One of Remixt's own ads (admin only): PUT changes it, PATCH { active }
// turns it on or off, DELETE removes one the owner made.

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await currentAdmin())) return notFound();
  const parsed = houseAdInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  await saveHouseAd((await params).id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await currentAdmin())) return notFound();
  const parsed = z.object({ active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "On or off?" }, { status: 400 });
  await setHouseAdActive((await params).id, parsed.data.active);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await currentAdmin())) return notFound();
  const error = await deleteHouseAd((await params).id);
  return error ? NextResponse.json(error, { status: 400 }) : NextResponse.json({ ok: true });
}
