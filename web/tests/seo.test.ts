// What search engines are shown: the tool pages' words (lib/tools.ts), the
// site description, every page's written description, and where the footer
// goes. Search results cut titles at about 60 characters and descriptions at
// about 160, and near-identical pages get treated as doorway pages.
//
//   node --import ./tests/support/register.mjs --test tests/seo.test.ts

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { showsFooter } from "../src/lib/bareView.ts";
import { SITE_DESCRIPTION, SITE_NAME } from "../src/lib/site.ts";
import { isStemKind } from "../src/lib/stemKinds.ts";
import { TOOL_PAGES, toolPage } from "../src/lib/tools.ts";

const TEMPLATE_EXTRA = ` · ${SITE_NAME}`.length;

describe("tool pages", () => {
  test("titles fit a search result with the brand added", () => {
    for (const t of TOOL_PAGES) assert.ok(t.title.length + TEMPLATE_EXTRA <= 60, `${t.slug}: "${t.title}" is ${t.title.length}`);
  });

  test("descriptions are 70–160 characters", () => {
    for (const t of TOOL_PAGES) {
      assert.ok(t.description.length >= 70 && t.description.length <= 160, `${t.slug}: ${t.description.length}`);
    }
  });

  test("slugs, titles, descriptions, headings and leads are all different", () => {
    for (const key of ["slug", "title", "description", "h1", "lead", "cta"] as const) {
      const values = TOOL_PAGES.map((t) => t[key]);
      assert.equal(new Set(values).size, values.length, `${key} repeats`);
    }
    for (const t of TOOL_PAGES) assert.match(t.slug, /^[a-z]+(-[a-z]+)*$/);
  });

  test("each page has its own sections and questions, not only the shared ones", () => {
    const headings = TOOL_PAGES.flatMap((t) => t.sections.map((s) => s.heading));
    assert.equal(new Set(headings).size, headings.length, "a section heading repeats across pages");
    const counts = new Map<string, number>();
    for (const t of TOOL_PAGES) for (const f of t.faq) counts.set(f.q, (counts.get(f.q) ?? 0) + 1);
    for (const t of TOOL_PAGES) {
      assert.ok(t.sections.length >= 2, `${t.slug}: sections`);
      assert.ok(t.steps.length >= 3, `${t.slug}: steps`);
      const own = t.faq.filter((f) => counts.get(f.q) === 1);
      assert.ok(own.length >= 1, `${t.slug}: no question of its own`);
      assert.equal(new Set(t.faq.map((f) => f.q)).size, t.faq.length, `${t.slug}: a question repeats`);
    }
  });

  test("related links and library kinds point at real things", () => {
    for (const t of TOOL_PAGES) {
      assert.ok(t.related.length >= 2, `${t.slug}: related`);
      for (const r of t.related) {
        assert.ok(toolPage(r), `${t.slug} links to unknown ${r}`);
        assert.notEqual(r, t.slug, `${t.slug} links to itself`);
      }
      if (t.library) assert.ok(isStemKind(t.library.kind), `${t.slug}: ${t.library.kind}`);
    }
  });
});

describe("descriptions everywhere", () => {
  test("the site description fits a search result", () => {
    assert.ok(SITE_DESCRIPTION.length >= 70 && SITE_DESCRIPTION.length <= 160, String(SITE_DESCRIPTION.length));
  });

  test("every page's written description is at most 160 characters", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/^(page|layout)\.tsx$/.test(name)) files.push(path);
      }
    };
    walk(join(import.meta.dirname, "../src/app"));
    let checked = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Plain string descriptions; built ones (with ${…}) depend on data.
      for (const m of source.matchAll(/description:\s*"((?:[^"\\]|\\.)*)"/g)) {
        checked++;
        assert.ok(m[1].length <= 160, `${file}: ${m[1].length} characters — "${m[1].slice(0, 60)}…"`);
      }
    }
    assert.ok(checked >= 10, `only ${checked} descriptions found`);
  });
});

describe("site footer", () => {
  test("goes under content pages", () => {
    for (const p of ["/", "/tools", "/tools/vocal-remover", "/library", "/remixes/abc", "/radio", "/radio/house", "/dj", "/studio-tips"]) {
      assert.equal(showsFooter(p), true, p);
    }
  });

  test("stays off bare views and full-height work screens", () => {
    for (const p of ["/studio", "/studio/", "/embed/abc", "/radio/house/embed", "/radio/house/broadcast", "/radio/house/console", null]) {
      assert.equal(showsFooter(p), false, String(p));
    }
  });
});
