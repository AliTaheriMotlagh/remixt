import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createSessionCookie, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { ensureEmailSchema } from "@/lib/emailTokens";
import { passwordProblem } from "@/lib/passwordRules";
import { allow, TOO_MANY } from "@/lib/rateLimit";

// POST { current, next }: a signed-in member changes their password. Every
// other device is signed out; this one gets a fresh session.
const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!(await allow(`password:${user.id}`, 10, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (!row || !(await verifyPassword(parsed.data.current, row.password_hash))) {
    return NextResponse.json({ error: "Your current password isn't right" }, { status: 400 });
  }
  const weak = passwordProblem(parsed.data.next, user.email);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });
  await ensureEmailSchema();
  await sql`
    UPDATE users SET password_hash = ${await hashPassword(parsed.data.next)}, sessions_valid_from = now(), password_weak = false
    WHERE id = ${user.id}
  `;
  // sessions_valid_from is to the second: the new session must be signed at or after it.
  await new Promise((r) => setTimeout(r, 1_000 - (Date.now() % 1_000) + 5));
  await createSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
