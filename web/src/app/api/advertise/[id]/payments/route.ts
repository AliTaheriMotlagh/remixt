import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { allow, TOO_MANY } from "@/lib/rateLimit";
import { addPayment } from "@/lib/monetize/adStore";

// "I've paid": the amount, how, and the reference (a card transfer's
// tracking number, a bank reference, a USDT transaction id). The owner
// checks it arrived and presses Payment received (Admin → Ads & earnings).
const schema = z.object({
  amount: z.number().positive().max(1e12),
  currency: z.enum(["USD", "IRT"]),
  method: z.string().trim().min(2).max(60),
  reference: z.string().trim().min(3, "Give the payment's reference or tracking number").max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await allow(`ad-payment:${user.id}`, (await getSettings()).limits.adPaymentsPerDay, 24 * 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const result = await addPayment(user.id, id, parsed.data);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
