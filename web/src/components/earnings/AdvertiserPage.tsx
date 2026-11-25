"use client";

// The advertiser page: make an ad (a picture card, an audio ad up to 15 s,
// or a promotion of your own remix or song), choose where and to whom it
// shows and what you pay per 1,000 views, pay by card-to-card / bank / USDT
// with a reference, and send it for review. It runs once Remixt approves it
// and has its payment, until the budget is spent. Results day by day.

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, CircleAlert, Image as ImageIcon, LayoutGrid, Loader2, Megaphone, Music, Pause, Pencil, Play, Plus, Radio as RadioIcon, Send, Wallet, X } from "lucide-react";
import { NEVER, NEVER_FA, TOPICS, microsOfToman, tomanOf, type AudioRules, type Format } from "@/lib/monetize/adRules";
import { useSettings } from "@/components/SettingsProvider";
import { MICROS, type Placement } from "@/lib/monetize/policy";
import { moneyIn, numIn, dateIn, type Lang } from "@/lib/monetize/moneyText";
import type { AdvertiserCampaign } from "@/lib/monetize/adStore";
import type { MonetizeSettings } from "@/lib/monetize/store";
import { deliveryStatus } from "@/lib/monetize/adStatus";
import DeliveryTracker, { DeliveryChip } from "@/components/ads/DeliveryTracker";

type Promotable = { target: string; title: string; kind: "remix" | "track" };
type Data = { campaigns: AdvertiserCampaign[]; promotable: Promotable[]; settings: MonetizeSettings };

const makeT = (AUDIO: AudioRules) => ({
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
    adsClosed: "New ads are closed for now — write to us to advertise. Your ads below keep running.",
    promotionsClosed: "Promotions are closed for now.",
    allClosed: "New ads and promotions are closed for now. Your ads below keep running.",
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
    adsClosed: "فعلاً ساخت تبلیغ تازه بسته است — برای تبلیغ به ما پیام دهید. تبلیغ‌های فعلی‌تان ادامه دارند.",
    promotionsClosed: "فعلاً معرفی ویژه بسته است.",
    allClosed: "فعلاً تبلیغ تازه و معرفی ویژه بسته است. تبلیغ‌های فعلی‌تان ادامه دارند.",
    last14: "۱۴ روز گذشته",
    usd: "دلار",
    toman: "تومان",
  },
});

