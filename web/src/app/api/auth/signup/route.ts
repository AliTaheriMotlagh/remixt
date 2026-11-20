import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { z } from "zod";
import sql from "@/lib/db";
import { trackServer } from "@/lib/analyticsStore";
import { createSessionCookie, hashPassword } from "@/lib/auth";
import { ensureRemixStats } from "@/lib/models";
import { REF_COOKIE } from "@/lib/referral";
import { CAPTCHA_FAILED, verifyCaptcha } from "@/lib/captcha";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  artistName: z.string().min(2).max(40),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { email, password, artistName } = parsed.data;
  // New accounts per address: enough for a household or a school's shared connection, not for a sign-up bot.
  const settings = await getSettings();
  // The owner can close sign-up (Admin → Settings → Switches); log-in still works.
  if (!settings.features.signups) return NextResponse.json({ error: "New accounts are closed for now — try again later" }, { status: 403 });
  if (!(await allow(`signup:${clientKey(req)}`, settings.limits.signupsPerHour, 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  if (!(await verifyCaptcha((body as { captcha?: unknown })?.captcha))) return NextResponse.json(CAPTCHA_FAILED, { status: 403 });

  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const palette = ["#7c3aed", "#db2777", "#0891b2", "#ea580c", "#16a34a", "#4f46e5"];
  const avatarColor = palette[Math.floor(Math.random() * palette.length)];

  await sql`
    INSERT INTO users (id, email, password_hash, artist_name, avatar_color)
    VALUES (${id}, ${email.toLowerCase()}, ${passwordHash}, ${artistName}, ${avatarColor})
  `;

  // Came from a friend's invite link: remember who, for their XP.
  const ref = req.cookies.get(REF_COOKIE)?.value;
  if (ref && ref !== id) {
    await ensureRemixStats();
    await sql`UPDATE users SET referred_by = (SELECT id FROM users WHERE id = ${ref}) WHERE id = ${id}`.catch(() => {});
  }

  await createSessionCookie(id);
  trackServer("signup", id);

  const res = NextResponse.json({ id, email, artistName });
  res.cookies.delete(REF_COOKIE);
  return res;
}
