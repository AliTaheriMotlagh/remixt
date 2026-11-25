import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblem } from "../src/lib/passwordRules";

describe("passwords", () => {
  test("short, common, repeated or the email are refused", () => {
    assert.ok(passwordProblem("123456"));
    assert.ok(passwordProblem("12345678"));
    assert.ok(passwordProblem("Password"));
    assert.ok(passwordProblem("aaaaaaaaaa"));
    assert.ok(passwordProblem("alitaheri", "alitaheri@example.com"));
  });
  test("a long uncommon one is fine", () => {
    assert.equal(passwordProblem("violet-tape-sunrise-42", "a@b.co"), null);
  });
});
