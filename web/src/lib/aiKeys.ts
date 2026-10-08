import crypto from "node:crypto";
import sql from "./db";

// Each person's own Anthropic API key for the AI co-producer, kept on
// their account. The key is encrypted at rest (AES-256-GCM, bound to the
// user it belongs to) and only ever decrypted on the server, for a call to
// Anthropic on that person's behalf; the browser only sees a hint of it.

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Best ideas and judgement" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Faster, cheaper" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "Fastest, cheapest" },
] as const;

export type AiModel = (typeof AI_MODELS)[number]["id"];
export const DEFAULT_AI_MODEL: AiModel = "claude-opus-5-5";

export function isAiModel(value: unknown): value is AiModel {
  return AI_MODELS.some((m) => m.id === value);
}

let key: Buffer | null = null;

/**
 * The encryption key: AI_KEY_SECRET, else derived from SESSION_SECRET (a
 * different key from the one sessions are signed with). A production
 * server with neither refuses to store keys, the same as auth.ts.
 */
function encryptionKey(): Buffer {
  if (key) return key;
  const secret = process.env.AI_KEY_SECRET || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Set AI_KEY_SECRET (or SESSION_SECRET) to store AI keys — see DEPLOY.md.");
  }
  key = Buffer.from(crypto.hkdfSync("sha256", secret || "dev-only-insecure-secret-change-me", "remixt", "ai-key-encryption", 32));
  return key;
}

function encrypt(plain: string, userId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

function decrypt(stored: string, userId: string): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown key format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

/** "sk-ant-api…x7Qa" — enough to recognise a key, not to use it. */
export function keyHint(apiKey: string) {
  return `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}`;
}

/** Whether `value` looks like an Anthropic API key. */
export function looksLikeKey(value: string) {
  return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(value);
}

let table: Promise<unknown> | null = null;

/**
 * Makes sure the keys table exists (the same statement as in
 * scripts/schema.sql) — once per server process, so a deploy works even
 * before `migrate.mjs` has been run against its database.
 */
function ensureTable() {
  table ??= sql`
    CREATE TABLE IF NOT EXISTS user_ai_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'anthropic',
      key_cipher TEXT NOT NULL,
      key_hint TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'claude-opus-5-5',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.catch((error) => {
    table = null;
    throw error;
  });
  return table;
}

export async function aiKeyStatus(userId: string): Promise<{ hint: string; model: AiModel } | null> {
  await ensureTable();
  const rows = await sql<{ key_hint: string; model: string }[]>`
    SELECT key_hint, model FROM user_ai_keys WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return { hint: row.key_hint, model: isAiModel(row.model) ? row.model : DEFAULT_AI_MODEL };
}

/** The person's key and model, decrypted — server-side only. Null when none is saved (or it can't be read any more). */
export async function savedAiKey(userId: string): Promise<{ apiKey: string; model: AiModel } | null> {
  await ensureTable();
  const rows = await sql<{ key_cipher: string; model: string }[]>`
    SELECT key_cipher, model FROM user_ai_keys WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  try {
    return { apiKey: decrypt(row.key_cipher, userId), model: isAiModel(row.model) ? row.model : DEFAULT_AI_MODEL };
  } catch {
    // The server's secret changed since it was saved: as good as no key.
    return null;
  }
}

export async function saveAiKey(userId: string, apiKey: string, model: AiModel) {
  await ensureTable();
  const cipher = encrypt(apiKey, userId);
  const hint = keyHint(apiKey);
  await sql`
    INSERT INTO user_ai_keys (user_id, key_cipher, key_hint, model, updated_at)
    VALUES (${userId}, ${cipher}, ${hint}, ${model}, now())
    ON CONFLICT (user_id) DO UPDATE SET key_cipher = EXCLUDED.key_cipher, key_hint = EXCLUDED.key_hint, model = EXCLUDED.model, updated_at = now()
  `;
  return { hint, model };
}

export async function setAiModel(userId: string, model: AiModel) {
  await ensureTable();
  await sql`UPDATE user_ai_keys SET model = ${model}, updated_at = now() WHERE user_id = ${userId}`;
}

export async function deleteAiKey(userId: string) {
  await ensureTable();
  await sql`DELETE FROM user_ai_keys WHERE user_id = ${userId}`;
}