/** The page's words in `lang`, with the owner's audio limits in them. */
function useT(lang: Lang) {
  const { audio } = useSettings();
  return useMemo(() => makeT(audio)[lang], [audio, lang]);
}

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
  const t = useT(lang);
  const fa = lang === "fa";
  const params = useSearchParams();
  const promoteFrom = params.get("promote");
  const { features } = useSettings();
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
        {(!features.selfServe || !features.promotions) && (
          <p className="mt-3 rounded-xl border border-drums/40 bg-drums/10 p-3 text-sm">
            {!features.selfServe && !features.promotions ? t.allClosed : !features.selfServe ? t.adsClosed : t.promotionsClosed}
          </p>
        )}
        {!form && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(["card", "audio", "promote"] as Format[]).filter((f) => (f === "promote" ? features.promotions : features.selfServe && (f !== "audio" || features.audioAds))).map((f) => (
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
              const d = deliveryStatus(c, { now: openedAt, paymentPending: c.payments.some((p) => p.status === "pending"), switches: features });
              const edit = () =>
                setForm({
                  id: c.id, format: c.format, advertiser: c.advertiser, title: c.title, body: c.body, cta: c.cta, link: c.link, topic: c.topic,
                  lang: c.lang as Form["lang"], placements: c.placements as Placement[], price: priceText(c.cpm_micros, lang, rate),
                  endsAt: c.ends_at ? c.ends_at.slice(0, 10) : "", promoteTarget: c.promote_target ?? "",
                });
              const maxDay = Math.max(1, ...c.days.map((d) => d.views));
              return (
                <li key={c.id} className="rounded-3xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs">{t.formats[c.format][0]}</span>
                        <DeliveryChip d={d} lang={lang} />
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
                        onClick={edit}
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
                  <DeliveryTracker
                    d={d}
                    lang={lang}
                    onAction={(a) => (a === "pay" ? setPaying(c.id) : a === "submit" ? act(c.id, "submit") : a === "resume" ? act(c.id, "resume") : edit())}
                  />
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
  const t = useT(lang);
  const fa = lang === "fa";
  const rate = data.settings.tomanRate;
  const money = moneyIn(lang, rate);
  const floor = data.settings.floors[form.format];
  const [picture, setPicture] = useState<File | null>(null);
  const [sound, setSound] = useState<{ file: File; seconds: number } | null>(null);
  const { maxSeconds } = useSettings().audio;
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
      if (seconds > maxSeconds + 0.5) {
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
      const cpmMicros = priceMicros(form.price.trim() || priceText(floor, lang, rate), lang, rate);
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
  const W = fa ? WIZARD.fa : WIZARD.en;
  const [step, setStep] = useState(0);
  // Left empty: the lowest price (the one the box shows greyed).
  const cpm = priceMicros(form.price.trim() || priceText(floor, lang, rate), lang, rate);
  /** What's missing on a step, or null (checked before moving on; the server checks again). */
  const problem = (i: number): string | null => {
    if (i === 0) {
      if (form.format === "promote") return form.promoteTarget ? null : W.needTarget;
      if (!form.title.trim()) return W.needTitle;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(form.link)) return W.needLink;
      if (form.format === "audio" && !sound && !form.id) return W.needSound;
    }
    if (i === 1 && form.format !== "promote" && !form.placements.some((x) => can.includes(x))) return W.needPlace;
    if (i === 2 && (!Number.isFinite(cpm) || cpm < floor)) return t.priceHelp(money(floor));
    return null;
  };
  const next = () => {
    const p = problem(step);
    setNote(p);
    if (!p) setStep((x) => Math.min(2, x + 1));
  };
  const steps = form.format === "promote" ? [W.s1Promote, W.s2, W.s3] : [W.s1, W.s2, W.s3];
  const PLACE_ICON: Record<string, typeof ImageIcon> = { site: LayoutGrid, remix: Music, radio: RadioIcon };

  return (
    <section className="rounded-3xl border border-brand/40 bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold">{t.formats[form.format][0]}</h2>
        <button type="button" onClick={() => setForm(null)} aria-label={t.cancel} className="rounded-full p-2 text-muted hover:bg-surface-hover hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* The steps, YouTube-Studio style: where you are, what's done, and you can go back to any done step. */}
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-label={W.stepsLabel}>
        {steps.map((name, i) => (
          <li key={name}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`flex w-full flex-col items-start gap-1 rounded-xl border-b-4 px-2 py-2 text-start transition ${
                i === step ? "border-brand bg-brand/10" : i < step ? "border-success hover:bg-surface-hover" : "border-border opacity-60"
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < step ? "bg-success text-white" : i === step ? "bg-brand text-white" : "bg-surface-raised text-muted"}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="text-xs font-semibold leading-tight sm:text-sm">{name}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-3">
          {step === 0 &&
            (form.format === "promote" ? (
              <div className="grid gap-2 text-sm">
                <span className="font-medium">{t.whatToPromote}</span>
                {data.promotable.length ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {data.promotable.map((p) => (
                      <li key={p.target}>
                        <button
                          type="button"
                          onClick={() => set({ promoteTarget: p.target })}
                          aria-pressed={form.promoteTarget === p.target}
                          className={`flex w-full items-center gap-2 rounded-xl border p-3 text-start ${form.promoteTarget === p.target ? "border-brand bg-brand/10" : "border-border hover:bg-surface-hover"}`}
                        >
                          <Music className="h-4 w-4 shrink-0 text-brand-strong" />
                          <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">{p.title}</span>
                          <span className="text-xs text-muted">{p.kind === "remix" ? W.remix : W.song}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">{t.nothingToPromote}</span>
                )}
              </div>
            ) : (
              <>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.adTitle} *</span>
                  <input className={field} value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} dir="auto" placeholder={W.titleHint} />
                  <span className="text-end text-[11px] text-muted">{form.title.length}/80</span>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.body}</span>
                  <textarea className={field} rows={2} value={form.body} maxLength={200} onChange={(e) => set({ body: e.target.value })} dir="auto" />
                  <span className="text-end text-[11px] text-muted">{form.body.length}/200</span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t.advertiser}</span>
                    <input className={field} value={form.advertiser} maxLength={60} onChange={(e) => set({ advertiser: e.target.value })} dir="auto" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t.cta}</span>
                    <input className={field} value={form.cta} maxLength={24} onChange={(e) => set({ cta: e.target.value })} dir="auto" />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{t.link} *</span>
                  <input className={field} value={form.link} maxLength={500} onChange={(e) => set({ link: e.target.value })} dir="ltr" inputMode="url" placeholder="https://" />
                </label>
                <FilePick label={t.picture} accept="image/jpeg,image/png" icon={ImageIcon} chosen={picture?.name ?? null} onPick={(f) => setPicture(f)} hint={W.pictureHint} />
                {form.format === "audio" && (
                  <div className="grid gap-1">
                    <FilePick label={`${t.sound} *`} accept="audio/*" icon={Music} chosen={sound?.file.name ?? null} onPick={(f) => void pickSound(f)} hint={W.soundHint} />
                    {sound && <audio controls src={URL.createObjectURL(sound.file)} className="mt-1 w-full" />}
                  </div>
                )}
              </>
            ))}

          {step === 1 && (
            <>
              {form.format !== "promote" && (
                <fieldset className="grid gap-2 text-sm">
                  <legend className="mb-1 font-medium">{t.where}</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {can.map((p) => {
                      const on = form.placements.includes(p);
                      const Icon = PLACE_ICON[p] ?? LayoutGrid;
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ placements: on ? form.placements.filter((x) => x !== p) : [...form.placements, p] })}
                          className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3 text-start transition ${on ? "border-brand bg-brand/10" : "border-border hover:bg-surface-hover"}`}
                        >
                          <span className={`absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border ${on ? "border-brand bg-brand text-white" : "border-border"}`}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <Icon className="h-5 w-5 text-brand-strong" />
                          <span className="font-semibold">{t.places[p]}</span>
                          <span className="text-xs text-muted">{W.placeHelp[p as "site" | "remix" | "radio"]}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
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
              <fieldset className="grid gap-1 text-sm">
                <legend className="mb-1 font-medium">{t.lang}</legend>
                <div className="flex flex-wrap gap-2">
                  {(["any", "en", "fa"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={form.lang === l}
                      onClick={() => set({ lang: l })}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${form.lang === l ? "border-brand bg-brand/15" : "border-border hover:bg-surface-hover"}`}
                    >
                      {t.langs[l]}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
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
              {Number.isFinite(cpm) && cpm >= floor && (
                <div className="rounded-2xl border border-border bg-background/40 p-3 text-sm">
                  <p className="font-semibold">{W.estimate}</p>
                  <ul className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[5, 20, 50].map((usd) => (
                      <li key={usd} className="rounded-xl bg-surface-raised p-2">
                        <span className="block text-xs text-muted">{money(usd * MICROS)}</span>
                        <span className="block text-lg font-bold tabular-nums">≈ {Math.floor((usd * MICROS) / (cpm / 1000)).toLocaleString(fa ? "fa-IR" : "en-US")}</span>
                        <span className="block text-[11px] text-muted">{W.views}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-2xl border border-brand/30 bg-brand/5 p-3 text-sm">
                <p className="font-semibold">{W.afterTitle}</p>
                <ol className="mt-2 grid gap-1.5">
                  {W.after.map((line, i) => (
                    <li key={line} className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                      <span className="text-muted">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          <div className="sticky bottom-16 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl bg-surface/95 p-1 backdrop-blur sm:static sm:bottom-auto">
            {/* What's missing sits with the buttons, so it's seen where Next was pressed (on a phone they float at the bottom). */}
            {note && (
              <p role="alert" className="flex basis-full items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-sm">
                <CircleAlert className="h-4 w-4 shrink-0 text-danger" /> {note}
              </p>
            )}
            {step > 0 && (
              <button type="button" onClick={() => (setNote(null), setStep(step - 1))} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-hover">
                {W.back}
              </button>
            )}
            {step < 2 ? (
              <button type="button" onClick={next} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-strong sm:flex-none">
                {W.next}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const p = [0, 1, 2].map(problem).find(Boolean) ?? null;
                  setNote(p);
                  if (!p) void save(true);
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t.saveSubmit}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50">
              {W.saveDraft}
            </button>
          </div>
        </div>
        {form.format !== "promote" && (
          <div className="lg:sticky lg:top-20 lg:self-start">
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
                <span className="block break-words font-semibold leading-snug">{form.title || W.titleHint}</span>
                {form.body && <span className="line-clamp-2 block text-sm text-muted">{form.body}</span>}
                <span className="mt-1 inline-flex rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">{form.cta || "…"}</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{W.previewNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** A file picker that looks like a button and says what was chosen (the browser's own is tiny on a phone). */
function FilePick({ label, accept, icon: Icon, chosen, onPick, hint }: { label: string; accept: string; icon: typeof ImageIcon; chosen: string | null; onPick: (f: File | null) => void; hint: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2 hover:border-brand hover:bg-surface-hover">
        <Icon className="h-5 w-5 shrink-0 text-brand-strong" />
        <span className="min-w-0 flex-1 truncate">{chosen ?? hint}</span>
        {chosen && <Check className="h-4 w-4 shrink-0 text-success" />}
        <input type="file" accept={accept} className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </span>
    </label>
  );
}

const WIZARD = {
  en: {
    stepsLabel: "Making your ad",
    s1: "What it says",
    s1Promote: "What to promote",
    s2: "Who sees it",
    s3: "Price & send",
    next: "Next",
    back: "Back",
    saveDraft: "Save draft",
    needTitle: "Give the ad a headline.",
    needLink: "Add the address the ad opens (https://…).",
    needSound: "Add the ad's sound.",
    needPlace: "Choose at least one place.",
    needTarget: "Choose what to promote.",
    titleHint: "Your headline",
    pictureHint: "Choose a picture (square looks best)",
    soundHint: "Choose the sound file",
    remix: "Remix",
    song: "Song",
    placeHelp: { site: "Lists, tool pages and guides — most people.", remix: "Under the player while a remix plays.", radio: "On the radio while songs play." },
    estimate: "About how many paid views your money buys",
    views: "views",
    afterTitle: "What happens next",
    after: ["Remixt checks the ad (usually within a day).", "You add money — card, bank or USDT — and send the reference.", "It shows until the money is spent. You see views and clicks every day."],
    previewNote: "How it looks on the page. A view counts only when half of it is on screen for a second.",
  },
  fa: {
    stepsLabel: "ساخت تبلیغ",
    s1: "متن تبلیغ",
    s1Promote: "چه چیزی معرفی شود",
    s2: "چه کسانی ببینند",
    s3: "قیمت و ارسال",
    next: "بعدی",
    back: "قبلی",
    saveDraft: "ذخیرهٔ پیش‌نویس",
    needTitle: "برای تبلیغ یک عنوان بنویسید.",
    needLink: "آدرسی که تبلیغ باز می‌کند را بنویسید (https://…).",
    needSound: "صدای تبلیغ را اضافه کنید.",
    needPlace: "دست‌کم یک جا را انتخاب کنید.",
    needTarget: "انتخاب کنید چه چیزی معرفی شود.",
    titleHint: "عنوان شما",
    pictureHint: "یک تصویر انتخاب کنید (مربعی بهتر است)",
    soundHint: "فایل صدا را انتخاب کنید",
    remix: "ریمیکس",
    song: "آهنگ",
    placeHelp: { site: "فهرست‌ها، صفحهٔ ابزارها و راهنماها — بیشترین بیننده.", remix: "زیر پخش‌کننده هنگام پخش ریمیکس.", radio: "در رادیو هنگام پخش آهنگ‌ها." },
    estimate: "تقریباً چند بازدید پولی با این مبلغ",
    views: "بازدید",
    afterTitle: "بعد چه می‌شود",
    after: ["ریمیکست تبلیغ را بررسی می‌کند (معمولاً تا یک روز).", "اعتبار اضافه می‌کنید — کارت، بانک یا تتر — و شمارهٔ پیگیری را می‌فرستید.", "تا تمام شدن اعتبار نمایش داده می‌شود. بازدید و کلیک را هر روز می‌بینید."],
    previewNote: "شکل تبلیغ در صفحه. بازدید فقط وقتی حساب می‌شود که نیمی از آن یک ثانیه روی صفحه باشد.",
  },
};

function PaymentForm({ lang, campaignId, settings, onDone }: { lang: Lang; campaignId: string; settings: MonetizeSettings; onDone: () => void }) {
  const t = useT(lang);
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
