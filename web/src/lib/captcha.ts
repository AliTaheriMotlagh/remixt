// "Are you a person?" for the sensitive forms (sign up, sign in, takedown
// requests), without a third party: a proof of work in the ALTCHA format.
//
// Why not reCAPTCHA or Turnstile: Google's is blocked in Iran, where much
// of the audience is; both are third-party scripts a VPN or a filter can
// break, and they sit badly with the page's cross-origin isolation (COEP).
// This one is a few hashes the visitor's browser works out in the
// background while they type (~0.3–1.5 s on a phone), checked here with
// nothing but our own secret. It doesn't prove a human, it makes every try
// cost something — so it goes together with the rate limits (rateLimit.ts),
// which is what the forms' real protection is made of.
//
// A challenge: { algorithm, salt, challenge, maxnumber, signature }.
// The browser finds n ≤ maxnumber with SHA-256(salt + n) === challenge and
// sends back the challenge with `number: n`, base64 JSON, as `captcha`.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import sql from "./db";

/** How many numbers the browser may have to try. Higher costs bots more, and slow phones too. */
export const CAPTCHA_MAX_NUMBER = 50_000;
/** How long a challenge can be answered. */
const CAPTCHA_TTL_MS = 10 * 60_000;

export type Challenge = { algorithm: "SHA-256"; salt: string; challenge: string; maxnumber: number; signature: string };
export type Solution = Challenge & { number: number };

function secret(): string {
  const key = process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET;
  if (!key && process.env.NODE_ENV === "production") throw new Error("CAPTCHA_SECRET (or SESSION_SECRET) is not set");
  return `captcha:${key || "dev-only-insecure-secret-change-me"}`;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const sign = (text: string) => createHmac("sha256", secret()).update(text).digest("hex");

export function createChallenge(now = Date.now(), maxnumber = CAPTCHA_MAX_NUMBER): Challenge {
  const salt = `${randomBytes(12).toString("hex")}?expires=${Math.floor((now + CAPTCHA_TTL_MS) / 1000)}`;
  const number = Math.floor(Math.random() * (maxnumber + 1));
  const challenge = sha256(salt + number);
  return { algorithm: "SHA-256", salt, challenge, maxnumber, signature: sign(challenge) };
}

/** Reads the form's `captcha` field (base64 JSON of a Solution); null when it isn't one. */
export function parseSolution(field: unknown): Solution | null {
  if (typeof field !== "string" || field.length > 2000) return null;
  try {
    const s = JSON.parse(Buffer.from(field, "base64").toString("utf8")) as Solution;
    if (s?.algorithm !== "SHA-256" || typeof s.salt !== "string" || typeof s.challenge !== "string") return null;
    if (typeof s.signature !== "string" || !Number.isInteger(s.number) || s.number < 0) return null;
    return s;
  } catch {
    return null;
  }
}

/** Whether `s` is a correct answer to a challenge we made that hasn't run out. Doesn't spend it. */
export function checkSolution(s: Solution, now = Date.now()): boolean {
  const expires = Number(/[?&]expires=(\d+)/.exec(s.salt)?.[1]);
  if (!expires || expires * 1000 < now) return false;
  const expected = Buffer.from(sign(s.challenge));
  const given = Buffer.from(s.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return sha256(s.salt + s.number) === s.challenge;
}

let ready: Promise<void> | null = null;
function ensureCaptchaSchema() {
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS captcha_spent (
      signature TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `.then(() => undefined, (err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/**
 * Checks the form's `captcha` field and spends it, so one answer can't be
 * replayed for a thousand sign-ups. False when missing, wrong, run out or
 * used before.
 */
export async function verifyCaptcha(field: unknown): Promise<boolean> {
  const s = parseSolution(field);
  if (!s || !checkSolution(s)) return false;
  await ensureCaptchaSchema();
  const expires = new Date(Number(/[?&]expires=(\d+)/.exec(s.salt)![1]) * 1000);
  const spent = await sql`
    INSERT INTO captcha_spent (signature, expires_at) VALUES (${s.signature}, ${expires})
    ON CONFLICT (signature) DO NOTHING RETURNING signature
  `;
  // Now and then, forget answers that have run out anyway.
  if (Math.random() < 0.02) void sql`DELETE FROM captcha_spent WHERE expires_at < now()`.catch(() => {});
  return spent.length === 1;
}

/** The answer a form gets when the check failed: the page asks for a fresh challenge and tries once more by itself. */
export const CAPTCHA_FAILED = { error: "Couldn't check you're a person — try again", captcha: true } as const;
