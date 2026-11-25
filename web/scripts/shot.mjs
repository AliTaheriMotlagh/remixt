// Screenshots of the running app, for checking a UI change without reading
// the code: `npm run shot -- <path> <out.png> [phone|tablet|desktop] [steps]`.
//
//   npm run shot -- /dj /tmp/dj.png phone
//   npm run shot -- /studio /tmp/s.png phone '[{"click":"text=Start in Producer"},{"wait":800},{"shot":"/tmp/s2.png"}]'
//
// Steps run in order: {"click": "<playwright selector>"}, {"tap": [x, y]},
// {"drag": [x1, y1, x2, y2]}, {"wait": ms},
// {"eval": "<js, result printed>"}, {"shot": "<file>", "full": true}. A full-
// page shot of the end state goes to <out.png>. Prints horizontal overflow
// and any page errors. Uses the installed Google Chrome; BASE_URL picks the
// server (default http://localhost:3000); COOKIE="remix_session=…" signs in.
import { chromium } from "playwright-core";

const [, , path = "/", out = "shot.png", size = "phone", stepsRaw = "[]"] = process.argv;
const phone = size !== "desktop";
// Landscape: a phone on its side (iPhone 14), an iPad on its side.
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "phone-landscape": { width: 844, height: 390 },
  tablet: { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
};
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({
  viewport: VIEWPORTS[size] ?? VIEWPORTS.phone,
  isMobile: phone,
  hasTouch: phone,
});
// Signed in: COOKIE="remix_session=…" (from /api/auth/login).
if (process.env.COOKIE) {
  const [name, ...value] = process.env.COOKIE.split("=");
  await page.context().addCookies([{ name, value: value.join("="), url: base }]);
}
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
for (const step of JSON.parse(stepsRaw)) {
  if (step.click) await page.locator(step.click).first().click({ timeout: 10_000 }).catch((e) => errors.push(`click ${step.click}: ${e.message.split("\n")[0]}`));
  if (step.tap) await page.mouse.click(step.tap[0], step.tap[1]);
  if (step.drag) {
    const [x1, y1, x2, y2] = step.drag;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
    await page.mouse.up();
  }
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.eval) console.log(JSON.stringify(await page.evaluate(step.eval)));
  if (step.shot) await page.screenshot({ path: step.shot, fullPage: !!step.full });
}
await page.screenshot({ path: out, fullPage: true });
// Against the set viewport: a too-wide page on a phone zooms out, and innerWidth grows with it.
const overflowX = await page.evaluate((vw) => document.documentElement.scrollWidth - vw, page.viewportSize()?.width ?? 0);
console.log(JSON.stringify({ out, overflowX, errors: [...new Set(errors)].slice(0, 10) }));
await browser.close();
