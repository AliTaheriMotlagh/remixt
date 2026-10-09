// Quick help: the Ask box's requests understood without an AI model —
// in English and Persian — and what each one is taken to mean.
//
//   node --import ./tests/support/register.mjs --test tests/quick-help.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { intentsOf } from "../src/lib/client/quickHelp.ts";

describe("what a request asks for", () => {
  const cases: [string, string[]][] = [
    ["Make it sound good", ["good"]],
    ["put the chorus on the drop", ["drop"]],
    ["make it a club remix and add a harmony", ["style-club", "harmony"]],
    ["Why does it sound off?", ["why"]],
    ["what changed?", ["changed"]],
    ["slowed + reverb", ["style-slowed"]],
    ["speed it up", ["speed"]],
    ["make it slower", ["speed"]],
    ["vocal louder", ["level"]],
    ["keep it", ["keep"]],
    ["undo that", ["undo"]],
    ["بهترش کن", ["good"]],
    ["دراپ رو قوی‌تر کن", ["drop"]],
    ["صدای خواننده رو بلندتر کن", ["level"]],
    ["یک هارمونی اضافه کن", ["harmony"]],
    ["کلاب", ["style-club"]],
    ["hello there", []],
  ];
  for (const [text, expected] of cases) {
    test(`“${text}”`, () => assert.deepEqual(intentsOf(text), expected));
  }

  test("asking why is a question: nothing else is done with it", () => {
    assert.deepEqual(intentsOf("why is it bad, make it better"), ["why"]);
  });
});
