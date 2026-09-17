import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createSessionCookie, hashPassword } from "@/lib/auth";

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

  await createSessionCookie(id);

  return NextResponse.json({ id, email, artistName });
}
