"use client";

// The owner's side of ads and earnings: what came in and where it went,
// the paying campaigns, artists' claims to their songs, and payouts.

import { useCallback, useEffect, useState } from "react";
import { formatMoney, MICROS } from "@/lib/monetize/policy";
import { TOPICS } from "@/lib/monetize/adRules";
import { useSettings } from "@/components/SettingsProvider";
import type { Campaign, monetizeOverview, MonetizeSettings, NetworkMonth } from "@/lib/monetize/store";
import type { adReviewQueue } from "@/lib/monetize/adStore";

type Overview = Awaited<ReturnType<typeof monetizeOverview>> & { queue: Awaited<ReturnType<typeof adReviewQueue>>; settings: MonetizeSettings; networks: NetworkMonth[] };

const topicName = (id: string) => TOPICS.find((t) => t.id === id)?.en ?? id;

/** Uploads an ad's picture or sound (the owner's own campaigns too). */
async function uploadMedia(id: string, kind: "image" | "audio", file: File, maxSeconds: number) {
  let q = `f=${kind}`;
  if (kind === "audio") {
    const seconds = await new Promise<number>((resolve, reject) => {
      const el = new Audio();
      const url = URL.createObjectURL(file);
      el.onloadedmetadata = () => (URL.revokeObjectURL(url), resolve(el.duration));
      el.onerror = () => (URL.revokeObjectURL(url), reject(new Error("Couldn't read the sound")));
      el.src = url;
    });
    if (seconds > maxSeconds + 0.5) throw new Error(`The sound is ${seconds.toFixed(1)} s — ${maxSeconds} s at most`);
    q += `&seconds=${seconds.toFixed(2)}`;
  }
  const res = await fetch(`/api/advertise/${id}/media?${q}`, { method: "PUT", body: file });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed");
}

async function post(body: unknown) {
  const res = await fetch("/api/admin/monetize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
}

const EMPTY = {
  id: null as string | null, name: "", advertiser: "", title: "", body: "", cta: "Learn more", link: "", image: "", lang: "any",
  placements: ["site", "remix", "radio"], cpm: 2, budget: 100, endsAt: "", format: "card" as "card" | "audio", topic: "other",
};

export default function MonetizeTab({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const settings = useSettings();
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
  const saveCampaign = async (f: Record<string, unknown>, files: { image: File | null; audio: File | null }) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/monetize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "campaign", ...f }) });
      const d = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !d.id) throw new Error(d.error ?? "Couldn't save");
      if (files.image) await uploadMedia(d.id, "image", files.image, settings.audio.maxSeconds);
      if (files.audio) await uploadMedia(d.id, "audio", files.audio, settings.audio.maxSeconds);
      setForm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };
  const pendingClaims = data.claims.filter((c) => c.status === "pending");
  const pendingPayouts = data.payouts.filter((p) => p.status === "requested");

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box
          label="Remixt's share, all time"
          value={formatMoney(data.money.platform)}
          detail={data.money.unclaimed ? `incl. ${formatMoney(data.money.unclaimed)} never claimed in ${settings.payouts.unclaimedYears} years` : undefined}
        />
        <Box label="Paid to members (incl. waiting)" value={formatMoney(data.money.members)} />
        <Box label="Kept for artists not verified" value={formatMoney(data.money.held)} />
        <Box label="This month, everyone" value={formatMoney(data.money.month)} />
        <Box label="Ad views today" value={`${data.views.today}`} detail={`${data.views.paidToday} paid`} />
        <Box label="Ad views this month" value={`${data.views.month}`} detail={`${data.views.paidMonth} paid`} />
        <Box label="Claims to check" value={`${pendingClaims.length}`} />
        <Box label="Payouts to send" value={`${pendingPayouts.length}`} detail={formatMoney(pendingPayouts.reduce((s, p) => s + p.micros, 0))} />
        <Box label="Ads to approve" value={`${data.queue.campaigns.length}`} />
        <Box label="Advertiser payments to check" value={`${data.queue.payments.length}`} detail={formatMoney(data.queue.payments.reduce((s, p) => s + p.micros, 0))} />
      </div>

      <ReviewQueue queue={data.queue} act={act} />
      <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
        Shares, prices, the Toman rate, how advertisers pay you, audio-ad rules and every other number are in{" "}
        <button type="button" onClick={onOpenSettings} className="font-semibold text-brand-strong hover:underline">
          Settings
        </button>
        .
      </p>

      <NetworkMonths months={data.networks ?? []} act={act} onOpenSettings={onOpenSettings} />

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
        {form && <CampaignForm initial={form} onCancel={() => setForm(null)} onSave={saveCampaign} />}
        <ul className="mt-3 flex flex-col gap-2">
          {data.campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <span className={`h-2 w-2 rounded-full ${c.active ? "bg-success" : "bg-muted"}`} />
              <span className="min-w-0 flex-1">
                <span className="me-1 rounded bg-surface-raised px-1.5 py-0.5 text-[11px]">{c.format}</span>
                {c.review !== "approved" && <span className="me-1 rounded bg-drums/15 px-1.5 py-0.5 text-[11px] text-drums">{c.review}</span>}
                {c.owner_id && <span className="me-1 rounded bg-brand/15 px-1.5 py-0.5 text-[11px] text-brand-strong">self-serve</span>}
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-muted">
                  · {c.advertiser || "—"} · {c.format === "promote" ? c.promote_target : c.placements.join(", ")} · {c.lang} · {topicName(c.topic)}
                </span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                {c.views.toLocaleString()} views · {c.clicks.toLocaleString()} clicks · {formatMoney(c.cpm_micros)} CPM · {formatMoney(c.spent_micros)} / {formatMoney(c.budget_micros)}
              </span>
              {!c.owner_id && (
                <button type="button" onClick={() => setForm(toForm(c))} className="text-xs text-brand-strong hover:underline">
                  Edit
                </button>
              )}
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
              <span className="font-semibold tabular-nums">
                {formatMoney(p.micros)}
                {p.currency === "IRT" && p.toman !== null && <span className="block text-xs font-normal text-muted">= {p.toman.toLocaleString()} Toman</span>}
              </span>
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
    format: c.format === "audio" ? "audio" : "card", topic: c.topic,
  };
}

