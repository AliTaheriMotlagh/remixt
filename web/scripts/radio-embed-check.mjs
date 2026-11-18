// The radio embed as a game or app would use it: framed with ?autoplay=1,
// it should start by itself, tell the host what's on, and obey pause/play.
//   cd web && node scripts/radio-embed-check.mjs [slug]   (needs the app running; BASE_URL)
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const slug = process.argv[2] ?? "remixt-radio";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto(`${base}/api/version`);
await page.setContent(`<iframe id="r" src="${base}/radio/${slug}/embed?autoplay=1" width="600" height="170" allow="autoplay"></iframe>
<script>window.got = []; addEventListener("message", (e) => e.data?.type === "remixt-radio:state" && got.push(e.data));</script>`);
const last = () => page.evaluate(() => window.got[window.got.length - 1] ?? null);
await page.waitForFunction(() => window.got.some((m) => m.playing), null, { timeout: 120_000 });
const on = await last();
console.log(JSON.stringify({ step: "autoplay", playing: on.playing, now: on.now?.title, next: on.next?.title ?? null, messages: await page.evaluate(() => window.got.length) }));
await page.evaluate(() => document.getElementById("r").contentWindow.postMessage({ type: "remixt-radio", action: "pause" }, "*"));
await page.waitForFunction(() => window.got[window.got.length - 1]?.playing === false, null, { timeout: 20_000 });
await page.waitForTimeout(3000);
console.log(JSON.stringify({ step: "paused by the host, and stays paused", playing: (await last()).playing }));
await page.evaluate(() => document.getElementById("r").contentWindow.postMessage({ type: "remixt-radio", action: "play" }, "*"));
await page.waitForFunction(() => window.got[window.got.length - 1]?.playing === true, null, { timeout: 120_000 });
console.log(JSON.stringify({ step: "played by the host", playing: (await last()).playing }));
await browser.close();
