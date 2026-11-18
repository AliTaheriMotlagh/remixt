// How often a radio tab asks for the station's feed (lib/radioPace.ts,
// pollEvery): every ask is a function call and database reads on the free
// tier, and a locked phone may listen for hours — but the next song must
// still be heard of well inside the 90 s it's announced ahead.
//
//   node --import ./tests/support/register.mjs --test tests/radio-poll-pace.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pollEvery } from "../src/lib/radioPace.ts";
import { NEXT_LEAD_SECONDS } from "../src/lib/radioPick.ts";

describe("radio poll pace", () => {
  test("lively on screen, relaxed in the background, rare when hidden and silent", () => {
    const onScreen = pollEvery({ hidden: false, playing: true });
    const locked = pollEvery({ hidden: true, playing: true });
    const idle = pollEvery({ hidden: true, playing: false });
    assert.ok(onScreen <= 5_000);
    assert.ok(onScreen < locked && locked < idle);
  });

  test("a locked phone still learns of the next song with most of its lead to spare", () => {
    const locked = pollEvery({ hidden: true, playing: true });
    assert.ok(locked * 4 <= NEXT_LEAD_SECONDS * 1000, "at least three-quarters of the lead left to mix it");
  });

  test("a day on the radio with the screen locked stays well inside a million calls a month", () => {
    const perMonth = (30 * 24 * 3600 * 1000) / pollEvery({ hidden: true, playing: true });
    assert.ok(perMonth < 200_000, `${perMonth}`);
  });
});
