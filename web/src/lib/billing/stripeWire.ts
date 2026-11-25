import { createHmac, timingSafeEqual } from "crypto";

// Stripe's wire formats, pure (no network, no database) so the tests can
// check them: its nested form encoding and its webhook signatures.

/** Stripe's form encoding: nested keys as a[b][c]. */
export function formEncode(data: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(...formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

/**
 * Checks a webhook's Stripe-Signature header (t=…,v1=…): an HMAC of
 * "t.payload" with the endpoint's signing secret, at most 5 minutes old.
 */
export function verifyStripeSignature(payload: string, header: string | null, signingSecret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", signingSecret).update(`${t}.${payload}`).digest("hex");
  const given = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return given.some((g) => g.length === expected.length && timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
}
