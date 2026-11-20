// lib/toolWorkbench.ts: each tool page's working tool gives what it's for.
//
//   node --import ./tests/support/register.mjs --test tests/tool-workbench.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { downloadName, keyShift, mashupRate, mixesWith, shownParts, signed, signInLinks, tempoFit, WB_TEXT, WORKBENCH, workbenchFor, workflowFor } from "../src/lib/toolWorkbench.ts";
import { safeNext } from "../src/lib/client/navigation.ts";
import { TOOL_LOCALES, toolPage, toolPages } from "../src/lib/tools.ts";

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

describe("on a phone: the split queue first", () => {
  test("a computer splits here; a phone is offered the queue, or asked to sign in for it", () => {
    assert.equal(workflowFor({ phone: false, tryHere: false, signedIn: null }), "here");
    assert.equal(workflowFor({ phone: true, tryHere: false, signedIn: true }), "queue");
    assert.equal(workflowFor({ phone: true, tryHere: false, signedIn: false }), "sign-in");
    // Not known yet: never sends anything before it's known who's here.
    assert.equal(workflowFor({ phone: true, tryHere: false, signedIn: null }), "sign-in");
  });
  test("asked to try anyway, it splits on the phone", () => {
    assert.equal(workflowFor({ phone: true, tryHere: true, signedIn: false }), "here");
    assert.equal(workflowFor({ phone: true, tryHere: true, signedIn: true }), "here");
  });
  test("signing in comes back to the tool page (login and sign-up honour ?next=)", () => {
    for (const path of ["/tools/vocal-remover", "/fa/tools/mashup-maker"]) {
      const { login, signup } = signInLinks(path);
      assert.equal(safeNext(login.slice(login.indexOf("?")), "/library"), path);
      assert.equal(safeNext(signup.slice(signup.indexOf("?")), "/upload"), path);
    }
  });
});

describe("the new tools do their own job", () => {
  test("every tool page has its workbench (none falls back to the stem splitter by accident)", () => {
    for (const t of toolPages("en")) assert.ok(WORKBENCH[t.slug], `${t.slug} has no workbench`);
  });
  test("the drum remover plays the song without its drums, and calls the download that", () => {
    const w = workbenchFor("drum-remover");
    assert.ok(!w.playing.includes("drums"));
    assert.deepEqual([...w.playing].sort(), ["bass", "other", "vocals"]);
    assert.equal(w.mixName, "No drums");
    assert.equal(downloadName("Song.mp3", w.mixName!, "wav"), "Song (No drums).wav");
  });
  test("the BPM and key finder measures instead of splitting", () => {
    assert.equal(workbenchFor("bpm-key-finder").analyze, true);
    assert.equal(workbenchFor("vocal-remover").analyze, undefined);
  });
});

describe("the BPM and key finder's answers", () => {
  test("tempo: the smallest change, counting half and double time", () => {
    assert.deepEqual(tempoFit(120, 120), { factor: 1, percent: 0, multiple: 1 });
    assert.equal(tempoFit(128, 120).percent, 6.7);
    assert.equal(tempoFit(140, 70).multiple, 0.5); // 70 is 140 at half time: no change needed
    assert.equal(tempoFit(140, 70).percent, 0);
    assert.equal(tempoFit(70, 142).multiple, 2);
    assert.equal(tempoFit(70, 142).percent, -1.4);
  });
  test("keys that mix: itself, its relative and the two neighbours on each side", () => {
    const aMinor = { tonic: 9, mode: "minor" as const };
    const list = mixesWith(aMinor);
    assert.deepEqual(list.map((k) => k.camelot), ["8A", "8B", "7A", "7B", "9A", "9B"]);
    assert.equal(list[0].fit, "same");
    assert.equal(list[1].fit, "relative");
  });
  test("pitch: 0 when the keys already share their notes, else the Studio's shift", () => {
    assert.equal(keyShift({ tonic: 9, mode: "minor" }, { tonic: 0, mode: "major" }), 0);
    assert.equal(keyShift({ tonic: 0, mode: "major" }, { tonic: 2, mode: "major" }), -2);
    assert.equal(signed(2), "+2");
    assert.equal(signed(-3), "−3");
    assert.equal(signed(0), "0");
  });
});
