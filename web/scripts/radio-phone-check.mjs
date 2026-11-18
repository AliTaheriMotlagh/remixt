// The radio through a song change on a "phone" with its timers asleep (as
// with the screen locked): a station is made from the console API, its song
// on air set to end in 100 s, and one listener — dressed as an iPhone (one
// player: an element's volume can't be set) or an Android phone (two
// players crossfading by volume) — must go from one song to the next with
// no silence, driven by the elements' own events, while the page's timers
// fire at most once every SLEEP_MS.
//   cd web && OWNER_ID=<user id> PHONE=ios|android [ENGINE=webkit] node scripts/radio-phone-check.mjs
// ENGINE=webkit: the listener in Safari's engine (Playwright's WebKit) rather than Chrome.
// Needs the app running (BASE_URL) and the test database in Docker (remixt-test-pg).
import { chromium, devices, webkit } from "playwright-core";
import { SignJWT } from "jose";
import { execSync } from "node:child_process";
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const phone = process.env.PHONE ?? "ios";
const sleepMs = Number(process.env.SLEEP_MS ?? 10_000);
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const secret = process.env.SESSION_SECRET ?? env.SESSION_SECRET ?? "dev-only-secret-change-me";
const token = await new SignJWT({ userId: process.env.OWNER_ID }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
const log = (x) => console.log(JSON.stringify(x));

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const listener = process.env.ENGINE === "webkit" ? await webkit.launch() : browser;
const owner = await browser.newContext();
await owner.addCookies([{ name: "remix_session", value: token, url: base }]);
const call = async (method, path, data) => {
  const res = await owner.request.fetch(`${base}${path}`, { method, data, headers: { "Content-Type": "application/json" }, timeout: 120_000 });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${JSON.stringify(body)}`);
  return body;
};

const { slug } = await call("POST", "/api/radio", { name: `Phone FM ${Date.now() % 10000}`, tagline: "rig" });
const found = (await call("GET", `/api/radio/${slug}/search?q=`)).items.filter((i) => i.kind === "track");
for (const item of found.slice(0, 3)) await call("POST", `/api/radio/${slug}/console`, { action: "playlist-add", kind: item.kind, id: item.id });
await call("POST", `/api/radio/${slug}/console`, { action: "settings", settings: { voting: false, autoFill: false, requests: "off" } });
log({ step: "station", slug, phone, sleepMs });

const device = phone === "ios" ? devices["iPhone 13"] : devices["Pixel 7"];
const { defaultBrowserType: _, ...dressed } = device;
const ctx = await listener.newContext(dressed);
await ctx.addInitScript(
  ({ ios, sleepMs }) => {
    if (ios) {
      // iOS: an element's volume stays at 1 whatever a page sets.
      Object.defineProperty(HTMLMediaElement.prototype, "volume", { get: () => 1, set: () => {}, configurable: true });
    }
    // Timers asleep once window.__asleep is set: each fires at most once every sleepMs.
    const wrap = (fn) =>
      function (cb, ms, ...rest) {
        let last = 0;
        const gated = (...a) => {
          if (window.__asleep) {
            const t = performance.now();
            if (t - last < sleepMs) return;
            last = t;
          }
          return typeof cb === "function" ? cb(...a) : undefined;
        };
        return fn.call(window, gated, ms, ...rest);
      };
    window.setInterval = wrap(window.setInterval);
    // Who paused an element, for the log.
    window.__pauses = [];
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      window.__pauses.push(`${Math.round(performance.now() / 100) / 10}s ${new Error().stack.split("\n").slice(2, 5).map((l) => l.trim().replace(/\(.*\//, "(")).join(" < ")}`);
      return pause.call(this);
    };
    window.__timerTicks = 0;
  },
  { ios: phone === "ios", sleepMs }
);
const page = await ctx.newPage();
page.on("pageerror", (e) => log({ pageerror: e.message }));
await page.goto(`${base}/radio/${slug}`, { waitUntil: "load" });
await page.getByRole("button", { name: "Tune in" }).click({ timeout: 30_000 });
await page.waitForFunction(() => window.__remixtRadio?.heard(), null, { timeout: 120_000 });
log({ step: "tuned in", mode: await page.evaluate(() => window.__remixtRadio.playMode), players: await page.evaluate(() => window.__remixtRadio.players.length) });

// The song on air ends in 100 s; anything announced after it is withdrawn, so the next is picked ~10 s from now.
const st = `(SELECT id FROM radio_stations WHERE slug = '${slug}')`;
execSync(`docker exec remixt-test-pg psql -U postgres -d remixt -c "DELETE FROM radio_queue WHERE status = 'playing' AND starts_at > now() AND station_id = ${st}; UPDATE radio_queue SET ends_at = now() + interval '100 seconds' WHERE status = 'playing' AND station_id = ${st}"`);
await page.evaluate(() => (window.__asleep = true));

const samples = [];
let silent = 0;
let rows = new Set();
const until = Date.now() + 125_000;
while (Date.now() < until) {
  const s = await page.evaluate(() => {
    const r = window.__remixtRadio;
    const h = r?.heard(Date.now() + r.serverClock);
    const ps = (r?.players ?? []).map((p) => `${p.deck?.row.rowId ?? (p.silent ? "silence" : "-")}:${p.el.paused ? "paused" : "on"}`).join(",");
    return { row: h?.rowId ?? null, off: h?.offMs ?? null, playing: h?.playing ?? 0, ps, alert: document.querySelector(".text-danger")?.textContent ?? "" };
  });
  if (s.row === null) silent++;
  else rows.add(s.row);
  samples.push(s.row === null ? `silent(${s.ps}${s.alert ? `; ${s.alert}` : ""})` : `${s.row}×${s.playing}:${s.off}`);
  await page.waitForTimeout(500);
}
log({ step: "through the change, every 0.5 s (row×players sounding:ms off the station)", samples: samples.join(" ") });
log({ step: "pauses", pauses: await page.evaluate(() => window.__pauses.slice(-8)), button: await page.locator('section[aria-label="On air"] button').first().innerText() });
log({ step: "result", songsHeard: [...rows], silentSamples: silent, ok: rows.size >= 2 && silent <= 2 });

await call("DELETE", `/api/radio/${slug}`);
if (listener !== browser) await listener.close();
await browser.close();
