import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import sql from "./db";

const SESSION_COOKIE = "remix_session";
let key: Uint8Array | null = null;

/**
 * The key sessions are signed with. A production server without
 * SESSION_SECRET refuses to sign anyone in: the fallback is public (it's
 * in this file), and with it anyone could forge a session for any account,
 * admins included. Checked on use rather than at import, so the app still
 * builds without it (the Docker image sets it only at start-up).
 */
function sessionKey(): Uint8Array {
  if (key) return key;
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set — add it to the host's environment variables (see DEPLOY.md).");
  }
  key = new TextEncoder().encode(secret || "dev-only-insecure-secret-change-me");
  return key;
}

export type User = {
  id: string;
  email: string;
  artist_name: string;
  bio: string;
  avatar_color: string;
  created_at: Date;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure in production, since browsers drop secure cookies over plain
    // HTTP. COOKIE_SECURE=false lets a production build be tried on
    // http://<server-ip> before HTTPS is set up.
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionKey());
    const userId = payload.userId as string;
    const rows = await sql<User[]>`
      SELECT id, email, artist_name, bio, avatar_color, created_at
      FROM users WHERE id = ${userId}
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
