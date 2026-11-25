import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { askManualPayment } from "@/lib/billing/store";
import { needsVerifiedEmail } from "@/lib/needsVerified";
import { allow, TOO_MANY } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings/server";

// POST { period, amount, reference }: "I paid by hand" (card to card, bank,
// USDT). The admin checks it arrived and confirms; Plus starts then.
const schema = z.object({ period: z.enum(["month", "year"]), amount: z.string().trim().min(1).max(60), reference: z.string().trim().min(3, "Add the payment's reference or tracking number").max(200) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const settings = await getSettings();
  if (!settings.plans.enabled || !settings.plans.manual) return NextResponse.json({ error: "Paying by hand isn't offered right now" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const unconfirmed = await needsVerifiedEmail(user.id);
  if (unconfirmed) return unconfirmed;
  if (!(await allow(`manual-pay:${user.id}`, 5, 86_400))) return NextResponse.json(TOO_MANY, { status: 429 });
  const id = await askManualPayment(user.id, parsed.data.period, parsed.data.amount, parsed.data.reference);
  return NextResponse.json({ id });
}
