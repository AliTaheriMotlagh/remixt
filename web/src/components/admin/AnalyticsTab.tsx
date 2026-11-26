"use client";

// Admin → Analytics: the site's own analytics (lib/analytics.ts has the
// definitions; nothing goes to a third party). What the owner asks of it,
// in the order they ask:
//   right now — who's here, on which pages, doing what (refreshes itself);
//   how it's going — users, sessions, engagement, against the period before;
//   where they come from — channels, sites, campaigns;
//   what they look at — pages and remixes;
//   who they are — countries, devices, browsers, languages, screens;
//   when — day of week × hour;
//   what they do — events, the path to publishing, and who comes back.
//
// Charts: one measure each (a switcher, never two axes), a hover readout on
// every plot, numbers in text colours, a table view under each chart.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { changeOf, changeText, durationText, funnel } from "@/lib/analytics";
import type { AnalyticsReport } from "@/lib/analyticsStore";

type Realtime = {
  active: { users: number; members: number };
  minutes: { ago: number; views: number; users: number }[];
  pages: { path: string; users: number }[];
  countries: { key: string; users: number }[];
  events: { name: string; at: string; path: string | null; artist: string | null }[];
  presence: { online: number; areas: Record<string, number>; artists: { id: string; artist_name: string; avatar_color: string; area: string }[]; artistCount: number } | null;
};

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 28, label: "28 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

const EVENT_NAME: Record<string, string> = {
  signup: "Sign-ups", login: "Log-ins", upload: "Songs uploaded", publish: "Remixes published", remix_play: "Remix plays", radio_tune: "Radio tune-ins",
  studio_open: "Studio opened", export: "Exports", search: "Searches", share: "Shares", ad_click: "Ad clicks", advertise_start: "Ads started", follow: "Follows", like: "Likes",
};

const nf = new Intl.NumberFormat();
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;

/** A country code as its flag and name ("IR" → 🇮🇷 Iran). */
function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let name = code;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {}
  return `${flag} ${name}`;
}

