"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

type Secret = { name: string; label: string; hint: string; group: string; set: boolean; from: "server" | "admin" | null; preview: string | null };
type Waiting = { id: string; artist_name: string; email: string; period: string; amount: string; reference: string; created_at: string };
type Member = { user_id: string; artist_name: string; email: string; plan: string; status: string; provider: string; period: string | null; current_period_end: string | null; cancel_at_period_end: boolean; note: string | null };
type Data = { secrets: Secret[]; waiting: Waiting[]; members: Member[]; counts: { provider: string; n: number }[]; mail: boolean; webhooks: { stripe: string; paypal: string } };

const GROUP: Record<string, string> = { stripe: "Stripe — cards, Apple Pay, Google Pay", paypal: "PayPal", ai: "The site's AI (OpenRouter)", mail: "Email (Resend)" };

/** Admin → Plans: gateways, members on Plus, payments by hand, giving Plus. */
export default function PlansTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [grant, setGrant] = useState({ email: "", months: "1" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/plans")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Couldn't load"));
  }, []);
  useEffect(load, [load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(JSON.stringify(body).slice(0, 80));
    setError(null);
    setNote(null);
    const res = await fetch("/api/admin/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(out?.error ?? "Failed");
    setNote(done);
    load();
  };

  if (!data) return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  const groups = [...new Set(data.secrets.map((s) => s.group))];
  const active = data.members.filter((m) => m.plan === "plus" && m.current_period_end && new Date(m.current_period_end) > new Date());

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Prices, what only Plus can use, and switching plans on are in{" "}
        <button type="button" onClick={onOpenSettings} className="font-semibold text-brand-strong hover:underline">
          Settings → Plans
        </button>
        . Here: the payment services&apos; keys, members on Plus and payments to confirm.
      </p>
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {note && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{note}</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted">On Plus now</p>
          <p className="text-2xl font-bold">{active.length}</p>
        </div>
        {data.counts.map((c) => (
          <div key={c.provider} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs capitalize text-muted">{c.provider === "admin" ? "Given by hand" : c.provider === "manual" ? "Paid by hand" : c.provider}</p>
            <p className="text-2xl font-bold">{c.n}</p>
          </div>
        ))}
      </section>

      {data.waiting.length > 0 && (
        <section className="rounded-2xl border border-beat/40 bg-beat/5 p-4">
          <h3 className="font-semibold">Payments by hand to confirm ({data.waiting.length})</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {data.waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <strong>{w.artist_name}</strong> <span className="text-muted">({w.email})</span> · {w.period === "year" ? "a year" : "a month"} · {w.amount} · ref. <code>{w.reference}</code>
                  <span className="block text-xs text-muted">{new Date(w.created_at).toLocaleString()}</span>
                </span>
                <button type="button" onClick={() => void act({ action: "manual", id: w.id, confirm: true }, "Confirmed — Plus is on for them")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white">
                  Received — turn Plus on
                </button>
                <button type="button" onClick={() => void act({ action: "manual", id: w.id, confirm: false, note: prompt("Why? (they'll see this)") ?? null }, "Turned down")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-danger">
                  Not found
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h3 className="font-semibold">Payment services and keys</h3>
        <p className="text-xs text-muted">
          A key set on the server (environment) wins and can&apos;t be changed here. Keys entered here are stored encrypted and never shown again — only a hint.
        </p>
        {groups.map((g) => (
          <div key={g} className="rounded-2xl border border-border bg-surface p-4">
            <h4 className="text-sm font-bold">{GROUP[g] ?? g}</h4>
            {g === "stripe" && <Hook label="Webhook address (Developers → Webhooks)" url={data.webhooks.stripe} />}
            {g === "paypal" && <Hook label="Webhook address (your app → Webhooks)" url={data.webhooks.paypal} />}
            <div className="mt-3 flex flex-col gap-3">
              {data.secrets
                .filter((s) => s.group === g)
                .map((s) => (
                  <div key={s.name} className="grid gap-1 text-sm sm:grid-cols-[14rem_1fr_auto] sm:items-center sm:gap-3">
                    <span>
                      {s.label}
                      <span className="block text-[11px] text-muted">{s.set ? (s.from === "server" ? `Set on the server · ${s.preview}` : `Set here · ${s.preview}`) : s.hint}</span>
                    </span>
                    <input
                      className="input"
                      type={s.name === "PAYPAL_MODE" || s.name === "MAIL_FROM" ? "text" : "password"}
                      autoComplete="off"
                      disabled={s.from === "server"}
                      placeholder={s.set ? "Leave empty to keep it" : s.hint}
                      value={drafts[s.name] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={s.from === "server" || !drafts[s.name]?.trim() || !!busy}
                        onClick={() => void act({ action: "secret", name: s.name, value: drafts[s.name] ?? "" }, `${s.label} saved`).then(() => setDrafts((d) => ({ ...d, [s.name]: "" })))}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Save
                      </button>
                      {s.from === "admin" && (
                        <button type="button" onClick={() => confirm(`Remove the ${s.label}?`) && void act({ action: "secret", name: s.name, value: "" }, `${s.label} removed`)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-danger">
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            {g === "mail" && (
              <button type="button" onClick={() => void act({ action: "test-mail" }, "Test email sent to you")} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                Send me a test email
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-muted">
          Apple&apos;s in-app purchase only applies to an app in the App Store; on the web, Apple Pay comes through Stripe Checkout (add and verify the domain under
          Stripe → Settings → Payment methods → Apple Pay).
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="font-semibold">Give Plus to someone</h3>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "grant", email: grant.email, months: Number(grant.months) }, `Plus given to ${grant.email}`);
          }}
        >
          <input className="input min-w-0 flex-1" type="email" required placeholder="Their email" value={grant.email} onChange={(e) => setGrant((g) => ({ ...g, email: e.target.value }))} />
          <select className="input w-32" value={grant.months} onChange={(e) => setGrant((g) => ({ ...g, months: e.target.value }))}>
            {[1, 3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} month{m > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!!busy} className="rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Give"}
          </button>
        </form>
      </section>

      <section>
        <h3 className="font-semibold">Members ({data.members.length})</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {data.members.map((m) => {
            const on = m.plan === "plus" && m.current_period_end && new Date(m.current_period_end) > new Date();
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <strong>{m.artist_name}</strong> <span className="text-muted">{m.email}</span>
                  <span className="block text-xs text-muted">
                    {on ? "Plus" : "Free"} · {m.provider} · {m.status}
                    {m.current_period_end ? ` · ${m.cancel_at_period_end ? "ends" : "renews"} ${new Date(m.current_period_end).toLocaleDateString()}` : ""}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                </span>
                {on && (
                  <button type="button" onClick={() => confirm(`End Plus for ${m.artist_name} now?`) && void act({ action: "revoke", userId: m.user_id }, "Plus ended")} className="rounded-lg border border-border px-2.5 py-1 text-xs text-danger">
                    End now
                  </button>
                )}
              </li>
            );
          })}
          {data.members.length === 0 && <li className="text-sm text-muted">Nobody yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function Hook({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      {label}: <code className="break-all text-foreground">{url}</code>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
        aria-label="Copy the address"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </p>
  );
}
