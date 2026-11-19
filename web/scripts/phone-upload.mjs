// A phone sending a song to the split queue, played in the installed Chrome
// against the running app: a phone's user agent (so the page takes the
// phone's path — the queue, the relay, small slices), an upload line held to
// a phone's speed, and whatever else a phone does to an upload — the line
// going dead for a while, the page reloading half-way. Prints one line of
// JSON: whether the song reached the queue, how long it took against what
// the line alone allows, and how it was cut up.
//
//   node scripts/phone-upload.mjs                       2 MB at 100 KB/s
//   MB=6 UP_KBPS=30 node scripts/phone-upload.mjs       a slow line (about 3½ minutes)
//   CUT=20 node scripts/phone-upload.mjs                the line dies for 20 s at 40%
//   RELOAD=1 node scripts/phone-upload.mjs              the page reloads at 50%: it must carry on, not start again
//   SHOT=/tmp/phone.png node scripts/phone-upload.mjs   and a picture of the page at the end
//
// BASE_URL picks the server (default http://localhost:3000). It signs in as
// sim-phone@test.local (made on first use) and takes its song back out of
// the queue afterwards. The unit-level version of this — every kind of bad
// line, in made-up time, in under a second — is tests/upload-sim.test.ts.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const megabytes = Number(process.env.MB ?? 2);
const upKbps = Number(process.env.UP_KBPS ?? 100);
const cutSeconds = Number(process.env.CUT ?? 0);
const reload = !!process.env.RELOAD;
const account = { email: "sim-phone@test.local", password: "sim-phone-password", artistName: "Sim Phone" };

const size = Math.round(megabytes * 1024 * 1024);
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "remixt-phone-")), `sim-song-${Date.now()}.mp3`);
fs.writeFileSync(file, randomBytes(size));

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

const json = { "Content-Type": "application/json" };
// Sign-up and log-in ask "are you a person?" (lib/captcha.ts): solved here, a fresh one per request.
const { createHash } = await import("node:crypto");
async function withCaptcha(data) {
  const c = await (await fetch(`${base}/api/captcha`)).json();
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash("sha256").update(c.salt + n).digest("hex") === c.challenge) return { ...data, captcha: Buffer.from(JSON.stringify({ ...c, number: n })).toString("base64") };
  }
  throw new Error("captcha: no answer found");
}
let signedIn = await context.request.post(`${base}/api/auth/login`, { headers: json, data: await withCaptcha(account) });
if (!signedIn.ok()) signedIn = await context.request.post(`${base}/api/auth/signup`, { headers: json, data: await withCaptcha(account) });
if (!signedIn.ok()) throw new Error(`Couldn't sign in as ${account.email}: HTTP ${signedIn.status()}`);

// What goes over the line: each slice, and how each request ended.
const slices = [];
let failedRequests = 0;
let queuedJob = null;
let jobs = 0;
page.on("requestfinished", async (request) => {
  const url = new URL(request.url());
  if (request.method() === "PUT" && url.searchParams.has("at")) {
    // The relay says how much it took (the browser doesn't say how big a body read from disk was).
    const taken = await (await request.response())?.json().catch(() => null);
    if (taken?.ok) slices.push({ at: Number(url.searchParams.get("at")), bytes: taken.bytes });
  }
  if (request.method() === "POST" && url.pathname === "/api/split-jobs") jobs++;
  if (request.method() === "POST" && url.pathname.endsWith("/queued")) {
    const response = await request.response();
    if (response?.ok()) queuedJob = url.pathname.split("/")[3];
  }
});
page.on("requestfailed", (request) => {
  if (request.url().includes("/api/split-jobs")) failedRequests++;
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const cdp = await context.newCDPSession(page);
const line = (offline) =>
  cdp.send("Network.emulateNetworkConditions", {
    offline,
    latency: 120,
    downloadThroughput: 4 * upKbps * 1024,
    uploadThroughput: upKbps * 1024,
  });

await page.goto(`${base}/upload`, { waitUntil: "networkidle" });
const queueMode = await page.getByText("split queue").first().isVisible().catch(() => false);
await page.locator('input[type="checkbox"]').first().check();
await line(false);
const startedAt = Date.now();
await page.locator('input[type="file"]').first().setInputFiles(file);

/** How far the page says the song has got (0–1), from its progress bar's label. */
const sentSoFar = () => slices.reduce((sum, s) => sum + s.bytes, 0) / size;
let cutDone = false;
let reloaded = 0;
const deadline = Date.now() + Math.max(120_000, (size / (upKbps * 1024)) * 4000 + cutSeconds * 2000 + 90_000);
while (!queuedJob && Date.now() < deadline) {
  await page.waitForTimeout(500);
  if (cutSeconds && !cutDone && sentSoFar() >= 0.4) {
    cutDone = true;
    await line(true);
    await page.waitForTimeout(cutSeconds * 1000);
    await line(false);
  }
  if (reload && !reloaded && sentSoFar() >= 0.5) {
    reloaded++;
    await page.reload({ waitUntil: "domcontentloaded" });
    await line(false);
  }
}
const seconds = (Date.now() - startedAt) / 1000;
await line(false).catch(() => {});
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

// Out of the queue again, so nothing is left behind for a helper to split.
if (queuedJob) await context.request.delete(`${base}/api/split-jobs/${queuedJob}`).catch(() => {});

const sizes = slices.map((s) => s.bytes).sort((a, b) => a - b);
const kb = (n) => Math.round(n / 1024);
const sent = sizes.reduce((a, b) => a + b, 0);
console.log(
  JSON.stringify({
    ok: !!queuedJob,
    queueMode,
    seconds: Math.round(seconds),
    lineAloneSeconds: Math.round(size / (upKbps * 1024)) + (cutDone ? cutSeconds : 0),
    songKB: kb(size),
    sentKB: kb(sent),
    sentTwiceKB: Math.max(0, kb(sent - size)),
    slices: sizes.length,
    sliceKB: sizes.length ? { smallest: kb(sizes[0]), middle: kb(sizes[sizes.length >> 1]), biggest: kb(sizes.at(-1)) } : null,
    jobsMade: jobs,
    failedRequests,
    reloaded,
    errors: [...new Set(errors)].slice(0, 5),
  })
);
await browser.close();
fs.rmSync(path.dirname(file), { recursive: true, force: true });
process.exit(queuedJob ? 0 : 1);
