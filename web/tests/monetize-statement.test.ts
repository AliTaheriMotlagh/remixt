// lib/monetize/policy.ts: money nobody claims, and a member's month as a CSV.
//
//   node --import ./tests/support/register.mjs --test tests/monetize-statement.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { monthSpan, statementCsv, unclaimedCutoff, UNCLAIMED_YEARS, type StatementLine } from "../src/lib/monetize/policy.ts";

describe("unclaimed money", () => {
  test("held money is given up only after the published years", () => {
    assert.equal(UNCLAIMED_YEARS, 3);
    assert.equal(unclaimedCutoff(new Date("2029-11-19T10:00:00Z")).toISOString(), "2026-11-19T10:00:00.000Z");
  });
  test("a leap day steps back to a real day", () => {
    assert.equal(unclaimedCutoff(new Date("2028-02-29T00:00:00Z")).toISOString(), "2025-03-01T00:00:00.000Z");
  });
});

describe("month statement", () => {
  test("a month is its first moment to the next month's, in UTC", () => {
    const span = monthSpan("2026-12")!;
    assert.equal(span.from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(span.to.toISOString(), "2027-01-01T00:00:00.000Z");
  });
  test("anything that isn't a month is refused", () => {
    for (const bad of ["", "2026-13", "2026-1", "26-11", "2026-11-01", "2026-00", "x2026-11"]) assert.equal(monthSpan(bad), null, bad);
  });

  const lines: StatementLine[] = [
    { day: "2026-11-02", source: "Night, Drive", kind: "remix", role: "remixer", views: 3, micros: 4_500, state: "waiting" },
    { day: "2026-11-02", source: '=HYPERLINK("x") "live"', kind: "song", role: "artist", views: 1, micros: 1_500, state: "paid" },
  ];

  test("opens in a spreadsheet: a BOM, a header, one line each, the total", () => {
    const csv = statementCsv("2026-11", lines);
    assert.ok(csv.startsWith("﻿Date,From,Kind,Your part,Paid views,Amount (USD),State\r\n"));
    const rows = csv.slice(1).trimEnd().split("\r\n");
    assert.equal(rows.length, 4);
    assert.equal(rows[1], '2026-11-02,"Night, Drive",remix,Remixer,3,0.004500,Waiting (30-day hold)');
    assert.equal(rows[3], "Total 2026-11,,,,,0.006000,");
  });

  test("a title can't run as a formula, and its quotes are kept", () => {
    const row = statementCsv("2026-11", lines).split("\r\n")[2];
    assert.equal(row, `2026-11-02,"'=HYPERLINK(""x"") ""live""",song,Artist,1,0.001500,Paid out`);
  });

  test("an empty month still has its header and a zero total", () => {
    assert.equal(statementCsv("2026-10", []), "﻿Date,From,Kind,Your part,Paid views,Amount (USD),State\r\nTotal 2026-10,,,,,0.000000,\r\n");
  });
});
