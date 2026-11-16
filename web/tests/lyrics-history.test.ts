// The lyrics' Undo and Redo (lib/client/lyricsStore.ts): every change to
// the open sheet is a step back, an undone step can be put back until
// something new changes, and Clear is one step like any other.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-history.test.ts

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const storage = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
};

const { useLyrics, activeSheet } = await import("../src/lib/client/lyricsStore.ts");
const text = () => activeSheet(useLyrics.getState())?.text;

beforeEach(() => {
  useLyrics.getState().create({ title: "Song", artist: "", text: "one\ntwo\nthree", source: "own" });
});

test("undo takes a line edit back, redo puts it back", () => {
  const lyrics = useLyrics.getState();
  lyrics.editLine(1, "TWO");
  assert.equal(text(), "one\nTWO\nthree");
  useLyrics.getState().undo();
  assert.equal(text(), "one\ntwo\nthree");
  useLyrics.getState().redo();
  assert.equal(text(), "one\nTWO\nthree");
  assert.equal(useLyrics.getState().future.length, 0);
});

test("a new change after an undo forgets what was undone", () => {
  useLyrics.getState().deleteLine(0);
  useLyrics.getState().undo();
  assert.equal(useLyrics.getState().future.length, 1);
  useLyrics.getState().duplicateLine(2);
  assert.equal(useLyrics.getState().future.length, 0);
  useLyrics.getState().redo();
  assert.equal(text(), "one\ntwo\nthree\nthree");
});

test("clear empties the sheet and undo brings every line back", () => {
  useLyrics.getState().clear();
  assert.equal(text(), "");
  assert.equal(useLyrics.getState().lines.length, 0);
  useLyrics.getState().undo();
  assert.equal(text(), "one\ntwo\nthree");
  useLyrics.getState().redo();
  assert.equal(text(), "");
});

test("several steps undo in order, and redo in order", () => {
  const s = () => useLyrics.getState();
  s().editLine(0, "a");
  s().editLine(1, "b");
  s().editLine(2, "c");
  s().undo();
  s().undo();
  assert.equal(text(), "a\ntwo\nthree");
  s().redo();
  assert.equal(text(), "a\nb\nthree");
  s().redo();
  assert.equal(text(), "a\nb\nc");
});
