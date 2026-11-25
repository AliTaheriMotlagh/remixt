import sql from "../db";
import { decrypt, encrypt, keyHint } from "../aiKeys";

// The keys Remixt's own services need — payment gateways, the site's AI,
// email — from the server's environment first, else entered by the owner
// in Admin → Plans (kept encrypted, AES-256-GCM, never sent to a browser:
// the admin page sees only whether each is set and a hint of it). The
// environment wins, so a deploy can pin a key the panel then can't change.

export const SECRETS = [
  { name: "STRIPE_SECRET_KEY", label: "Stripe secret key", hint: "sk_live_… (Developers → API keys)", group: "stripe" },
  { name: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook signing secret", hint: "whsec_… (Developers → Webhooks → your endpoint)", group: "stripe" },
  { name: "PAYPAL_CLIENT_ID", label: "PayPal client ID", hint: "developer.paypal.com → Apps & Credentials", group: "paypal" },
  { name: "PAYPAL_CLIENT_SECRET", label: "PayPal secret", hint: "Same app as the client ID", group: "paypal" },
  { name: "PAYPAL_WEBHOOK_ID", label: "PayPal webhook ID", hint: "The webhook you added for /api/billing/webhook/paypal", group: "paypal" },
  { name: "PAYPAL_MODE", label: "PayPal mode", hint: "live, or sandbox for testing", group: "paypal" },
  { name: "OPENROUTER_API_KEY", label: "OpenRouter key (the site's AI)", hint: "sk-or-… (openrouter.ai/keys)", group: "ai" },
  { name: "RESEND_API_KEY", label: "Resend key (emails)", hint: "re_… (resend.com → API keys)", group: "mail" },
  { name: "MAIL_FROM", label: "Emails come from", hint: "Remixt <hello@remixt.app> — a domain verified in Resend", group: "mail" },
] as const;

export type SecretName = (typeof SECRETS)[number]["name"];
export const isSecretName = (v: unknown): v is SecretName => SECRETS.some((s) => s.name === v);

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS app_secrets (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.then(() => undefined, (err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// Read once a minute per server at most: every checkout and webhook reads them.
let cache: { at: number; values: Map<string, string> } | null = null;

async function stored(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.values;
  await ensureTable();
  const rows = await sql<{ name: string; value: string }[]>`SELECT name, value FROM app_secrets`;
  const values = new Map<string, string>();
  for (const r of rows) {
    try {
      values.set(r.name, decrypt(r.value, `site:${r.name}`));
    } catch {
      // Encrypted with another server secret: as if not set.
    }
  }
  cache = { at: Date.now(), values };
  return values;
}

/** The key, or null when it's set nowhere. */
export async function secret(name: SecretName): Promise<string | null> {
  const env = process.env[name]?.trim();
  if (env) return env;
  return (await stored().catch(() => new Map<string, string>())).get(name) ?? null;
}

/** For Admin → Plans: each key, whether it's set and where, with a hint. */
export async function secretStatus() {
  const db = await stored().catch(() => new Map<string, string>());
  return SECRETS.map((s) => {
    const env = process.env[s.name]?.trim();
    const value = env || db.get(s.name);
    return { ...s, set: !!value, from: env ? ("server" as const) : value ? ("admin" as const) : null, preview: value ? (s.name === "PAYPAL_MODE" || s.name === "MAIL_FROM" ? value : keyHint(value)) : null };
  });
}

/** Sets (or, empty, clears) a key entered in Admin. A key set in the server's environment can't be changed here. */
export async function setSecret(name: SecretName, value: string, by: string) {
  if (process.env[name]?.trim()) throw new Error("Set on the server — change it there");
  await ensureTable();
  const v = value.trim();
  if (!v) await sql`DELETE FROM app_secrets WHERE name = ${name}`;
  else
    await sql`
      INSERT INTO app_secrets (name, value, updated_by) VALUES (${name}, ${encrypt(v, `site:${name}`)}, ${by})
      ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;
  cache = null;
}
