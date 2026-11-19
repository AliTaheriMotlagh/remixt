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
import { TOOL_LOCALES, toolLanguages, toolPage, toolPages, toolPath, toolsHubPath } from "../src/lib/tools.ts";
import { TOOL_UI } from "../src/lib/toolsUi.ts";

const TEMPLATE_EXTRA = ` · ${SITE_NAME}`.length;

for (const locale of TOOL_LOCALES) {
  const PAGES = toolPages(locale);
  describe(`tool pages (${locale})`, () => {
    test("titles fit a search result with the brand added", () => {
      for (const t of PAGES) assert.ok(t.title.length + TEMPLATE_EXTRA <= 60, `${t.slug}: "${t.title}" is ${t.title.length}`);
    });

    test("descriptions are 70–160 characters", () => {
      for (const t of PAGES) {
        assert.ok(t.description.length >= 70 && t.description.length <= 160, `${t.slug}: ${t.description.length}`);
      }
    });

    test("slugs, titles, descriptions, headings and leads are all different", () => {
      for (const key of ["slug", "title", "description", "h1", "lead", "cta"] as const) {
        const values = PAGES.map((t) => t[key]);
        assert.equal(new Set(values).size, values.length, `${key} repeats`);
      }
      for (const t of PAGES) assert.match(t.slug, /^[a-z]+(-[a-z]+)*$/);
    });

    test("each page has its own sections and questions, not only the shared ones", () => {
      const headings = PAGES.flatMap((t) => t.sections.map((s) => s.heading));
      assert.equal(new Set(headings).size, headings.length, "a section heading repeats across pages");
      const counts = new Map<string, number>();
      for (const t of PAGES) for (const f of t.faq) counts.set(f.q, (counts.get(f.q) ?? 0) + 1);
      for (const t of PAGES) {
        assert.ok(t.sections.length >= 2, `${t.slug}: sections`);
        assert.ok(t.steps.length >= 3, `${t.slug}: steps`);
        const own = t.faq.filter((f) => counts.get(f.q) === 1);
        assert.ok(own.length >= 1, `${t.slug}: no question of its own`);
        assert.equal(new Set(t.faq.map((f) => f.q)).size, t.faq.length, `${t.slug}: a question repeats`);
      }
    });

    test("related links and library kinds point at real things", () => {
      for (const t of PAGES) {
        assert.ok(t.related.length >= 2, `${t.slug}: related`);
        for (const r of t.related) {
          assert.ok(toolPage(r, locale), `${t.slug} links to unknown ${r}`);
          assert.notEqual(r, t.slug, `${t.slug} links to itself`);
        }
        if (t.library) assert.ok(isStemKind(t.library.kind), `${t.slug}: ${t.library.kind}`);
      }
    });

    test("the hub's title and description fit a search result", () => {
      const { hub } = TOOL_UI[locale];
      assert.ok(hub.title.length + TEMPLATE_EXTRA <= 60, `"${hub.title}" is ${hub.title.length}`);
      assert.ok(hub.description.length >= 70 && hub.description.length <= 160, String(hub.description.length));
    });
  });
}

