"use client";

import Link from "next/link";
import { Heart, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { StorageReport } from "@/lib/storageReport";
import SongFixTab from "./admin/SongFixTab";
import SettingsTab from "./admin/SettingsTab";
import MonetizeTab from "@/components/admin/MonetizeTab";

type Overview = {
  users: number;
  new_users: number;
  songs: number;
  failed_songs: number;
  processing_songs: number;
  remixes: number;
  published_remixes: number;
  plays: number;
  likes: number;
  visits: {
    visits_today: number;
    visits_week: number;
    visits_month: number;
    visits_total: number;
    visitors_month: number;
    views_today: number;
    views_total: number;
    members_today: number;
  } | null;
};

type AdminUser = {
  id: string;
  email: string;
  artist_name: string;
  created_at: string;
  songs: number;
  remixes: number;
  admin: boolean;
};

type AdminTrack = {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  duration: number | null;
  created_at: string;
  owner_id: string;
  artist_name: string;
  email: string;
  used_in_remixes: number;
  featured_example: boolean;
  example_credit: string | null;
};

type AdminRemix = {
  id: string;
  title: string;
  published: boolean;
  created_at: string;
  play_count: number;
  likes: number;
  lanes: number;
  owner_id: string;
  artist_name: string;
  email: string;
};

type AdminReport = {
  id: string;
  kind: "remix" | "comment" | "track" | "live" | "takedown";
  target_id: string | null;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reporter_name: string | null;
  reporter_email: string | null;
  target_label: string | null;
  target_href: string | null;
};

type AdminResult = {
  stem_id: string;
  kind: string;
  version: number;
  bytes: number;
  created_at: string;
  stem_kind: string;
  track_title: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
};

type Tab = "reports" | "users" | "songs" | "fix" | "remixes" | "challenges" | "results" | "storage" | "cleanup" | "money" | "settings";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function send(url: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(url, init).catch(() => null);
  if (res?.ok) return null;
  const data = await res?.json().catch(() => null);
  return data?.error ?? "Something went wrong";
}

/** Fetches `url` (re-fetching as `q` changes, debounced) and exposes a reload. */
function useList<T>(url: string, key: string, q: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!cancelled) setItems(data?.[key] ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, key, q, version]);
  return { items, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

export default function AdminPanel({ adminId }: { adminId: string }) {
  const [tab, setTab] = useState<Tab>("reports");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewVersion, setOverviewVersion] = useState(0);
  const refreshOverview = useCallback(() => setOverviewVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/overview")
      .then((res) => res.json())
      .then((data) => !cancelled && setOverview(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [overviewVersion]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "reports", label: "Reports" },
    { id: "users", label: "Users" },
    { id: "songs", label: "Songs" },
    { id: "fix", label: "Fix songs" },
    { id: "remixes", label: "Remixes" },
    { id: "challenges", label: "Challenges" },
    { id: "results", label: "Shared results" },
    { id: "storage", label: "Storage" },
    { id: "cleanup", label: "Clean up" },
    { id: "money", label: "Ads & earnings" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={overview?.users} detail={overview ? `+${overview.new_users} this week` : undefined} />
        <Stat
          label="Songs"
          value={overview?.songs}
          detail={overview ? `${overview.failed_songs} failed · ${overview.processing_songs} uploading` : undefined}
        />
        <Stat
          label="Remixes"
          value={overview?.remixes}
          detail={overview ? `${overview.published_remixes} published` : undefined}
        />
        <Stat label="Plays" value={overview?.plays} detail={overview ? `${overview.likes} likes` : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Visits today"
          value={overview?.visits?.visits_today}
          detail={overview?.visits ? `${overview.visits.members_today} signed in · ${overview.visits.views_today} page views` : undefined}
        />
        <Stat label="Visits this week" value={overview?.visits?.visits_week} />
        <Stat
          label="Visits, 30 days"
          value={overview?.visits?.visits_month}
          detail={overview?.visits ? `${overview.visits.visitors_month} different visitors` : undefined}
        />
        <Stat
          label="Visits, all time"
          value={overview?.visits?.visits_total}
          detail={overview?.visits ? `${overview.visits.views_total} page views` : undefined}
        />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "reports" && <ReportsTab onChange={refreshOverview} />}
        {tab === "users" && <UsersTab adminId={adminId} onChange={refreshOverview} />}
        {tab === "songs" && <SongsTab onChange={refreshOverview} />}
        {tab === "remixes" && <RemixesTab onChange={refreshOverview} />}
        {tab === "challenges" && <ChallengesTab />}
        {tab === "results" && <ResultsTab />}
        {tab === "storage" && <StorageTab onChange={refreshOverview} />}
        {tab === "cleanup" && <CleanupTab onChange={refreshOverview} />}
        {tab === "money" && <MonetizeTab onOpenSettings={() => setTab("settings")} />}
        {tab === "settings" && <SettingsTab />}
        {tab === "fix" && <SongFixTab />}
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value?: number; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? "…"}</p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input mb-3 sm:max-w-sm"
    />
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}

const dangerButton =
  "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";
const plainButton =
  "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover disabled:opacity-50";

function Empty({ items }: { items: unknown[] | null }) {
  if (items === null) return <p className="text-sm text-muted">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-muted">Nothing found.</p>;
  return null;
}

function UsersTab({ adminId, onChange }: { adminId: string; onChange: () => void }) {
  const [q, setQ] = useState("");
  const { items, reload } = useList<AdminUser>("/api/admin/users", "users", q);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(user: AdminUser) {
    if (
      !confirm(
        `Delete ${user.artist_name} (${user.email})?\n\nThis deletes their ${user.songs} song(s), their ${user.remixes} remix(es) and every lane other people's remixes use from their songs. It can't be undone.`
      )
    ) {
      return;
    }
    setBusy(user.id);
    setError(await send(`/api/admin/users/${user.id}`, { method: "DELETE" }));
    setBusy(null);
    reload();
    onChange();
  }

  return (
    <div>
      <Search value={q} onChange={setQ} placeholder="Search by email or artist name…" />
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((user) => (
          <Row key={user.id}>
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Link href={`/artist/${user.id}`} className="hover:underline">
                  {user.artist_name}
                </Link>
                {user.admin && (
                  <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand-strong">
                    admin
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {user.email} · joined {formatDate(user.created_at)} · {user.songs} songs · {user.remixes} remixes
              </p>
            </div>
            {!user.admin && user.id !== adminId && (
              <button onClick={() => remove(user)} disabled={busy === user.id} className={dangerButton}>
                {busy === user.id ? "Deleting…" : "Delete user"}
              </button>
            )}
          </Row>
        ))}
      </div>
    </div>
  );
}

function SongsTab({ onChange }: { onChange: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { items, reload } = useList<AdminTrack>(`/api/admin/tracks?status=${status}`, "tracks", q);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(track: AdminTrack) {
    const uses = track.used_in_remixes
      ? `\n\nIt's used in ${track.used_in_remixes} remix(es); they'll lose those lanes.`
      : "";
    if (!confirm(`Delete “${track.title}” by ${track.artist_name}?${uses}\n\nThis can't be undone.`)) return;
    setBusy(track.id);
    setError(await send(`/api/admin/tracks/${track.id}`, { method: "DELETE" }));
    setBusy(null);
    reload();
    onChange();
  }

  async function feature(track: AdminTrack) {
    let credit: string | null = null;
    if (!track.featured_example) {
      const answer = prompt(
        `Feature “${track.title}” on the examples page.\n\nCredit line (artist, and the licence or permission you have — e.g. “by Jane Doe · CC BY 4.0”):`,
        track.example_credit ?? `by ${track.artist_name}`
      );
      if (answer === null) return;
      credit = answer.trim() || null;
    }
    setBusy(track.id);
    setError(
      await send(`/api/admin/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !track.featured_example, credit }),
      })
    );
    setBusy(null);
    reload();
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Search value={q} onChange={setQ} placeholder="Search by title, artist or email…" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mb-3 sm:w-40">
          <option value="">All</option>
          <option value="ready">Ready</option>
          <option value="processing">Uploading</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((track) => (
          <Row key={track.id}>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {track.title}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    track.status === "ready"
                      ? "bg-success/15 text-success"
                      : track.status === "failed"
                        ? "bg-danger/15 text-danger"
                        : "bg-brand/15 text-brand-strong"
                  }`}
                >
                  {track.status === "processing" ? "uploading" : track.status}
                </span>
              </p>
              <p className="truncate text-xs text-muted">
                {track.artist_name} ({track.email}) · {formatDate(track.created_at)}
                {track.used_in_remixes > 0 && ` · in ${track.used_in_remixes} remixes`}
              </p>
              {track.error && <p className="truncate text-xs text-danger">{track.error}</p>}
            </div>
            {track.status === "ready" && (
              <button
                onClick={() => feature(track)}
                disabled={busy === track.id}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs ${track.featured_example ? "border-brand bg-brand/15 text-brand-strong" : "border-border text-muted hover:text-foreground"}`}
                title={track.featured_example ? `Featured on /examples${track.example_credit ? ` — ${track.example_credit}` : ""}` : "Show this song first on /examples"}
              >
                {track.featured_example ? "★ Example" : "☆ Feature"}
              </button>
            )}
            <button onClick={() => remove(track)} disabled={busy === track.id} className={dangerButton}>
              {busy === track.id ? "Deleting…" : "Delete"}
            </button>
          </Row>
        ))}
      </div>
    </div>
  );
}

function RemixesTab({ onChange }: { onChange: () => void }) {
  const [q, setQ] = useState("");
  const { items, reload } = useList<AdminRemix>("/api/admin/remixes", "remixes", q);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setPublished(remix: AdminRemix, published: boolean) {
    setBusy(remix.id);
    setError(
      await send(`/api/admin/remixes/${remix.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      })
    );
    setBusy(null);
    reload();
    onChange();
  }

  async function remove(remix: AdminRemix) {
    if (!confirm(`Delete the remix “${remix.title}” by ${remix.artist_name}? This can't be undone.`)) return;
    setBusy(remix.id);
    setError(await send(`/api/admin/remixes/${remix.id}`, { method: "DELETE" }));
    setBusy(null);
    reload();
    onChange();
  }

  return (
    <div>
      <Search value={q} onChange={setQ} placeholder="Search by title, artist or email…" />
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((remix) => (
          <Row key={remix.id}>
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Link href={`/remixes/${remix.id}`} className="hover:underline">
                  {remix.title}
                </Link>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    remix.published ? "bg-success/15 text-success" : "bg-surface-raised text-muted"
                  }`}
                >
                  {remix.published ? "published" : "private"}
                </span>
              </p>
              <p className="truncate text-xs text-muted">
                {remix.artist_name} ({remix.email}) · {formatDate(remix.created_at)} · <Play /> {remix.play_count} · <Heart />{" "}
                {remix.likes} · {remix.lanes} lanes
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPublished(remix, !remix.published)}
                disabled={busy === remix.id}
                className={plainButton}
              >
                {remix.published ? "Unpublish" : "Publish"}
              </button>
              <button onClick={() => remove(remix)} disabled={busy === remix.id} className={dangerButton}>
                Delete
              </button>
            </div>
          </Row>
        ))}
      </div>
    </div>
  );
}

const REPORT_LABELS: Record<string, string> = {
  spam: "Spam",
  abuse: "Harassment / hate",
  explicit: "Sexual / violent",
  copyright: "Copyright",
  other: "Other",
};

function ReportsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<"open" | "all">("open");
  const { items, reload } = useList<AdminReport>(`/api/admin/reports?status=${status}`, "reports", "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function close(report: AdminReport, action: "resolve" | "dismiss" | "remove") {
    if (
      action === "remove" &&
      !confirm(
        report.kind === "comment"
          ? "Delete this comment?"
          : `Delete “${report.target_label ?? "this"}”? A song is removed with its stems and every remix lane using them. This can't be undone.`
      )
    ) {
      return;
    }
    setBusy(report.id);
    setError(
      await send(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
    );
    setBusy(null);
    reload();
    onChange();
  }

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(["open", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs ${status === s ? "bg-brand text-white" : "border border-border text-muted"}`}
          >
            {s === "open" ? "Open" : "All"}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((report) => (
          <Row key={report.id}>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="mr-2 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">
                  {report.kind === "takedown" ? "Takedown" : REPORT_LABELS[report.reason] ?? report.reason}
                </span>
                {report.kind !== "takedown" && <span className="mr-1 text-xs text-muted">{report.kind}:</span>}
                {report.target_href ? (
                  <Link href={report.target_href} className="font-medium hover:underline" target="_blank">
                    {report.target_label ?? "(open)"}
                  </Link>
                ) : (
                  <span className="text-muted">{report.target_id ? "(already removed)" : "(no matching item found — check the link)"}</span>
                )}
                {report.status !== "open" && (
                  <span className="ml-2 text-[10px] uppercase text-muted">{report.status}</span>
                )}
              </p>
              {report.details && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{report.details}</p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                {report.reporter_name ?? "Signed out"}
                {report.reporter_email ? ` · ${report.reporter_email}` : ""} · {formatDate(report.created_at)}
              </p>
            </div>
            {report.status === "open" && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {report.target_href && (
                  <button onClick={() => close(report, "remove")} disabled={busy === report.id} className={dangerButton}>
                    Remove it
                  </button>
                )}
                <button onClick={() => close(report, "resolve")} disabled={busy === report.id} className={plainButton}>
                  Handled
                </button>
                <button onClick={() => close(report, "dismiss")} disabled={busy === report.id} className={plainButton}>
                  Dismiss
                </button>
              </div>
            )}
          </Row>
        ))}
      </div>
    </div>
  );
}

type PickStem = { id: string; kind: string; track_title: string; artist_name: string };
type AdminChallenge = {
  id: string;
  title: string;
  status: "upcoming" | "running" | "ended";
  starts_at: string;
  ends_at: string;
  entries: number;
  vocal: PickStem | null;
  beat: PickStem | null;
};

function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ChallengesTab() {
  const { items, reload } = useList<AdminChallenge>("/api/admin/challenges", "challenges", "");
  const [stems, setStems] = useState<PickStem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vocal, setVocal] = useState("");
  const [beat, setBeat] = useState("");
  const [startsAt, setStartsAt] = useState(() => localInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => localInput(new Date(Date.now() + 7 * 86_400_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stems")
      .then((res) => res.json())
      .then((data) => setStems(data.stems ?? []))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(
      await send("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          vocalStemId: vocal,
          beatStemId: beat,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      })
    );
    setBusy(false);
    setTitle("");
    setDescription("");
    reload();
  }

  async function remove(challenge: AdminChallenge) {
    if (!confirm(`Delete the challenge “${challenge.title}”? Its entries stay up as normal remixes.`)) return;
    setError(await send(`/api/admin/challenges/${challenge.id}`, { method: "DELETE" }));
    reload();
  }

  const label = (s: PickStem) => `${s.track_title} — ${s.artist_name}${s.kind === "vocals" ? "" : ` (${s.kind})`}`;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">New challenge</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. “Late-night flip”" className="input" required minLength={3} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should people go for? (optional)" rows={2} className="input" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Vocal
            <select value={vocal} onChange={(e) => setVocal(e.target.value)} className="input" required>
              <option value="">Pick a vocal…</option>
              {stems.filter((s) => s.kind === "vocals").map((s) => (
                <option key={s.id} value={s.id}>{label(s)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Beat
            <select value={beat} onChange={(e) => setBeat(e.target.value)} className="input" required>
              <option value="">Pick a beat…</option>
              {stems.filter((s) => s.kind !== "vocals").map((s) => (
                <option key={s.id} value={s.id}>{label(s)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Starts
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="input" required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Ends
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input" required />
          </label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Creating…" : "Create challenge"}
        </button>
      </form>

      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((c) => (
          <Row key={c.id}>
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Link href={`/challenges?id=${c.id}`} className="hover:underline">{c.title}</Link>
                <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted">{c.status}</span>
              </p>
              <p className="truncate text-xs text-muted">
                {formatDate(c.starts_at)} → {formatDate(c.ends_at)} · {c.entries} entries ·{" "}
                {c.vocal?.track_title ?? "(vocal removed)"} + {c.beat?.track_title ?? "(beat removed)"}
              </p>
            </div>
            <button onClick={() => remove(c)} className={dangerButton}>Delete</button>
          </Row>
        ))}
      </div>
    </div>
  );
}

/** What browsers shared about stems (lib/stemResults.ts): delete one that's wrong, or all of a sender's. */
function ResultsTab() {
  const [q, setQ] = useState("");
  const { items, reload } = useList<AdminResult>("/api/admin/results", "results", q);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(body: { stemId: string; kind: string } | { userId: string }, busyKey: string, question: string) {
    if (!confirm(question)) return;
    setBusy(busyKey);
    setError(
      await send("/api/admin/results", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    setBusy(null);
    reload();
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Beats and analysis one browser worked out from a stem and every other browser — phones above all — now uses.
        Delete one that sounds wrong (the next computer to open the stem works it out again), or everything from
        someone sending junk.
      </p>
      <Search value={q} onChange={setQ} placeholder="Search by song, sender or email…" />
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <Empty items={items} />
      <div className="flex flex-col gap-2">
        {items?.map((r) => {
          const key = `${r.stem_id}:${r.kind}`;
          return (
            <Row key={`${key}:${r.version}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.track_title}
                  <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-muted">
                    {r.stem_kind} · {r.kind} v{r.version}
                  </span>
                </p>
                <p className="truncate text-xs text-muted">
                  {r.sender_name ? `${r.sender_name} (${r.sender_email})` : "a deleted account"} · {formatDate(r.created_at)} ·{" "}
                  {Math.max(1, Math.round(r.bytes / 1024))} KB
                </p>
              </div>
              <div className="flex gap-2">
                {r.sender_id && (
                  <button
                    onClick={() =>
                      remove(
                        { userId: r.sender_id! },
                        `user:${r.sender_id}`,
                        `Delete every result ${r.sender_name} has shared?`
                      )
                    }
                    disabled={busy !== null}
                    className={plainButton}
                  >
                    All from sender
                  </button>
                )}
                <button
                  onClick={() =>
                    remove({ stemId: r.stem_id, kind: r.kind }, key, `Delete the shared ${r.kind} of “${r.track_title}”?`)
                  }
                  disabled={busy !== null}
                  className={dangerButton}
                >
                  Delete
                </button>
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/**
 * Moving from Vercel Blob to R2: how much of the old store is in R2 yet,
 * a button that copies the rest (a batch per request, asked again until
 * done, so none hits the time limit), and once it's all there, emptying
 * the old store. A suspended store says so, and why it'll come back.
 */
function MoveFromBlob({ legacy, onDone }: { legacy: NonNullable<StorageReport["legacy"]>; onDone: () => void }) {
  const [copying, setCopying] = useState<{ copied: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  async function copyRest() {
    setError(null);
    let copied = 0;
    setCopying({ copied, left: legacy.ok ? legacy.leftCount : 0 });
    for (;;) {
      const res = await fetch("/api/admin/files", { method: "POST" }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(data?.error ?? "Copying stopped: no answer. Press again to carry on.");
        break;
      }
      copied += data.copied;
      setCopying({ copied, left: data.left });
      if (data.failedCount) setError(`${data.failedCount} file(s) couldn't be copied, e.g. ${data.failed[0]}. Press again to retry them.`);
      // Done, or nothing went over this round (only files that keep failing are left).
      if (data.left === 0 || data.copied === 0) break;
    }
    setCopying(null);
    onDone();
  }

  async function emptyOld() {
    if (!confirm("Delete from the old Blob store every file R2 already holds (same size)? Files not copied yet stay. Deleting is free on Vercel.")) return;
    setEmptying(true);
    setError(await send("/api/admin/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legacyMoved: true }) }));
    setEmptying(false);
    onDone();
  }

  if (!legacy.ok) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">Moving from Vercel Blob</p>
        <p className="mt-1 text-sm text-danger">The old store refused: {legacy.error}</p>
        <p className="mt-2 text-sm text-muted">
          Nothing can be copied while it refuses: a suspended store can&apos;t be read at all, file by file or
          in one go. New songs are stored in R2 and play normally; the radio leaves old ones out. Either wait
          until Vercel lifts it (on the Hobby plan, up to 30 days after it went over a limit) and copy them
          here, or start fresh below and upload the songs again.
        </p>
      </div>
    );
  }
  const total = legacy.moved + legacy.leftCount;
  const done = total ? legacy.moved / total : 1;
  const left = copying ? copying.left : legacy.leftCount;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Moving from Vercel Blob</p>
        <p className="text-sm tabular-nums text-muted">
          {legacy.moved} of {total} files in R2 · {formatSize(legacy.leftBytes)} to go
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${Math.round(done * 100)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {left === 0
          ? "Every file is in R2. Empty the old store, then disconnect it from the project in Vercel (Storage tab)."
          : "A file not copied yet is copied the first time someone plays it; this copies the rest now, songs first."}
      </p>
      {copying && (
        <p className="mt-2 text-sm tabular-nums">
          Copied {copying.copied} file(s)… {copying.left} left. Keep this page open.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {left > 0 && (
          <button onClick={copyRest} disabled={!!copying} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-50">
            {copying ? "Copying…" : `Copy the rest now (${left})`}
          </button>
        )}
        {legacy.moved > 0 && (
          <button onClick={emptyOld} disabled={emptying || !!copying} className={dangerButton}>
            {emptying ? "Deleting…" : `Empty the old store (${legacy.moved} copied file(s))`}
          </button>
        )}
      </div>
    </div>
  );
}

type MissingCounts = { songs: number; remixes: number; emptied: number; covers: number; results: number; jobs: number };

/**
 * Starting over with what storage really holds — for when the old store is
 * gone for good: first says what would go (nothing changes), then removes
 * the songs whose audio isn't there and forgets missing covers, shared
 * results and queued uploads. Songs whose files are there aren't touched.
 */
function StartFresh({ onDone }: { onDone: () => void }) {
  const [counts, setCounts] = useState<MissingCounts | null>(null);
  const [busy, setBusy] = useState<"checking" | "removing" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    setBusy("checking");
    setMessage(null);
    const res = await fetch("/api/admin/files?missing=1").catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) setCounts(data);
    else setMessage({ ok: false, text: data?.error ?? "Storage didn't answer" });
    setBusy(null);
  }

  async function remove() {
    if (!counts) return;
    const lines = [
      `Delete ${counts.songs} song(s) whose audio isn't in storage?`,
      counts.remixes ? `${counts.remixes} remix(es) use them: ${counts.emptied} use nothing else and are deleted, the rest lose those lanes.` : "",
      "Their owners can upload the songs again. This can't be undone.",
    ];
    if (!confirm(lines.filter(Boolean).join("\n\n"))) return;
    setBusy("removing");
    const res = await fetch("/api/admin/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missing: true }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setMessage(
      res?.ok
        ? {
            ok: true,
            text: `Removed ${data.songs} song(s), ${data.remixes} empty remix(es), ${data.jobs} queued song(s); forgot ${data.covers} cover(s) and ${data.results} shared result(s).`,
          }
        : { ok: false, text: data?.error ?? "Storage didn't answer" }
    );
    setCounts(null);
    setBusy(null);
    onDone();
  }

  const nothing = counts && !counts.songs && !counts.covers && !counts.results && !counts.jobs;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-medium">Start fresh</p>
      <p className="mt-1 text-sm text-muted">
        For when the old files are gone for good: remove the songs whose audio isn&apos;t in storage, so nothing
        shows that can&apos;t play, and forget covers and results whose files are gone. Songs whose files are there
        stay as they are. Check first: nothing changes until you confirm.
      </p>
      {counts && !nothing && (
        <ul className="mt-3 list-disc pl-5 text-sm">
          <li>{counts.songs} song(s) with audio missing (and recorded takes)</li>
          {counts.remixes > 0 && (
            <li>
              {counts.remixes} remix(es) use them — {counts.emptied} use nothing else and go too
            </li>
          )}
          {counts.covers > 0 && <li>{counts.covers} cover(s) whose picture is gone (a drawn one shows instead)</li>}
          {counts.results > 0 && <li>{counts.results} shared result(s) (browsers work them out again)</li>}
          {counts.jobs > 0 && <li>{counts.jobs} song(s) waiting to be split whose upload is gone</li>}
        </ul>
      )}
      {nothing && <p className="mt-3 text-sm text-success">Every row has its file. Nothing to remove.</p>}
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={check} disabled={!!busy} className={plainButton}>
          {busy === "checking" ? "Checking…" : counts ? "Check again" : "Check what would go"}
        </button>
        {counts && !nothing && (
          <button onClick={remove} disabled={!!busy} className={dangerButton}>
            {busy === "removing" ? "Removing…" : `Remove ${counts.songs} song(s) and the rest`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * What's in storage, how near the plan's limit it is, and ways to make
 * room: delete leftover files nothing uses, the shared results (worked out
 * again by browsers), or the songs taking the most space.
 */
function StorageTab({ onChange }: { onChange: () => void }) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/files").catch(() => null);
      const data = await res?.json().catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setReport(data);
        setLoadError(null);
      } else setLoadError(data?.error ?? "Couldn't read storage");
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function removeFiles(body: object, label: string, question: string) {
    if (!confirm(question)) return;
    setBusy(label);
    setMessage(null);
    const res = await fetch("/api/admin/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(null);
    setMessage(
      res?.ok
        ? { text: `Deleted ${data.deleted} file(s)${data.bytes ? `, ${formatSize(data.bytes)} freed` : ""}.`, ok: true }
        : { text: data?.error ?? "Delete failed", ok: false }
    );
    setVersion((v) => v + 1);
  }

  async function removeSong(song: StorageReport["songs"][number]) {
    const uses = song.usedInRemixes ? `\n\nIt's used in ${song.usedInRemixes} remix(es); they'll lose those lanes.` : "";
    if (!confirm(`Delete “${song.title}” by ${song.artist} (${formatSize(song.bytes)})?${uses}\n\nThis can't be undone.`)) return;
    setBusy(song.id);
    setMessage(null);
    const error = await send(`/api/admin/tracks/${song.id}`, { method: "DELETE" });
    setBusy(null);
    setMessage(error ? { text: error, ok: false } : { text: `Deleted “${song.title}”, ${formatSize(song.bytes)} freed.`, ok: true });
    setVersion((v) => v + 1);
    onChange();
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/5 p-5">
        <p className="font-medium text-danger">{loadError}</p>
        <p className="mt-2 text-sm text-muted">
          While the store refuses, songs can&apos;t play or upload and nothing can be deleted here. A Vercel Blob
          store on the Hobby plan is suspended once the team goes over a monthly limit (storage, operations or
          data transfer) and comes back 30 days later; with R2, check the bucket and its API token in Cloudflare.
        </p>
        <button onClick={() => setVersion((v) => v + 1)} className={`${plainButton} mt-3`}>
          Try again
        </button>
      </div>
    );
  }
  if (!report) return <p className="text-sm text-muted">Reading storage… (every file is listed, this can take a moment)</p>;

  const share = report.limit ? report.total / report.limit : null;
  const results = report.groups.find((g) => g.id === "results");
  const songs = showAll ? report.songs : report.songs.slice(0, 15);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {formatSize(report.total)}
            {report.limit && <span className="text-muted"> of {formatSize(report.limit)}</span>}
            <span className="ml-2 text-xs text-muted">
              {report.files} files · {report.backend === "blob" ? "Vercel Blob" : report.backend === "r2" ? "Cloudflare R2" : "this server's disk"}
            </span>
          </p>
          <button onClick={() => setVersion((v) => v + 1)} className={plainButton}>
            Refresh
          </button>
        </div>
        {share !== null && (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={`h-full rounded-full ${share >= 0.9 ? "bg-danger" : share >= 0.75 ? "bg-brand-strong" : "bg-success"}`}
                style={{ width: `${Math.min(100, share * 100)}%` }}
              />
            </div>
            {share >= 0.8 && (
              <p className="mt-2 text-sm text-danger">
                {Math.round(share * 100)}% full. When the plan&apos;s limit is crossed the store is suspended, and
                no song plays until it&apos;s back. Make room below.
              </p>
            )}
          </>
        )}
        {report.brokenSongs > 0 && (
          <p className="mt-2 text-sm text-danger">
            {report.legacy && !report.legacy.ok
              ? `${report.brokenSongs} ready song(s) can't play until the old Blob store answers again — their audio is still in it, and is copied to R2 then (see below).`
              : `${report.brokenSongs} ready song(s) have stems missing from storage and can't play.`}
          </p>
        )}
        <div className="mt-4 flex flex-col divide-y divide-border text-sm">
          {report.groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{g.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {g.files} · <span className="text-foreground">{formatSize(g.bytes)}</span>
                {g.leftoverFiles > 0 && <span className="text-danger"> · {formatSize(g.leftoverBytes)} unused</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {report.legacy && <MoveFromBlob legacy={report.legacy} onDone={() => setVersion((v) => v + 1)} />}

      {(report.brokenSongs > 0 || (report.legacy && !report.legacy.ok)) && <StartFresh onDone={() => setVersion((v) => v + 1)} />}

      {message && <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Unused files</p>
            <p className="text-sm text-muted">
              Files no song, cover or result points at: songs deleted while their files stayed, replaced covers,
              link downloads never used. Deleting them breaks nothing.
            </p>
          </div>
          <button
            onClick={() =>
              removeFiles(
                { leftovers: true },
                "leftovers",
                `Delete all ${report.leftoverCount} unused file(s) (${formatSize(report.leftoverBytes)})?`
              )
            }
            disabled={!report.leftoverCount || busy !== null}
            className={dangerButton}
          >
            {busy === "leftovers" ? "Deleting…" : `Delete all (${formatSize(report.leftoverBytes)})`}
          </button>
        </div>
        {report.leftoverCount === 0 ? (
          <p className="mt-3 text-sm text-muted">None — every file is in use.</p>
        ) : (
          <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {report.leftovers.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs hover:bg-surface-hover">
                <span className="min-w-0 truncate font-mono" title={f.key}>
                  {f.key}
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted">
                  {formatSize(f.size)} · {formatDate(f.uploadedAt)}
                  <button
                    onClick={() => removeFiles({ keys: [f.key] }, f.key, `Delete ${f.key} (${formatSize(f.size)})?`)}
                    disabled={busy !== null}
                    className="rounded px-1.5 py-0.5 text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {busy === f.key ? "…" : "Delete"}
                  </button>
                </span>
              </div>
            ))}
            {report.leftoverCount > report.leftovers.length && (
              <p className="px-2 text-xs text-muted">…and {report.leftoverCount - report.leftovers.length} more (Delete all includes them).</p>
            )}
          </div>
        )}
      </div>

      {results && results.files > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">Shared beats and analysis</p>
              <p className="text-sm text-muted">
                {results.files} file(s), {formatSize(results.bytes)}. Browsers work them out again the next time a
                stem is opened — only slower the first time, on phones above all.
              </p>
            </div>
            <button
              onClick={() =>
                removeFiles({ results: true }, "results", `Delete all ${results.files} shared result(s) (${formatSize(results.bytes)})?`)
              }
              disabled={busy !== null}
              className={dangerButton}
            >
              {busy === "results" ? "Deleting…" : "Delete all"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">Biggest songs</p>
        <p className="text-sm text-muted">Deleting a song deletes its stems; remixes that use it lose those lanes.</p>
        <div className="mt-3 flex flex-col gap-2">
          {songs.map((song) => (
            <Row key={song.id}>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {song.title}
                  <span className="ml-2 tabular-nums text-sm text-muted">{formatSize(song.bytes)}</span>
                  {song.missing > 0 && <span className="ml-2 text-xs text-danger">{song.missing} stem file(s) missing</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {song.artist} · {formatDate(song.createdAt)}
                  {song.usedInRemixes > 0 && ` · in ${song.usedInRemixes} remixes`}
                  {song.status !== "ready" && ` · ${song.status === "processing" ? "uploading" : song.status}`}
                </p>
              </div>
              <button onClick={() => removeSong(song)} disabled={busy !== null} className={dangerButton}>
                {busy === song.id ? "Deleting…" : "Delete"}
              </button>
            </Row>
          ))}
        </div>
        {report.songs.length > songs.length && (
          <button onClick={() => setShowAll(true)} className={`${plainButton} mt-3`}>
            Show {report.songs.length - songs.length} more
          </button>
        )}
      </div>
    </div>
  );
}

function CleanupTab({ onChange }: { onChange: () => void }) {
  const [preview, setPreview] = useState<{
    failedSongs: number;
    stuckSongs: number;
    emptyRemixes: number;
    outdatedResults: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/cleanup")
      .then((res) => res.json())
      .then((data) => !cancelled && setPreview(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function run() {
    setRunning(true);
    setResult(null);
    const res = await fetch("/api/admin/cleanup", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setRunning(false);
    setResult(
      res?.ok
        ? `Removed ${data.songs} song(s), ${data.remixes} empty remix(es) and ${data.results} outdated shared result(s), and cleared leftover link downloads.`
        : (data?.error ?? "Clean-up failed")
    );
    setVersion((v) => v + 1);
    onChange();
  }

  const total = preview ? preview.failedSongs + preview.stuckSongs + preview.emptyRemixes + preview.outdatedResults : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-medium">Remove leftovers</p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>
          <span className="tabular-nums text-foreground">{preview?.failedSongs ?? "…"}</span> songs whose split
          failed
        </li>
        <li>
          <span className="tabular-nums text-foreground">{preview?.stuckSongs ?? "…"}</span> songs stuck uploading
          for over an hour (the tab was closed part-way)
        </li>
        <li>
          <span className="tabular-nums text-foreground">{preview?.emptyRemixes ?? "…"}</span> remixes with no lanes
          left (every song they used was deleted)
        </li>
        <li>
          <span className="tabular-nums text-foreground">{preview?.outdatedResults ?? "…"}</span> shared beats and
          analysis made by an older version of the code
        </li>
        <li>Songs fetched from links more than an hour ago that were never used</li>
      </ul>
      <p className="mt-3 text-xs text-muted">Their stored files are deleted too, which frees storage space.</p>
      <button
        onClick={run}
        disabled={running || !preview}
        className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
      >
        {running ? "Cleaning up…" : total > 0 ? `Clean up ${total} item(s)` : "Clean up"}
      </button>
      {result && <p className="mt-3 text-sm text-success">{result}</p>}
    </div>
  );
}
