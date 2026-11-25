"use client";

// Admin → Users → one member: who they are, what they made and shared,
// their money, and their trail on the site (devices, places, sessions, the
// last pages and events). Opened from the users list.

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { durationText } from "@/lib/analytics";

type Detail = {
  user: { id: string; email: string; artist_name: string; bio: string; avatar_color: string; created_at: string; admin: boolean };
  made: Record<string, number>;
  money: { earned: string; paid: string; waiting: string };
  recentWork: { kind: string; id: string; title: string; created_at: string; state: string }[];
  activity: {
    summary: { first: string | null; last: string | null; views: number; sessions: number; engaged: number } | null;
    clients: { device: string; os: string; browser: string; country: string; views: number; last: string }[];
    recent: { at: string; path: string; engaged_ms: number; channel: string; entry: boolean }[];
    events: { at: string; name: string; path: string | null }[];
    firstSource: { channel: string; referrer_host: string; utm_campaign: string | null } | null;
  } | null;
  trouble: {
    hits: { at: string; kind: string; message: string; path: string }[];
    feedback: { at: string; kind: string; message: string; status: string }[];
  } | null;
};

const MADE: [string, string][] = [
  ["songs", "Songs"], ["private_songs", "Private songs"], ["shares_given", "Songs shared with others"], ["shared_with_them", "Shared with them"],
  ["remixes", "Remixes"], ["published", "Published"], ["plays", "Plays"], ["likes_received", "Likes received"], ["followers", "Followers"],
  ["following", "Following"], ["comments", "Comments"], ["projects", "Projects together"], ["open_reports", "Open reports"],
];

const when = (s: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function UserDetail({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/admin/users/${userId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setError("Couldn't load"));
  }, [userId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label="Member details">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          {d ? (
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: d.user.avatar_color }}>
                {d.user.artist_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  <Link href={`/artist/${d.user.id}`} className="hover:underline">{d.user.artist_name}</Link>
                  {d.user.admin && <span className="ms-2 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand-strong">admin</span>}
                </p>
                <p className="truncate text-sm text-muted">{d.user.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{error ?? "Loading…"}</p>
          )}
          <button onClick={onClose} className="-m-2 p-2 text-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {d && (
          <div className="mt-5 space-y-6 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted">Joined</dt>
              <dd>{when(d.user.created_at)}</dd>
              <dt className="text-muted">First seen</dt>
              <dd>{when(d.activity?.summary?.first ?? null)}</dd>
              <dt className="text-muted">Last seen</dt>
              <dd>{when(d.activity?.summary?.last ?? null)}</dd>
              <dt className="text-muted">Came from</dt>
              <dd>
                {d.activity?.firstSource
                  ? `${d.activity.firstSource.channel}${d.activity.firstSource.referrer_host ? ` (${d.activity.firstSource.referrer_host})` : ""}${d.activity.firstSource.utm_campaign ? ` · ${d.activity.firstSource.utm_campaign}` : ""}`
                  : "—"}
              </dd>
              <dt className="text-muted">Sessions · page views</dt>
              <dd className="tabular-nums">
                {d.activity?.summary ? `${d.activity.summary.sessions} · ${d.activity.summary.views}` : "—"}
              </dd>
              <dt className="text-muted">Time on the site</dt>
              <dd>{d.activity?.summary ? durationText(d.activity.summary.engaged) : "—"}</dd>
            </dl>
            {d.user.bio && <p className="rounded-lg bg-surface p-3 text-muted">{d.user.bio}</p>}

            <section>
              <h3 className="font-semibold">Made and shared</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MADE.map(([k, label]) => (
                  <div key={k} className="rounded-lg border border-border bg-surface p-2">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="font-semibold tabular-nums">{d.made[k] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="font-semibold">Money</h3>
              <p className="mt-1 text-muted">
                Earned {d.money.earned} · paid out {d.money.paid} · still waiting {d.money.waiting}
              </p>
            </section>

            <section>
              <h3 className="font-semibold">Latest work</h3>
              <ul className="mt-2 space-y-1">
                {d.recentWork.map((w) => (
                  <li key={`${w.kind}-${w.id}`} className="flex justify-between gap-2">
                    <span className="truncate">
                      {w.kind === "remix" ? <Link href={`/remixes/${w.id}`} className="hover:underline">{w.title}</Link> : w.title}
                      <span className="text-muted"> · {w.kind} · {w.state}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{new Date(w.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
                {d.recentWork.length === 0 && <li className="text-muted">Nothing yet</li>}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">Devices and places</h3>
              <ul className="mt-2 space-y-1">
                {(d.activity?.clients ?? []).map((c, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="capitalize">{c.device} · {c.os} · {c.browser}{c.country ? ` · ${c.country}` : ""}</span>
                    <span className="shrink-0 text-xs text-muted">{c.views} views · {new Date(c.last).toLocaleDateString()}</span>
                  </li>
                ))}
                {!d.activity?.clients.length && <li className="text-muted">Not seen since analytics started</li>}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">Last pages</h3>
              <ul className="mt-2 space-y-0.5 font-mono text-xs">
                {(d.activity?.recent ?? []).map((v, i) => (
                  <li key={i} className={`flex justify-between gap-2 ${v.entry ? "mt-2 border-t border-border pt-2" : ""}`}>
                    <span className="truncate">{v.path}</span>
                    <span className="shrink-0 text-muted">
                      {v.engaged_ms ? durationText(v.engaged_ms) : ""} {new Date(v.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">What they did</h3>
              <ul className="mt-2 space-y-0.5 text-xs">
                {(d.activity?.events ?? []).map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{e.name}{e.path ? <span className="text-muted"> · {e.path}</span> : null}</span>
                    <span className="shrink-0 text-muted">{new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
                {!d.activity?.events.length && <li className="text-muted">Nothing recorded yet</li>}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">Where they had trouble</h3>
              <p className="text-xs text-muted">Errors, rage clicks, stuck pages and server failures their browser reported (30 days).</p>
              <ul className="mt-2 space-y-0.5 text-xs">
                {(d.trouble?.hits ?? []).map((h, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="me-1 rounded bg-danger/10 px-1 text-danger">{h.kind}</span>
                      {h.message} <span className="text-muted">· {h.path}</span>
                    </span>
                    <span className="shrink-0 text-muted">{new Date(h.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
                {!d.trouble?.hits.length && <li className="text-muted">None reported</li>}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">Their feedback</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {(d.trouble?.feedback ?? []).map((f, i) => (
                  <li key={i} className="rounded-lg border border-border p-2">
                    <span className="text-xs text-muted">{f.kind} · {f.status} · {when(f.at)}</span>
                    <p className="whitespace-pre-wrap break-words">{f.message}</p>
                  </li>
                ))}
                {!d.trouble?.feedback.length && <li className="text-muted">None sent</li>}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
