import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import sql from "./db";

// Each user's own ChatGPT / Claude API key, for the Studio's AI producer.
// Keys are stored encrypted (AES-256-GCM) and only ever decrypted here,
// on the server, to make that user's model calls — the browser gets back
// the last four characters, never the key.

export type AiProvider = "anthropic" | "openai";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai"];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
};

let encryptionKey: Buffer | null = null;

/**
 * AI_KEY_SECRET if it's set, else a key derived from SESSION_SECRET (so
 * existing deployments need no new variable). Like sessions, production
 * refuses to run on the public development fallback.
 */
function keyForEncryption(): Buffer {
  if (encryptionKey) return encryptionKey;
  const secret = process.env.AI_KEY_SECRET || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Neither AI_KEY_SECRET nor SESSION_SECRET is set — add one to the host's environment variables.");
  }
  encryptionKey = Buffer.from(
    hkdfSync("sha256", secret || "dev-only-insecure-secret-change-me", "remixt", "ai-provider-keys", 32)
  );
  return encryptionKey;
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForEncryption(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

function decrypt(stored: string): string | null {
  try {
    const raw = Buffer.from(stored.replace(/^v1:/, ""), "base64");
    const decipher = createDecipheriv("aes-256-gcm", keyForEncryption(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    // Encrypted under a different secret (it was rotated): treat as unset.
    return null;
  }
}

let schema: Promise<void> | null = null;

/** Creates the table on first use, so a database that missed the migration still works. */
function ensureTable(): Promise<void> {
  schema ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS user_ai_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'anthropic',
        anthropic_model TEXT NOT NULL DEFAULT '',
        openai_model TEXT NOT NULL DEFAULT '',
        anthropic_key TEXT NOT NULL DEFAULT '',
        openai_key TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

type Row = {
  provider: string;
  anthropic_model: string;
  openai_model: string;
  anthropic_key: string;
  openai_key: string;
};

async function row(userId: string): Promise<Row | undefined> {
  await ensureTable();
  const rows = await sql<Row[]>`
    SELECT provider, anthropic_model, openai_model, anthropic_key, openai_key
    FROM user_ai_settings WHERE user_id = ${userId}
  `;
  return rows[0];
}

/** What the settings form shows: never the keys themselves. */
export type PublicAiSettings = {
  provider: AiProvider;
  models: Record<AiProvider, string>;
  /** Last four characters of each saved key, or null when none is saved. */
  keyEndings: Record<AiProvider, string | null>;
};

export async function getAiSettings(userId: string): Promise<PublicAiSettings> {
  const r = await row(userId);
  const ending = (stored: string | undefined) => {
    const key = stored ? decrypt(stored) : null;
    return key ? key.slice(-4) : null;
  };
  return {
    provider: r?.provider === "openai" ? "openai" : "anthropic",
    models: {
      anthropic: r?.anthropic_model || DEFAULT_MODELS.anthropic,
      openai: r?.openai_model || DEFAULT_MODELS.openai,
    },
    keyEndings: { anthropic: ending(r?.anthropic_key), openai: ending(r?.openai_key) },
  };
}

/** The provider, model and decrypted key to call with — server only. */
export async function getAiCredentials(
  userId: string
): Promise<{ provider: AiProvider; model: string; key: string } | null> {
  const r = await row(userId);
  if (!r) return null;
  const provider: AiProvider = r.provider === "openai" ? "openai" : "anthropic";
  const stored = provider === "openai" ? r.openai_key : r.anthropic_key;
  const key = stored ? decrypt(stored) : null;
  if (!key) return null;
  const model = (provider === "openai" ? r.openai_model : r.anthropic_model) || DEFAULT_MODELS[provider];
  return { provider, model, key };
}

export type AiSettingsUpdate = {
  provider: AiProvider;
  models: Record<AiProvider, string>;
  /** A new key to save, "" to remove the saved one, or undefined to keep it. */
  keys: Partial<Record<AiProvider, string>>;
};

export async function saveAiSettings(userId: string, update: AiSettingsUpdate) {
  const current = await row(userId);
  const next = (provider: AiProvider) => {
    const given = update.keys[provider];
    if (given === undefined) return (provider === "openai" ? current?.openai_key : current?.anthropic_key) ?? "";
    return given.trim() ? encrypt(given.trim()) : "";
  };
  const anthropicKey = next("anthropic");
  const openaiKey = next("openai");
  await sql`
    INSERT INTO user_ai_settings (user_id, provider, anthropic_model, openai_model, anthropic_key, openai_key, updated_at)
    VALUES (${userId}, ${update.provider}, ${update.models.anthropic}, ${update.models.openai}, ${anthropicKey}, ${openaiKey}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      anthropic_model = EXCLUDED.anthropic_model,
      openai_model = EXCLUDED.openai_model,
      anthropic_key = EXCLUDED.anthropic_key,
      openai_key = EXCLUDED.openai_key,
      updated_at = now()
  `;
}
