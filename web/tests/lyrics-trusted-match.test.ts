import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedLyricsMatch, type LyricsResult } from "../src/lib/lyrics";

const r = (o: Partial<LyricsResult>): LyricsResult => ({ id: 1, title: "", artist: "", album: "", duration: null, instrumental: false, plain: "la", synced: null, ...o });

test("a same-titled song by someone else is not taken", () => {
  const found = trustedLyricsMatch([r({ title: "Moft", artist: "Some Band", synced: "[00:01.00]x", duration: 200 })], { title: "Moft", artist: "Dorcci", length: 200 });
  assert.equal(found, null);
});

test("the same title and artist is taken, the timed copy of the same recording first", () => {
  const plain = r({ id: 1, title: "Ye Rooze Khoob Miad", artist: "Hichkas", plain: "a" });
  const timed = r({ id: 2, title: "Ye Rooze Khoob Miad", artist: "Hichkas feat. Mehdi", synced: "[00:01.00]a", duration: 241 });
  assert.equal(trustedLyricsMatch([plain, timed], { title: "Ye Rooze Khoob Miad", artist: "Hichkas", length: 240 })?.id, 2);
});

test("a loose title match is not enough", () => {
  assert.equal(trustedLyricsMatch([r({ title: "Moft Khor", artist: "Dorcci" })], { title: "Moft", artist: "Dorcci", length: null }), null);
});

test("with no artist, only the same recording's length counts", () => {
  const a = r({ title: "Baran", artist: "X", duration: 180 });
  assert.equal(trustedLyricsMatch([a], { title: "Baran", artist: "", length: null }), null);
  assert.equal(trustedLyricsMatch([a], { title: "Baran", artist: "", length: 181 })?.title, "Baran");
});

test("a far-off length is another song", () => {
  assert.equal(trustedLyricsMatch([r({ title: "Hello", artist: "Adele", duration: 100 })], { title: "Hello", artist: "Adele", length: 295 }), null);
});
