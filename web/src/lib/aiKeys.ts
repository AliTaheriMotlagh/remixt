import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import sql from "./db";

// Each user's AI producer settings: which model service, which model, and
// their own API key for it. Keys are stored encrypted (AES-256-GCM) and
// only ever decrypted here, on the server, to make that user's model
// calls — the browser gets back the last four characters, never the key.
//
// Besides the paid services there are two free routes: Google Gemini and
// Groq give out free API keys, and "free" uses one shared free key the
// site owner puts in the server's environment (FREE_AI_KEY), with a daily
// cap per user so one person can't use up everyone's quota.

/** Services a user brings their own key for. */
export type KeyedProvider = "anthropic" | "openai" | "gemini" | "groq";
export type AiProvider = KeyedProvider | "free";
export const KEYED_PROVIDERS: KeyedProvider[] = ["anthropic", "openai", "gemini", "groq"];

export const DEFAULT_MODELS: Record<KeyedProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b",
};

/** Where each OpenAI-compatible service answers (Claude has its own SDK). */
export const COMPATIBLE_BASE_URLS: Record<Exclude<KeyedProvider, "anthropic">, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
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

/** Creates the tables on first use, so a database that missed the migration still works. */
function ensureTables(): Promise<void> {
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
    await sql`ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS gemini_model TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS groq_model TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS gemini_key TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS groq_key TEXT NOT NULL DEFAULT ''`;
    await sql`
      CREATE TABLE IF NOT EXISTS ai_free_usage (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )
    `;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

type Row = Record<`${KeyedProvider}_model` | `${KeyedProvider}_key`, string> & { provider: string };

async function row(userId: string): Promise<Row | undefined> {
  await ensureTables();
  const rows = await sql<Row[]>`
    SELECT provider, anthropic_model, openai_model, gemini_model, groq_model,
           anthropic_key, openai_key, gemini_key, groq_key
    FROM user_ai_settings WHERE user_id = ${userId}
  `;
  return rows[0];
}

function asProvider(value: string | undefined): AiProvider {
  return value === "free" || KEYED_PROVIDERS.includes(value as KeyedProvider) ? (value as AiProvider) : "anthropic";
}

// --- The shared free AI ---------------------------------------------------------

/** The site owner's free key, from the environment — null when not set up. */
function freeConfig(): { provider: "gemini" | "groq"; key: string; model: string; dailyLimit: number } | null {
  const key = process.env.FREE_AI_KEY?.trim();
  if (!key) return null;
  const provider = process.env.FREE_AI_PROVIDER === "groq" ? "groq" : "gemini";
  return {
    provider,
    key,
    model: process.env.FREE_AI_MODEL?.trim() || DEFAULT_MODELS[provider],
    dailyLimit: Math.max(1, Number(process.env.FREE_AI_DAILY_LIMIT) || 60),
  };
}

async function freeCallsToday(userId: string) {
  await ensureTables();
  const rows = await sql<{ calls: number }[]>`
    SELECT calls FROM ai_free_usage WHERE user_id = ${userId} AND day = CURRENT_DATE
  `;
  return rows[0]?.calls ?? 0;
}

/**
 * Counts one model call against the user's free allowance for today.
 * Returns false (and counts nothing) when it's used up.
 */
export async function takeFreeCall(userId: string): Promise<boolean> {
  const config = freeConfig();
  if (!config) return false;
  await ensureTables();
  const rows = await sql<{ calls: number }[]>`
    INSERT INTO ai_free_usage (user_id, day, calls) VALUES (${userId}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET calls = ai_free_usage.calls + 1
      WHERE ai_free_usage.calls < ${config.dailyLimit}
    RETURNING calls
  `;
  return rows.length > 0;
}

// --- Settings -------------------------------------------------------------------

/** What the settings form shows: never the keys themselves. */
export type PublicAiSettings = {
  provider: AiProvider;
  models: Record<KeyedProvider, string>;
  /** Last four characters of each saved key, or null when none is saved. */
  keyEndings: Record<KeyedProvider, string | null>;
  /** The shared free AI, when the site has one. */
  free: { service: "gemini" | "groq"; model: string; dailyLimit: number; leftToday: number } | null;
};

export async function getAiSettings(userId: string): Promise<PublicAiSettings> {
  const r = await row(userId);
  const ending = (stored: string | undefined) => {
    const key = stored ? decrypt(stored) : null;
    return key ? key.slice(-4) : null;
  };
  const config = freeConfig();
  const free = config
    ? {
        service: config.provider,
        model: config.model,
        dailyLimit: config.dailyLimit,
        leftToday: Math.max(0, config.dailyLimit - (await freeCallsToday(userId))),
      }
    : null;
  const models = {} as Record<KeyedProvider, string>;
  const keyEndings = {} as Record<KeyedProvider, string | null>;
  for (const p of KEYED_PROVIDERS) {
    models[p] = r?.[`${p}_model`] || DEFAULT_MODELS[p];
    keyEndings[p] = ending(r?.[`${p}_key`]);
  }
  // With nothing set up yet, start on the free AI if the site has one.
  const provider = r ? asProvider(r.provider) : free ? "free" : "anthropic";
  return { provider: provider === "free" && !free ? "anthropic" : provider, models, keyEndings, free };
}

export type AiCredentials = {
  /** The service actually called. */
  service: KeyedProvider;
  /** What the user picked — "free" when it's the shared key. */
  provider: AiProvider;
  model: string;
  key: string;
};

/** The service, model and decrypted key to call with — server only. */
export async function getAiCredentials(userId: string): Promise<AiCredentials | null> {
  const r = await row(userId);
  const provider = r ? asProvider(r.provider) : freeConfig() ? "free" : null;
  if (!provider) return null;
  if (provider === "free") {
    const config = freeConfig();
    return config ? { service: config.provider, provider, model: config.model, key: config.key } : null;
  }
  const stored = r?.[`${provider}_key`];
  const key = stored ? decrypt(stored) : null;
  if (!key) return null;
  return { service: provider, provider, model: r?.[`${provider}_model`] || DEFAULT_MODELS[provider], key };
}

export type AiSettingsUpdate = {
  provider: AiProvider;
  models: Record<KeyedProvider, string>;
  /** A new key to save, "" to remove the saved one, or undefined to keep it. */
  keys: Partial<Record<KeyedProvider, string>>;
};

export async function saveAiSettings(userId: string, update: AiSettingsUpdate) {
  const current = await row(userId);
  const key = (provider: KeyedProvider) => {
    const given = update.keys[provider];
    if (given === undefined) return current?.[`${provider}_key`] ?? "";
    return given.trim() ? encrypt(given.trim()) : "";
  };
  const values = {
    user_id: userId,
    provider: update.provider,
    anthropic_model: update.models.anthropic,
    openai_model: update.models.openai,
    gemini_model: update.models.gemini,
    groq_model: update.models.groq,
    anthropic_key: key("anthropic"),
    openai_key: key("openai"),
    gemini_key: key("gemini"),
    groq_key: key("groq"),
  };
  await ensureTables();
  await sql`
    INSERT INTO user_ai_settings ${sql(values)}
    ON CONFLICT (user_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      anthropic_model = EXCLUDED.anthropic_model,
      openai_model = EXCLUDED.openai_model,
      gemini_model = EXCLUDED.gemini_model,
      groq_model = EXCLUDED.groq_model,
      anthropic_key = EXCLUDED.anthropic_key,
      openai_key = EXCLUDED.openai_key,
      gemini_key = EXCLUDED.gemini_key,
      groq_key = EXCLUDED.groq_key,
      updated_at = now()
  `;
}
