// Checking a person's own AI key before it's saved on their account
// (lib/aiKeys.ts), with the providers faked: a key the provider turns
// away isn't kept, and one the provider can't be reached to check is kept
// all the same — refusing it then was how keys went missing from accounts.
//
//   node --import ./tests/support/register.mjs --test tests/ai-keys.test.ts

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { checkAiKey } from "../src/lib/aiKeys.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Every request answered with `status` (and a body the SDK can read), or failing outright when `status` is null. */
function provider(status: number | null) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    if (status === null) throw new TypeError("fetch failed");
    const body = status < 300 ? { id: "claude-opus-5-5", type: "model", display_name: "Claude", created_at: "2026-01-01T00:00:00Z" } : { type: "error", error: { type: "error", message: "no" } };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

const ANTHROPIC = "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OPENROUTER = "sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("checking a key before it's saved", () => {
  test("a key the provider accepts is saved", async () => {
    const calls = provider(200);
    assert.deepEqual(await checkAiKey("anthropic", ANTHROPIC, "claude-opus-5-5"), { ok: true });
    assert.ok(calls[0].includes("api.anthropic.com"));
    provider(200);
    assert.deepEqual(await checkAiKey("openrouter", OPENROUTER, "anthropic/claude-sonnet-5-5"), { ok: true });
  });

  test("a key the provider turns away isn't", async () => {
    provider(401);
    const anthropic = await checkAiKey("anthropic", ANTHROPIC, "claude-opus-5-5");
    assert.equal(anthropic.ok, false);
    provider(401);
    const openrouter = await checkAiKey("openrouter", OPENROUTER, "anthropic/claude-sonnet-5-5");
    assert.equal(openrouter.ok, false);
  });

  test("a model the key can't use is said, and not saved", async () => {
    provider(404);
    const result = await checkAiKey("anthropic", ANTHROPIC, "claude-haiku-5-5");
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /model/);
  });

  test("a provider that can't be reached doesn't lose the key: it's saved, with a warning", async () => {
    provider(null);
    const anthropic = await checkAiKey("anthropic", ANTHROPIC, "claude-opus-5-5");
    assert.equal(anthropic.ok, "unchecked");
    assert.match(anthropic.ok === "unchecked" ? anthropic.warning : "", /Saved/);
    provider(null);
    assert.equal((await checkAiKey("openrouter", OPENROUTER, "anthropic/claude-sonnet-5-5")).ok, "unchecked");
    // An outage on the provider's side is the same.
    provider(503);
    assert.equal((await checkAiKey("anthropic", ANTHROPIC, "claude-opus-5-5")).ok, "unchecked");
  });
});
