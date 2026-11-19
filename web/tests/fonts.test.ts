// Persian text has to be drawn by a font that has Persian: Geist has none,
// and its size-adjusted Arial fallback draws the letters unjoined (every
// Persian title, artist and lyric line on the site came out as separate
// letters). Vazirmatn's Arabic-script cut goes first in the stack, limited
// to those letters by unicode-range so Latin text stays in Geist.
//
//   node --import ./tests/support/register.mjs --test tests/fonts.test.ts

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("the Persian face is the local Arabic-script cut, small, lazy and with no Arial fallback of its own", () => {
  const file = join(root, "assets/fonts/Vazirmatn-arabic.woff2");
  assert.ok(statSync(file).size < 80_000, "the Arabic cut, not the whole family");
  assert.match(layout, /src: "\.\.\/\.\.\/assets\/fonts\/Vazirmatn-arabic\.woff2"/);
  assert.match(layout, /preload: false/);
  assert.match(layout, /adjustFontFallback: false/);
  assert.match(layout, /\$\{vazirmatn\.variable\}/, "the variable is set on <html>");
});

test("it covers Persian letters and joiners, and nothing Latin", () => {
  const range = layout.match(/prop: "unicode-range",\s*value:\s*"([^"]+)"/)?.[1];
  assert.ok(range, "unicode-range declared");
  const spans = range.split(",").map((part) => {
    const [a, b = a] = part.trim().replace(/^U\+/, "").split("-");
    return [parseInt(a, 16), parseInt(b, 16)] as const;
  });
  const covered = (ch: string) => spans.some(([a, b]) => ch.codePointAt(0)! >= a && ch.codePointAt(0)! <= b);
  for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیيكۀ‌‏") assert.ok(covered(ch), `U+${ch.codePointAt(0)!.toString(16)}`);
  for (const ch of "Aaz09 .,!?-—'\"€") assert.ok(!covered(ch), `Latin "${ch}" would leave Geist`);
});

test("the site's text stack puts it before Geist's Arial fallback, in sans and mono", () => {
  assert.match(css, /--font-sans:\s*var\(--font-vazirmatn\),\s*var\(--font-geist-sans\);/);
  // Both Geist stacks end in their own Arial fallback, which would take Persian first.
  assert.match(css, /--font-mono:\s*var\(--font-vazirmatn\),\s*var\(--font-geist-mono\);/);
});
