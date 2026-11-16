// Drives the Studio and exports what it plays, for measuring.
//   cd web && BASE_URL=http://localhost:3100 OUT_DIR=/tmp node scripts/ai-drive.mjs steps.json [desktop|phone]
// Steps: {add:[tab,query]} {ai:true} {tab:"Style"} {switch:"regex"} {click:"selector"}
//        {export:"name"} {shot:"name"} {wait:ms} {text:"selector"} {keep:true}
//        {eval:"js"} (window.__remixt has the Studio's stores) {viewport:[390,844]}
import { chromium } from "playwright-core";
import fs from "node:fs";

const [, , stepsRaw = "[]", size = "desktop"] = process.argv;
const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = `${process.env.OUT_DIR ?? "/tmp"}/`;
const phone = size === "phone";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  else if (process.env.LOG && m.text().startsWith("[")) console.log(m.text());
});
page.on("crash", () => errors.push("PAGE CRASHED"));
page.on("close", () => errors.push("PAGE CLOSED"));
const note = (e, what) => errors.push(`${what}: ${String(e.message ?? e).split("\n")[0]}`);
await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 60_000 });
const producer = page.locator("text=Start in Producer");
if (await producer.count()) await producer.first().click();
await page.waitForTimeout(800);

for (const step of JSON.parse(stepsRaw.endsWith(".json") ? fs.readFileSync(stepsRaw, "utf8") : stepsRaw)) {
  try {
    if (step.add) {
      const [tab, query] = step.add;
      const showLib = page.getByRole("button", { name: /Show library/ });
      if (await showLib.count()) await showLib.first().click();
      await page.getByRole("tablist", { name: "What to add" }).locator("button", { hasText: new RegExp(`^${tab}$`) }).first().click();
      await page.getByLabel("Search stems").first().fill(query);
      await page.waitForTimeout(900);
      const btn = step.all ? page.getByRole("button", { name: /^Add every line of/ }) : page.getByRole("button", { name: /^Add .* to the mix$/ });
      await btn.first().click();
      await page.waitForTimeout(700);
    }
    if (step.ai) {
      await page.getByRole("button", { name: "AI producer" }).first().click();
      await page.locator("text=Make it sound good").first().waitFor({ timeout: 150_000 });
      await page.waitForTimeout(600);
    }
    if (step.tab) {
      await page.locator('nav[aria-label="AI producer sections"] button', { hasText: step.tab }).first().click();
      await page.waitForTimeout(500);
    }
    if (step.switch) {
      await page.getByRole("switch", { name: new RegExp(step.switch, "i") }).first().click();
      await page.waitForTimeout(step.settle ?? 2500);
    }
    if (step.click) {
      await page.locator(step.click).first().click();
      await page.waitForTimeout(step.settle ?? 600);
    }
    if (step.keep) {
      await page.getByRole("button", { name: /Keep it/ }).first().click();
      await page.waitForTimeout(500);
    }
    if (step.stop) {
      const pause = page.getByRole("button", { name: "Pause", exact: true });
      if (await pause.count()) await pause.first().click();
    }
    if (step.export) {
      await page.locator('button[title="Export the mix as an audio file"]').first().click();
      await page.locator("button", { hasText: "WAV · lossless" }).first().click();
      const auto = page.waitForEvent("download", { timeout: 200_000 }).catch(() => null);
      await page.locator("button", { hasText: "Export the whole mix" }).first().click();
      const dl = page.locator('[aria-label="Export"] button', { hasText: "Download" }).first();
      await dl.waitFor({ timeout: 180_000 });
      await page.waitForTimeout(400);
      const manual = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
      await dl.click();
      const download = await Promise.race([auto, manual]);
      await download.saveAs(`${out}${step.export}.wav`);
      await page.locator('[aria-label="Export"] button[aria-label="Close"]').first().click().catch(() => {});
      console.log(`exported ${step.export}.wav ${fs.statSync(`${out}${step.export}.wav`).size}`);
    }
    if (step.viewport) {
      // A phone's width for what's already set up (the phone's own page asks for other taps to get here).
      await page.setViewportSize({ width: step.viewport[0], height: step.viewport[1] });
      await page.waitForTimeout(600);
    }
    if (step.text) console.log(JSON.stringify((await page.locator(step.text).first().innerText()).slice(0, 6000)));
    if (step.eval) console.log(JSON.stringify(await page.evaluate(step.eval)));
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.shot) await page.screenshot({ path: `${out}${step.shot}.png`, fullPage: !!step.full });
  } catch (e) {
    note(e, JSON.stringify(step));
  }
}
console.log(JSON.stringify({ errors: [...new Set(errors)].slice(0, 12) }));
await browser.close();
