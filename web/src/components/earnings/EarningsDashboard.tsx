"use client";

// A member's earnings: what's theirs to withdraw, what's on its way, where
// it came from, the songs they can claim, who they share remixes with, how
// they're paid — and the badges along the way.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Award, BadgeCheck, Banknote, CircleDollarSign, Clock3, Eye, Hourglass, Loader2, Lock, Plus, Sparkles, Trash2, Users, Wallet } from "lucide-react";
import { earnBadges, formatMoney, HOLD_DAYS, MICROS, PAYOUT_MIN_MICROS, rpm, type Role } from "@/lib/monetize/policy";
import type { EarningsSummary } from "@/lib/monetize/store";

const METHODS = ["PayPal", "Bank transfer (IBAN / Sheba)", "Crypto (USDT)", "Other"] as const;

const ROLE_LABEL: Record<Role, string> = {
  platform: "Remixt",
  remixer: "Remixer",
  collaborator: "Collaborator",
  "parent-remixer": "Original remix",
  artist: "Artist",
  vocalist: "Vocalist",
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data;
}

export default function EarningsDashboard({ artistName }: { artistName: string }) {
  const [data, setData] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/earnings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load your earnings");
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{error}</p>;
  if (!data)
    return (
      <div className="grid gap-4">
        <div className="h-48 animate-pulse rounded-3xl bg-surface" />
        <div className="h-32 animate-pulse rounded-3xl bg-surface" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <Balance data={data} artistName={artistName} onChange={load} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Activity data={data} />
        <Badges data={data} />
      </div>
      <Sources data={data} />
      <Claims data={data} onChange={load} />
      <Splits data={data} onChange={load} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PayoutAccount data={data} onChange={load} />
        <PayoutHistory data={data} />
      </div>
    </div>
  );
}

function Balance({ data, artistName, onChange }: { data: EarningsSummary; artistName: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const progress = Math.min(1, data.available / PAYOUT_MIN_MICROS);
  const canPay = data.available >= PAYOUT_MIN_MICROS && !!data.account && data.requested === 0;
  async function payout() {
    setBusy(true);
    setNote(null);
    try {
      const r = (await send("/api/earnings/payout", "POST")) as { micros: number };
      setNote(`Asked for ${formatMoney(r.micros)} — we'll send it to your ${data.account?.method}.`);
      onChange();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't ask for a payout");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/30 via-surface to-vocals/15 p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/25 blur-3xl" aria-hidden />
      <p className="text-sm text-muted">{artistName}&apos;s earnings</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">Ready to withdraw</h1>
          <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">{formatMoney(data.available)}</p>
        </div>
        <button
          type="button"
          onClick={payout}
          disabled={!canPay || busy}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Withdraw
        </button>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-xs text-muted">
          <span>{progress < 1 ? `${formatMoney(PAYOUT_MIN_MICROS - data.available)} to your first withdrawal` : "You can withdraw"}</span>
          <span className="tabular-nums">{formatMoney(PAYOUT_MIN_MICROS)}</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-vocals transition-[width] duration-700" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
        {!data.account && data.available > 0 && <p className="mt-2 text-xs text-muted">Add how you&apos;d like to be paid (below) to withdraw.</p>}
        {data.requested > 0 && <p className="mt-2 text-xs text-muted">{formatMoney(data.requested)} is on its way to you.</p>}
        {note && <p className="mt-2 text-sm">{note}</p>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Hourglass} label={`Waiting (${HOLD_DAYS} days)`} value={formatMoney(data.waiting)} />
        <Stat icon={Lock} label="Kept for artists of your uploads" value={formatMoney(data.heldForYourUploads)} />
        <Stat icon={Wallet} label="Paid to you" value={formatMoney(data.paid)} />
        <Stat icon={CircleDollarSign} label="Earned in all" value={formatMoney(data.lifetime)} />
      </dl>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/40 p-3 backdrop-blur">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Activity({ data }: { data: EarningsSummary }) {
  const days = useMemo(() => {
    const byDay = new Map(data.last30.map((d) => [d.day, d.micros]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(data.asOf - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      return { day: d, micros: byDay.get(d) ?? 0 };
    });
  }, [data.last30, data.asOf]);
  const max = Math.max(1, ...days.map((d) => d.micros));
  const month = days.reduce((s, d) => s + d.micros, 0);
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Last 30 days</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground tabular-nums">{formatMoney(month)}</span> ·{" "}
          <Eye className="inline h-3.5 w-3.5" /> {data.paidViews.toLocaleString()} paid views in all · {formatMoney(rpm(data.lifetime, data.paidViews))} per 1,000
        </p>
      </div>
      <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label={`Earnings per day over the last 30 days: ${formatMoney(month)} in all`}>
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-gradient-to-t from-brand/60 to-vocals/80 transition-opacity group-hover:opacity-100"
              style={{ height: `${d.micros ? Math.max(4, (d.micros / max) * 100) : 2}%`, opacity: d.micros ? 0.85 : 0.2 }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-1.5 py-0.5 text-[10px] group-hover:block">
              {d.day.slice(5)} · {formatMoney(d.micros)}
            </span>
          </div>
        ))}
      </div>
      {data.lifetime > 0 && <Statements asOf={data.asOf} />}
      {data.lifetime === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nothing yet. Publish a remix and share it: every real view of the ad on its page pays you and the artists you used.{" "}
          <Link href="/studio" className="text-brand-strong hover:underline">
            Open the Studio
          </Link>
        </p>
      )}
    </section>
  );
}

