// How long the heavy work takes, and how much memory the page holds, on a
// phone-sized Chrome slowed down like a phone — for the "works here / slow
// on phones / computer only" labels (lib/client/deviceFeatures.ts).
//
//   cd web && node scripts/phone-measure.mjs [cpu-slowdown=4] [phone|desktop]
//   NEWSONG=3 (or 4): that many whole songs, and "A new song from everything" instead of Make it sound good.
//
// Needs the app running (BASE_URL, default http://localhost:3000) with the
// test songs in its library. Memory is the page's renderer process (RSS),
// which holds the decoded audio too — not just the JS heap. An emulated
// phone is not a phone: iOS's memory limit and its stopping the page on
// lock can only be checked on one (see PLAN.md, phase 3).
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const slow = Number(process.argv[2] ?? 4);
const size = process.argv[3] ?? "phone";
const phone = size === "phone";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ...(phone ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36" } : {}),
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("crash", () => errors.push("PAGE CRASHED"));
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow });

/** The biggest renderer process of this browser, in MB (the page's). */
function rendererMb() {
  try {
    const rows = execSync("ps -axo pid=,ppid=,rss=,command=", { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n");
    const procs = rows.map((r) => r.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
    const root = browser.process?.()?.pid;
    const mine = new Set(root ? [root] : []);
    for (let grew = true; grew; ) {
      grew = false;
      for (const p of procs) if (mine.has(p.ppid) && !mine.has(p.pid)) mine.add(p.pid), (grew = true);
    }
    const renderers = procs.filter((p) => (!root || mine.has(p.pid)) && p.cmd.includes("--type=renderer"));
    return Math.round(Math.max(0, ...renderers.map((p) => p.rss)) / 1024);
  } catch {
    return null;
  }
}

let peak = 0;
const sampler = setInterval(() => {
  const mb = rendererMb();
  if (mb) peak = Math.max(peak, mb);
}, 500);
const results = [];
async function measure(name, run) {
  peak = rendererMb() ?? 0;
  const t = Date.now();
  try {
    await run();
    results.push({ name, seconds: Math.round((Date.now() - t) / 100) / 10, peakMb: peak, ok: true });
  } catch (e) {
    results.push({ name, seconds: Math.round((Date.now() - t) / 100) / 10, peakMb: peak, ok: false, why: String(e.message ?? e).split("\n")[0] });
  }
  console.log(JSON.stringify(results[results.length - 1]));
}

await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 120_000 });
const producer = page.locator("text=Start in Producer");
if (await producer.count()) await producer.first().click();
// The library panel is easiest to reach wide: add the songs, then go back to a phone's width.
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);
async function add(tab, query) {
  const showLib = page.getByRole("button", { name: /Show library/ });
  if (await showLib.count()) await showLib.first().click();
  await page.getByRole("tablist", { name: "What to add" }).locator("button", { hasText: new RegExp(`^${tab}$`) }).first().click();
  await page.getByLabel("Search stems").first().fill(query);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Add .* to the mix$/ }).first().click();
}
const newSong = Number(process.env.NEWSONG ?? 0);
const songs = ["Ye Rooze Khoob", "Kid Cudi", "Tofanag", "Tehran Gonahkar"].slice(0, newSong);
await measure(newSong ? `load ${newSong} whole songs` : "load two songs", async () => {
  if (newSong) {
    for (const song of songs) {
      await add("Vocals", song);
      await add("Beats", song);
    }
  } else {
    await add("Vocals", "Ye Rooze Khoob");
    await add("Beats", "Kid Cudi");
  }
  const lanes = newSong ? newSong * 2 : 2;
  await page.waitForFunction((n) => window.__remixt?.studio.getState().lanes.length === n, lanes, { timeout: 120_000 });
});
if (phone) await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);

await measure("first play (time to sound)", async () => {
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.waitForFunction(() => window.__remixt.studio.getState().isPlaying, null, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
});

await measure("AI producer: hearing the songs (prepareSession)", async () => {
  await page.getByRole("button", { name: "AI producer" }).first().click();
  await page.locator("text=Make it sound good").first().waitFor({ timeout: 600_000 });
});

if (newSong)
  await measure(`A new song from everything (${newSong} songs)`, async () => {
    await page.locator('nav[aria-label="AI producer sections"] button', { hasText: "Mashup" }).first().click();
    await page.getByRole("switch", { name: /^A new song from everything/i }).first().click();
    await page.waitForFunction(() => window.__remixt.aiTrial.getState().trial?.ideas.some((i) => i.id === "new-song"), null, { timeout: 600_000 });
  });
else await measure("Make it sound good + Pro mix", async () => {
  await page.getByRole("switch", { name: /^Make it sound good/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Keep it/ }).first().waitFor({ timeout: 600_000 });
});

await measure("Export the whole mix (WAV)", async () => {
  await page.getByRole("button", { name: /Keep it/ }).first().click().catch(() => {});
  await page.keyboard.press("Escape");
  const exportButton = page.locator('button[title="Export the mix as an audio file"]:visible');
  if (!(await exportButton.count())) await page.getByRole("button", { name: "More controls" }).first().click();
  await page.locator('button[title="Export the mix as an audio file"]:visible').first().click();
  await page.locator("button", { hasText: "WAV · lossless" }).first().click();
  await page.locator("button", { hasText: "Export the whole mix" }).first().click();
  await page.locator('[aria-label="Export"] button', { hasText: /Download|Save/ }).first().waitFor({ timeout: 600_000 });
});

clearInterval(sampler);
console.log(JSON.stringify({ slow, size, results, errors: [...new Set(errors)].slice(0, 6) }, null, 1));
await browser.close();
