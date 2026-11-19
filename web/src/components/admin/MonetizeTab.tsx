"use client";

// The owner's side of ads and earnings: what came in and where it went,
// the paying campaigns, artists' claims to their songs, and payouts.

import { useCallback, useEffect, useState } from "react";
import { formatMoney, MICROS } from "@/lib/monetize/policy";
import type { Campaign, monetizeOverview } from "@/lib/monetize/store";

type Overview = Awaited<ReturnType<typeof monetizeOverview>>;

async function post(body: unknown) {
  const res = await fetch("/api/admin/monetize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
}

const EMPTY = { id: null as string | null, name: "", advertiser: "", title: "", body: "", cta: "Learn more", link: "", image: "", lang: "any", placements: ["site", "remix", "radio"], cpm: 2, budget: 100, endsAt: "" };

export default function MonetizeTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/monetize", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Couldn't load"));
  }, []);
  useEffect(load, [load]);

  const act = async (body: unknown) => {
    setError(null);
    try {
      await post(body);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!data) return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  const pendingClaims = data.claims.filter((c) => c.status === "pending");
  const pendingPayouts = data.payouts.filter((p) => p.status === "requested");

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box label="Remixt's share, all time" value={formatMoney(data.money.platform)} />
        <Box label="Paid to members (incl. waiting)" value={formatMoney(data.money.members)} />
        <Box label="Kept for artists not verified" value={formatMoney(data.money.held)} />
        <Box label="This month, everyone" value={formatMoney(data.money.month)} />
        <Box label="Ad views today" value={`${data.views.today}`} detail={`${data.views.paidToday} paid`} />
        <Box label="Ad views this month" value={`${data.views.month}`} detail={`${data.views.paidMonth} paid`} />
        <Box label="Claims to check" value={`${pendingClaims.length}`} />
        <Box label="Payouts to send" value={`${pendingPayouts.length}`} detail={formatMoney(pendingPayouts.reduce((s, p) => s + p.micros, 0))} />
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Campaigns</h3>
          <button type="button" onClick={() => setForm(EMPTY)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            New campaign
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          An advertiser you work with directly: they pay a price per 1,000 paid views (CPM) up to a budget. Each paid view is shared at once by the
          rules in lib/monetize/policy.ts. With no campaign running, spots show Remixt&apos;s own ads (they pay nobody).
        </p>
        {form && <CampaignForm initial={form} onCancel={() => setForm(null)} onSave={async (f) => (await act({ action: "campaign", ...f }), setForm(null))} />}
        <ul className="mt-3 flex flex-col gap-2">
          {data.campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className={`h-2 w-2 rounded-full ${c.active ? "bg-success" : "bg-muted"}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name}</span> <span className="text-muted">· {c.advertiser || "—"} · {c.placements.join(", ")} · {c.lang}</span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                {c.views.toLocaleString()} views · {c.clicks.toLocaleString()} clicks · {formatMoney(c.cpm_micros)} CPM · {formatMoney(c.spent_micros)} / {formatMoney(c.budget_micros)}
              </span>
              <button type="button" onClick={() => setForm(toForm(c))} className="text-xs text-brand-strong hover:underline">
                Edit
              </button>
              <button type="button" onClick={() => act({ action: "campaign-active", id: c.id, active: !c.active })} className="text-xs hover:underline">
                {c.active ? "Pause" : "Resume"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Artists claiming their songs</h3>
        <p className="mt-1 text-xs text-muted">
          Check before verifying: the claimant&apos;s official pages, the release, the distributor. Verifying moves everything kept for that song to
          them (it still waits out its hold), and turns down other open claims to it.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {data.claims.length === 0 && <li className="text-sm text-muted">No claims yet.</li>}
          {data.claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
              <p>
                <span className="font-medium">{c.artist_name}</span> <span className="text-muted">({c.email})</span> claims{" "}
                <span className="font-medium">“{c.title}”</span> · {formatMoney(c.held)} kept · <span className="text-muted">{c.status}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{c.evidence}</p>
              {c.status === "pending" && (
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => act({ action: "claim", id: c.id, verify: true })} className="text-success hover:underline">
                    Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => act({ action: "claim", id: c.id, verify: false, note: prompt("Why not? (they'll see this)") ?? null })}
                    className="text-danger hover:underline"
                  >
                    Turn down
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Payouts</h3>
        <p className="mt-1 text-xs text-muted">Send the money yourself, then mark it sent. Turning one down returns it to the member&apos;s balance.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {data.payouts.length === 0 && <li className="text-sm text-muted">No payouts asked for yet.</li>}
          {data.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.artist_name}</span> <span className="text-muted">({p.email})</span> · {p.method}
                <span className="block break-all text-xs text-muted">{p.details}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatMoney(p.micros)}</span>
              {p.status === "requested" ? (
                <>
                  <button type="button" onClick={() => act({ action: "payout", id: p.id, paid: true })} className="text-success hover:underline">
                    Mark sent
                  </button>
                  <button type="button" onClick={() => act({ action: "payout", id: p.id, paid: false, note: prompt("Why? (they'll see this)") ?? null })} className="text-danger hover:underline">
                    Turn down
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted">{p.status}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function toForm(c: Campaign): typeof EMPTY {
  return {
    id: c.id, name: c.name, advertiser: c.advertiser, title: c.title, body: c.body, cta: c.cta, link: c.link, image: c.image_url ?? "",
    lang: c.lang, placements: c.placements, cpm: c.cpm_micros / MICROS, budget: c.budget_micros / MICROS, endsAt: c.ends_at ? c.ends_at.slice(0, 16) : "",
  };
}

function Box({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-[11px] text-muted">{detail}</p>}
    </div>
  );
}

function CampaignForm({ initial, onSave, onCancel }: { initial: typeof EMPTY; onSave: (f: Record<string, unknown>) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, image: f.image || null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null });
      }}
      className="mt-3 grid gap-2 rounded-xl border border-brand/40 bg-surface p-4 text-sm sm:grid-cols-2"
    >
      <input className="input" placeholder="Campaign name (yours)" value={f.name} onChange={set("name")} required />
      <input className="input" placeholder="Advertiser (shown)" value={f.advertiser} onChange={set("advertiser")} />
      <input className="input" placeholder="Headline (≤ 80)" value={f.title} onChange={set("title")} maxLength={80} required />
      <input className="input" placeholder="Button (≤ 30)" value={f.cta} onChange={set("cta")} maxLength={30} required />
      <textarea className="input sm:col-span-2" placeholder="One or two lines (≤ 200)" value={f.body} onChange={set("body")} maxLength={200} rows={2} />
      <input className="input" placeholder="https://their-page" value={f.link} onChange={set("link")} required />
      <input className="input" placeholder="Picture URL (square, optional)" value={f.image} onChange={set("image")} />
      <label className="flex items-center gap-2">
        CPM $ <input className="input flex-1" type="number" min={0.01} step={0.01} value={f.cpm} onChange={set("cpm")} />
      </label>
      <label className="flex items-center gap-2">
        Budget $ <input className="input flex-1" type="number" min={1} step={1} value={f.budget} onChange={set("budget")} />
      </label>
      <select className="input" value={f.lang} onChange={set("lang")}>
        <option value="any">Any language</option>
        <option value="en">English pages</option>
        <option value="fa">Persian pages</option>
      </select>
      <label className="flex items-center gap-2">
        Ends <input className="input flex-1" type="datetime-local" value={f.endsAt} onChange={set("endsAt")} />
      </label>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        {(["site", "remix", "radio"] as const).map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={f.placements.includes(p)}
              onChange={(e) => setF({ ...f, placements: e.target.checked ? [...f.placements, p] : f.placements.filter((x) => x !== p) })}
            />
            {p === "site" ? "Ordinary pages" : p === "remix" ? "Remix pages" : "Radio"}
          </label>
        ))}
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 font-semibold text-white">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
