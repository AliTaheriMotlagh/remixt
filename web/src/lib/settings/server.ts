// The owner's settings on the server: stored one row per setting
// (app_settings), every change written to a history (app_settings_log: who,
// when, from what to what), read through a short cache so a page view
// doesn't ask the database every time. The rules are in registry.ts.

import sql from "../db";
import { ensureSchema } from "../schema";
import { applyChange, DEFAULTS, getPath, resolveSettings, type AppSettings } from "./registry";

let ready: Promise<void> | null = null;

function ensureSettingsSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings_log (
        id BIGSERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        old_value JSONB,
        new_value JSONB NOT NULL,
        changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await migrateOldSettings();
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** The three money settings kept before this (monetize_settings): moved over once. */
async function migrateOldSettings() {
  const [old] = await sql<{ t: string | null }[]>`SELECT to_regclass('monetize_settings')::text AS t`;
  if (!old?.t) return;
  const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM monetize_settings`;
  const moved: Record<string, unknown> = {};
  for (const r of rows) {
    const v = r.value as Record<string, unknown> | number;
    if (r.key === "tomanRate") moved["payouts.tomanRate"] = Number(v);
    if (r.key === "floors" && v && typeof v === "object") for (const f of ["card", "audio", "promote"]) if (v[f] !== undefined) moved[`ads.floors.${f}`] = Number(v[f]);
    if (r.key === "payTo" && v && typeof v === "object") for (const l of ["en", "fa"]) if (typeof v[l] === "string") moved[`payTo.${l}`] = v[l];
  }
  for (const [key, value] of Object.entries(moved)) {
    await sql`INSERT INTO app_settings (key, value) VALUES (${key}, ${sql.json(value as never)}) ON CONFLICT (key) DO NOTHING`;
  }
  await sql`DROP TABLE monetize_settings`;
}

// A server keeps what it read for this long; another server sees a change within it.
const CACHE_MS = 10_000;
let cache: { at: number; settings: AppSettings } | null = null;
let reading: Promise<AppSettings> | null = null;

/** The settings in force (defaults where the owner hasn't changed anything). Never fails: on trouble, the defaults. */
export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  reading ??= (async () => {
    try {
      await ensureSettingsSchema();
      const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM app_settings`;
      const settings = resolveSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
      cache = { at: Date.now(), settings };
      return settings;
    } catch (err) {
      console.error("settings: using the defaults", err);
      return cache?.settings ?? DEFAULTS;
    } finally {
      reading = null;
    }
  })();
  return reading;
}

/** Saves a change from Admin → Settings: checked as a whole, every changed value logged. */
export async function saveSettings(patch: Record<string, unknown>, adminId: string): Promise<{ settings: AppSettings; changed: string[] } | { errors: Record<string, string> }> {
  await ensureSettingsSchema();
  cache = null;
  const current = await getSettings();
  const result = applyChange(current, patch);
  if ("errors" in result) return result;
  await sql.begin(async (tx) => {
    for (const path of result.changed) {
      const value = getPath(result.settings, path);
      await tx`
        INSERT INTO app_settings (key, value, updated_by) VALUES (${path}, ${tx.json(value as never)}, ${adminId})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
      `;
      await tx`
        INSERT INTO app_settings_log (key, old_value, new_value, changed_by)
        VALUES (${path}, ${tx.json(getPath(current, path) as never)}, ${tx.json(value as never)}, ${adminId})
      `;
    }
  });
  cache = { at: Date.now(), settings: result.settings };
  return result;
}

/** Back to the default: the stored value goes (logged), so a later change of the default applies. */
export async function resetSetting(path: string, adminId: string): Promise<{ settings: AppSettings } | { errors: Record<string, string> }> {
  const result = await saveSettings({ [path]: getPath(DEFAULTS, path) }, adminId);
  if ("errors" in result) return result;
  await sql`DELETE FROM app_settings WHERE key = ${path}`;
  cache = null;
  return { settings: await getSettings() };
}

export type SettingsChange = { id: string; key: string; old_value: unknown; new_value: unknown; changed_at: string; by: string | null };

/** The latest changes, newest first. */
export async function settingsLog(limit = 100): Promise<SettingsChange[]> {
  await ensureSettingsSchema();
  return sql<SettingsChange[]>`
    SELECT l.id, l.key, l.old_value, l.new_value, l.changed_at, u.artist_name AS by
    FROM app_settings_log l LEFT JOIN users u ON u.id = l.changed_by
    ORDER BY l.id DESC LIMIT ${limit}
  `;
}

/** The paths the owner has changed from the default. */
export async function changedPaths(): Promise<string[]> {
  await ensureSettingsSchema();
  return (await sql<{ key: string }[]>`SELECT key FROM app_settings`).map((r) => r.key);
}
