// Plays stems one after another on the Library page (or the Upload page's
// "your uploads" with PAGE=/upload), in the installed Chrome as a phone,
// and reports for each whether sound actually ran: the bug this guards
// against is "play stops working after a few".
//
//   node scripts/preview-play.mjs            the first 8 play buttons on /library
//   COUNT=15 AGAIN=1 node scripts/preview-play.mjs   …and then the first ones again (kept copies)
//
//   ENGINE=webkit node scripts/preview-play.mjs     in Safari's engine (once: npx playwright-core install webkit)
//
// BASE_URL picks the server; COOKIE="remix_session=…" signs in (the Upload page needs it).
import { chromium, webkit } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const path = process.env.PAGE ?? "/library";
const count = Number(process.env.COUNT ?? 8);
const browser =
  process.env.ENGINE === "webkit"
    ? await webkit.launch()
    : await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
if (process.env.COOKIE) {
  const [name, ...value] = process.env.COOKIE.split("=");
  await context.addCookies([{ name, value: value.join("="), url: base }]);
}
const page = await context.newPage();
// The player's <audio> isn't in the page: catch it as it's made.
await page.addInitScript(() => {
  window.__audios = [];
  const Real = window.Audio;
  window.Audio = function (...args) {
    const audio = new Real(...args);
    window.__audios.push(audio);
    return audio;
  };
  window.Audio.prototype = Real.prototype;
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}${path}`, { waitUntil: "networkidle" });

const buttons = page.locator('button[aria-label^="Play"]');
const total = Math.min(count, await buttons.count());
const order = [...Array(total).keys()];
if (process.env.AGAIN) order.push(...order.slice(0, Math.min(4, total)));
const results = [];
for (const i of order) {
  // Whatever is playing shows "Pause": the i-th stem is the i-th button either way.
  const button = page.locator('button[aria-label^="Play"], button[aria-label^="Pause"], button[aria-label^="Loading"]').nth(i);
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click({ timeout: 5000 }).catch((e) => errors.push(`tap ${i}: ${e.message.split("\n")[0]}`));
  let heard = 0;
  for (let waited = 0; waited < 8000 && heard < 0.5; waited += 250) {
    await page.waitForTimeout(250);
    heard = await page.evaluate(() => Math.max(0, ...window.__audios.map((a) => (a.paused ? 0 : a.currentTime))));
  }
  results.push(heard >= 0.5);
}
const failed = results.map((ok, n) => (ok ? null : n + 1)).filter(Boolean);
console.log(JSON.stringify({ ok: failed.length === 0 && total > 0, played: results.length, silent: failed, errors: [...new Set(errors)].slice(0, 5) }));
await browser.close();
process.exit(failed.length === 0 && total > 0 ? 0 : 1);
