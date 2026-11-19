"use client";

// A remix's maker decides about ads on it (like YouTube's per-video
// monetization): on or off, which kinds, which topics never next to it —
// and sees what its artists chose, what it earned and its promotions.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CircleDollarSign, ExternalLink, Loader2, Megaphone } from "lucide-react";
import { adKindText, AD_KINDS, SONG_POLICY_TEXT, TOPICS, type AdKind, type RemixAdSettings } from "@/lib/monetize/adRules";
import { moneyIn, moneyPath, numIn, type Lang } from "@/lib/monetize/moneyText";
import type { RemixMoney } from "@/lib/monetize/adStore";
import { useSettings } from "@/components/SettingsProvider";

const T = {
  en: {
    back: "Back to earnings",
    title: (r: string) => `Ads on “${r}”`,
    open: "Open the remix",
    notPublic: "This remix is private: no ads show until it's published.",
    adsOn: "Show ads on this remix",
    adsOnHelp: "Ads pay you, your collaborators and the artists of the songs you used. Off: nobody earns from it.",
    kinds: "Which kinds",
    topics: "Never next to my music",
    topicsHelp: "Ads about these topics won't show on this remix.",
    save: "Save",
    saved: "Saved — from the next ad on.",
    failed: "Couldn't save",
    forced: (s: string) => `The artist of “${s}” chose Monetize: ads stay on in the kinds you allow, even with your switch off. You still get your share.`,
    blocked: (s: string) => `The artist of “${s}” chose Block: this remix can't be public. Take that song out in the Studio and publish again.`,
    artists: "What its artists chose",
    noChoice: "Not verified yet — follows you",
    earned: "What it earned",
    yours: "Yours",
    everyone: "Everyone (incl. artists and Remixt)",
    views: "Paid views",
    byKind: { card: "Picture ads", audio: "Audio ads", promote: "Promotion" } as Record<string, string>,
    where: { remix: "on its page", radio: "on the radio", site: "", promote: "" } as Record<string, string>,
    promote: "Promote this remix",
    promoteHelp: "Pay to show it first in the remixes list (marked Promoted). The money goes to Remixt; listeners come to you.",
    promotions: "Its promotions",
    review: { draft: "Draft", pending: "Being checked", approved: "Running", rejected: "Turned down" } as Record<string, string>,
    spent: (s: string, b: string) => `${s} of ${b} spent`,
    clicks: (n: string) => `${n} opened`,
  },
  fa: {
    back: "بازگشت به درآمد",
    title: (r: string) => `تبلیغ روی «${r}»`,
    open: "باز کردن ریمیکس",
    notPublic: "این ریمیکس خصوصی است: تا منتشر نشود تبلیغی نشان داده نمی‌شود.",
    adsOn: "نمایش تبلیغ روی این ریمیکس",
    adsOnHelp: "تبلیغ به شما، همکارانتان و هنرمندانِ آهنگ‌هایی که استفاده کرده‌اید پول می‌دهد. خاموش: هیچ‌کس از آن درآمد ندارد.",
    kinds: "چه نوع تبلیغی",
    topics: "هرگز کنار موسیقی من",
    topicsHelp: "تبلیغ دربارهٔ این موضوع‌ها روی این ریمیکس نشان داده نمی‌شود.",
    save: "ذخیره",
    saved: "ذخیره شد — از تبلیغ بعدی.",
    failed: "ذخیره نشد",
    forced: (s: string) => `هنرمندِ «${s}» «کسب درآمد» را انتخاب کرده: تبلیغ در انواعی که اجازه داده‌اید روشن می‌ماند، حتی اگر خاموشش کنید. سهم شما همچنان پرداخت می‌شود.`,
    blocked: (s: string) => `هنرمندِ «${s}» «مسدود» را انتخاب کرده: این ریمیکس نمی‌تواند عمومی باشد. آن آهنگ را در استودیو بردارید و دوباره منتشر کنید.`,
    artists: "انتخاب هنرمندانِ آن",
    noChoice: "هنوز تأیید نشده — تابع شما",
    earned: "درآمد آن",
    yours: "سهم شما",
    everyone: "همه (با هنرمندان و ریمیکست)",
    views: "بازدید پولی",
    byKind: { card: "تبلیغ تصویری", audio: "تبلیغ صوتی", promote: "معرفی ویژه" } as Record<string, string>,
    where: { remix: "در صفحه‌اش", radio: "در رادیو", site: "", promote: "" } as Record<string, string>,
    promote: "معرفی ویژهٔ این ریمیکس",
    promoteHelp: "پول بدهید تا اولِ فهرست ریمیکس‌ها (با برچسب «ویژه») نشان داده شود. پول به ریمیکست می‌رسد؛ شنونده به شما.",
    promotions: "معرفی‌های ویژهٔ آن",
    review: { draft: "پیش‌نویس", pending: "در حال بررسی", approved: "در حال اجرا", rejected: "رد شد" } as Record<string, string>,
    spent: (s: string, b: string) => `${s} از ${b} خرج شده`,
    clicks: (n: string) => `${n} باز شده`,
  },
};