function langName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function AnalyticsTab() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const load = useCallback(() => {
    fetch(`/api/admin/analytics?days=${days}&tz=${encodeURIComponent(tz)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: AnalyticsReport) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError("Couldn't load the numbers"))
      .finally(() => setLoading(false));
  }, [days, tz]);
  useEffect(load, [load]);
  const reload = () => {
    setLoading(true);
    load();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted">Kept on this site: no third-party script, no cookies, no addresses. Times in {tz}.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => {
                  setLoading(true);
                  setDays(r.days);
                }}
                aria-pressed={days === r.days}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${days === r.days ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={reload} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <RightNow />

      <Listening days={days} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : (
        <Report data={data} />
      )}
    </div>
  );
}

// ——— listening ———

type ListeningReport = {
  listening: { listens: number; hours: number; completed: number; skipped: number; listeners: number; bySource: { source: string; listens: number; hours: number }[] };
  songs: { songs: number; measured: number; keyed: number };
};

const SOURCE_NAME: Record<string, string> = { radio: "Radio", dj: "DJ decks", preview: "Library previews", remix: "Remix pages", embed: "Embeds" };

/** Songs heard (lib/listens.ts) and how much of the library is measured (lib/trackAnalysis.ts). */
function Listening({ days }: { days: number }) {
  const [data, setData] = useState<ListeningReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/listening?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ListeningReport | null) => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [days]);
  if (!data) return null;
  const { listening: l, songs } = data;
  const share = (n: number) => (l.listens ? `${Math.round((n / l.listens) * 100)}%` : "–");
  return (
    <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="listening-title">
      <h3 id="listening-title" className="font-semibold">Listening and songs</h3>
      <p className="text-xs text-muted">
        Songs heard for 5 s or more, wherever they played. Measured songs have their tempo, key, beat grid and energy kept for the DJ set planner — new ones as they
        split, older ones by miners waiting for work and by anyone who opens them on the decks.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div><dt className="text-xs text-muted">Listens</dt><dd className="text-lg font-semibold tabular-nums">{nf.format(l.listens)}</dd></div>
        <div><dt className="text-xs text-muted">Hours heard</dt><dd className="text-lg font-semibold tabular-nums">{nf.format(Math.round(l.hours * 10) / 10)}</dd></div>
        <div><dt className="text-xs text-muted">Heard to the end</dt><dd className="text-lg font-semibold tabular-nums">{share(l.completed)}</dd></div>
        <div><dt className="text-xs text-muted">Skipped</dt><dd className="text-lg font-semibold tabular-nums">{share(l.skipped)}</dd></div>
        <div><dt className="text-xs text-muted">Songs measured</dt><dd className="text-lg font-semibold tabular-nums">{nf.format(songs.measured)} / {nf.format(songs.songs)}</dd></div>
      </dl>
      {l.bySource.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {l.bySource.map((s) => (
            <li key={s.source}>
              {SOURCE_NAME[s.source] ?? s.source}: <span className="tabular-nums text-foreground">{nf.format(s.listens)}</span> ({nf.format(Math.round(s.hours * 10) / 10)} h)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ——— right now ———

function RightNow() {
  const [rt, setRt] = useState<Realtime | null>(null);
  useEffect(() => {
    let gone = false;
    const get = () => {
      if (document.hidden) return;
      fetch("/api/admin/analytics/realtime", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Realtime) => !gone && setRt(d))
        .catch(() => {});
    };
    get();
    const timer = setInterval(get, 15_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, []);
  const perMinute = useMemo(() => {
    const out = Array.from({ length: 30 }, (_, i) => ({ label: `${29 - i} min ago`, value: 0 }));
    for (const m of rt?.minutes ?? []) if (m.ago >= 0 && m.ago < 30) out[29 - m.ago].value = m.views;
    return out;
  }, [rt]);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="rt-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="rt-title" className="flex items-center gap-2 font-semibold">
          <span className="live-dot h-2 w-2 rounded-full bg-success" aria-hidden /> Right now
        </h3>
        <p className="text-xs text-muted">Updates every 15 s</p>
      </div>
      <div className="mt-3 grid gap-5 lg:grid-cols-[14rem_1fr_1fr]">
        <div>
          <p className="text-4xl font-bold tabular-nums">{rt ? nf.format(rt.presence?.online ?? rt.active.users) : "–"}</p>
          <p className="text-sm text-muted">online now{rt?.presence ? ` · ${rt.presence.artistCount} signed in` : ""}</p>
          <p className="mt-3 text-xs text-muted">{rt ? `${nf.format(rt.active.users)} people opened a page in the last 5 minutes` : ""}</p>
          {rt?.presence && Object.keys(rt.presence.areas).length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {Object.entries(rt.presence.areas)
                .sort((a, b) => b[1] - a[1])
                .map(([area, n]) => (
                  <li key={area} className="flex justify-between">
                    <span className="capitalize text-muted">{area}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs text-muted">Page views per minute, last 30 minutes</p>
          <Bars values={perMinute} height={88} />
          {rt && rt.countries.length > 0 && (
            <p className="mt-2 text-xs text-muted">{rt.countries.map((c) => `${countryName(c.key)} ${c.users}`).join(" · ")}</p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <p className="text-xs text-muted">Pages open now</p>
            <ul className="mt-1 space-y-1 text-sm">
              {(rt?.pages ?? []).slice(0, 6).map((p) => (
                <li key={p.path} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{p.path}</span>
                  <span className="tabular-nums text-muted">{p.users}</span>
                </li>
              ))}
              {rt && rt.pages.length === 0 && <li className="text-xs text-muted">Nobody right now</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs text-muted">Just happened</p>
            <ul className="mt-1 space-y-1 text-xs">
              {(rt?.events ?? []).slice(0, 6).map((e, i) => (
                <li key={i} className="truncate">
                  <span className="text-muted">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{" "}
                  {EVENT_NAME[e.name] ?? e.name}
                  {e.artist ? ` · ${e.artist}` : ""}
                </li>
              ))}
              {rt && rt.events.length === 0 && <li className="text-muted">Nothing in the last 30 minutes</li>}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ——— the report ———

type Metric = "users" | "sessions" | "views" | "members";

function Report({ data }: { data: AnalyticsReport }) {
  const t = data.totals;
  const p = data.previous;
  const bounce = (x: typeof t) => (x.sessions ? 1 - x.engagedSessions / x.sessions : 0);
  const engagement = (x: typeof t) => (x.sessions ? x.engagedSessions / x.sessions : 0);
  const avgTime = (x: typeof t) => (x.sessions ? x.engagedMs / x.sessions : 0);
  const perSession = (x: typeof t) => (x.sessions ? x.views / x.sessions : 0);
  const [metric, setMetric] = useState<Metric>("users");

  const tiles: { label: string; value: string; change: number | null; had: boolean; goodUp?: boolean; help: string }[] = [
    { label: "Users", value: nf.format(t.users), change: changeOf(t.users, p.users), had: p.users > 0, help: "Different browsers that opened a page" },
    { label: "New users", value: nf.format(t.newUsers), change: changeOf(t.newUsers, p.newUsers), had: p.newUsers > 0, help: "Here for the first time" },
    { label: "Sessions", value: nf.format(t.sessions), change: changeOf(t.sessions, p.sessions), had: p.sessions > 0, help: "Visits; one ends after 30 minutes away" },
    { label: "Page views", value: nf.format(t.views), change: changeOf(t.views, p.views), had: p.views > 0, help: "Every page opened" },
    { label: "Engagement rate", value: pct(engagement(t)), change: changeOf(engagement(t), engagement(p)), had: p.sessions > 0, help: "Sessions of 10 s+, 2+ pages, or a sign-up/upload/publish" },
    { label: "Time per session", value: durationText(avgTime(t)), change: changeOf(avgTime(t), avgTime(p)), had: p.sessions > 0, help: "Time pages were on screen, per session" },
    { label: "Pages per session", value: perSession(t).toFixed(1), change: changeOf(perSession(t), perSession(p)), had: p.sessions > 0, help: "Page views ÷ sessions" },
    { label: "Bounce rate", value: pct(bounce(t)), change: changeOf(bounce(t), bounce(p)), had: p.sessions > 0, goodUp: false, help: "Sessions that weren't engaged" },
  ];

  const series = useMemo(() => {
    const byDay = new Map(data.daily.map((d) => [d.day, d]));
    const n = data.days === 1 ? 2 : data.days;
    const end = new Date(data.to);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(end.getTime() - (n - 1 - i) * 86_400_000);
      const key = d.toLocaleDateString("en-CA", { timeZone: data.tz });
      const row = byDay.get(key);
      return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: data.tz }), day: key, value: row?.[metric] ?? 0 };
    });
  }, [data, metric]);

  const csv = () => {
    const lines = [["day", "users", "sessions", "views", "members"].join(","), ...data.daily.map((d) => [d.day, d.users, d.sessions, d.views, d.members].join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `remixt-analytics-${data.days}d.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps = funnel([
    { name: "Visited", count: data.funnel.visitors },
    { name: "Opened the Studio, Library or Upload", count: data.funnel.creators },
    { name: "Made an account", count: data.funnel.signups },
    { name: "Uploaded a song", count: data.funnel.uploads },
    { name: "Published a remix", count: data.funnel.publishers },
  ]);

  return (
    <>
      <section aria-label="How it's going">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((x) => (
            <Tile key={x.label} {...x} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Changes are against the {data.days === 1 ? "24 hours" : `${data.days} days`} before. {nf.format(t.members)} signed-in members were here.</p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="trend-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="trend-title" className="font-semibold">
            {metric === "users" ? "Users" : metric === "sessions" ? "Sessions" : metric === "views" ? "Page views" : "Signed-in members"} per day
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Measure">
              {(["users", "sessions", "views", "members"] as Metric[]).map((m) => (
                <button key={m} onClick={() => setMetric(m)} aria-pressed={metric === m} className={`rounded-md px-2 py-1 capitalize ${metric === m ? "bg-surface-raised" : "text-muted"}`}>
                  {m === "views" ? "Views" : m}
                </button>
              ))}
            </div>
            <button onClick={csv} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted hover:text-foreground">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        <AreaChart points={series} />
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">As a table</summary>
          <table className="mt-2 w-full max-w-md tabular-nums">
            <tbody>
              {series.map((s) => (
                <tr key={s.day} className="border-t border-border/50">
                  <td className="py-0.5">{s.label}</td>
                  <td className="text-right text-foreground">{nf.format(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Where sessions come from" rows={data.channels.map((c) => ({ key: c.key, value: c.sessions }))} unit="sessions" />
        <ListCard title="Sites that sent people" rows={data.referrers.filter((r) => r.key !== "(none)").map((c) => ({ key: c.key, value: c.sessions }))} unit="sessions" empty="No other site yet" />
        <ListCard
          title="Campaigns (utm_campaign)"
          rows={data.campaigns.filter((r) => r.key !== "(none)").map((c) => ({ key: c.key, value: c.sessions }))}
          unit="sessions"
          empty="Tag your links: ?utm_source=instagram&utm_campaign=launch"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="pages-title">
        <h3 id="pages-title" className="font-semibold">Pages</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">Page</th>
                <th className="py-1 text-right font-medium">Views</th>
                <th className="py-1 text-right font-medium">Users</th>
                <th className="py-1 text-right font-medium">Landed here</th>
                <th className="py-1 text-right font-medium">Time on page</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.pages.map((pg) => (
                <tr key={pg.route} className="border-t border-border/50">
                  <td className="max-w-[16rem] truncate py-1.5 font-mono text-xs">{pg.route}</td>
                  <td className="text-right">{nf.format(pg.views)}</td>
                  <td className="text-right">{nf.format(pg.users)}</td>
                  <td className="text-right">{nf.format(pg.entries)}</td>
                  <td className="text-right">{pg.engaged ? durationText(pg.engaged) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages.length === 0 && <p className="py-4 text-sm text-muted">No page views in this period yet.</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Most viewed remixes" rows={data.remixes.map((r) => ({ key: `${r.title} — ${r.artist}`, value: r.views, href: `/remixes/${r.id}` }))} unit="views" empty="No remix pages opened yet" />
        <ListCard title="Countries" rows={data.countries.map((c) => ({ key: countryName(c.key), value: c.users }))} unit="users" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ListCard title="Devices" rows={data.devices.map((c) => ({ key: c.key, value: c.users }))} unit="users" compact />
        <ListCard title="Systems" rows={data.os.map((c) => ({ key: c.key, value: c.users }))} unit="users" compact />
        <ListCard title="Browsers" rows={data.browsers.map((c) => ({ key: c.key, value: c.users }))} unit="users" compact />
        <ListCard title="Languages" rows={data.langs.map((c) => ({ key: c.key === "(unknown)" ? c.key : langName(c.key), value: c.users }))} unit="users" compact />
      </div>
      <ListCard title="Screen widths (px)" rows={data.screens.map((c) => ({ key: c.key, value: c.users }))} unit="users" compact />

      <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="when-title">
        <h3 id="when-title" className="font-semibold">When people come</h3>
        <p className="text-xs text-muted">Page views by day of week and hour ({data.tz}) — darker is busier.</p>
        <Heatmap cells={data.hours} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="events-title">
          <h3 id="events-title" className="font-semibold">What people did</h3>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">Event</th>
                <th className="py-1 text-right font-medium">Count</th>
                <th className="py-1 text-right font-medium">People</th>
                <th className="py-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.events.map((e) => (
                <tr key={e.name} className="border-t border-border/50">
                  <td className="py-1.5">{EVENT_NAME[e.name] ?? e.name}</td>
                  <td className="text-right">{nf.format(e.now)}</td>
                  <td className="text-right">{nf.format(e.people)}</td>
                  <td className="text-right text-muted">{changeText(changeOf(e.now, e.before), e.before > 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.events.length === 0 && <p className="py-3 text-sm text-muted">Nothing recorded yet.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="funnel-title">
          <h3 id="funnel-title" className="font-semibold">The path to publishing</h3>
          <p className="text-xs text-muted">
            People who did each step in the period (not necessarily in order). Accounts, uploads and publishing count from the site&apos;s own
            records; visits only since analytics began.
          </p>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={s.name}>
                <div className="flex justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="tabular-nums">
                    {nf.format(s.count)} <span className="text-muted">{i > 0 && s.ofFirst <= 1 ? `· ${pct(s.ofFirst)} of visitors` : ""}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-raised" title={`${nf.format(s.count)} (${pct(s.ofFirst)})`}>
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(s.count ? 1 : 0, s.ofFirst * 100))}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="ret-title">
        <h3 id="ret-title" className="font-semibold">Who comes back</h3>
        <p className="text-xs text-muted">New visitors by the week they first came, and the share who came back each week after.</p>
        <Cohorts rows={data.cohorts} />
      </section>
    </>
  );
}

function Tile({ label, value, change, had, goodUp = true, help }: { label: string; value: string; change: number | null; had: boolean; goodUp?: boolean; help: string }) {
  const good = change === null || change === 0 ? null : change > 0 === goodUp;
  return (
    <div className="rounded-xl border border-border bg-surface p-3" title={help}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className={`mt-0.5 text-xs ${good === null ? "text-muted" : good ? "text-success" : "text-danger"}`}>
        {good === null ? "" : good ? "▲ " : "▼ "}
        {changeText(change, had)}
        <span className="sr-only">{good === null ? "" : good ? " (better)" : " (worse)"}</span>
      </p>
    </div>
  );
}

/** Daily values as a line over a soft area, with a crosshair and readout on hover. */
function AreaChart({ points }: { points: { label: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 720;
  const h = 200;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const nice = niceMax(max);
  const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * (w - pad.l - pad.r) : (w - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (1 - v / nice) * (h - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const ticks = [0, nice / 2, nice];
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-52 w-full"
        role="img"
        aria-label={`Highest ${nf.format(max)} on one day`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * w;
          const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id="an-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {p.label}
            </text>
          ) : null
        )}
        <path d={area} fill="url(#an-area)" />
        <path d={line} fill="none" stroke="var(--brand-strong)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r="4.5" fill="var(--brand-strong)" stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(x(hover) / w) * 100}%`, transform: `translateX(${hover > points.length / 2 ? "-105%" : "5%"})` }}
        >
          <p className="text-muted">{points[hover].label}</p>
          <p className="font-semibold tabular-nums">{nf.format(points[hover].value)}</p>
        </div>
      )}
    </div>
  );
}

/** Small vertical bars (the last 30 minutes) with a readout on hover. */
function Bars({ values, height }: { values: { label: string; value: number }[]; height: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div className="relative mt-2">
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={`w-full rounded-t-[3px] ${hover === i ? "bg-brand-strong" : "bg-brand"}`}
              style={{ height: `${v.value ? Math.max(4, (v.value / max) * 100) : 2}%`, opacity: v.value ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      {hover !== null && (
        <p className="pointer-events-none absolute -top-6 right-0 rounded bg-surface-raised px-2 py-0.5 text-xs">
          {values[hover].label}: <span className="font-semibold">{values[hover].value}</span> views
        </p>
      )}
    </div>
  );
}

/** A ranked list with a bar behind each value. */
function ListCard({ title, rows, unit, empty = "Nothing yet", compact: small = false }: { title: string; rows: { key: string; value: number; href?: string }[]; unit: string; empty?: string; compact?: boolean }) {
  const total = rows.reduce((n, r) => n + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className={`mt-3 ${small ? "space-y-1.5" : "space-y-2"}`}>
          {rows.map((r) => (
            <li key={r.key} className="relative" title={`${r.key}: ${nf.format(r.value)} ${unit} (${total ? pct(r.value / total) : "0%"})`}>
              <div className="absolute inset-y-0 left-0 rounded-md bg-brand/15" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
              <div className="relative flex items-center justify-between gap-2 px-2 py-1 text-sm">
                {r.href ? (
                  <a href={r.href} className="truncate hover:underline">{r.key}</a>
                ) : (
                  <span className="truncate first-letter:uppercase">{r.key}</span>
                )}
                <span className="shrink-0 tabular-nums">
                  {nf.format(r.value)} <span className="text-xs text-muted">{total ? pct(r.value / total) : ""}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour: one hue, lighter to darker, a readout on hover. */
function Heatmap({ cells }: { cells: { dow: number; hour: number; views: number }[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; views: number } | null>(null);
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.views]));
  const max = Math.max(1, ...cells.map((c) => c.views));
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="min-w-[36rem]" onMouseLeave={() => setHover(null)}>
        <div className="grid grid-cols-[2.5rem_repeat(24,1fr)] gap-[2px] text-[10px] text-muted">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">{h % 3 === 0 ? h : ""}</span>
          ))}
          {DAYS.map((d, i) => (
            <Row key={d} label={d}>
              {Array.from({ length: 24 }, (_, h) => {
                const v = grid.get(`${i + 1}-${h}`) ?? 0;
                return (
                  <span
                    key={h}
                    onMouseEnter={() => setHover({ dow: i, hour: h, views: v })}
                    className="aspect-square rounded-[3px] border border-border/40"
                    style={{ background: v ? `color-mix(in oklab, var(--brand) ${Math.round(15 + (v / max) * 85)}%, var(--surface))` : "var(--surface-raised)" }}
                    aria-label={`${d} ${h}:00, ${v} views`}
                  />
                );
              })}
            </Row>
          ))}
        </div>
        <p className="mt-2 h-4 text-xs text-muted">{hover ? `${DAYS[hover.dow]} ${hover.hour}:00–${hover.hour + 1}:00 · ${nf.format(hover.views)} views` : ""}</p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="self-center">{label}</span>
      {children}
    </>
  );
}

function Cohorts({ rows }: { rows: { week: string; size: number; back: number[] }[] }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted">Not enough weeks yet.</p>;
  const thisWeek = rows.length - 1;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm tabular-nums">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 text-left font-medium">First week</th>
            <th className="py-1 text-right font-medium">New</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n} className="py-1 text-center font-medium">Week {n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.week} className="border-t border-border/50">
              <td className="py-1">{new Date(`${r.week}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</td>
              <td className="text-right">{nf.format(r.size)}</td>
              {r.back.map((b, n) => {
                // A later week that hasn't come yet for this group: blank, not 0%.
                const future = i + n + 1 > thisWeek;
                const share = r.size ? b / r.size : 0;
                return (
                  <td key={n} className="p-0.5 text-center text-xs">
                    {future ? (
                      ""
                    ) : (
                      <span
                        className="block rounded px-1 py-1"
                        style={{ background: `color-mix(in oklab, var(--brand) ${Math.round(share * 100)}%, var(--surface-raised))` }}
                        title={`${b} of ${r.size}`}
                      >
                        {pct(share)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function compact(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(Math.round(v));
}
