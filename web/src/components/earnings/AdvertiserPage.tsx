"use client";

// The advertiser page: make an ad (a picture card, an audio ad up to 15 s,
// or a promotion of your own remix or song), choose where and to whom it
// shows and what you pay per 1,000 views, pay by card-to-card / bank / USDT
// with a reference, and send it for review. It runs once Remixt approves it
// and has its payment, until the budget is spent. Results day by day.

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, CircleAlert, Image as ImageIcon, Loader2, Megaphone, Music, Pause, Pencil, Play, Plus, Send, Wallet, X } from "lucide-react";
import { AUDIO, NEVER, TOPICS, microsOfToman, tomanOf, type Format } from "@/lib/monetize/adRules";
import { MICROS, type Placement } from "@/lib/monetize/policy";
import { moneyIn, numIn, dateIn, type Lang } from "@/lib/monetize/moneyText";
import type { AdvertiserCampaign } from "@/lib/monetize/adStore";
import type { MonetizeSettings } from "@/lib/monetize/store";

type Promotable = { target: string; title: string; kind: "remix" | "track" };
type Data = { campaigns: AdvertiserCampaign[]; promotable: Promotable[]; settings: MonetizeSettings };

const T = {
  en: {
    title: "Advertise on Remixt",
    intro: "Reach people who make and listen to music. You pay only for real views — at least half the ad on screen for a second, or 5 seconds of an audio ad heard. Clicks are free.",
    newAd: "New ad",
    yourAds: "Your ads",
    none: "No ads yet.",
    formats: {
      card: ["Picture ad", "A card with your picture and link, on remix pages, the radio and the tools."],
      audio: ["Audio ad", `Up to ${AUDIO.maxSeconds} s before a remix plays and in radio breaks. Skippable after ${AUDIO.skipAfter} s.`],
      promote: ["Promote your music", "Your remix first in the remixes list, or your song first in the library, marked Promoted."],
    } as Record<Format, [string, string]>,
    whatToPromote: "What to promote",
    nothingToPromote: "Publish a remix or upload a song first.",
    advertiser: "Your name or brand",
    adTitle: "Headline",
    body: "Text (optional)",
    cta: "Button",
    link: "Opens (https://…)",
    topic: "What it's about",
    topicHelp: "Remixers can keep topics off their remixes, so say honestly.",
    lang: "Shown to",
    langs: { any: "Everyone", en: "English pages", fa: "Persian pages" },
    where: "Where",
    places: { site: "Lists, tools and other pages", remix: "Remix pages", radio: "The radio", promote: "" } as Record<Placement, string>,
    price: "Your price per 1,000 views",
    priceHelp: (m: string) => `At least ${m}. A higher price shows more often than others'.`,
    ends: "Ends on (optional)",
    picture: "Picture (JPEG/PNG, square looks best, 1 MB)",
    sound: `Sound (MP3/M4A/OGG/WAV, ${AUDIO.maxSeconds} s at most, 1 MB)`,
    tooLong: (s: string) => `That sound is ${s} s — ${AUDIO.maxSeconds} s at most.`,
    save: "Save",
    saveSubmit: "Save and send for review",
    cancel: "Cancel",
    preview: "Preview",
    sponsored: "Sponsored",
    never: "Never on Remixt",
    status: { draft: "Draft", pending: "Being checked", approved: "Approved", rejected: "Turned down" } as Record<string, string>,
    paused: "Paused",
    running: "Running",
    noBudget: "Add money to run",
    ended: "Ended",
    stats: (v: string, c: string, ctr: string) => `${v} paid views · ${c} clicks · ${ctr} opened`,
    spent: (s: string, b: string) => `${s} spent of ${b}`,
    edit: "Edit",
    submit: "Send for review",
    pause: "Pause",
    resume: "Resume",
    addMoney: "Add money",
    payTitle: "Add money to this ad",
    payTo: "How to pay",
    payToMissing: "Remixt hasn't put payment details here yet — write to us to pay.",
    amount: "Amount",
    method: "How you paid",
    methods: ["Card to card", "Bank transfer", "USDT (TRC-20)", "Other"],
    reference: "Reference / tracking number / transaction id",
    sendPayment: "I've paid — send",
    paymentSent: "Sent — your budget goes up once we see it arrive.",
    payments: "Payments",
    payState: { pending: "Being checked", received: "Received", rejected: "Not found" } as Record<string, string>,
    rules: "Every ad is checked before it runs. Ads must be true, legal where they show, and lead where they say.",
    reviewNote: "Our note",
    failed: "Something went wrong",
    last14: "Last 14 days",
    usd: "Dollars",
    toman: "Toman",
  },
  fa: {
    title: "تبلیغ در ریمیکست",
    intro: "به کسانی برسید که موسیقی می‌سازند و گوش می‌دهند. فقط برای بازدید واقعی پول می‌دهید — دست‌کم نیمی از تبلیغ یک ثانیه روی صفحه، یا ۵ ثانیه شنیدنِ تبلیغ صوتی. کلیک رایگان است.",
    newAd: "تبلیغ تازه",
    yourAds: "تبلیغ‌های شما",
    none: "هنوز تبلیغی ندارید.",
    formats: {
      card: ["تبلیغ تصویری", "کارتی با عکس و لینک شما، در صفحهٔ ریمیکس‌ها، رادیو و ابزارها."],
      audio: ["تبلیغ صوتی", `تا ${AUDIO.maxSeconds} ثانیه پیش از پخش ریمیکس و در وقفه‌های رادیو. پس از ${AUDIO.skipAfter} ثانیه رد شدنی.`],
      promote: ["معرفی ویژهٔ موسیقی‌تان", "ریمیکس شما اولِ فهرست ریمیکس‌ها، یا آهنگتان اولِ کتابخانه، با برچسب «ویژه»."],
    } as Record<Format, [string, string]>,
    whatToPromote: "چه چیزی معرفی شود",
    nothingToPromote: "اول یک ریمیکس منتشر کنید یا آهنگی آپلود کنید.",
    advertiser: "نام شما یا برند",
    adTitle: "عنوان",
    body: "متن (اختیاری)",
    cta: "دکمه",
    link: "لینک (https://…)",
    topic: "دربارهٔ چیست",
    topicHelp: "ریمیکسرها می‌توانند موضوع‌هایی را از ریمیکسشان دور نگه دارند، پس صادقانه بگویید.",
    lang: "نمایش برای",
    langs: { any: "همه", en: "صفحه‌های انگلیسی", fa: "صفحه‌های فارسی" },
    where: "کجا",
    places: { site: "فهرست‌ها، ابزارها و صفحه‌های دیگر", remix: "صفحهٔ ریمیکس‌ها", radio: "رادیو", promote: "" } as Record<Placement, string>,
    price: "قیمت شما برای هر ۱۰۰۰ بازدید",
    priceHelp: (m: string) => `حداقل ${m}. قیمت بالاتر بیشتر از بقیه نمایش داده می‌شود.`,
    ends: "تاریخ پایان (اختیاری)",
    picture: "عکس (JPEG/PNG، مربعی بهتر است، ۱ مگابایت)",
    sound: `صدا (MP3/M4A/OGG/WAV، حداکثر ${AUDIO.maxSeconds} ثانیه، ۱ مگابایت)`,
    tooLong: (s: string) => `این صدا ${s} ثانیه است — حداکثر ${AUDIO.maxSeconds} ثانیه.`,
    save: "ذخیره",
    saveSubmit: "ذخیره و ارسال برای بررسی",
    cancel: "انصراف",
    preview: "پیش‌نمایش",
    sponsored: "تبلیغ",
    never: "هرگز در ریمیکست",
    status: { draft: "پیش‌نویس", pending: "در حال بررسی", approved: "تأییدشده", rejected: "رد شد" } as Record<string, string>,
    paused: "متوقف",
    running: "در حال اجرا",
    noBudget: "برای اجرا پول اضافه کنید",
    ended: "پایان‌یافته",
    stats: (v: string, c: string, ctr: string) => `${v} بازدید پولی · ${c} کلیک · ${ctr} باز شده`,
    spent: (s: string, b: string) => `${s} خرج شده از ${b}`,
    edit: "ویرایش",
    submit: "ارسال برای بررسی",
    pause: "توقف",
    resume: "ادامه",
    addMoney: "افزودن پول",
    payTitle: "افزودن پول به این تبلیغ",
    payTo: "روش پرداخت",
    payToMissing: "ریمیکست هنوز اطلاعات پرداخت را اینجا نگذاشته — برای پرداخت به ما پیام دهید.",
    amount: "مبلغ",
    method: "چطور پرداخت کردید",
    methods: ["کارت به کارت", "انتقال بانکی", "تتر (TRC-20)", "روش دیگر"],
    reference: "شمارهٔ پیگیری / مرجع / شناسهٔ تراکنش",
    sendPayment: "پرداخت کردم — ارسال",
    paymentSent: "ارسال شد — وقتی واریز را ببینیم بودجه‌تان بالا می‌رود.",
    payments: "پرداخت‌ها",
    payState: { pending: "در حال بررسی", received: "دریافت شد", rejected: "پیدا نشد" } as Record<string, string>,
    rules: "هر تبلیغ پیش از اجرا بررسی می‌شود. تبلیغ باید راست باشد، جایی که نمایش داده می‌شود قانونی باشد، و همان‌جا ببرد که می‌گوید.",
    reviewNote: "یادداشت ما",
    failed: "مشکلی پیش آمد",
    last14: "۱۴ روز گذشته",
    usd: "دلار",
    toman: "تومان",
  },
};

