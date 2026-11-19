// lib/captcha.ts + lib/client/captcha.ts: the "are you a person?" proof of
// work on sign-up, sign-in and takedown requests. The browser's solver must
// find what the server hid, and the server must refuse anything altered,
// run out or made by someone else.
//
//   node --import ./tests/support/register.mjs --test tests/captcha.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkSolution, createChallenge, parseSolution } from "../src/lib/captcha.ts";
import { solve } from "../src/lib/client/captcha.ts";

describe("captcha", () => {
  test("the browser's solver finds the number, and the server takes it", async () => {
    const c = createChallenge(Date.now(), 5000);
    const number = await solve(c);
    assert.notEqual(number, null);
    const field = Buffer.from(JSON.stringify({ ...c, number })).toString("base64");
    const s = parseSolution(field);
    assert.ok(s && checkSolution(s));
  });

  test("a wrong number, a changed challenge or a forged signature is refused", async () => {
    const c = createChallenge(Date.now(), 2000);
    const number = (await solve(c))!;
    assert.equal(checkSolution({ ...c, number: number + 1 }), false);
    assert.equal(checkSolution({ ...c, number, salt: c.salt.replace(/^./, "x") }), false);
    assert.equal(checkSolution({ ...c, number, signature: "0".repeat(64) }), false);
  });

  test("an answer that ran out is refused", async () => {
    const c = createChallenge(Date.now() - 60 * 60_000, 1000);
    const number = (await solve(c))!;
    assert.equal(checkSolution({ ...c, number }), false);
  });

  test("junk in the field is not a solution", () => {
    for (const junk of [undefined, 42, "", "not base64 json", Buffer.from('{"algorithm":"MD5"}').toString("base64"), "x".repeat(5000)]) {
      assert.equal(parseSolution(junk), null);
    }
  });

  test("a phone-sized challenge solves quickly", async () => {
    const c = createChallenge();
    const started = performance.now();
    assert.notEqual(await solve(c), null);
    assert.ok(performance.now() - started < 5000, `took ${Math.round(performance.now() - started)} ms`);
  });
});
