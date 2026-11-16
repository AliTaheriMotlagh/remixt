// The clip editor's design (lib/clipDesign.ts): looks keep the user's words
// and places, a new shape lays the video out again, a stored design is
// checked before it's trusted, and dragging snaps to the middle.
//
//   node --import ./tests/support/register.mjs --test tests/clip-design.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTemplate,
  CLIP_TEMPLATES,
  defaultDesign,
  forStorage,
  layoutFor,
  readDesign,
  resetPlace,
  setElement,
  snapPosition,
  withWords,
} from "../src/lib/clipDesign.ts";

const words = { title: "Song", artist: "Me", link: "remixt.app/r/abc" };

test("a look changes colours and fonts, not the words or where things are", () => {
  let d = withWords(defaultDesign(), words);
  d = setElement(d, "title", { x: 0.3, y: 0.7, scale: 1.6 });
  const sunset = CLIP_TEMPLATES.find((t) => t.id === "sunset")!;
  const after = applyTemplate(d, sunset);
  assert.equal(after.elements.title.text, "Song");
  assert.deepEqual([after.elements.title.x, after.elements.title.y, after.elements.title.scale], [0.3, 0.7, 1.6]);
  assert.equal(after.elements.title.font, "heavy");
  assert.deepEqual(after.background.colors, sunset.background.colors);
});

test("a look keeps a photo background", () => {
  const d = { ...defaultDesign(), background: { ...defaultDesign().background, kind: "photo" as const } };
  assert.equal(applyTemplate(d, CLIP_TEMPLATES[3]).background.kind, "photo");
});

test("a new shape lays everything out for it, keeping the rest", () => {
  const d = setElement(withWords(defaultDesign("story"), words), "lyrics", { color: "#ff0000", x: 0.1 });
  const wide = layoutFor(d, "wide");
  assert.equal(wide.format, "wide");
  assert.equal(wide.elements.lyrics.color, "#ff0000");
  assert.notEqual(wide.elements.lyrics.x, 0.1);
  assert.equal(wide.elements.title.text, "Song");
  assert.equal(resetPlace(d, "lyrics").elements.lyrics.x, defaultDesign("story").elements.lyrics.x);
});

test("the song's words fill only what the user hasn't typed", () => {
  const typed = setElement(defaultDesign(), "title", { text: "My title" });
  const d = withWords(typed, words);
  assert.equal(d.elements.title.text, "My title");
  assert.equal(d.elements.artist.text, "Me");
});

test("a stored design is checked: bad values fall back, this song's words and the photo aren't kept", () => {
  const stored = JSON.parse(JSON.stringify(forStorage(setElement(withWords(defaultDesign("square"), words), "caption", { text: "out now", visible: true }))));
  const back = readDesign(stored)!;
  assert.equal(back.format, "square");
  assert.equal(back.elements.title.text, "");
  assert.equal(back.elements.caption.text, "out now");
  assert.equal(back.elements.photo.visible, false);

  const broken = readDesign({ format: "huge", background: { kind: "photo", colors: ["red"], dim: 9 }, elements: { title: { scale: 99, color: "javascript:", font: "comic" } } })!;
  assert.equal(broken.format, "story");
  assert.equal(broken.background.kind, "gradient");
  assert.equal(broken.background.dim, 0.85);
  assert.equal(broken.elements.title.scale, 3);
  assert.match(broken.elements.title.color, /^#[0-9a-f]{6}$/i);
  assert.equal(broken.elements.title.font, defaultDesign().elements.title.font);
  assert.equal(readDesign(null), null);
});

test("dragging near the middle snaps to it; off the edge stays on the frame", () => {
  assert.deepEqual(snapPosition(0.505, 0.3), { x: 0.5, y: 0.3, snapX: true, snapY: false });
  const off = snapPosition(1.4, -0.2);
  assert.equal(off.x, 0.98);
  assert.equal(off.y, 0.02);
});