/** Each month's network views, and sharing out what the network paid for it. */
function NetworkMonths({ months, act, onOpenSettings }: { months: NetworkMonth[]; act: (body: unknown) => Promise<void>; onOpenSettings?: () => void }) {
  const settings = useSettings();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const on = settings.network.adsense || settings.network.other;
  const nameOf = (n: string) => (n === "adsense" ? "Google AdSense" : settings.network.otherName || "Other network");
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <section>
      <h3 className="font-semibold">Ad networks</h3>
      <p className="mt-1 text-xs text-muted">
        {on ? `On: ${[settings.network.adsense && "Google AdSense", settings.network.other && nameOf("other")].filter(Boolean).join(" and ")}. ` : "Off. "}
        A network fills a picture spot no campaign takes, on pages that aren&apos;t the Studio, upload, library or DJ. It pays Remixt once a month (AdSense
        around the 21st, for the month before). When it has paid, enter the amount here: it&apos;s split between the pages by their network views, then each
        page&apos;s part by the usual shares, and members see it on /earnings after the hold.{" "}
        <button type="button" onClick={onOpenSettings} className="font-semibold text-brand-strong hover:underline">
          Network settings
        </button>
      </p>
      {months.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm text-muted">No network views yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {months.map((m) => {
            const key = `${m.network}|${m.month}`;
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.month}</span> <span className="text-muted">· {nameOf(m.network)} · {m.views.toLocaleString()} counted views on {m.pages} pages</span>
                </span>
                {m.closed ? (
                  <span className="text-xs text-success">
                    {formatMoney(m.closed.micros)} shared {new Date(m.closed.at).toLocaleDateString()}
                    {m.views ? ` · RPM ${formatMoney(Math.round((m.closed.micros / m.views) * 1000))}` : ""}
                  </span>
                ) : m.month >= thisMonth ? (
                  <span className="text-xs text-muted">Shared after the month ends</span>
                ) : (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amount = Number(amounts[key]);
                      if (!(amount > 0)) return;
                      if (!confirm(`Share ${formatMoney(Math.round(amount * MICROS))} from ${nameOf(m.network)} for ${m.month}? This can't be undone.`)) return;
                      void act({ action: "network-close", network: m.network, month: m.month, amount });
                    }}
                  >
                    <span className="text-xs text-muted">Paid $</span>
                    <input
                      inputMode="decimal"
                      value={amounts[key] ?? ""}
                      onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))}
                      placeholder="0.00"
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums"
                      aria-label={`What ${nameOf(m.network)} paid for ${m.month}, in dollars`}
                    />
                    <button type="submit" className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white">
                      Share out
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
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

function CampaignForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: typeof EMPTY;
  onSave: (f: Record<string, unknown>, files: { image: File | null; audio: File | null }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const { maxSeconds } = useSettings().audio;
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, image: f.image || null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null }, { image, audio });
      }}
      className="mt-3 grid gap-2 rounded-xl border border-brand/40 bg-surface p-4 text-sm sm:grid-cols-2"
    >
      <select className="input" value={f.format} onChange={set("format")} aria-label="Kind">
        <option value="card">Picture ad</option>
        <option value="audio">Audio ad (≤ {maxSeconds} s)</option>
      </select>
      <select className="input" value={f.topic} onChange={set("topic")} aria-label="Topic">
        {TOPICS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.en}
          </option>
        ))}
      </select>
      <input className="input" placeholder="Campaign name (yours)" value={f.name} onChange={set("name")} required />
      <input className="input" placeholder="Advertiser (shown)" value={f.advertiser} onChange={set("advertiser")} />
      <input className="input" placeholder="Headline (≤ 80)" value={f.title} onChange={set("title")} maxLength={80} required />
      <input className="input" placeholder="Button (≤ 30)" value={f.cta} onChange={set("cta")} maxLength={30} required />
      <textarea className="input sm:col-span-2" placeholder="One or two lines (≤ 200)" value={f.body} onChange={set("body")} maxLength={200} rows={2} />
      <input className="input" placeholder="https://their-page" value={f.link} onChange={set("link")} required />
      <input className="input" placeholder="Picture URL (square, optional)" value={f.image} onChange={set("image")} />
      <label className="grid gap-1 text-xs text-muted">
        Or upload a picture (JPEG/PNG, 1 MB)
        <input type="file" accept="image/jpeg,image/png" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      </label>
      {f.format === "audio" && (
        <label className="grid gap-1 text-xs text-muted">
          The sound (≤ {maxSeconds} s, 1 MB){!f.id && " — required"}
          <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        </label>
      )}
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

type Queue = Overview["queue"];

/** Advertisers' ads waiting for the owner, and their payments to check. */
function ReviewQueue({ queue, act }: { queue: Queue; act: (body: unknown) => Promise<void> }) {
  if (!queue.campaigns.length && !queue.payments.length) return null;
  return (
    <section className="rounded-2xl border border-drums/40 bg-drums/5 p-4">
      <h3 className="font-semibold">Waiting for you</h3>
      {queue.campaigns.length > 0 && (
        <>
          <p className="mt-2 text-xs text-muted">
            Ads from advertisers. Check they&apos;re true, legal where they show, lead where they say, and are about the topic they claim. They run once
            approved and paid.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {queue.campaigns.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <p className="text-xs text-muted">
                  {c.format} · {topicName(c.topic)} · {c.lang} · {c.format === "promote" ? `promotes “${c.promote_title ?? c.promote_target}”` : c.placements.join(", ")} ·{" "}
                  {formatMoney(c.cpm_micros)} per 1,000 · by {c.artist_name} ({c.email})
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {(c.image_key || c.image_url) && (
                    // eslint-disable-next-line @next/next/no-img-element -- the ad's own picture
                    <img
                      src={c.image_key ? `/api/ads/media/${c.id}?f=image` : c.image_url!}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{c.title || c.name}</p>
                    {c.body && <p className="text-muted">{c.body}</p>}
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs text-brand-strong hover:underline">
                        {c.link}
                      </a>
                    )}
                  </div>
                </div>
                {c.audio_key && <audio controls src={`/api/ads/media/${c.id}?f=audio`} className="mt-2 w-full" />}
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => act({ action: "review", id: c.id, approve: true })} className="text-success hover:underline">
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => act({ action: "review", id: c.id, approve: false, note: prompt("Why not? (they'll see this)") ?? null })}
                    className="text-danger hover:underline"
                  >
                    Turn down
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {queue.payments.length > 0 && (
        <>
          <p className="mt-4 text-xs text-muted">Payments advertisers say they made. Find each in your account by its reference, then mark it.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {queue.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.artist_name}</span> <span className="text-muted">({p.email})</span> for “{p.campaign}”
                  <span className="block break-all text-xs text-muted">
                    {p.method} · ref {p.reference}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {p.currency === "IRT" && p.toman !== null ? `${p.toman.toLocaleString()} Toman` : formatMoney(p.micros)}
                  {p.currency === "IRT" && <span className="block text-xs font-normal text-muted">= {formatMoney(p.micros)}</span>}
                </span>
                <button type="button" onClick={() => act({ action: "ad-payment", id: p.id, received: true })} className="text-success hover:underline">
                  Received
                </button>
                <button
                  type="button"
                  onClick={() => act({ action: "ad-payment", id: p.id, received: false, note: prompt("What's wrong? (they'll see this)") ?? null })}
                  className="text-danger hover:underline"
                >
                  Not found
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
