// Opens every page of the running app on a phone and a computer and
// reports what's plainly wrong: an error status, page or console errors,
// sideways scrolling, broken pictures, "NaN"/"undefined"/"Infinity" on
// screen, and buttons with no name. A screenshot of each lands in OUT_DIR.
//   cd web && node scripts/page-audit.mjs            (needs the app running; BASE_URL; COOKIE="remix_session=…" to sign in)
//   PAGES=/radio,/dj node scripts/page-audit.mjs      (just those)
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT_DIR ?? "/tmp/page-audit";
fs.mkdirSync(out, { recursive: true });
const ids = { remix: process.env.REMIX_ID, artist: process.env.ARTIST_ID, live: process.env.LIVE_ID };
const pages = (
  process.env.PAGES?.split(",") ?? [
    "/", "/studio", "/library", "/upload", "/remixes", ids.remix && `/remixes/${ids.remix}`, ids.remix && `/embed/${ids.remix}`,
    ids.artist && `/artist/${ids.artist}`, "/dj", "/radio", "/radio/remixt-radio", "/radio/remixt-radio/embed", "/radio/remixt-radio/broadcast",
    "/live", "/live/new", ids.live && `/live/${ids.live}`, "/challenges", "/leaderboard", "/notifications", "/examples",
    "/login", "/signup", "/storage", "/takedown", "/earnings", "/tools", "/fa/tools", "/admin", "/no-such-page",
  ]
).filter(Boolean);

const browser = await chromium.launch({ channel: "chrome" });
const sizes = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1440, height: 900 } } };
const results = [];
for (const [size, options] of Object.entries(sizes)) {
  const context = await browser.newContext(options);
  if (process.env.COOKIE) {
    const [name, ...value] = process.env.COOKIE.split("=");
    await context.addCookies([{ name, value: value.join("="), url: base }]);
  }
  for (const path of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    page.on("console", (m) => m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text()) && errors.push(m.text().slice(0, 160)));
    let status = 0;
    try {
      const res = await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 60_000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(2500);
    } catch (e) {
      errors.push(`load: ${String(e).slice(0, 120)}`);
    }
    const found = await page
      .evaluate(() => {
        const text = document.body?.innerText ?? "";
        const bad = [...new Set(text.match(/\b(NaN|undefined|Infinity|\[object Object\])\b/g) ?? [])];
        const wide = document.documentElement.scrollWidth - window.innerWidth;
        const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.slice(-60));
        const unnamed = [...document.querySelectorAll("button, a[href]")].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !(b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title") || b.querySelector("img[alt]:not([alt=''])"));
        }).length;
        return { bad, wide, brokenImages, unnamed, title: document.title };
      })
      .catch(() => ({ bad: [], wide: 0, brokenImages: [], unnamed: 0, title: "?" }));
    const file = `${out}/${size}${path.replace(/[^a-z0-9]+/gi, "_")}.png`;
    await page.screenshot({ path: file }).catch(() => {});
    const problems = [
      status >= 400 && path !== "/no-such-page" && `status ${status}`,
      found.wide > 1 && `scrolls sideways by ${found.wide}px`,
      found.bad.length && `shows ${found.bad.join(", ")}`,
      found.brokenImages.length && `broken images: ${found.brokenImages.join(" ")}`,
      found.unnamed && `${found.unnamed} buttons/links with no name`,
      ...errors.slice(0, 4),
    ].filter(Boolean);
    results.push({ size, path, status, ok: problems.length === 0, problems });
    console.log(`${problems.length ? "✗" : "✓"} ${size.padEnd(7)} ${path.padEnd(36)} ${status} ${problems.join(" | ")}`);
    await page.close();
  }
  await context.close();
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
