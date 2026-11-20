// lib/toolWorkbench.ts: each tool page's working tool gives what it's for.
//
//   node --import ./tests/support/register.mjs --test tests/tool-workbench.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { downloadName, mashupRate, shownParts, WB_TEXT, WORKBENCH, workbenchFor } from "../src/lib/toolWorkbench.ts";
import { TOOL_LOCALES, toolPage } from "../src/lib/tools.ts";

describe("every tool page does its own job", () => {
  test("each tool has a workbench, and each workbench a tool page", () => {
    for (const slug of Object.keys(WORKBENCH)) assert.ok(toolPage(slug, "en"), slug);
    for (const [slug, w] of Object.entries(WORKBENCH)) {
      assert.ok(w.playing.every((p) => w.parts.includes(p)), `${slug}: what plays first is shown`);
      assert.ok(w.playing.length > 0, slug);
    }
  });
  test("what each one is for comes first", () => {
    assert.equal(workbenchFor("vocal-remover").parts[0], "beat");
    assert.equal(workbenchFor("acapella-extractor").parts[0], "vocals");
    assert.equal(workbenchFor("drum-extractor").parts[0], "drums");
    assert.equal(workbenchFor("bass-extractor").parts[0], "bass");
    assert.equal(workbenchFor("mashup-maker").songs, 2);
  });
  test("a split with only vocals and beat still gives something", () => {
    assert.deepEqual(shownParts(workbenchFor("drum-extractor"), ["vocals", "beat"]), ["vocals"]);
    assert.deepEqual(shownParts(workbenchFor("bass-extractor"), ["beat"]), ["beat"]);
    assert.deepEqual(shownParts(workbenchFor("stem-splitter"), ["vocals", "beat", "drums", "bass", "other"]), ["vocals", "drums", "bass", "other", "beat"]);
  });
  test("every word in both languages", () => {
    for (const l of TOOL_LOCALES) assert.deepEqual(Object.keys(WB_TEXT[l]).sort(), Object.keys(WB_TEXT.en).sort(), l);
  });
});

describe("files and tempo", () => {
  test("download names: the song, what it is, safe characters", () => {
    assert.equal(downloadName("Blinding Lights.mp3", "Instrumental"), "Blinding Lights (Instrumental).mp3");
    assert.equal(downloadName('a/b:c?.wav', "Vocals", "wav"), "a b c (Vocals).wav");
    assert.equal(downloadName(".mp3", "Drums"), "Song (Drums).mp3");
  });
  test("the mashup's beat speed: vocal ÷ beat tempo, half/double time when closer, left alone beyond ±20%", () => {
    assert.equal(mashupRate(120, 100), 1.2);
    assert.equal(mashupRate(140, 70), 1);
    assert.equal(mashupRate(90, 170), 1.059);
    assert.equal(mashupRate(150, 100), 0.75 >= 0.8 ? 0.75 : 1);
    assert.equal(mashupRate(null, 100), 1);
  });
});
