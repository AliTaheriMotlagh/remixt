import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie } from "@/lib/auth";
import { resetPassword } from "@/lib/emailTokens";
import { passwordProblem } from "@/lib/passwordRules";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";

// POST { token, password }: the new password from a reset link; signs them in.
const schema = z.object({ token: z.string().min(20).max(100), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await allow(`reset:${clientKey(req)}`, 20, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  const weak = passwordProblem(parsed.data.password);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });
  const userId = await resetPassword(parsed.data.token, parsed.data.password);
  if (!userId) return NextResponse.json({ error: "This link has been used or has run out — ask for a new one" }, { status: 400 });
  await createSessionCookie(userId);
  return NextResponse.json({ ok: true });
}
