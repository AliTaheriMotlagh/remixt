// Plays a heavy Studio session in the installed Chrome and reports how it
// went: how long until the mix is heard, whether it kept playing, the audio
// thread's load and the page's memory. Adds every line of the first few
// songs in the library (`SONGS`, default 6), so a session of 15–30 lanes.
//
//   node scripts/heavy-play.mjs            (BASE_URL picks the server)
//   SONGS=10 node scripts/heavy-play.mjs
//   FIT=1 PHONE=1 node scripts/heavy-play.mjs   (every lane stretched to one tempo; phone limits)
//   FIT=1 RETEMPO=10 node scripts/heavy-play.mjs (and to another tempo 10 s in, while it plays)
//   PROFILE_DIR=/tmp/p FIT=1 node scripts/heavy-play.mjs, twice   (the second plays from the first's cache)
//   FIT=1 SEEK=6 node scripts/heavy-play.mjs     (a minute ahead, 6 s in)
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const songs = Number(process.env.SONGS ?? 6);
const args = ["--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info"];
const phone = !!process.env.PHONE;
// A phone's user agent is what puts the engine on its tighter memory limits (see device.ts).
const options = phone
  ? { viewport: { width: 1180, height: 820 }, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: true }
  : { viewport: { width: 1440, height: 900 } };
// PROFILE_DIR=<dir>: a browser profile kept between runs, so a second run plays from what the first kept on disk.
const browser = process.env.PROFILE_DIR
  ? await chromium.launchPersistentContext(process.env.PROFILE_DIR, { channel: "chrome", args, ...options })
  : await chromium.launch({ channel: "chrome", args });
const page = process.env.PROFILE_DIR ? browser.pages()[0] ?? (await browser.newPage()) : await browser.newPage(options);
// Taps what reaches the speakers, and counts the sources playing, so a gap
// (a lane waiting on its audio, a stand-in running out) shows up in numbers.
await page.addInitScript(() => {
  const w = window;
  w.__taps = [];
  w.__playing = 0;
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target === this.context.destination && !this.__tap && this.context instanceof AudioContext) {
      const tap = this.context.createAnalyser();
      tap.__tap = true;
      tap.fftSize = 2048;
      connect.call(this, tap);
      w.__taps.push(tap);
    }
    return connect.call(this, target, ...rest);
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, offset, duration) {
    const ctx = this.context;
    if (ctx instanceof AudioContext && this.buffer && this.buffer.length > 1) {
      const begin = Math.max(when, ctx.currentTime);
      const end = begin + (duration ?? this.buffer.duration - (offset ?? 0));
      this.__span = [begin, end];
      (w.__spans ??= []).push(this.__span);
    }
    return start.call(this, when, offset, duration);
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (when = 0) {
    if (this.__span) this.__span[1] = Math.min(this.__span[1], Math.max(when, this.context.currentTime));
    return stop.call(this, when);
  };
  w.__level = () => {
    let peak = 0;
    const data = new Float32Array(2048);
    for (const tap of w.__taps) {
      tap.getFloatTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v));
    }
    return peak;
  };
  // Sources sounding at the audio clock's now (stopped early ones still count: it's an upper bound).
  w.__sounding = () => {
    const ctx = w.__taps[0]?.context;
    if (!ctx) return 0;
    const t = ctx.currentTime;
    return (w.__spans ?? []).filter(([a, b]) => a <= t && b > t).length;
  };
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => (m.type() === "error" ? errors.push(m.text()) : process.env.LOG && m.text().startsWith("[") && console.log(m.text())));
page.on("crash", () => errors.push("PAGE CRASHED"));

await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 60_000 });
// A profile kept from a run before offers that run's mix back: it's the one played again.
const restore = page.getByRole("button", { name: "Restore it" });
let count = 0;
if (await restore.count()) {
  await restore.click();
  await page.waitForTimeout(800);
} else {
  const producer = page.locator("text=Start in Producer");
  if (await producer.count()) await producer.first().click();
  await page.waitForTimeout(800);
  const add = page.locator("button", { hasText: "All lines" });
  count = Math.min(songs, await add.count());
  for (let i = 0; i < count; i++) {
    await add.nth(i).click();
    await page.waitForTimeout(300);
  }
}
/** Every lane stretched to `bpm`: each one is rendered at that speed. */
async function fitTo(bpm) {
  await page.locator("button", { hasText: "BPM" }).first().click();
  await page.locator("input[type=number]").first().fill(String(bpm));
  await page.locator("button", { hasText: "Fit every lane" }).first().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}
