import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cleanReport, groupMessage, groupPath, isRage, problemKey } from "../src/lib/feedback";

describe("problems group as one", () => {
  test("ids, numbers and URLs taken out of messages", () => {
    assert.equal(groupMessage("Stem 3f2a9c1e-1111-2222-3333-444455556666 failed after 12 s"), "Stem <id> failed after <n> s");
    assert.equal(groupMessage("GET https://remixt.app/api/stems/abc?x=1 failed"), "GET /api/stems/abc failed");
  });
  test("pages with ids grouped", () => {
    assert.equal(groupPath("/remixes/k2j3h4k5j6?t=1"), "/remixes/<id>");
    assert.equal(groupPath("/radio/remixt-radio"), "/radio/<id>");
    assert.equal(groupPath("/studio"), "/studio");
  });
  test("the same problem on two remixes is one key", () => {
    const a = problemKey({ kind: "error", message: "Couldn't load 123", path: "/remixes/aaaaaaaaaa" });
    const b = problemKey({ kind: "error", message: "Couldn't load 456", path: "/remixes/bbbbbbbbbb" });
    assert.equal(a, b);
  });
});

describe("reports are checked", () => {
  test("bad ones and browser noise dropped", () => {
    assert.equal(cleanReport({ kind: "hack", message: "x", path: "/" }), null);
    assert.equal(cleanReport({ kind: "error", message: "x", path: "http://evil" }), null);
    assert.equal(cleanReport({ kind: "error", message: "Script error.", path: "/" }), null);
    assert.equal(cleanReport({ kind: "error", message: "ResizeObserver loop limit exceeded", path: "/" }), null);
    assert.equal(cleanReport({ kind: "error", message: "boom", path: "/", detail: "chrome-extension://abc/x.js" }), null);
  });
  test("long fields trimmed", () => {
    const r = cleanReport({ kind: "api", message: "x".repeat(1000), path: "/", detail: "y".repeat(5000) })!;
    assert.equal(r.message.length, 300);
    assert.equal(r.detail!.length, 2000);
  });
});

describe("rage clicks", () => {
  test("three quick clicks in one place", () => {
    assert.equal(isRage([{ t: 0, x: 10, y: 10 }, { t: 200, x: 12, y: 11 }, { t: 400, x: 9, y: 12 }]), true);
  });
  test("slow or spread clicks aren't", () => {
    assert.equal(isRage([{ t: 0, x: 10, y: 10 }, { t: 500, x: 12, y: 11 }, { t: 1200, x: 9, y: 12 }]), false);
    assert.equal(isRage([{ t: 0, x: 10, y: 10 }, { t: 200, x: 200, y: 11 }, { t: 400, x: 9, y: 12 }]), false);
    assert.equal(isRage([{ t: 0, x: 10, y: 10 }, { t: 200, x: 12, y: 11 }]), false);
  });
});
