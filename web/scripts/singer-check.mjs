// Checks "Remove a singer…" in a real browser against the running app: a
// remix opens in the Studio, the vocal lane's dialog listens for voices,
// the last voice is taken out with "Cut that time out of the song", the
// song must get shorter by whole bars with faded clips — then Undo must
// bring every lane, clip and the length back. Also shoots the dialog on a
// phone (it's a bottom sheet there).
//   cd web && node scripts/singer-check.mjs <remix id>     (needs the app running; BASE_URL; OUT_DIR for the shots)
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT_DIR ?? "/tmp";
const remix = process.argv[2];
const log = (x) => console.log(JSON.stringify(x));
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });

const open = async (options) => {
  const page = await browser.newPage(options);
  page.on("pageerror", (e) => log({ pageerror: String(e).slice(0, 200) }));
  await page.goto(`${base}/studio?remix=${remix}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__remixt?.studio.getState().lanes.some((l) => l.kind === "vocals"), null, { timeout: 60_000 });
  await page.evaluate(() => window.__remixt.engine.ensureAllLoaded());
  await page.evaluate(() => {
    const s = window.__remixt.studio.getState();
    window.__remixt.view.getState().setRemoveSinger(s.lanes.find((l) => l.kind === "vocals").laneId);
  });
  await page.getByRole("dialog", { name: "Remove a singer" }).or(page.locator('[aria-label="Remove a singer"]')).first().waitFor({ timeout: 20_000 });
  return page;
};
const snapshot = (page) =>
  page.evaluate(() => {
    const s = window.__remixt.studio.getState();
    return {
      duration: Math.round(s.duration * 100) / 100,
      lanes: s.lanes.map((l) => ({ kind: l.kind, muted: l.muted, clips: (l.clips ?? []).length, clipSeconds: Math.round((l.clips ?? []).reduce((n, c) => n + (c.to - c.from), 0) * 10) / 10 })),
    };
  });

// A phone: the dialog as a bottom sheet (SKIP_PHONE=1 to leave it out).
if (!process.env.SKIP_PHONE) {
const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${out}/singer-phone.png` });
log({ step: "phone shot", file: `${out}/singer-phone.png` });
await phone.close();
}

if (process.env.LYRICS) {
  // A timed sheet whose headers name the singers, as on Genius: the dialog must offer each by name.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => log({ pageerror: String(e).slice(0, 200) }));
  await page.goto(`${base}/studio?remix=${remix}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__remixt?.studio.getState().lanes.some((l) => l.kind === "vocals"), null, { timeout: 60_000 });
  await page.evaluate(() => window.__remixt.engine.ensureAllLoaded());
  const stamp = (s) => `[${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.00]`;
  const text = [
    "[Verse 1: Hichkas]", ...[20, 26, 32, 38].map((t, i) => `${stamp(t)}first verse line ${i + 1}`),
    "[Chorus: Hichkas & Dorcci]", ...[50, 56].map((t, i) => `${stamp(t)}chorus line ${i + 1}`),
    "[Verse 2: Dorcci]", ...[100, 106, 112, 118].map((t, i) => `${stamp(t)}second verse line ${i + 1}`),
  ].join("\n");
  await page.evaluate((text) => {
    window.__remixt.lyrics.getState().create({ title: "Header check", artist: "", text, source: "own", aligned: true });
    const s = window.__remixt.studio.getState();
    window.__remixt.view.getState().setRemoveSinger(s.lanes.find((l) => l.kind === "vocals").laneId);
  }, text);
  await page.locator('[aria-label="Remove a singer"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const names = await page.locator('[aria-label="Remove a singer"] button[aria-pressed]').allInnerTexts();
  log({ step: "named singers", names: names.map((n) => n.replace(/\s+/g, " ")).filter((n) => /Hichkas|Dorcci/.test(n)) });
  await page.screenshot({ path: `${out}/singer-lyrics.png` });
  const before = await snapshot(page);
  await page.getByRole("button", { name: /^Dorcci/ }).click();
  await page.waitForTimeout(300);
  const shared = await page.getByText(/sung together with someone else/).count();
  const apply = page.getByRole("button", { name: /^Take out \d+ part/ });
  log({ step: "Dorcci picked", apply: await apply.innerText(), sharedWarning: shared > 0 });
  await apply.click();
  await page.waitForTimeout(1500);
  const after = await snapshot(page);
  const lines = await page.evaluate(() => { const l = window.__remixt.lyrics.getState(); return l.sheets.find((x) => x.id === l.activeId)?.text.split("\n").filter((x) => /line/.test(x)).length; });
  log({ step: "after (keep the music)", duration: after.duration, vocal: after.lanes[0], linesLeft: lines });
  await browser.close();
  const ok = names.some((n) => n.includes("Hichkas")) && names.some((n) => n.includes("Dorcci")) && after.duration === before.duration && after.lanes[0].clips > 0;
  console.log(ok ? "OK" : "FAIL");
  process.exit(ok ? 0 : 1);
}

const page = await open({ viewport: { width: 1440, height: 900 } });
const before = await snapshot(page);
log({ step: "before", ...before });
// It listens by itself as it opens.
await page.getByText(/voices heard|hears one voice|couldn't be heard/).first().waitFor({ timeout: 180_000 });
await page.getByRole("tab", { name: /By voice/ }).click();
const takeOut = page.getByRole("button", { name: "Take out", exact: true });
const voices = await takeOut.count();
log({ step: "voices", count: voices });
if (voices < 2 || process.env.POINT) {
  // Pointing out: play from a third in, hold the button for 3 s, then find the rest that sound like it.
  await page.getByRole("tab", { name: /Point out/ }).click();
  await page.evaluate(() => window.__remixt.engine.seek(window.__remixt.studio.getState().duration / 3));
  const hold = page.getByRole("button", { name: /Hold while they sing/ });
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(3000);
  await page.mouse.up();
  await page.getByRole("button", { name: /Find all their parts/ }).click();
  log({ step: "pointed out", note: await page.getByText(/Found \d+ phrase|No singing where you held/).first().innerText() });
  await page.evaluate(() => window.__remixt.engine.pause());
} else await takeOut.last().click();
await page.getByRole("radio", { name: /Cut that time out/ }).click();
const apply = page.getByRole("button", { name: /^Take out \d+ part/ });
log({ step: "apply", label: await apply.innerText() });
await apply.click();
await page.waitForTimeout(1500);
const cut = await snapshot(page);
const bpm = await page.evaluate(() => window.__remixt.studio.getState().projectBpm);
const bar = (60 / bpm) * 4;
const removed = before.duration - cut.duration;
log({ step: "after cut", ...cut, removedSeconds: Math.round(removed * 100) / 100, bars: Math.round((removed / bar) * 100) / 100 });

const undoButton = page.locator('button[aria-label="Undo"]:visible').first();
log({ step: "undo button", visible: await undoButton.count(), enabled: await undoButton.isEnabled().catch(() => null) });
if (await undoButton.isEnabled().catch(() => false)) await undoButton.click();
else await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
await page.waitForTimeout(1000);
const undone = await snapshot(page);
const same = JSON.stringify(undone) === JSON.stringify(before);
log({ step: "after undo", same, ...undone });
await browser.close();
const ok = removed > 0 && Math.abs(removed / bar - Math.round(removed / bar)) < 0.02 && same;
console.log(ok ? "OK" : "FAIL");
process.exit(ok ? 0 : 1);
