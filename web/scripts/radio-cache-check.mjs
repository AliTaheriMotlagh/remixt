// Checks the radio's kept mixes against the running app: tune in to a
// station, wait for what's on air to be kept on the device (radioCache.ts),
// leave, come back in the same browser — the song must now play from the
// kept file (no mixing) and still be on the station's clock.
//   cd web && node scripts/radio-cache-check.mjs [slug]     (needs the app running; BASE_URL; default the house station)
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const slug = process.argv[2] ?? "remixt-radio";
const log = (x) => console.log(JSON.stringify(x));

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  // Every mix this tab makes (anything over 5 s of audio), for the check to count.
  window.__mixes = [];
  const render = OfflineAudioContext.prototype.startRendering;
  OfflineAudioContext.prototype.startRendering = function () {
    const seconds = this.length / this.sampleRate;
    if (seconds > 5) window.__mixes.push(Math.round(seconds));
    return render.call(this);
  };
});

const kept = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("remixt-cache");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("meta")) return resolve([]);
          const all = db.transaction("meta").objectStore("meta").index("kind").getAll("radio");
          all.onsuccess = () => resolve(all.result.map((m) => Math.round(m.bytes / 1e6) + " MB"));
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      })
  );

const visit = async (label) => {
  const page = await context.newPage();
  await page.goto(`${base}/radio/${slug}`, { waitUntil: "load" });
  const title = await page.locator('section[aria-label="On air"] h1').innerText({ timeout: 30_000 }).catch(() => "?");
  const at = Date.now();
  await page.getByRole("button", { name: "Tune in" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pause" }).waitFor({ timeout: 180_000 });
  await page.waitForFunction(() => window.__remixtRadio?.heard(), null, { timeout: 180_000 });
  const firstSound = (Date.now() - at) / 1000;
  await page.waitForTimeout(3000);
  const heard = await page.evaluate(() => window.__remixtRadio.heard(Date.now() + window.__remixtRadio.serverClock));
  log({ visit: label, onAir: title, firstSoundSeconds: firstSound, offStationMs: heard?.offMs, songSecond: Math.round(heard?.at ?? -1), mixesMade: await page.evaluate(() => window.__mixes) });
  return page;
};

const first = await visit("first");
// The song was joined part way: its whole mix is made once the mixer is free.
let saved = [];
for (let i = 0; i < 60 && saved.length === 0; i++) {
  await first.waitForTimeout(2000);
  saved = await kept(first);
}
log({ step: "kept on the device", entries: saved, mixesMade: await first.evaluate(() => window.__mixes) });
await first.close();

const again = await visit("again");
await again.close();
await browser.close();
if (saved.length === 0) {
  console.log("FAIL: nothing was kept");
  process.exit(1);
}
