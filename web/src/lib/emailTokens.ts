import { createHash, randomBytes } from "crypto";
import sql from "./db";
import { hashPassword } from "./auth";
import { layout, mailReady, sendMail, type Sent } from "./mail";
import { absoluteUrl } from "./site";

// One-time links sent by email: "confirm your address" (good for 3 days) and
// "reset your password" (1 hour). Only a hash of each token is stored, so a
// leaked database can't be used to take over accounts; a link works once.

export type Purpose = "verify" | "reset";
const LIFETIME: Record<Purpose, number> = { verify: 3 * 24 * 3600_000, reset: 3600_000 };

/**
 * The column, added once — and every account made before confirming existed
 * counts as confirmed (they signed up when nobody was asked; turning them
 * away from publishing now would punish them for it). The same as in
 * scripts/schema.sql.
 */
export const GRANDFATHER = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified_at') THEN
    ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
    UPDATE users SET email_verified_at = created_at;
  END IF;
END $$`;

let ready: Promise<void> | null = null;
export function ensureEmailSchema(): Promise<void> {
  ready ??= (async () => {
    await sql.unsafe(GRANDFATHER);
    await sql`
      CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens (user_id, purpose)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function newToken(userId: string, purpose: Purpose): Promise<string> {
  await ensureEmailSchema();
  // A new link replaces the ones before it.
  await sql`DELETE FROM email_tokens WHERE user_id = ${userId} AND purpose = ${purpose}`;
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (${hash(token)}, ${userId}, ${purpose}, ${new Date(Date.now() + LIFETIME[purpose])})`;
  if (Math.random() < 0.05) void sql`DELETE FROM email_tokens WHERE expires_at < now() - interval '7 days'`.catch(() => {});
  return token;
}

/** Spends a token: the user it was for, or null (unknown, used, run out). */
async function spend(token: string, purpose: Purpose): Promise<string | null> {
  if (!/^[\w-]{20,80}$/.test(token)) return null;
  await ensureEmailSchema();
  const [row] = await sql<{ user_id: string }[]>`
    UPDATE email_tokens SET used_at = now()
    WHERE token_hash = ${hash(token)} AND purpose = ${purpose} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `;
  return row?.user_id ?? null;
}

export async function isVerified(userId: string): Promise<boolean> {
  await ensureEmailSchema();
  const [r] = await sql<{ v: Date | null }[]>`SELECT email_verified_at AS v FROM users WHERE id = ${userId}`;
  return !!r?.v;
}

/**
 * Whether `userId` may do something that needs a confirmed address: yes when
 * they've confirmed, when the owner switched the rule off, or when the site
 * can't send email at all (nobody can be asked to confirm then).
 */
export async function verifiedEnough(userId: string, required: boolean): Promise<boolean> {
  if (!required || !(await mailReady())) return true;
  return isVerified(userId);
}

export async function sendVerification(user: { id: string; email: string; artist_name: string }): Promise<Sent> {
  const token = await newToken(user.id, "verify");
  const href = absoluteUrl(`/verify-email?token=${token}`);
  return sendMail(
    user.email,
    "Confirm your email for Remixt",
    layout({
      heading: `Welcome to Remixt, ${user.artist_name}`,
      lines: ["Confirm this is your email address, so you can publish remixes, get paid and keep your account safe."],
      button: { label: "Confirm my email", href },
      footer: "The link works for 3 days. Didn't sign up? Ignore this email.",
    })
  );
}

export async function confirmEmail(token: string): Promise<string | null> {
  const userId = await spend(token, "verify");
  if (userId) await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${userId}`;
  return userId;
}

export async function sendReset(email: string): Promise<void> {
  await ensureEmailSchema();
  const [user] = await sql<{ id: string; email: string; artist_name: string }[]>`SELECT id, email, artist_name FROM users WHERE email = ${email.toLowerCase()}`;
  // Said the same whether or not there's an account (nobody learns who's signed up).
  if (!user) return;
  const token = await newToken(user.id, "reset");
  await sendMail(
    user.email,
    "Reset your Remixt password",
    layout({
      heading: "Reset your password",
      lines: [`Someone (hopefully you) asked to reset the password for ${user.artist_name} on Remixt.`],
      button: { label: "Choose a new password", href: absoluteUrl(`/reset-password?token=${token}`) },
      footer: "The link works for 1 hour, once. Didn't ask? Ignore this email — your password stays as it is.",
    })
  );
}

/** Sets a new password with a reset link; the account's email counts as confirmed (they opened the link). */
export async function resetPassword(token: string, password: string): Promise<string | null> {
  const userId = await spend(token, "reset");
  if (!userId) return null;
  await sql`UPDATE users SET password_hash = ${await hashPassword(password)}, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${userId}`;
  return userId;
}
