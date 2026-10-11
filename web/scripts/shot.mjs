// Screenshots of the running app, for checking a UI change without reading
// the code: `npm run shot -- <path> <out.png> [phone|desktop] [steps]`.
//
//   npm run shot -- /dj /tmp/dj.png phone
//   npm run shot -- /studio /tmp/s.png phone '[{"click":"text=Start in Producer"},{"wait":800},{"shot":"/tmp/s2.png"}]'
//
// Steps run in order: {"click": "<playwright selector>"}, {"wait": ms},
// {"eval": "<js, result printed>"}, {"shot": "<file>", "full": true}. A full-
// page shot of the end state goes to <out.png>. Prints horizontal overflow
// and any page errors. Uses the installed Google Chrome; BASE_URL picks the
// server (default http://localhost:3000).
import { chromium } from "playwright-core";

const [, , path = "/", out = "shot.png", size = "phone", stepsRaw = "[]"] = process.argv;
const phone = size !== "desktop";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  isMobile: phone,
  hasTouch: phone,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
for (const step of JSON.parse(stepsRaw)) {
  if (step.click) await page.locator(step.click).first().click({ timeout: 10_000 }).catch((e) => errors.push(`click ${step.click}: ${e.message.split("\n")[0]}`));
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.eval) console.log(JSON.stringify(await page.evaluate(step.eval)));
  if (step.shot) await page.screenshot({ path: step.shot, fullPage: !!step.full });
}
await page.screenshot({ path: out, fullPage: true });
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(JSON.stringify({ out, overflowX, errors: [...new Set(errors)].slice(0, 10) }));
await browser.close();
