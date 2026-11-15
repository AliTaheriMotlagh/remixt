// uploads.ts: the "about 2 min left" shown beside a song going up.
//
//   node --import ./tests/support/register.mjs --test tests/upload-time-left.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { timeLeftText } from "../src/lib/client/uploads";

test("rounded so it doesn't flicker, and nothing when it can't tell", () => {
  assert.equal(timeLeftText(null), null);
  assert.equal(timeLeftText(0), null);
  assert.equal(timeLeftText(Infinity), null);
  assert.equal(timeLeftText(4), "a few seconds left");
  assert.equal(timeLeftText(33), "about 40 s left");
  assert.equal(timeLeftText(150), "about 3 min left");
  assert.equal(timeLeftText(4000), "over an hour left");
});
