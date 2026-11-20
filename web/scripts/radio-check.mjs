// Checks a radio station end to end against the running app: a station is
// started and filled from the console API, two guest listeners tune in and
// must hear the same moment, one votes, one requests, the DJ skips, the
// vote's winner comes on in both tabs, and the reports count it all.
//   cd web && OWNER_ID=<user id> node scripts/radio-check.mjs     (needs the app running; BASE_URL; SESSION_SECRET from .env.local)
// SHORTEN=1: the song on air ends early instead of a skip (a real change, with the station's transition).
// TRANSITION=auto|automix|blend|bassSwap|filter|echo|rise|tapeStop: the station's style (default: the station default).
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const secret = process.env.SESSION_SECRET ?? env.SESSION_SECRET ?? "dev-only-secret-change-me";
const token = await new SignJWT({ userId: process.env.OWNER_ID }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
const log = (x) => console.log(JSON.stringify(x));

// Which change was made, and whether the rendered one played (cut) or it fell back to the plain crossfade.
const changes = async (p) =>
  p.evaluate(() => (window.__remixtRadio?.decks ?? []).map((d) => ({ row: d.row.rowId, title: d.row.title, bpm: d.row.bpm ?? null, transition: d.row.transition ?? null, rendered: !!d.cut })));

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const owner = await browser.newContext();
await owner.addCookies([{ name: "remix_session", value: token, url: base }]);
const api = owner.request;
const call = async (method, path, data) => {
  const res = await api.fetch(`${base}${path}`, { method, data, headers: { "Content-Type": "application/json" }, timeout: 120_000 });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${JSON.stringify(body)}`);
  return body;
};

const { slug } = await call("POST", "/api/radio", { name: `Check FM ${Date.now() % 10000}`, tagline: "rig" });
log({ step: "station", slug });
// Whatever happens below, the rig's station goes at the end (a failed run left stations behind, up to the limit of 5).
try {
const found = (await call("GET", `/api/radio/${slug}/search?q=`)).items;
for (const item of found.slice(0, 4)) await call("POST", `/api/radio/${slug}/console`, { action: "playlist-add", kind: item.kind, id: item.id });
await call("POST", `/api/radio/${slug}/console`, { action: "settings", settings: { voting: true, autoFill: false, requests: "open", ...(process.env.TRANSITION ? { transition: process.env.TRANSITION } : {}) } });
const consoleData = await call("GET", `/api/radio/${slug}/console`);
log({ step: "playlist", songs: consoleData.playlist.map((p) => p.title) });

const listen = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/radio/${slug}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Tune in" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pause" }).waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => window.__remixtRadio?.heard(), null, { timeout: 120_000 });
  return page;
};
const [a, b] = await Promise.all([listen(), listen()]);
for (const p of [a, b]) p.on("response", (r) => (/\/(vote|request)$/.test(new URL(r.url()).pathname) ? r.text().then((t) => log({ response: r.status(), path: new URL(r.url()).pathname, body: t })) : null));
await a.waitForTimeout(6000);
const heard = async () => {
  const at = Date.now();
  // Each tab against the station's clock, measured inside the tab at one instant.
  const [pa, pb] = await Promise.all([a, b].map((p) => p.evaluate(() => window.__remixtRadio?.heard(Date.now() + window.__remixtRadio.serverClock) ?? null)));
  return { offA: pa?.offMs, offB: pb?.offMs, gapMs: pa && pb && pa.offMs !== null && pb.offMs !== null ? Math.abs(pa.offMs - pb.offMs) : null, tookMs: Date.now() - at };
};
log({ step: "two listeners, same moment?", ...(await heard()) });
const title = (p) => p.locator('section[aria-label="On air"] h1').innerText();
log({ step: "on air", a: await title(a), b: await title(b) });

// A votes for the last choice; B requests a song.
const choice = a.locator("button[aria-pressed]").last();
const choiceTitle = (await choice.locator("span.truncate").first().innerText()).trim();
await choice.click();
await a.waitForTimeout(1500);
await b.getByRole("button", { name: "Request", exact: true }).first().click();
await b.waitForTimeout(1500);
const feed = await call("GET", `/api/radio/${slug}?sid=rigcheck0001`);
log({ step: "vote and request", votedFor: choiceTitle, votes: feed.vote.total, requests: feed.requests.map((r) => `${r.title} (${r.count})`) });

let t0;
if (process.env.SHORTEN) {
  // The song ends in 30 s (set in the database, as if it were nearly over): the next one should be fetched ahead and start at once.
  const { execSync } = await import("node:child_process");
  // The song on air ends in 100 s; anything already announced after it is withdrawn, so the next pick happens ~10 s from now.
  const st = `(SELECT id FROM radio_stations WHERE slug = '${slug}')`;
  execSync(`docker exec remixt-test-pg psql -U postgres -d remixt -c "DELETE FROM radio_queue WHERE status = 'playing' AND starts_at > now() AND station_id = ${st}; UPDATE radio_queue SET ends_at = now() + interval '100 seconds' WHERE status = 'playing' AND station_id = ${st}"`);
  t0 = Date.now() + 100_000;
  // Sample tab A through the change: how many decks sound, and is there ever silence?
  const samples = [];
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    samples.push(await a.evaluate(() => { const h = window.__remixtRadio?.heard(Date.now() + window.__remixtRadio.serverClock); const r = window.__remixtRadio; return h ? `${h.rowId}[${h.levels.join("/")}]${h.offMs}` : `silent(rendering ${[...(r?.rendering?.keys() ?? [])]}; players ${(r?.players ?? []).map((p) => `${p.deck?.row.rowId ?? (p.silent ? "silence" : "-")}:${p.el.paused ? "paused" : "on"}:${Math.round(p.el.currentTime)}:${p.el.error?.code ?? ""}`).join(",")}; decks ${(r?.decks ?? []).map((d) => { const n = Date.now() + r.serverClock; return `${d.row.rowId}@${Math.round(((d.row.startsAt ?? 0) - n) / 100) / 10}..${Math.round(((d.row.endsAt ?? 0) - n) / 100) / 10}s+${d.offset}${d.cut ? "cut" : ""}`; }).join(",")}; break ${!!r?.inBreak}; stopped ${!!r?.stopped}; ${document.querySelector('[role=alert], .text-danger')?.textContent ?? ""})`; }));
    await a.waitForTimeout(500);
  }
  log({ step: "through the change (tab A every 0.5 s: newest row [gain of each sounding deck])", samples: samples.join(" ") });
  log({ step: "the change", decks: await changes(a) });
} else {
  await call("POST", `/api/radio/${slug}/console`, { action: "skip" });
  t0 = Date.now();
}
await Promise.all(
  [a, b].map((p) =>
    p.waitForFunction(
      (want) => {
        const h = window.__remixtRadio?.heard();
        return h && h.at < 60 && document.querySelector('section[aria-label="On air"] h1')?.textContent === want;
      },
      choiceTitle,
      { timeout: 120_000, polling: 100 }
    )
  )
);
log({ step: "next song playing in both tabs after", seconds: (Date.now() - t0) / 1000 });
await a.waitForTimeout(3000);
log({ step: "after skip", expected: choiceTitle, titleA: await title(a), titleB: await title(b), ...(await heard()) });

const report = await call("GET", `/api/radio/${slug}/report?days=7`);
log({ step: "report", plays: report.plays, skips: report.skips, votes: report.votes, requests: report.requests, peak: report.listenersPeak, bySource: report.bySource });
const csv = await api.fetch(`${base}/api/radio/${slug}/report?format=csv&days=7`, { timeout: 120_000 }).then((r) => r.text());
log({ step: "csv", lines: csv.split("\n").length, head: csv.split("\n")[0] });
const pub = await (await fetch(`${base}/api/radio/${slug}/now`)).json();
log({ step: "public api", now: pub.now?.title, listeners: pub.listeners, cors: true });

} finally {
  await call("DELETE", `/api/radio/${slug}`).catch((e) => log({ cleanup: e.message }));
  log({ step: "deleted" });
  await browser.close();
}