/** The last 12 months, each a CSV download (for taxes and records). */
function Statements({ asOf }: { asOf: number }) {
  const months = useMemo(() => {
    const now = new Date(asOf);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      return {
        value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      };
    });
  }, [asOf]);
  const [month, setMonth] = useState(months[0].value);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="statement-month" className="text-muted">
        Statement
      </label>
      <select
        id="statement-month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded-full border border-border bg-surface-raised px-3 py-1.5"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <a href={`/api/earnings/statement?month=${month}`} download className="rounded-full border border-border px-3 py-1.5 font-semibold hover:bg-surface-hover">
        Download CSV
      </a>
    </div>
  );
}

function Badges({ data }: { data: EarningsSummary }) {
  const badges = earnBadges({ paidViews: data.paidViews, lifetimeMicros: data.lifetime, ...data.facts });
  const done = badges.filter((b) => b.done).length;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Award className="h-5 w-5 text-drums" /> Milestones <span className="text-sm font-normal text-muted">{done}/{badges.length}</span>
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {badges.map((b) => (
          <li key={b.id} className={`rounded-xl border p-2.5 ${b.done ? "border-drums/40 bg-drums/10" : "border-border bg-surface-raised/50"}`} title={b.description}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {b.done ? <Sparkles className="h-3.5 w-3.5 text-drums" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
              <span className="truncate">{b.label}</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{b.description}</p>
            {!b.done && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background">
                <div className="h-full bg-drums/70" style={{ width: `${(b.value / b.goal) * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sources({ data }: { data: EarningsSummary }) {
  if (!data.sources.length) return null;
  const top = Math.max(1, ...data.sources.map((s) => s.micros));
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">Where it comes from</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {data.sources.map((s) => (
          <li key={s.key} className="relative overflow-hidden rounded-xl px-3 py-2.5">
            <div className="absolute inset-y-0 left-0 bg-brand/10" style={{ width: `${(s.micros / top) * 100}%` }} aria-hidden />
            <div className="relative flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {s.kind === "remix" ? (
                  <Link href={`/remixes/${s.id}`} className="block truncate font-medium hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{s.title}</span>
                )}
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {s.roles.map((r) => (
                    <span key={r} className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted">
                      {ROLE_LABEL[r]}
                    </span>
                  ))}
                </span>
              </div>
              <span className="text-xs text-muted tabular-nums">{s.views.toLocaleString()} views</span>
              <span className="w-20 text-right font-semibold tabular-nums">{formatMoney(s.micros)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Claims({ data, onChange }: { data: EarningsSummary; onChange: () => void }) {
  const params = useSearchParams();
  const from = params.get("from");
  const [fromSongs, setFromSongs] = useState<{ id: string; title: string; verified: boolean }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!from) return;
    fetch(`/api/earnings/claimable?remix=${encodeURIComponent(from)}`)
      .then((r) => r.json())
      .then((d: { songs: { id: string; title: string; verified: boolean }[] }) => setFromSongs(d.songs ?? []))
      .catch(() => {});
  }, [from]);

  const claimed = new Set(data.claims.map((c) => c.trackId));
  const candidates = [
    ...fromSongs.filter((s) => !s.verified && !claimed.has(s.id)).map((s) => ({ id: s.id, title: s.title, held: 0 })),
    ...data.uploads.filter((u) => !u.claim && !fromSongs.some((s) => s.id === u.id)).map((u) => ({ id: u.id, title: u.title, held: u.heldMicros })),
  ];

  async function claim() {
    if (!picked) return;
    setBusy(true);
    setNote(null);
    try {
      await send("/api/earnings/claims", "POST", { trackId: picked, evidence });
      setNote("Sent. We'll check it and write to you — usually within a few days.");
      setPicked(null);
      setEvidence("");
      onChange();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="claims" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <BadgeCheck className="h-5 w-5 text-vocals" /> Your songs
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        If you wrote or own a song people remix here, you get the artists&apos; share of every remix that uses it. Until a song&apos;s artist is
        verified, their share is kept for them. Claim a song and tell us how to check it&apos;s yours — your official pages, your distributor, a
        release with your name.
      </p>

      {data.claims.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.claims.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised/40 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              {c.heldMicros > 0 && <span className="text-xs text-muted tabular-nums">{formatMoney(c.heldMicros)} kept</span>}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  c.status === "verified" ? "bg-success/15 text-success" : c.status === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"
                }`}
              >
                {c.status === "verified" ? "Verified — paid to you" : c.status === "rejected" ? "Not accepted" : "Being checked"}
              </span>
              {c.note && <span className="hidden max-w-[16rem] truncate text-xs text-muted sm:block" title={c.note}>{c.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/40 p-4">
          <p className="text-sm font-semibold">Claim a song</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.slice(0, 30).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPicked(c.id === picked ? null : c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${picked === c.id ? "border-vocals bg-vocals/15" : "border-border hover:bg-surface-hover"}`}
              >
                {c.title}
                {c.held > 0 && <span className="ml-1.5 text-xs text-muted">{formatMoney(c.held)}</span>}
              </button>
            ))}
          </div>
          {picked && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={3}
                maxLength={3000}
                className="input"
                placeholder="How can we check it's yours? Links to your official profiles, the release, your distributor…"
              />
              <p className="text-xs text-muted">
                Claiming a song that isn&apos;t yours closes your account and gives back anything it was paid.
              </p>
              <button
                type="button"
                onClick={claim}
                disabled={busy || evidence.trim().length < 20}
                className="self-start rounded-full bg-vocals px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Sending…" : "Claim this song"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          To claim a song, open a remix that uses it and press <span className="text-foreground">“Your song? Claim your share”</span> under its credits.
        </p>
      )}
      {note && <p className="mt-3 text-sm">{note}</p>}
    </section>
  );
}

type Pick = { userId: string; name: string; bp: number };

function Splits({ data, onChange }: { data: EarningsSummary; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!data.remixes.length) return null;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Users className="h-5 w-5 text-brand-strong" /> Share with collaborators
      </h2>
      <p className="mt-1 text-sm text-muted">Made a remix with someone? Give them part of the remixers&apos; share. You keep at least 10%.</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {data.remixes.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface-raised/30">
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className="text-xs text-muted">{r.splits.length ? r.splits.map((s) => `${s.name} ${s.bp / 100}%`).join(" · ") : "Just you"}</span>
            </button>
            {open === r.id && <SplitEditor remixId={r.id} initial={r.splits} onSaved={onChange} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SplitEditor({ remixId, initial, onSaved }: { remixId: string; initial: Pick[]; onSaved: () => void }) {
  const [rows, setRows] = useState<Pick[]>(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; artist_name: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d: { users?: { id: string; artist_name: string }[] }) => setFound(d.users ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const given = rows.reduce((s, r) => s + r.bp, 0);
  async function save() {
    setNote(null);
    try {
      await send("/api/earnings/splits", "PUT", { remixId, splits: rows.map((r) => ({ userId: r.userId, bp: r.bp })) });
      setNote("Saved — from now on, each view is shared this way.");
      onSaved();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  return (
    <div className="border-t border-border px-3 pb-3 pt-2">
      {rows.map((r, i) => (
        <div key={r.userId} className="flex items-center gap-3 py-1.5">
          <span className="w-32 truncate text-sm">{r.name}</span>
          <input
            type="range"
            min={100}
            max={9000}
            step={100}
            value={r.bp}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, bp: Number(e.target.value) } : x)))}
            className="flex-1 accent-[var(--brand)]"
            aria-label={`${r.name}'s part`}
          />
          <span className="w-12 text-right text-sm tabular-nums">{r.bp / 100}%</span>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`} className="text-muted hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="relative mt-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input w-full" placeholder="Add a collaborator by artist name" />
        {q.trim().length >= 2 && found.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl">
            {found
              .filter((f) => !rows.some((r) => r.userId === f.id))
              .map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRows([...rows, { userId: f.id, name: f.artist_name, bp: 2500 }]);
                      setQ("");
                      setFound([]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover"
                  >
                    <Plus className="h-3.5 w-3.5" /> {f.artist_name}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-xs ${given > 9000 ? "text-danger" : "text-muted"}`}>You keep {Math.max(0, (10_000 - given) / 100)}% of the remixers&apos; share</span>
        <button type="button" onClick={save} disabled={given > 9000} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </div>
      {note && <p className="mt-2 text-sm">{note}</p>}
    </div>
  );
}

function PayoutAccount({ data, onChange }: { data: EarningsSummary; onChange: () => void }) {
  const [method, setMethod] = useState<string>(data.account?.method ?? METHODS[0]);
  const [details, setDetails] = useState(data.account?.details ?? "");
  const [note, setNote] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    try {
      await send("/api/earnings/account", "PUT", { method, details });
      setNote("Saved.");
      onChange();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't save");
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">How you&apos;re paid</h2>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="input">
        {METHODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        maxLength={400}
        className="input"
        placeholder={method.startsWith("PayPal") ? "Your PayPal email" : method.startsWith("Bank") ? "Account holder's name and IBAN / Sheba number" : method.startsWith("Crypto") ? "Wallet address and network (e.g. TRC-20)" : "Where to send it"}
      />
      <p className="text-xs text-muted">Only you and the person sending payouts can see this.</p>
      <button type="submit" className="self-start rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-surface-hover">
        Save
      </button>
      {note && <p className="text-sm">{note}</p>}
    </form>
  );
}

function PayoutHistory({ data }: { data: EarningsSummary }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">Payouts</h2>
      {data.payouts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None yet. You can withdraw once {formatMoney(PAYOUT_MIN_MICROS)} is ready ({PAYOUT_MIN_MICROS / MICROS} dollars).</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.payouts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="text-muted tabular-nums">{new Date(p.created_at).toLocaleDateString()}</span>
              <span className="flex-1 truncate">{p.method}</span>
              <span className="font-semibold tabular-nums">{formatMoney(p.micros)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "paid" ? "bg-success/15 text-success" : p.status === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"}`}>
                {p.status === "paid" ? "Sent" : p.status === "rejected" ? "Returned to balance" : "On its way"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
