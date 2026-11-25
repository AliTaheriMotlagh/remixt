// Setting ads up step by step (lib/monetize/adSetup.ts).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adSetupSteps, setupProgress } from "../src/lib/monetize/adSetup.ts";
import { DEFAULTS, GROUPS } from "../src/lib/settings/registry.ts";

const none = { running: 0, pendingCampaigns: 0, pendingPayments: 0, unpaidApproved: 0 };

describe("ad setup steps", () => {
  test("a fresh site: payment details and a running ad are what's missing", () => {
    const steps = adSetupSteps(DEFAULTS, none);
    const missing = steps.filter((s) => !s.done && !s.optional).map((s) => s.id);
    assert.deepEqual(missing, ["payTo", "running"]);
    assert.equal(setupProgress(steps).ready, false);
  });

  test("an approved ad without money is named as the reason nothing shows", () => {
    const step = adSetupSteps(DEFAULTS, { ...none, unpaidApproved: 1 }).find((s) => s.id === "running")!;
    assert.match(step.en, /no budget/);
    assert.match(step.help, /Approved isn't enough/);
  });

  test("everything done: ready", () => {
    const s = { ...DEFAULTS, payTo: { en: "IBAN …", fa: "" } };
    assert.equal(setupProgress(adSetupSteps(s, { ...none, running: 2 })).ready, true);
  });

  test("waiting work keeps it from being ready", () => {
    const s = { ...DEFAULTS, payTo: { en: "IBAN …", fa: "" } };
    assert.equal(setupProgress(adSetupSteps(s, { ...none, running: 1, pendingPayments: 1 })).ready, false);
  });

  test("every settings link opens a group that exists", () => {
    const ids = new Set(GROUPS.map((g) => g.id));
    for (const step of adSetupSteps(DEFAULTS, none)) if ("settings" in step.go) assert.ok(ids.has(step.go.settings), step.id);
  });
});
