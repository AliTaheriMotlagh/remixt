import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CAPTCHA_FAILED, verifyCaptcha } from "@/lib/captcha";
import { sendReset } from "@/lib/emailTokens";
import { mailReady } from "@/lib/mail";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";

// POST { email, captcha }: a password-reset link, if there's an account. The
// answer is the same either way, so nobody can find out who has one.
const schema = z.object({ email: z.string().trim().email().max(200), captcha: z.unknown() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email address" }, { status: 400 });
  if (!(await mailReady())) return NextResponse.json({ error: "This site can't send emails yet — ask the site's owner to reset it" }, { status: 503 });
  if (!(await allow(`forgot:${clientKey(req)}`, 10, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  if (!(await allow(`forgot-mail:${parsed.data.email.toLowerCase()}`, 3, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  if (!(await verifyCaptcha(parsed.data.captcha))) return NextResponse.json(CAPTCHA_FAILED, { status: 403 });
  await sendReset(parsed.data.email).catch((err) => console.error("reset mail failed", err));
  return NextResponse.json({ ok: true });
}
