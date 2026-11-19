import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { PAYOUT_METHODS, setPayoutAccount } from "@/lib/monetize/store";

const schema = z.object({ method: z.enum(PAYOUT_METHODS), details: z.string().trim().min(4, "Say where to send it").max(400) });

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  await setPayoutAccount(user.id, parsed.data.method, parsed.data.details);
  return NextResponse.json({ ok: true });
}
