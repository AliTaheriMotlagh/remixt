// Checks the DJ decks with real library songs: /dj opens on two library
// songs, SYNC holds the beats together for minutes (drift measured from the
// engine's own positions), the Auto DJ loads and mixes the next song, and a
// recorded set comes out as an MP3 with its track list.
//   cd web && node scripts/dj-check.mjs [minutes=3]      (needs the app running; BASE_URL)
import { chromium } from "playwright-core";
import fs from "node:fs";

const minutes = Number(process.argv[2] ?? 3);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT_DIR ?? "/tmp";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const log = (x) => console.log(JSON.stringify(x));

await page.goto(`${base}/dj`, { waitUntil: "load", timeout: 120_000 });
const t0 = Date.now();
await page.waitForFunction(() => window.__remixtDj?.deckTrack("A") && window.__remixtDj?.deckTrack("B"), null, { timeout: 240_000 });
const decks = await page.evaluate(() => ["A", "B"].map((id) => { const t = window.__remixtDj.deckTrack(id).info; return { id, title: t.title, source: t.source, bpm: t.bpm, key: t.camelot }; }));
log({ step: "opened on", seconds: (Date.now() - t0) / 1000, decks });
await page.screenshot({ path: `${out}/dj-open.png` });
// Full-length songs for the drift check (LOAD_A / LOAD_B: library track ids; default two from the test library).
const loadA = process.env.LOAD_A ?? "1d866c26-b5d3-417e-8a7f-4910bd494ca6";
const loadB = process.env.LOAD_B ?? "d5efae30-f1c4-42c1-bfa5-2cd29af17595";
await page.evaluate(async ([a, b]) => { await window.__remixtDjLoad("A", `lib:${a}`); await window.__remixtDjLoad("B", `lib:${b}`); }, [loadA, loadB]);
log({ step: "loaded", decks: await page.evaluate(() => ["A", "B"].map((id) => { const t = window.__remixtDj.deckTrack(id).info; return `${t.title} ${t.bpm} BPM ${t.camelot}`; })) });

// Both playing, B synced to A: how far apart do the beats drift?
await page.mouse.click(5, 5);
await page.evaluate(() => {
  const e = window.__remixtDj;
  e.unlock();
  e.play("A");
  e.sync("B");
  e.play("B");
  e.sync("B");
});
const phase = () =>
  page.evaluate(() => {
    const s = window.__remixtDj.snapshot();
    const beat = (d) => ((d.position - d.track.firstBeat) * d.track.bpm) / 60;
    const a = beat(s.decks.A);
    const b = beat(s.decks.B);
    let diff = (b - a) % 1;
    if (diff > 0.5) diff -= 1;
    if (diff < -0.5) diff += 1;
    const period = 60 / (s.decks.A.track.bpm * s.decks.A.rate);
    return { ms: diff * period * 1000, playing: s.decks.A.playing && s.decks.B.playing };
  });
const samples = [];
const end = Date.now() + minutes * 60_000;
await page.waitForTimeout(1500);
const first = await phase();
while (Date.now() < end) {
  await page.waitForTimeout(5000);
  const p = await phase();
  if (!p.playing) break;
  samples.push(p.ms - first.ms);
}
const drift = samples.length ? Math.max(...samples.map(Math.abs)) : null;
log({ step: "sync drift", minutes: samples.length * 5 / 60, startOffsetMs: Math.round(first.ms), maxDriftMs: drift && Math.round(drift * 10) / 10, lastDriftMs: samples.length ? Math.round(samples[samples.length - 1] * 10) / 10 : null });

// Record, Auto DJ on, a transition (Auto-mix now rather than waiting for the song's end), stop, save MP3.
await page.evaluate(() => { const e = window.__remixtDj; e.pause("B"); e.seek("B", 0); e.setCrossfader(-1); });
await page.getByRole("button", { name: "Record my mix" }).click();
await page.getByRole("switch", { name: /Auto DJ/ }).click();
await page.waitForTimeout(2000);
log({ step: "auto dj", note: await page.locator('section[aria-label="Auto-mix"]').innerText().then((t) => t.split("\n").slice(0, 4)) });
// A is near its end after the drift check: the Auto DJ starts the transition itself.
await page.waitForFunction(() => { const s = window.__remixtDj.snapshot(); return !s.decks.A.playing && s.decks.B.playing; }, null, { timeout: 180_000 });
log({ step: "auto-mix done", note: await page.locator('section[aria-label="Auto-mix"]').innerText().then((t) => t.split("\n").slice(0, 3)) });
// The Auto DJ puts the next song on the free deck.
await page.waitForTimeout(25000);
log({ step: "next on deck A", title: await page.evaluate(() => window.__remixtDj.deckTrack("A")?.info.title) });
await page.getByRole("button", { name: /STOP/ }).click();
await page.waitForTimeout(1000);
log({ step: "set list", list: await page.locator('section[aria-label="Mixer"] ol').first().innerText().catch(() => null) });
const dl = page.waitForEvent("download", { timeout: 180_000 });
await page.getByRole("button", { name: /Save as MP3/ }).click();
const file = await dl;
await file.saveAs(`${out}/dj-set.mp3`);
log({ step: "mp3", bytes: fs.statSync(`${out}/dj-set.mp3`).size });
await page.screenshot({ path: `${out}/dj-after.png` });
log({ errors: [...new Set(errors)].slice(0, 8) });
await browser.close();