if (process.env.FIT && count) await fitTo(process.env.FIT === "1" ? 100 : process.env.FIT);
const play = page.getByRole("button", { name: "Play", exact: true }).first();
const t0 = Date.now();
await play.click();
let heardAfter = null;
for (let i = 0; i < Number(process.env.WAIT_S ?? 60) * 4 && heardAfter === null; i++) {
  await page.waitForTimeout(250);
  if (await page.getByRole("button", { name: "Pause", exact: true }).count()) heardAfter = Date.now() - t0;
}
// PROFILE=<seconds into playback>: a CPU profile of the page for ten seconds from then, its busiest functions printed.
const profileAt = process.env.PROFILE ? Number(process.env.PROFILE) * 4 : -1;
const cdp = profileAt >= 0 ? await page.context().newCDPSession(page) : null;
// Let it play, sampling the level and the sources sounding four times a second.
const samples = [];
// RETEMPO=<seconds into playback>: every lane fitted to another tempo while it plays (as trying an AI idea does).
const retempoAt = process.env.RETEMPO ? Number(process.env.RETEMPO) * 4 : -1;
for (let i = 0; i < Number(process.env.LISTEN_S ?? 30) * 4; i++) {
  if (i === retempoAt) await fitTo(112);
  // SEEK=<seconds into playback>: jumps ahead a minute (→ twelve times), as far as the stand-ins have to start again.
  if (i === (process.env.SEEK ? Number(process.env.SEEK) * 4 : -1)) {
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    for (let k = 0; k < 12; k++) await page.keyboard.press("ArrowRight");
  }
  if (i === profileAt) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  if (cdp && i === profileAt + 40) {
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map();
    const dt = (profile.endTime - profile.startTime) / profile.samples.length / 1000;
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    for (const id of profile.samples) {
      const f = byId.get(id).callFrame;
      const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + dt);
    }
    console.log("[profile] busiest (ms of 10 s):");
    for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`[profile] ${Math.round(v)} ${k}`);
    // Components (capitalised functions), by time spent in them and what they call.
    const hits = new Map(profile.nodes.map((n) => [n.id, 0]));
    for (const id of profile.samples) hits.set(id, hits.get(id) + 1);
    const total = (n) => (n.total ??= hits.get(n.id) + (n.children ?? []).reduce((sum, c) => sum + total(byId.get(c)), 0));
    const inclusive = new Map();
    const walk = (n, seen) => {
      const name = n.callFrame.functionName;
      const isComponent = /^[A-Z]/.test(name) && !seen.has(name);
      if (isComponent) inclusive.set(name, (inclusive.get(name) ?? 0) + total(n) * dt);
      const next = isComponent ? new Set([...seen, name]) : seen;
      for (const c of n.children ?? []) walk(byId.get(c), next);
    };
    walk(profile.nodes[0], new Set());
    console.log("[profile] components:");
    for (const [k, v] of [...inclusive].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`[profile] ${Math.round(v)} ${k}`);
  }
  samples.push(await page.evaluate(() => [window.__level(), window.__sounding(), performance.memory ? Math.round(performance.memory.usedJSHeapSize / 2 ** 20) : 0]));
  await page.waitForTimeout(250);
}
const silent = samples.filter(([level]) => level < 0.002).length;
const sounding = samples.map(([, n]) => n);
const memory = await page.evaluate(() => {
  const m = performance.memory;
  return m ? Math.round(m.usedJSHeapSize / 2 ** 20) : null;
});
console.log(
  JSON.stringify(
    {
      songs: count,
      heardAfterMs: heardAfter,
      stillPlaying: !!(await page.getByRole("button", { name: "Pause", exact: true }).count()),
      silentSamples: `${silent} of ${samples.length}`,
      sourcesSounding: { min: Math.min(...sounding), max: Math.max(...sounding), byFiveSeconds: sounding.filter((_, i) => i % 20 === 0) },
      heapMb: { end: memory, peak: Math.max(...samples.map(([, , mb]) => mb)) },
      errors: [...new Set(errors)].slice(0, 10),
    },
    null,
    1
  )
);
await page.screenshot({ path: process.env.OUT ?? "/tmp/heavy-play.png" });
await browser.close();
