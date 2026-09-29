"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  kind: "remix" | "comment" | "track" | "takedown";
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

type Tab = "reports" | "users" | "songs" | "remixes" | "challenges" | "cleanup";

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
    { id: "remixes", label: "Remixes" },
    { id: "challenges", label: "Challenges" },
    { id: "cleanup", label: "Clean up" },
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
        {tab === "cleanup" && <CleanupTab onChange={refreshOverview} />}
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
                {remix.artist_name} ({remix.email}) · {formatDate(remix.created_at)} · ▶ {remix.play_count} · ♥{" "}
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
        <div className="grid gap-3 sm:grid-cols-2">
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

function CleanupTab({ onChange }: { onChange: () => void }) {
  const [preview, setPreview] = useState<{ failedSongs: number; stuckSongs: number; emptyRemixes: number } | null>(
    null
  );
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
        ? `Removed ${data.songs} song(s) and ${data.remixes} empty remix(es), and cleared leftover link downloads.`
        : (data?.error ?? "Clean-up failed")
    );
    setVersion((v) => v + 1);
    onChange();
  }

  const total = preview ? preview.failedSongs + preview.stuckSongs + preview.emptyRemixes : 0;

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
