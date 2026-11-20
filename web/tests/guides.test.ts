// The guides (lib/guides.ts): what search engines are shown, and that every
// link from a guide goes somewhere real.
//
//   node --import ./tests/support/register.mjs --test tests/guides.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GUIDES, guide, guidePath, guidesForTool } from "../src/lib/guides.ts";
import { TOOL_PAGES, toolPage } from "../src/lib/tools.ts";

/** " · Remixt", added by the layout's title template. */
const TEMPLATE_EXTRA = 9;

describe("guides: what a search result shows", () => {
  test("titles fit with the brand added; descriptions are 70–160 characters", () => {
    for (const g of GUIDES) {
      assert.ok(g.title.length + TEMPLATE_EXTRA <= 60, `${g.slug}: "${g.title}" is ${g.title.length}`);
      assert.ok(g.description.length >= 70 && g.description.length <= 160, `${g.slug}: ${g.description.length}`);
    }
  });

  test("slugs, titles, descriptions, headings and leads are all different — from each other and from the tool pages", () => {
    for (const key of ["slug", "title", "description", "h1", "lead"] as const) {
      const values = [...GUIDES.map((g) => g[key]), ...TOOL_PAGES.map((t) => t[key])];
      assert.equal(new Set(values).size, values.length, `${key} repeats`);
    }
    for (const g of GUIDES) assert.match(g.slug, /^[a-z]+(-[a-z]+)*$/);
  });

  test("each is a real article: several sections, its own questions, a date", () => {
    const headings = GUIDES.flatMap((g) => g.sections.map((s) => `${g.slug}:${s.heading}`));
    assert.equal(new Set(headings).size, headings.length, "a heading repeats within a guide");
    const questions = GUIDES.flatMap((g) => g.faq.map((f) => f.q));
    assert.equal(new Set(questions).size, questions.length, "a question repeats across guides");
    for (const g of GUIDES) {
      assert.ok(g.sections.length >= 3, `${g.slug}: sections`);
      assert.ok(g.faq.length >= 2, `${g.slug}: questions`);
      const words = [g.lead, ...g.sections.flatMap((s) => [...s.paragraphs, ...(s.steps ?? []).map((x) => x.text)])].join(" ").split(/\s+/).length;
      assert.ok(words >= 350, `${g.slug}: only ${words} words — too thin to answer the question`);
      assert.match(g.updated, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(g.minutes >= Math.floor(words / 250), `${g.slug}: says ${g.minutes} min for ${words} words`);
    }
  });
});

describe("guides: links", () => {
  test("every tool and guide a guide points to exists, and none points to itself", () => {
    for (const g of GUIDES) {
      assert.ok(g.tools.length >= 2, `${g.slug}: tools`);
      for (const t of g.tools) assert.ok(toolPage(t), `${g.slug} → unknown tool ${t}`);
      assert.ok(g.related.length >= 2, `${g.slug}: related`);
      for (const r of g.related) {
        assert.ok(guide(r), `${g.slug} → unknown guide ${r}`);
        assert.notEqual(r, g.slug);
      }
    }
  });

  test("every guide is linked from at least one other (no orphans)", () => {
    for (const g of GUIDES) assert.ok(GUIDES.some((o) => o.related.includes(g.slug)), `${g.slug} has no way in from another guide`);
  });

  test("the tool pages a guide explains link back to it", () => {
    assert.ok(guidesForTool("bpm-key-finder").some((g) => g.slug === "how-to-match-keys"));
    assert.ok(guidesForTool("mashup-maker").some((g) => g.slug === "how-to-make-a-mashup"));
    assert.equal(guidePath("how-to-make-a-remix"), "/guides/how-to-make-a-remix");
  });

  test("the content map's questions each have their guide", () => {
    const want = ["how-to-make-a-remix", "how-to-isolate-vocals", "how-to-create-an-acapella", "how-to-dj-with-stems", "how-to-match-bpm", "how-to-match-keys", "how-to-make-a-mashup", "how-to-use-stems-in-a-daw"];
    assert.deepEqual(GUIDES.map((g) => g.slug).sort(), [...want].sort());
  });
});
