import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVerified, sendVerification } from "@/lib/emailTokens";
import { mailReady } from "@/lib/mail";
import { allow, TOO_MANY } from "@/lib/rateLimit";

// POST: send the confirm-your-email link again (signed in; 3 an hour).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await isVerified(user.id)) return NextResponse.json({ ok: true, already: true });
  if (!(await mailReady())) return NextResponse.json({ error: "Email isn't set up on this site yet — nothing to confirm" }, { status: 503 });
  if (!(await allow(`verify-mail:${user.id}`, 3, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  const sent = await sendVerification(user);
  if (!sent.sent) return NextResponse.json({ error: "Couldn't send the email — try again in a minute" }, { status: 502 });
  return NextResponse.json({ ok: true, to: user.email });
}
