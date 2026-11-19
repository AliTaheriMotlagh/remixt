// Signing up / in from a test, now that those forms ask "are you a person?"
// (lib/captcha.ts) and limit tries per address (lib/rateLimit.ts): the
// challenge is solved here, and each request says it comes from an address
// of its own (the test server trusts X-Real-IP like the host's proxy), so a
// suite that makes twenty accounts isn't taken for a sign-up bot.

import { createHash, randomInt } from "node:crypto";

export async function captchaFor(base: string): Promise<string> {
  const c = (await (await fetch(`${base}/api/captcha`)).json()) as { salt: string; challenge: string; maxnumber: number };
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash("sha256").update(c.salt + n).digest("hex") === c.challenge) {
      return Buffer.from(JSON.stringify({ ...c, number: n })).toString("base64");
    }
  }
  throw new Error("captcha: no answer found");
}

/** A POST to /api/auth/signup or /api/auth/login with `body`, the check solved, from an address of its own. */
export async function authInit(base: string, body: Record<string, unknown>): Promise<RequestInit> {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": `198.18.${randomInt(256)}.${randomInt(1, 255)}` },
    body: JSON.stringify({ ...body, captcha: await captchaFor(base) }),
  };
}