const NEVER_FA = ["قمار و شرط‌بندی", "محتوای بزرگسالان", "سلاح", "مواد مخدر", "الکل و دخانیات", "طرح‌های پولسازی دروغین"];

type Form = {
  id: string | null; format: Format; advertiser: string; title: string; body: string; cta: string; link: string; topic: string;
  lang: "any" | "en" | "fa"; placements: Placement[]; price: string; endsAt: string; promoteTarget: string;
};

const blank = (format: Format, lang: Lang, promote: string | null): Form => ({
  id: null, format, advertiser: "", title: "", body: "", cta: lang === "fa" ? "بیشتر" : "Learn more", link: "", topic: format === "promote" ? "music" : "other",
  lang: "any", placements: format === "card" ? ["site", "remix", "radio"] : format === "audio" ? ["remix", "radio"] : ["promote"], price: "", endsAt: "",
  promoteTarget: promote ?? "",
});

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** A sound file's length (s), read by the browser before it's sent. */
function soundSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = new Audio();
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    el.src = url;
  });
}

export default function AdvertiserPage({ lang = "en" }: { lang?: Lang }) {
  const t = T[lang];
  const fa = lang === "fa";
  const params = useSearchParams();
  const promoteFrom = params.get("promote");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  /** When the page opened: an ad whose end date has passed shows as ended. */
  const [openedAt] = useState(() => Date.now());
  const rate = data?.settings.tomanRate ?? 0;
  const money = useMemo(() => moneyIn(lang, rate), [lang, rate]);
  const num = useMemo(() => numIn(lang), [lang]);
  const date = useMemo(() => dateIn(lang), [lang]);

  const load = useCallback(() => {
    fetch("/api/advertise", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? t.failed);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [t.failed]);
  useEffect(load, [load]);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !data || !promoteFrom) return;
    opened.current = true;
    setForm(blank("promote", lang, promoteFrom));
  }, [data, promoteFrom, lang]);

  async function act(id: string, action: string) {
    try {
      await call(`/api/advertise/${id}`, "PATCH", { action });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : t.failed);
    }
  }

  if (error) return <p className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-3xl bg-surface" />;

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-brand/25 via-surface to-vocals/10 p-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Megaphone className="h-7 w-7 text-brand-strong" /> {t.title}
        </h1>
        <p className="mt-2 max-w-3xl text-muted">{t.intro}</p>
        {!form && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(["card", "audio", "promote"] as Format[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setForm(blank(f, lang, null))}
                className="rounded-2xl border border-border bg-surface/80 p-4 text-start transition hover:border-brand hover:bg-surface-hover"
              >
                <span className="flex items-center gap-2 font-semibold">
                  {f === "card" ? <ImageIcon className="h-4 w-4" /> : f === "audio" ? <Music className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                  <Plus className="h-3.5 w-3.5" /> {t.formats[f][0]}
                </span>
                <span className="mt-1 block text-xs text-muted">{t.formats[f][1]}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {form && (
        <AdForm
          lang={lang}
          form={form}
          setForm={setForm}
          data={data}
          onDone={() => {
            setForm(null);
            load();
          }}
        />
      )}

      <section>
        <h2 className="text-xl font-bold">{t.yourAds}</h2>
        {data.campaigns.length === 0 ? (
          <p className="mt-2 text-muted">{t.none}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {data.campaigns.map((c) => {
              const ended = !!c.ends_at && new Date(c.ends_at).getTime() < openedAt;
              const broke = c.budget_micros - c.spent_micros < Math.max(1, c.cpm_micros / 1000);
              const state =
                c.review !== "approved" ? t.status[c.review] : !c.active ? t.paused : ended ? t.ended : broke ? t.noBudget : t.running;
              const good = c.review === "approved" && c.active && !ended && !broke;
              const maxDay = Math.max(1, ...c.days.map((d) => d.views));
              return (
                <li key={c.id} className="rounded-3xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs">{t.formats[c.format][0]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${good ? "bg-success/15 text-success" : c.review === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"}`}>
                          {state}
                        </span>
                      </p>
                      <p className="mt-1 truncate text-lg font-semibold">{c.format === "promote" ? (c.promoteTitle ?? c.name) : c.title || c.name}</p>
                      <p className="text-sm text-muted">
                        {t.spent(money(c.spent_micros), money(c.budget_micros))} · {t.stats(num(c.views), num(c.clicks), c.views ? `${num(Math.round((c.clicks / c.views) * 1000) / 10)}%` : "–")}
                      </p>
                      {c.review === "rejected" && c.review_note && (
                        <p className="mt-1 text-sm text-danger">
                          {t.reviewNote}: {c.review_note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            id: c.id, format: c.format, advertiser: c.advertiser, title: c.title, body: c.body, cta: c.cta, link: c.link, topic: c.topic,
                            lang: c.lang as Form["lang"], placements: c.placements as Placement[], price: priceText(c.cpm_micros, lang, rate),
                            endsAt: c.ends_at ? c.ends_at.slice(0, 10) : "", promoteTarget: c.promote_target ?? "",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
                      >
                        <Pencil className="h-3.5 w-3.5" /> {t.edit}
                      </button>
                      {(c.review === "draft" || c.review === "rejected") && (
                        <button type="button" onClick={() => act(c.id, "submit")} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                          <Send className="h-3.5 w-3.5" /> {t.submit}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => act(c.id, c.active ? "pause" : "resume")}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
                      >
                        {c.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {c.active ? t.pause : t.resume}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaying(paying === c.id ? null : c.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-success/50 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/10"
                      >
                        <Wallet className="h-3.5 w-3.5" /> {t.addMoney}
                      </button>
                    </div>
                  </div>
                  {c.days.length > 0 && (
                    <div className="mt-3">
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <BarChart3 className="h-3.5 w-3.5" /> {t.last14}
                      </p>
                      <div className="mt-1 flex h-14 items-end gap-1" dir="ltr">
                        {c.days.map((d) => (
                          <div key={d.day} className="flex-1 rounded-t bg-brand/60" style={{ height: `${Math.max(6, (d.views / maxDay) * 100)}%` }} title={`${d.day}: ${d.views}`} />
                        ))}
                      </div>
                    </div>
                  )}
                  {paying === c.id && <PaymentForm lang={lang} campaignId={c.id} settings={data.settings} onDone={() => { setPaying(null); load(); }} />}
                  {c.payments.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted">{t.payments}</p>
                      <ul className="mt-1 flex flex-col gap-1 text-sm">
                        {c.payments.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-muted">{date(p.created_at)}</span>
                            <span className="font-semibold tabular-nums">
                              {p.currency === "IRT" && p.toman !== null ? `${num(p.toman)} ${t.toman}` : money(p.micros)}
                            </span>
                            <span className="truncate text-muted" dir="ltr">
                              {p.method} · {p.reference}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${p.status === "received" ? "bg-success/15 text-success" : p.status === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"}`}
                            >
                              {t.payState[p.status] ?? p.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-surface/60 p-5 text-sm">
        <p className="text-muted">{t.rules}</p>
        <p className="mt-3 flex items-center gap-1.5 font-semibold">
          <CircleAlert className="h-4 w-4 text-danger" /> {t.never}
        </p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {(fa ? NEVER_FA : NEVER).map((x) => (
            <li key={x} className="rounded-full bg-danger/10 px-2.5 py-1 text-xs">
              {x}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** A price per 1,000 as typed: dollars, or Toman on the Persian page once there's a rate. */
function priceText(micros: number, lang: Lang, rate: number): string {
  return lang === "fa" && rate > 0 ? String(tomanOf(micros, rate)) : (micros / MICROS).toFixed(2);
}
function priceMicros(text: string, lang: Lang, rate: number): number {
  const v = Number(text.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  if (!(v > 0)) return 0;
  return lang === "fa" && rate > 0 ? microsOfToman(v, rate) : Math.round(v * MICROS);
}

function AdForm({ lang, form, setForm, data, onDone }: { lang: Lang; form: Form; setForm: (f: Form | null) => void; data: Data; onDone: () => void }) {
  const t = T[lang];
  const fa = lang === "fa";
  const rate = data.settings.tomanRate;
  const money = moneyIn(lang, rate);
  const floor = data.settings.floors[form.format];
  const [picture, setPicture] = useState<File | null>(null);
  const [sound, setSound] = useState<{ file: File; seconds: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const can: Placement[] = form.format === "card" ? ["site", "remix", "radio"] : form.format === "audio" ? ["remix", "radio"] : [];
  const pictureUrl = useMemo(() => (picture ? URL.createObjectURL(picture) : null), [picture]);
  useEffect(() => () => void (pictureUrl && URL.revokeObjectURL(pictureUrl)), [pictureUrl]);

  async function pickSound(file: File | null) {
    setNote(null);
    if (!file) return setSound(null);
    try {
      const seconds = await soundSeconds(file);
      if (seconds > AUDIO.maxSeconds + 0.5) {
        setSound(null);
        setNote(t.tooLong(seconds.toFixed(1)));
        return;
      }
      setSound({ file, seconds });
    } catch {
      setNote(t.failed);
    }
  }

  async function save(submit: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const cpmMicros = priceMicros(form.price, lang, rate);
      const draft = {
        name: form.title || form.advertiser, advertiser: form.advertiser, title: form.title, body: form.body, cta: form.cta, link: form.link,
        format: form.format, topic: form.topic, lang: form.lang, placements: form.format === "promote" ? ["promote"] : form.placements,
        cpmMicros, endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59Z`).toISOString() : null,
        promoteTarget: form.format === "promote" ? form.promoteTarget || null : null,
      };
      let id = form.id;
      if (id) await call(`/api/advertise/${id}`, "PATCH", { action: "save", ...draft });
      else id = (await call("/api/advertise", "POST", draft)).id!;
      if (picture) {
        const res = await fetch(`/api/advertise/${id}/media?f=image`, { method: "PUT", body: picture });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t.failed);
      }
      if (sound) {
        const res = await fetch(`/api/advertise/${id}/media?f=audio&seconds=${sound.seconds.toFixed(2)}`, { method: "PUT", body: sound.file });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t.failed);
      }
      if (submit) await call(`/api/advertise/${id}`, "PATCH", { action: "submit" });
      onDone();
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = "input w-full";
  return (
    <section className="rounded-3xl border border-brand/40 bg-surface p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold">{t.formats[form.format][0]}</h2>
        <button type="button" onClick={() => setForm(null)} aria-label={t.cancel} className="text-muted hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-3">
          {form.format === "promote" ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t.whatToPromote}</span>
              {data.promotable.length ? (
                <select className={field} value={form.promoteTarget} onChange={(e) => set({ promoteTarget: e.target.value })}>
                  <option value="">—</option>
                  {data.promotable.map((p) => (
                    <option key={p.target} value={p.target}>
                      {p.kind === "remix" ? "♫ " : "♪ "}
                      {p.title}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-muted">{t.nothingToPromote}</span>
              )}
            </label>
          ) : (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.advertiser}</span>
                <input className={field} value={form.advertiser} maxLength={60} onChange={(e) => set({ advertiser: e.target.value })} dir="auto" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.adTitle}</span>
                <input className={field} value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} dir="auto" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.body}</span>
                <textarea className={field} rows={2} value={form.body} maxLength={200} onChange={(e) => set({ body: e.target.value })} dir="auto" />
              </label>
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.cta}</span>
                  <input className={field} value={form.cta} maxLength={24} onChange={(e) => set({ cta: e.target.value })} dir="auto" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.link}</span>
                  <input className={field} value={form.link} maxLength={500} onChange={(e) => set({ link: e.target.value })} dir="ltr" inputMode="url" />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.topic}</span>
                <select className={field} value={form.topic} onChange={(e) => set({ topic: e.target.value })}>
                  {TOPICS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {fa ? x.fa : x.en}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted">{t.topicHelp}</span>
              </label>
              <fieldset className="text-sm">
                <legend className="font-medium">{t.where}</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {can.map((p) => (
                    <label key={p} className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={form.placements.includes(p)}
                        onChange={() => set({ placements: form.placements.includes(p) ? form.placements.filter((x) => x !== p) : [...form.placements, p] })}
                      />
                      {t.places[p]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.picture}</span>
                <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPicture(e.target.files?.[0] ?? null)} />
              </label>
              {form.format === "audio" && (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.sound}</span>
                  <input type="file" accept="audio/*" onChange={(e) => void pickSound(e.target.files?.[0] ?? null)} />
                  {sound && <audio controls src={URL.createObjectURL(sound.file)} className="mt-1 w-full" />}
                </label>
              )}
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t.lang}</span>
              <select className={field} value={form.lang} onChange={(e) => set({ lang: e.target.value as Form["lang"] })}>
                {(["any", "en", "fa"] as const).map((l) => (
                  <option key={l} value={l}>
                    {t.langs[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                {t.price} ({fa && rate ? t.toman : t.usd})
              </span>
              <input className={field} value={form.price} onChange={(e) => set({ price: e.target.value })} inputMode="decimal" dir="ltr" placeholder={priceText(floor, lang, rate)} />
              <span className="text-xs text-muted">{t.priceHelp(money(floor))}</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t.ends}</span>
              <input className={field} type="date" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            </label>
          </div>
          {note && <p className="text-sm text-danger">{note}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t.saveSubmit}
            </button>
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">
              {t.save}
            </button>
          </div>
        </div>
        {form.format !== "promote" && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.preview}</p>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3" dir={form.lang === "fa" || (form.lang === "any" && fa) ? "rtl" : "ltr"}>
              {pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={pictureUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/40 to-vocals/30 text-xl font-bold">
                  {(form.advertiser || form.title || "?").slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {t.sponsored}
                  {form.advertiser && ` · ${form.advertiser}`}
                </span>
                <span className="block truncate font-semibold">{form.title || "…"}</span>
                {form.body && <span className="line-clamp-2 block text-sm text-muted">{form.body}</span>}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PaymentForm({ lang, campaignId, settings, onDone }: { lang: Lang; campaignId: string; settings: MonetizeSettings; onDone: () => void }) {
  const t = T[lang];
  const fa = lang === "fa";
  const toman = fa && settings.tomanRate > 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(t.methods[0]);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const payTo = (fa ? settings.payTo.fa : settings.payTo.en) || settings.payTo.en || settings.payTo.fa;
  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const value = Number(amount.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
      await call(`/api/advertise/${campaignId}/payments`, "POST", { amount: value, currency: toman ? "IRT" : "USD", method, reference });
      setNote(t.paymentSent);
      setTimeout(onDone, 1200);
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-2xl border border-success/40 bg-success/5 p-4 text-sm">
      <p className="font-semibold">{t.payTitle}</p>
      <p className="mt-2 font-medium">{t.payTo}</p>
      <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface p-3 text-muted" dir="auto">
        {payTo || t.payToMissing}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1">
          <span>
            {t.amount} ({toman ? t.toman : t.usd})
          </span>
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" />
        </label>
        <label className="grid gap-1">
          <span>{t.method}</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {t.methods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>{t.reference}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} dir="ltr" />
        </label>
      </div>
      <button type="button" disabled={busy || !amount || reference.trim().length < 3} onClick={send} className="mt-3 rounded-full bg-success px-4 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} {t.sendPayment}
      </button>
      {note && <p className="mt-2">{note}</p>}
    </div>
  );
}
