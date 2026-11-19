// Counting tries in Postgres, so the limit holds across every server
// instance (on serverless hosting each request may land on a new one,
// which makes in-memory counters useless).

import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import sql from "./db";

let ready: Promise<void> | null = null;
function ensureRateSchema() {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS rate_hits (
        bucket TEXT NOT NULL,
        at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS rate_hits_bucket_at ON rate_hits (bucket, at)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/**
 * The visitor's address, as the host's proxy saw it (Vercel and most
 * proxies put it first in X-Forwarded-For), hashed: it's only ever
 * compared, never shown, and isn't kept in the clear.
 */
export function clientKey(req: NextRequest): string {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 24);
}

/** How many hits `bucket` had in the last `windowSeconds`. */
export async function hitsIn(bucket: string, windowSeconds: number): Promise<number> {
  await ensureRateSchema();
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM rate_hits WHERE bucket = ${bucket} AND at > now() - make_interval(secs => ${windowSeconds})
  `;
  return row?.n ?? 0;
}

/** Counts one hit against `bucket`. */
export async function hit(bucket: string): Promise<void> {
  await ensureRateSchema();
  await sql`INSERT INTO rate_hits (bucket) VALUES (${bucket})`;
  if (Math.random() < 0.01) void sql`DELETE FROM rate_hits WHERE at < now() - interval '1 day'`.catch(() => {});
}

/** Counts a hit and says whether `bucket` is still within `max` per `windowSeconds`. */
export async function allow(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  if ((await hitsIn(bucket, windowSeconds)) >= max) return false;
  await hit(bucket);
  return true;
}

export const TOO_MANY = { error: "Too many tries — wait a few minutes and try again" } as const;
