// The radio's words in a real browser: the line sung on the lock screen
// (Media Session), "Wrong words?" — pick another sheet for this device,
// nudge it, show none, back to the found words — and the owner's choice
// for everyone (api/lyrics/choice), seen by a guest.
//   cd web && OWNER_ID=<user id of the songs' owner> node scripts/radio-words-check.mjs [slug]
// Needs the app running (BASE_URL); default the house station.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const slug = process.argv[2] ?? "remixt-radio";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const secret = process.env.SESSION_SECRET ?? env.SESSION_SECRET ?? "dev-only-secret-change-me";
const token = await new SignJWT({ userId: process.env.OWNER_ID }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
const log = (x) => console.log(JSON.stringify(x));
const fails = [];
const check = (name, ok, extra = {}) => {
  log({ check: name, ok, ...extra });
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await guest.newPage();
page.on("pageerror", (e) => log({ pageerror: String(e).slice(0, 200) }));
await page.goto(`${base}/radio/${slug}`, { waitUntil: "load" });
const card = page.locator('[aria-label="Lyrics"]');
await card.waitFor();
await page.waitForFunction(() => !/Finding the words/.test(document.querySelector('[aria-label="Lyrics"]')?.textContent ?? ""), null, { timeout: 60_000 });
const onAir = await page.locator('section[aria-label="On air"] h1').innerText();
log({ step: "on air", onAir, lyrics: (await card.innerText()).replace(/\s+/g, " ").slice(0, 160) });

// Tuned in: the lock screen carries the song, and the line sung once there is one.
await page.getByRole("button", { name: "Tune in" }).click();
await page.waitForFunction(() => window.__remixtRadio?.heard(), null, { timeout: 120_000 });
await page.waitForTimeout(2500);
const meta = () => page.evaluate(() => ({ title: navigator.mediaSession.metadata?.title, artist: navigator.mediaSession.metadata?.artist, album: navigator.mediaSession.metadata?.album, state: navigator.mediaSession.playbackState }));
const m1 = await meta();
check("lock screen shows the song", m1.title === onAir && m1.state === "playing", m1);
const hasLines = await card.locator("p[dir]").count();
if (hasLines) {
  // Wait for a sung line (up to 40 s), then it must be on the lock screen.
  const sung = await page
    .waitForFunction(() => /^♪ /.test(navigator.mediaSession.metadata?.artist ?? ""), null, { timeout: 40_000 })
    .then(() => true)
    .catch(() => false);
  check("lock screen shows the line sung", sung, await meta());
}

// "Wrong words?" / "Find the words": the panel searches by itself; pick the first result for this device.
const fix = card.getByRole("button", { name: /Wrong words\?|Find the words/ });
if (await fix.count()) {
  await fix.click();
  const region = page.getByRole("region", { name: "Put the words right" });
  await region.waitFor();
  await region.locator("ul button").first().waitFor({ timeout: 30_000 }).catch(() => null);
  const results = await region.locator("ul button").count();
  log({ step: "search results", results });
  if (results) {
    const first = (await region.locator("ul button").first().locator("span.block").first().innerText()).trim();
    await region.locator("ul button").first().click();
    await page.waitForTimeout(1500);
    const label = await card.locator("div").first().innerText();
    const status = await region.locator('[role="status"]').innerText().catch(() => "");
    check("a picked sheet shows as your pick", /your pick/.test(label) || /can't be lined up/.test(status), { first, label: label.replace(/\s+/g, " "), status });
    if (/your pick/.test(label)) {
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem("remixt.radio.words") ?? "{}"));
      await region.getByRole("button", { name: /Later/ }).click();
      await page.waitForTimeout(800);
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem("remixt.radio.words") ?? "{}"));
      const k = Object.keys(after)[0];
      check("nudge later is kept", !!k && after[k].shift === 0.5, { before: Object.values(before)[0]?.shift, after: after[k]?.shift });
    }
    await region.getByRole("button", { name: "Show no words" }).click();
    await page.waitForTimeout(800);
    check("show no words", /Words hidden for this song/.test(await card.innerText()));
    await region.getByRole("button", { name: /Back to the found words/ }).click();
    await page.waitForTimeout(1500);
    check("back to the found words", !/your pick|Words hidden/.test(await card.innerText()));
  }
}

// The owner's choice, for everyone: set through the API, seen by the guest after a reload.
if (process.env.OWNER_ID) {
  const owner = await browser.newContext();
  await owner.addCookies([{ name: "remix_session", value: token, url: base }]);
  const feed = await (await owner.request.get(`${base}/api/radio/${slug}?sid=wordscheck01`)).json();
  const item = feed.now;
  const can = await (await owner.request.get(`${base}/api/lyrics/choice?kind=${item.kind}&id=${item.id}`)).json();
  log({ step: "owner may set", canSet: can.canSet });
  if (can.canSet) {
    const lrc = Array.from({ length: 40 }, (_, i) => `[${String(Math.floor((i * 6) / 60)).padStart(2, "0")}:${String((i * 6) % 60).padStart(2, "0")}.00]rig line ${i + 1}`).join("\n");
    const put = await owner.request.put(`${base}/api/lyrics/choice`, { data: { kind: item.kind, id: item.id, lrc, shift: 0, noWords: false, song: "Rig words" } });
    check("owner sets words for everyone", put.ok(), { status: put.status() });
    const stranger = await (await guest.request.put(`${base}/api/lyrics/choice`, { data: { kind: item.kind, id: item.id, lrc, shift: 0, noWords: false, song: "x" } })).status();
    check("a guest can't", stranger === 401 || stranger === 403, { status: stranger });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => /set by its owner/.test(document.querySelector('[aria-label="Lyrics"]')?.textContent ?? ""), null, { timeout: 30_000 }).catch(() => {});
    check("the guest sees the owner's words", /rig line|set by its owner/.test(await card.innerText()), { text: (await card.innerText()).replace(/\s+/g, " ").slice(0, 120) });
    const del = await owner.request.delete(`${base}/api/lyrics/choice?kind=${item.kind}&id=${item.id}`);
    check("owner puts it back", del.ok());
  }
  await owner.close();
}

await browser.close();
console.log(fails.length ? `FAIL: ${fails.join(", ")}` : "OK");
process.exit(fails.length ? 1 : 0);