describe("tool pages in other languages", () => {
  const english = toolPages("en");

  test("every English page has its twin in every language, under the same slug, and nothing more", () => {
    for (const locale of TOOL_LOCALES) {
      assert.deepEqual(
        toolPages(locale).map((t) => t.slug),
        english.map((t) => t.slug),
        locale,
      );
    }
  });

  test("a twin says the same shape of thing: same steps, sections, library kind and related pages", () => {
    for (const locale of TOOL_LOCALES) {
      for (const en of english) {
        const t = toolPage(en.slug, locale)!;
        assert.equal(t.steps.length, en.steps.length, `${locale}/${t.slug}: steps`);
        assert.equal(t.sections.length, en.sections.length, `${locale}/${t.slug}: sections`);
        assert.equal(t.faq.length, en.faq.length, `${locale}/${t.slug}: questions`);
        assert.equal(t.library?.kind, en.library?.kind, `${locale}/${t.slug}: library`);
        assert.deepEqual(t.related, en.related, `${locale}/${t.slug}: related`);
      }
    }
  });

  test("Persian pages are written in Persian, not left in English", () => {
    // Letters only, without the names that stay Latin (Remixt, Demucs, MP3, the app's English button labels).
    const persianShare = (text: string) => {
      const persian = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
      const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
      return persian / Math.max(1, persian + latin);
    };
    for (const t of toolPages("fa")) {
      const texts = [t.name, t.title, t.description, t.h1, t.lead, t.cta, ...t.steps.flatMap((s) => [s.name, s.text]),
        ...t.sections.flatMap((s) => [s.heading, ...s.paragraphs]), ...t.faq.flatMap((f) => [f.q, f.a])];
      for (const text of texts) assert.ok(persianShare(text) >= 0.6, `${t.slug}: mostly not Persian — "${text.slice(0, 50)}"`);
    }
    for (const word of [TOOL_UI.fa.home, TOOL_UI.fa.tools, TOOL_UI.fa.howItWorks, TOOL_UI.fa.hub.h1]) {
      assert.ok(persianShare(word) === 1, word);
    }
  });

  test("Persian step numbers are written in Persian digits", () => {
    assert.equal(TOOL_UI.fa.number(1), "۱");
    assert.equal(TOOL_UI.fa.number(12), "۱۲");
    assert.equal(TOOL_UI.en.number(3), "3");
  });

  test("hreflang links are reciprocal and English is the default", () => {
    for (const slug of [undefined, ...english.map((t) => t.slug)]) {
      const languages = toolLanguages(slug);
      assert.equal(languages["x-default"], languages.en);
      for (const locale of TOOL_LOCALES) {
        const path = slug ? toolPath(slug, locale) : toolsHubPath(locale);
        assert.equal(languages[locale], path);
      }
    }
    assert.equal(toolPath("vocal-remover"), "/tools/vocal-remover");
    assert.equal(toolPath("vocal-remover", "fa"), "/fa/tools/vocal-remover");
    assert.equal(toolsHubPath("fa"), "/fa/tools");
  });

  test("Persian pages read right to left; others left to right", () => {
    for (const locale of TOOL_LOCALES) assert.equal(TOOL_UI[locale].dir, locale === "fa" ? "rtl" : "ltr");
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
    for (const p of ["/", "/tools", "/tools/vocal-remover", "/fa/tools", "/fa/tools/vocal-remover", "/library", "/remixes/abc", "/radio", "/radio/house", "/dj", "/studio-tips"]) {
      assert.equal(showsFooter(p), true, p);
    }
  });

  test("stays off bare views and full-height work screens", () => {
    for (const p of ["/studio", "/studio/", "/embed/abc", "/radio/house/embed", "/radio/house/broadcast", "/radio/house/console", null]) {
      assert.equal(showsFooter(p), false, String(p));
    }
  });
});

describe("a remix page's description", async () => {
  const { remixDescription, DESCRIPTION_MAX } = await import("../src/lib/site.ts");
  test("says what it's built from and invites, when there's room", () => {
    const text = remixDescription("Night Drive", "Sara", ["Rain", "Moon"]);
    assert.equal(text, "Listen to “Night Drive”, a remix by Sara on Remixt. Built from Rain + Moon. Open it in the studio and make your own.");
  });
  test("drops source songs, then the invitation, then shortens the title — never past 160", () => {
    const long = ["A very long source song title here", "Another quite long source title", "Third long source song title"];
    for (const [title, artist, sources] of [
      ["Night Drive", "Sara", long],
      ["A remix title that goes on and on and on for a very long while indeed, far too long", "An artist with a long name", long],
      ["x".repeat(400), "y".repeat(200), []],
    ] as const) {
      const text = remixDescription(title, artist, [...sources]);
      assert.ok(text.length <= DESCRIPTION_MAX, `${text.length}: ${text}`);
      assert.ok(text.startsWith("Listen to “"));
    }
    assert.ok(!remixDescription("Night Drive", "Sara", long).includes("Third"), "fewer sources first");
  });
});
