// Structured data is one JSON-LD document per script, each with its
// "@context": a bare list crashed scripts that read the page's structured
// data (r["@context"].toLowerCase, seen on the tool pages and the home page).
//
//   node --import ./tests/support/register.mjs --test tests/json-ld.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { jsonLdDocument } from "../src/lib/jsonLd.ts";

describe("JSON-LD documents", () => {
  test("a list becomes one graph with its context", () => {
    const doc = jsonLdDocument([
      { "@context": "https://schema.org", "@type": "WebApplication", name: "A" },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] },
    ]);
    assert.equal(doc["@context"], "https://schema.org");
    const graph = doc["@graph"] as Record<string, unknown>[];
    assert.equal(graph.length, 2);
    assert.ok(graph.every((item) => !("@context" in item)));
    assert.deepEqual(graph.map((g) => g["@type"]), ["WebApplication", "FAQPage"]);
  });
  test("one item stays itself, given a context if it had none", () => {
    assert.deepEqual(jsonLdDocument([{ "@context": "https://schema.org", "@type": "WebSite" }]), { "@context": "https://schema.org", "@type": "WebSite" });
    assert.equal(jsonLdDocument({ "@type": "WebSite" })["@context"], "https://schema.org");
  });
});