export default function RemixAdPanel({ remixId, lang = "en", rate = 0 }: { remixId: string; lang?: Lang; rate?: number }) {
  const t = T[lang];
  const fa = lang === "fa";
  const kindText = adKindText(useSettings().audio);
  const money = useMemo(() => moneyIn(lang, rate), [lang, rate]);
  const num = useMemo(() => numIn(lang), [lang]);
  const [data, setData] = useState<RemixMoney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RemixAdSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/remixes/${remixId}/ads`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Not found");
        setData(d);
        setForm(d.ads.settings);
      })
      .catch((e) => setError(e.message));
  }, [remixId]);
  useEffect(load, [load]);

  async function save() {
    if (!form) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/remixes/${remixId}/ads`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error(t.failed);
      setNote(t.saved);
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{error}</p>;
  if (!data || !form) return <div className="h-64 animate-pulse rounded-3xl bg-surface" />;
  const ads = data.ads;
  const monetizing = ads.songs.find((s) => s.policy === "monetize");
  const blocking = ads.songs.find((s) => s.policy === "block");
  const toggleKind = (k: AdKind) => setForm({ ...form, kinds: form.kinds.includes(k) ? form.kinds.filter((x) => x !== k) : [...form.kinds, k] });
  const toggleTopic = (id: string) =>
    setForm({ ...form, blockedTopics: form.blockedTopics.includes(id) ? form.blockedTopics.filter((x) => x !== id) : [...form.blockedTopics, id] });
  const max = Math.max(1, ...data.last30.map((d) => d.micros));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={moneyPath(lang, "/earnings")} className="text-sm text-brand-strong hover:underline">
          {t.back}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{t.title(data.remix.title)}</h1>
        <Link href={`/remixes/${remixId}`} className="mt-1 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          {t.open} <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {!data.remix.published && <p className="rounded-2xl border border-border bg-surface-raised p-3 text-sm text-muted">{t.notPublic}</p>}
      {blocking && (
        <p className="flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" /> {t.blocked(blocking.title)}
        </p>
      )}
      {!blocking && monetizing && (!form.on || !form.kinds.length) && (
        <p className="flex items-start gap-2 rounded-2xl border border-drums/40 bg-drums/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t.forced(monetizing.title)}
        </p>
      )}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={form.on} onChange={(e) => setForm({ ...form, on: e.target.checked })} className="mt-1 h-5 w-5 accent-[var(--brand)]" />
          <span>
            <span className="block font-semibold">{t.adsOn}</span>
            <span className="block text-sm text-muted">{t.adsOnHelp}</span>
          </span>
        </label>

        <fieldset className={`mt-5 ${form.on ? "" : "opacity-50"}`}>
          <legend className="font-semibold">{t.kinds}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {AD_KINDS.map((k) => (
              <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-2xl border p-3 ${form.kinds.includes(k) ? "border-brand bg-brand/10" : "border-border"}`}>
                <input type="checkbox" checked={form.kinds.includes(k)} onChange={() => toggleKind(k)} className="mt-1 accent-[var(--brand)]" />
                <span>
                  <span className="block text-sm font-semibold">{fa ? kindText[k].fa : kindText[k].en}</span>
                  <span className="block text-xs text-muted">{fa ? kindText[k].faHelp : kindText[k].enHelp}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="font-semibold">{t.topics}</legend>
          <p className="text-sm text-muted">{t.topicsHelp}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TOPICS.map((topic) => {
              const off = form.blockedTopics.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={off}
                  onClick={() => toggleTopic(topic.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${off ? "border-danger bg-danger/10 text-foreground line-through" : "border-border text-muted"}`}
                >
                  {fa ? topic.fa : topic.en}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.save}
          </button>
          {note && <p className="text-sm">{note}</p>}
        </div>
      </section>

      {ads.songs.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="font-semibold">{t.artists}</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {ads.songs.map((s) => (
              <li key={s.trackId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.policy === "block" ? "bg-danger/15 text-danger" : s.policy === "monetize" ? "bg-success/15 text-success" : "bg-surface-raised text-muted"
                  }`}
                >
                  {s.policy && s.verified ? (fa ? SONG_POLICY_TEXT[s.policy].fa : SONG_POLICY_TEXT[s.policy].en) : t.noChoice}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CircleDollarSign className="h-5 w-5 text-success" /> {t.earned}
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">{t.yours}</dt>
            <dd className="text-xl font-bold tabular-nums">{money(data.yours)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.everyone}</dt>
            <dd className="text-xl font-bold tabular-nums">{money(data.everyone)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.views}</dt>
            <dd className="text-xl font-bold tabular-nums">{num(data.views)}</dd>
          </div>
        </dl>
        {data.byKind.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {data.byKind.map((k) => (
              <li key={`${k.format}-${k.placement}`} className="rounded-full bg-surface-raised px-3 py-1">
                {t.byKind[k.format] ?? k.format} {t.where[k.placement]} · {num(k.views)} · {money(k.micros)}
              </li>
            ))}
          </ul>
        )}
        {data.last30.length > 0 && (
          <div className="mt-4 flex h-20 items-end gap-[3px]" dir="ltr" aria-hidden>
            {data.last30.map((d) => (
              <div key={d.day} className="flex-1 rounded-t bg-brand/60" style={{ height: `${Math.max(4, (d.micros / max) * 100)}%` }} title={`${d.day} · ${money(d.micros)}`} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-brand/40 bg-gradient-to-br from-brand/15 to-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Megaphone className="h-5 w-5 text-brand-strong" /> {t.promote}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.promoteHelp}</p>
        {data.remix.published && (
          <Link
            href={`${moneyPath(lang, "/advertise")}?promote=${encodeURIComponent(`remix:${remixId}`)}`}
            className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            {t.promote}
          </Link>
        )}
        {data.promotions.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">{t.promotions}</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {data.promotions.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs">{t.review[p.review] ?? p.review}</span>
                  <span className="text-muted">{t.spent(money(p.spent), money(p.budget))}</span>
                  <span className="text-muted">· {num(p.views)} · {t.clicks(num(p.clicks))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
