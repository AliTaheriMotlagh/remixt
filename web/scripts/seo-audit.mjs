// Checks the running app the way a search engine sees it: robots.txt,
// sitemap.xml and llms.txt, then every page in the sitemap — status, title,
// description, canonical, robots, one <h1>, a share image, and that its
// JSON-LD parses. Also that an unknown page is a real 404.
//
//   node scripts/seo-audit.mjs                 (the app on localhost:3000)
//   BASE_URL=http://localhost:3100 node scripts/seo-audit.mjs
//   LIMIT=50 node scripts/seo-audit.mjs        (first 50 sitemap pages)
//
// Exits 1 on any failure; warnings (long titles, no <h1> in the HTML) don't fail.

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const LIMIT = Number(process.env.LIMIT) || Infinity;
const failures = [];
const warnings = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);
const warn = (where, what) => warnings.push(`${where}: ${what}`);

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** The sitemap's addresses use the public origin; fetch them from BASE. */
const local = (url) => {
  const u = new URL(url);
  return BASE + u.pathname + u.search;
};
const get = (url) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; seo-audit)" } });

async function checkText(path, mustContain) {
  const res = await get(BASE + path);
  const body = await res.text();
  if (res.status !== 200) return fail(path, `status ${res.status}`);
  for (const s of mustContain) if (!body.includes(s)) fail(path, `doesn't mention ${s}`);
  return body;
}

function attr(html, re) {
  const m = html.match(re);
  return m ? decode(m[1]) : undefined;
}

async function checkPage(url) {
  const path = new URL(url).pathname + new URL(url).search;
  const res = await get(local(url));
  const html = await res.text();
  if (res.status !== 200) return fail(path, `status ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`);

  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title) fail(path, "no <title>");
  else if (title.length > 65) warn(path, `title is ${title.length} characters`);

  const description = attr(html, /<meta name="description" content="([^"]*)"/);
  if (!description) fail(path, "no meta description");
  else if (description.length > 160) warn(path, `description is ${description.length} characters`);

  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  const want = new URL(url);
  if (!canonical) fail(path, "no canonical");
  else {
    const got = new URL(canonical);
    const same = (u) => u.pathname.replace(/\/$/, "") + u.search;
    if (same(got) !== same(want)) fail(path, `canonical is ${canonical}`);
  }

  const robots = attr(html, /<meta name="robots" content="([^"]*)"/);
  if (robots?.includes("noindex")) fail(path, `in the sitemap but "${robots}"`);

  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s === 0) warn(path, "no <h1> in the server HTML");
  if (h1s > 1) fail(path, `${h1s} <h1>s`);

  if (!/<meta property="og:image" content="[^"]+"/.test(html)) fail(path, "no og:image");
  if (!/<html[^>]*\blang="/.test(html)) fail(path, "no lang on <html>");

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const item of [data].flat()) if (!item["@context"] || !item["@type"]) fail(path, "JSON-LD item without @context/@type");
    } catch (e) {
      fail(path, `JSON-LD doesn't parse: ${e.message}`);
    }
  }
}

const robots = await checkText("/robots.txt", ["Sitemap:", "Disallow: /api/"]);
await checkText("/llms.txt", ["# Remixt", "/tools/"]);
const sitemap = await checkText("/sitemap.xml", ["<urlset", "/tools/vocal-remover"]);
if (robots && /Disallow: \/tools/.test(robots)) fail("/robots.txt", "blocks /tools");

const urls = [...new Set([...(sitemap ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1])))].slice(0, LIMIT);
console.log(`Checking ${urls.length} sitemap pages on ${BASE}…`);
for (const url of urls) {
  const started = Date.now();
  // A page that hangs or drops the connection is a failure, not the end of the audit.
  await checkPage(url).catch((e) => fail(new URL(url).pathname, `no answer (${e.cause?.code ?? e.name})`));
  if (Date.now() - started > 3000) warn(new URL(url).pathname, `took ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const missing = await get(`${BASE}/tools/no-such-tool`);
if (missing.status !== 404) fail("/tools/no-such-tool", `status ${missing.status}, wanted 404`);

for (const w of warnings) console.log(`warn  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${urls.length} pages, ${failures.length} failures, ${warnings.length} warnings`);
process.exit(failures.length ? 1 : 0);
