"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Wallet } from "lucide-react";
import type { Period } from "@/lib/plans";

type Status = {
  user: { email: string; verified: boolean } | null;
  plan: "free" | "plus";
  subscription?: { status: string; provider: string; period: Period | null; until: string | null; cancelAtPeriodEnd: boolean; canManage: boolean } | null;
  manual?: { id: string; period: Period; amount: string; reference: string; status: string; admin_note: string | null; created_at: string }[];
  ai?: { used: number; limit: number; left: number } | null;
  offers: { enabled: boolean; stripe: boolean; paypal: boolean; manual: boolean };
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");

/** Join, pay, or manage Plus — on /plus, in the Plus card. */
export default function PlusActions({ signedIn, manualHow }: { signedIn: boolean; manualHow: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [byHand, setByHand] = useState(false);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [sent, setSent] = useState(false);

  const load = (session?: string | null) =>
    fetch(`/api/billing${session ? `?session=${encodeURIComponent(session)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setError("Couldn't load your plan — check your connection"));

  useEffect(() => {
    void load(new URLSearchParams(window.location.search).get("session"));
  }, []);

  const go = async (provider: "stripe" | "paypal") => {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, period }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't start the payment");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the payment");
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy("manage");
    setError(null);
    try {
      const res = await fetch("/api/billing/manage", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't open it");
      if (data.url) window.location.href = data.url;
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open it");
    } finally {
      setBusy(null);
    }
  };

  const sendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("manual");
    setError(null);
    try {
      const res = await fetch("/api/billing/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, amount, reference }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send it");
      setSent(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn)
    return (
      <Link href="/signup?next=/plus" className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong">
        Sign up to join Plus
      </Link>
    );
  if (!status)
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
      </p>
    );

  const sub = status.subscription;
  const waiting = status.manual?.find((m) => m.status === "waiting");
  const noWay = !status.offers.stripe && !status.offers.paypal && !status.offers.manual;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {status.plan === "plus" ? (
        <div className="rounded-xl bg-success/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-success">
            <Check className="h-4 w-4" /> You&apos;re on Plus
          </p>
          <p className="mt-1 text-muted">
            {sub?.cancelAtPeriodEnd ? `Until ${day(sub.until)} — it won't renew.` : sub?.until ? `Renews ${day(sub.until)}.` : "Thank you for supporting Remixt."}
          </p>
          {status.ai && <p className="mt-1 text-xs text-muted">AI today: {status.ai.left.toLocaleString("en-US")} of {status.ai.limit.toLocaleString("en-US")} tokens left.</p>}
          {sub?.canManage && (
            <button type="button" onClick={() => void manage()} disabled={!!busy} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50">
              {busy === "manage" ? "Opening…" : sub.provider === "stripe" ? "Manage card, invoices or cancel" : sub.cancelAtPeriodEnd ? "Cancelled" : "Cancel PayPal subscription"}
            </button>
          )}
        </div>
      ) : (
        <>
          {status.user && !status.user.verified && (
            <p className="rounded-lg bg-beat/10 px-3 py-2 text-xs">Confirm your email first (the link is in your inbox — or use the banner at the top to send it again).</p>
          )}
          <div role="radiogroup" aria-label="How often to pay" className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-sm">
            {(["month", "year"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={`min-h-9 rounded-md font-semibold ${period === p ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}>
                {p === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
          {status.offers.stripe && (
            <button type="button" onClick={() => void go("stripe")} disabled={!!busy} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              {busy === "stripe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Card, Apple Pay or Google Pay
            </button>
          )}
          {status.offers.paypal && (
            <button type="button" onClick={() => void go("paypal")} disabled={!!busy} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#ffc439] px-4 font-semibold text-[#111] hover:brightness-95 disabled:opacity-50">
              {busy === "paypal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} PayPal
            </button>
          )}
          {status.offers.manual &&
            (waiting ? (
              <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs">
                Your payment ({waiting.amount}, ref. {waiting.reference}) is waiting to be confirmed — usually within a day. You&apos;ll get a notice.
              </p>
            ) : byHand ? (
              <form onSubmit={sendManual} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                {manualHow ? <p className="whitespace-pre-line text-xs text-muted">{manualHow}</p> : <p className="text-xs text-muted">Ask the Remixt team for the account to pay into.</p>}
                <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="What you paid (e.g. 350,000 Toman)" required maxLength={60} />
                <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference / tracking number" required maxLength={200} />
                <button type="submit" disabled={busy === "manual"} className="min-h-10 rounded-lg bg-brand px-3 font-semibold text-white disabled:opacity-50">
                  {busy === "manual" ? "Sending…" : "I've paid — check it"}
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setByHand(true)} className="text-sm font-semibold text-brand-strong hover:underline">
                Pay by card to card, bank or USDT
              </button>
            ))}
          {sent && <p className="text-xs text-success">Sent — we&apos;ll confirm it soon.</p>}
          {noWay && <p className="text-xs text-muted">Payments open soon.</p>}
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
