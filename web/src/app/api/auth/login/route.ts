import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";
import { CAPTCHA_FAILED, verifyCaptcha } from "@/lib/captcha";
import { allow, clientKey, hit, hitsIn, TOO_MANY } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  // Password guessing: wrong passwords per account and per address are counted; past the limit, no more tries
  // for 15 minutes (a right password included, so a guesser can't tell when they've found it).
  const account = `login-fail:${email.toLowerCase()}`;
  const from = `login:${clientKey(req)}`;
  if ((await hitsIn(account, 15 * 60)) >= 8 || !(await allow(from, 30, 15 * 60))) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }
  if (!(await verifyCaptcha((body as { captcha?: unknown })?.captcha))) return NextResponse.json(CAPTCHA_FAILED, { status: 403 });

  const rows = await sql<
    { id: string; password_hash: string; artist_name: string }[]
  >`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await hit(account);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSessionCookie(user.id);
  return NextResponse.json({ id: user.id, artistName: user.artist_name });
}
