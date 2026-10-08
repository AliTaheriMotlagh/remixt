import crypto from "node:crypto";
import sql from "./db";

// Each person's own API keys for the AI co-producer — Anthropic (Claude
// directly) and/or OpenRouter (Claude or any other model it carries), one
// of each, kept on their account. A key is encrypted at rest (AES-256-GCM,
// bound to the user it belongs to) and only ever decrypted on the server,
// for a call on that person's behalf; the browser only sees a hint of it.

export const AI_PROVIDERS = ["anthropic", "openrouter"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isProvider(value: unknown): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

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

/** An OpenRouter model id: "vendor/model", maybe with a variant ("…:free"). */
export function isOpenRouterModel(value: unknown): value is string {
  return typeof value === "string" && /^[\w.-]{1,60}\/[\w.:~-]{1,100}$/.test(value);
}

export function isModelFor(provider: AiProvider, value: unknown): value is string {
  return provider === "anthropic" ? isAiModel(value) : isOpenRouterModel(value);
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

/** "sk-ant-api…x7Qa" / "sk-or-v1-a…9f2c" — enough to recognise a key, not to use it. */
export function keyHint(apiKey: string) {
  return `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}`;
}

/** Whether `value` looks like a key for `provider`. */
export function looksLikeKey(provider: AiProvider, value: string) {
  return provider === "anthropic" ? /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(value) : /^sk-or-[A-Za-z0-9_-]{20,300}$/.test(value);
}

let table: Promise<unknown> | null = null;

/**
 * Makes sure the keys table exists in its current shape (the same as in
 * scripts/schema.sql) — once per server process, so a deploy works even
 * before `migrate.mjs` has been run against its database. A table from
 * before OpenRouter (one key per person) gets its key widened to one per
 * person and provider.
 */
function ensureTable() {
  table ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS user_ai_keys (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'anthropic',
        key_cipher TEXT NOT NULL,
        key_hint TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'claude-opus-5-5',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, provider)
      )
    `;
    await sql.unsafe(UPGRADE_PRIMARY_KEY);
  })().catch((error) => {
    table = null;
    throw error;
  });
  return table;
}

/** One key per person → one per person and provider (a no-op once done). */
export const UPGRADE_PRIMARY_KEY = `
  DO $$ BEGIN
    IF (SELECT count(*) FROM information_schema.key_column_usage
        WHERE table_name = 'user_ai_keys' AND constraint_name = 'user_ai_keys_pkey') = 1 THEN
      ALTER TABLE user_ai_keys DROP CONSTRAINT user_ai_keys_pkey;
      ALTER TABLE user_ai_keys ADD PRIMARY KEY (user_id, provider);
    END IF;
  END $$;
`;

export type KeyStatus = { hint: string; model: string };

/** Which providers the person has a key saved for, with a hint of each and the model chosen. */
export async function aiKeyStatuses(userId: string): Promise<Partial<Record<AiProvider, KeyStatus>>> {
  await ensureTable();
  const rows = await sql<{ provider: string; key_hint: string; model: string }[]>`
    SELECT provider, key_hint, model FROM user_ai_keys WHERE user_id = ${userId}
  `;
  const out: Partial<Record<AiProvider, KeyStatus>> = {};
  for (const row of rows) if (isProvider(row.provider)) out[row.provider] = { hint: row.key_hint, model: row.model };
  return out;
}

/** The person's key and model for `provider`, decrypted — server-side only. Null when none is saved (or it can't be read any more). */
export async function savedAiKey(userId: string, provider: AiProvider): Promise<{ apiKey: string; model: string } | null> {
  await ensureTable();
  const rows = await sql<{ key_cipher: string; model: string }[]>`
    SELECT key_cipher, model FROM user_ai_keys WHERE user_id = ${userId} AND provider = ${provider}
  `;
  const row = rows[0];
  if (!row) return null;
  try {
    return { apiKey: decrypt(row.key_cipher, userId), model: row.model };
  } catch {
    // The server's secret changed since it was saved: as good as no key.
    return null;
  }
}

export async function saveAiKey(userId: string, provider: AiProvider, apiKey: string, model: string) {
  await ensureTable();
  const cipher = encrypt(apiKey, userId);
  const hint = keyHint(apiKey);
  await sql`
    INSERT INTO user_ai_keys (user_id, provider, key_cipher, key_hint, model, updated_at)
    VALUES (${userId}, ${provider}, ${cipher}, ${hint}, ${model}, now())
    ON CONFLICT (user_id, provider) DO UPDATE SET key_cipher = EXCLUDED.key_cipher, key_hint = EXCLUDED.key_hint, model = EXCLUDED.model, updated_at = now()
  `;
  return { hint, model };
}

export async function setAiModel(userId: string, provider: AiProvider, model: string) {
  await ensureTable();
  await sql`UPDATE user_ai_keys SET model = ${model}, updated_at = now() WHERE user_id = ${userId} AND provider = ${provider}`;
}

export async function deleteAiKey(userId: string, provider: AiProvider) {
  await ensureTable();
  await sql`DELETE FROM user_ai_keys WHERE user_id = ${userId} AND provider = ${provider}`;
}
