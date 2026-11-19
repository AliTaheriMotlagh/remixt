"use client";

// A member's earnings: what's theirs to withdraw, what's on its way, where
// it came from, the songs they can claim, their remixes' ads and
// collaborators, how they're paid — and the badges along the way. In
// English (dollars) at /earnings and Persian (Toman) at /fa/earnings.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award, BadgeCheck, Banknote, CircleDollarSign, Clock3, Eye, Hourglass, Loader2, Lock, Megaphone, Music2, Plus, Settings2, Sparkles, Trash2,
  Users, Wallet,
} from "lucide-react";
import { earnBadges, isTomanMethod, PAYOUT_METHOD_FA, ROLE_TEXT, PAYOUT_METHODS, rpm, type Role } from "@/lib/monetize/policy";
import { dateIn, moneyIn, moneyPath, numIn, type Lang } from "@/lib/monetize/moneyText";
import type { EarningsSummary } from "@/lib/monetize/store";
import { persianNumber } from "@/lib/monetize/adRules";
import { useSettings } from "@/components/SettingsProvider";

type Data = EarningsSummary & { tomanRate: number };

const T = {
  en: {
    loadFailed: "Couldn't load your earnings",
    whose: (n: string) => `${n}'s earnings`,
    ready: "Ready to withdraw",
    withdraw: "Withdraw",
    toFirst: (m: string) => `${m} to your first withdrawal`,
    canWithdraw: "You can withdraw",
    addAccount: "Add how you'd like to be paid (below) to withdraw.",
    onItsWay: (m: string) => `${m} is on its way to you.`,
    asked: (m: string, how: string) => `Asked for ${m} — we'll send it to your ${how}.`,
    askFailed: "Couldn't ask for a payout",
    waiting: (days: number) => `Waiting (${days} days)`,
    keptForUploads: "Kept for artists of your uploads",
    paidToYou: "Paid to you",
    earnedInAll: "Earned in all",
    pages: "Your money pages",
    artistPage: "Your songs as an artist",
    artistHelp: "Choose Monetize / Follow the remixer / Block for each song",
    advertise: "Advertise or promote",
    advertiseHelp: "Ads for your business, or more listeners for your remix",
    last30: "Last 30 days",
    paidViews: (n: string) => `${n} paid views in all`,
    per1000: (m: string) => `${m} per 1,000`,
    nothingYet: "Nothing yet. Publish a remix and share it: every real view of the ad on its page pays you and the artists you used.",
    openStudio: "Open the Studio",
    statement: "Statement",
    downloadCsv: "Download CSV",
    milestones: "Milestones",
    whereFrom: "Where it comes from",
    views: (n: string) => `${n} views`,
    removed: "Removed",
    yourSongs: "Your songs",
    songsHelp:
      "If you wrote or own a song people remix here, you get the artists' share of every remix that uses it. Until a song's artist is verified, their share is kept for them. Claim a song and tell us how to check it's yours — your official pages, your distributor, a release with your name.",
    kept: (m: string) => `${m} kept`,
    verified: "Verified — paid to you",
    notAccepted: "Not accepted",
    beingChecked: "Being checked",
    claimASong: "Claim a song",
    evidence: "How can we check it's yours? Links to your official profiles, the release, your distributor…",
    falseClaim: "Claiming a song that isn't yours closes your account and gives back anything it was paid.",
    sending: "Sending…",
    claimThis: "Claim this song",
    claimSent: "Sent. We'll check it and write to you — usually within a few days.",
    claimFailed: "Couldn't send it",
    howToClaim: "To claim a song, open a remix that uses it and press “Your song? Claim your share” under its credits.",
    yourRemixes: "Your remixes",
    remixesHelp: "Each remix's ads (on or off, which kinds, topics you don't want) and who you share it with. You keep at least 10% of the remixers' share.",
    adSettings: "Ads & earnings",
    justYou: "Just you",
    share: "Share",
    savedSplits: "Saved — from now on, each view is shared this way.",
    addCollaborator: "Add a collaborator by artist name",
    youKeep: (p: number) => `You keep ${p}% of the remixers' share`,
    save: "Save",
    saved: "Saved.",
    saveFailed: "Couldn't save",
    howPaid: "How you're paid",
    privateNote: "Only you and the person sending payouts can see this.",
    tomanNote: "Paid in Toman at Remixt's rate on the day you withdraw.",
    placeholders: { paypal: "Your PayPal email", iban: "Account holder's name and IBAN", sheba: "Account holder's name and Sheba (IR…) or card number", crypto: "Wallet address and network (e.g. TRC-20)", other: "Where to send it" },
    payouts: "Payouts",
    noPayouts: (m: string) => `None yet. You can withdraw once ${m} is ready.`,
    sent: "Sent",
    returned: "Returned to balance",
    onWay: "On its way",
    method: (m: string) => m,
  },
  fa: {
    loadFailed: "درآمدتان بارگیری نشد",
    whose: (n: string) => `درآمد ${n}`,
    ready: "آمادهٔ برداشت",
    withdraw: "برداشت",
    toFirst: (m: string) => `${m} تا اولین برداشت`,
    canWithdraw: "می‌توانید برداشت کنید",
    addAccount: "برای برداشت، روش دریافت پول را (پایین صفحه) وارد کنید.",
    onItsWay: (m: string) => `${m} در راه است.`,
    asked: (m: string, how: string) => `درخواست ${m} ثبت شد — به ${how} شما واریز می‌کنیم.`,
    askFailed: "درخواست برداشت ثبت نشد",
    waiting: (days: number) => `در انتظار (${persianNumber(days)} روز)`,
    keptForUploads: "نگه‌داشته برای هنرمندانِ آپلودهای شما",
    paidToYou: "پرداخت‌شده به شما",
    earnedInAll: "کل درآمد",
    pages: "صفحه‌های درآمد شما",
    artistPage: "آهنگ‌های شما به‌عنوان هنرمند",
    artistHelp: "برای هر آهنگ: کسب درآمد / تصمیم با ریمیکسر / مسدود",
    advertise: "تبلیغ یا معرفی ویژه",
    advertiseHelp: "تبلیغ کسب‌وکارتان، یا شنوندهٔ بیشتر برای ریمیکستان",
    last30: "۳۰ روز گذشته",
    paidViews: (n: string) => `${n} بازدیدِ پولی در کل`,
    per1000: (m: string) => `${m} برای هر ۱۰۰۰`,
    nothingYet: "هنوز چیزی نیست. یک ریمیکس منتشر کنید و به اشتراک بگذارید: هر بازدید واقعی از تبلیغِ صفحه‌اش به شما و هنرمندانی که استفاده کرده‌اید پول می‌دهد.",
    openStudio: "باز کردن استودیو",
    statement: "صورت‌حساب",
    downloadCsv: "دانلود CSV",
    milestones: "دستاوردها",
    whereFrom: "از کجا آمده",
    views: (n: string) => `${n} بازدید`,
    removed: "حذف‌شده",
    yourSongs: "آهنگ‌های شما",
    songsHelp:
      "اگر آهنگی که اینجا ریمیکس می‌شود مال شماست، سهم هنرمندان از هر ریمیکسی که از آن استفاده کند به شما می‌رسد. تا هنرمندِ آهنگ تأیید نشده، سهمش برایش نگه داشته می‌شود. آهنگ را ادعا کنید و بگویید چطور بررسی کنیم که مال شماست — صفحه‌های رسمی، پخش‌کننده، انتشار با نام شما.",
    kept: (m: string) => `${m} نگه‌داشته`,
    verified: "تأییدشده — به شما پرداخت می‌شود",
    notAccepted: "پذیرفته نشد",
    beingChecked: "در حال بررسی",
    claimASong: "ادعای مالکیت آهنگ",
    evidence: "چطور بررسی کنیم که مال شماست؟ لینک صفحه‌های رسمی، انتشار، پخش‌کننده…",
    falseClaim: "ادعای آهنگی که مال شما نیست حساب را می‌بندد و هر پولی که گرفته شده برگردانده می‌شود.",
    sending: "در حال ارسال…",
    claimThis: "ادعای این آهنگ",
    claimSent: "ارسال شد. بررسی می‌کنیم و خبر می‌دهیم — معمولاً ظرف چند روز.",
    claimFailed: "ارسال نشد",
    howToClaim: "برای ادعای یک آهنگ، ریمیکسی را که از آن استفاده می‌کند باز کنید و زیر اعتبارها «آهنگ شماست؟ سهمتان را بگیرید» را بزنید.",
    yourRemixes: "ریمیکس‌های شما",
    remixesHelp: "تبلیغِ هر ریمیکس (روشن یا خاموش، چه نوعی، موضوع‌هایی که نمی‌خواهید) و این‌که درآمدش را با چه کسی تقسیم می‌کنید. حداقل ۱۰٪ سهم ریمیکسرها برای شما می‌ماند.",
    adSettings: "تبلیغ و درآمد",
    justYou: "فقط شما",
    share: "تقسیم",
    savedSplits: "ذخیره شد — از این به بعد هر بازدید این‌طور تقسیم می‌شود.",
    addCollaborator: "افزودن همکار با نام هنری",
    youKeep: (p: number) => `${p}٪ از سهم ریمیکسرها برای شما می‌ماند`,
    save: "ذخیره",
    saved: "ذخیره شد.",
    saveFailed: "ذخیره نشد",
    howPaid: "روش دریافت پول",
    privateNote: "فقط شما و کسی که پرداخت‌ها را انجام می‌دهد این را می‌بینید.",
    tomanNote: "به تومان و با نرخ ریمیکست در روز درخواست برداشت پرداخت می‌شود.",
    placeholders: { paypal: "ایمیل پی‌پال", iban: "نام صاحب حساب و IBAN", sheba: "نام صاحب حساب و شمارهٔ شبا (IR…) یا شمارهٔ کارت", crypto: "آدرس کیف پول و شبکه (مثلاً TRC-20)", other: "کجا واریز شود" },
    payouts: "برداشت‌ها",
    noPayouts: (m: string) => `هنوز نه. وقتی ${m} آماده شد می‌توانید برداشت کنید.`,
    sent: "واریز شد",
    returned: "به موجودی برگشت",
    onWay: "در راه",
    method: (m: string) => PAYOUT_METHOD_FA[m] ?? m,
  },
} as const;

const roleLabel = (lang: Lang, r: Role) => ROLE_TEXT[r][lang];

const BADGE_FA: Record<string, [string, string]> = {
  "first-cent": ["اولین درآمد", "از یک بازدیدِ کارتان درآمد بگیرید"],
  "thousand-views": ["هزار بازدید", "۱۰۰۰ بازدید پولی از کارتان"],
  payday: ["روز پرداخت", "اولین برداشت"],
  "rights-verified": ["هنرمند واقعی", "تأیید یکی از آهنگ‌هایتان"],
  crew: ["گروه", "تقسیم درآمد یک ریمیکس با همکار"],
  catalogue: ["کاتالوگ", "۵ ریمیکسِ درآمدزا"],
  "ten-dollars": ["باشگاه ۱۰ دلاری", "۱۰ دلار درآمد در کل"],
  "hundred-dollars": ["باشگاه ۱۰۰ دلاری", "۱۰۰ دلار درآمد در کل"],
};

type Ctx = { lang: Lang; t: (typeof T)[Lang]; money: (m: number) => string; num: (n: number) => string; date: (v: string | number) => string; rate: number };
const MoneyCtx = createContext<Ctx>(null as never);
const useM = () => useContext(MoneyCtx);

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data;
}

export default function EarningsDashboard({ artistName, lang = "en" }: { artistName: string; lang?: Lang }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = T[lang];
  const load = useCallback(() => {
    fetch("/api/earnings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(t.loadFailed);
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, [t]);
  useEffect(load, [load]);
  const ctx = useMemo<Ctx>(
    () => ({ lang, t, money: moneyIn(lang, data?.tomanRate ?? 0), num: numIn(lang), date: dateIn(lang), rate: data?.tomanRate ?? 0 }),
    [lang, t, data?.tomanRate]
  );

  if (error) return <p className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{error}</p>;
  if (!data)
    return (
      <div className="grid gap-4">
        <div className="h-48 animate-pulse rounded-3xl bg-surface" />
        <div className="h-32 animate-pulse rounded-3xl bg-surface" />
      </div>
    );

  return (
    <MoneyCtx.Provider value={ctx}>
      <div className="flex flex-col gap-6">
        <Balance data={data} artistName={artistName} onChange={load} />
        <MoneyPages />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Activity data={data} />
          <Badges data={data} />
        </div>
        <Sources data={data} />
        <Claims data={data} onChange={load} />
        <Remixes data={data} onChange={load} />
        <div className="grid gap-6 lg:grid-cols-2">
          <PayoutAccount data={data} onChange={load} />
          <PayoutHistory data={data} />
        </div>
      </div>
    </MoneyCtx.Provider>
  );
}

function Balance({ data, artistName, onChange }: { data: Data; artistName: string; onChange: () => void }) {
  const { minMicros, holdDays } = useSettings().payouts;
  const { t, money, lang } = useM();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const progress = Math.min(1, data.available / minMicros);
  const canPay = data.available >= minMicros && !!data.account && data.requested === 0;
  async function payout() {
    setBusy(true);
    setNote(null);
    try {
      const r = (await send("/api/earnings/payout", "POST")) as { micros: number };
      setNote(t.asked(money(r.micros), t.method(data.account?.method ?? "")));
      onChange();
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.askFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/30 via-surface to-vocals/15 p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/25 blur-3xl" aria-hidden />
      <p className="text-sm text-muted">{t.whose(artistName)}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">{t.ready}</h1>
          <p className={`mt-1 font-bold tabular-nums tracking-tight ${lang === "fa" ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl"}`}>{money(data.available)}</p>
        </div>
        <button
          type="button"
          onClick={payout}
          disabled={!canPay || busy}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} {t.withdraw}
        </button>
      </div>
      <div className="mt-5">
        <div className="flex justify-between gap-3 text-xs text-muted">
          <span>{progress < 1 ? t.toFirst(money(minMicros - data.available)) : t.canWithdraw}</span>
          <span className="tabular-nums">{money(minMicros)}</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-vocals transition-[width] duration-700" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
        {!data.account && data.available > 0 && <p className="mt-2 text-xs text-muted">{t.addAccount}</p>}
        {data.requested > 0 && <p className="mt-2 text-xs text-muted">{t.onItsWay(money(data.requested))}</p>}
        {note && <p className="mt-2 text-sm">{note}</p>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Hourglass} label={t.waiting(holdDays)} value={money(data.waiting)} />
        <Stat icon={Lock} label={t.keptForUploads} value={money(data.heldForYourUploads)} />
        <Stat icon={Wallet} label={t.paidToYou} value={money(data.paid)} />
        <Stat icon={CircleDollarSign} label={t.earnedInAll} value={money(data.lifetime)} />
      </dl>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/40 p-3 backdrop-blur">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** The other money pages: the artist's songs and the advertiser page. */
function MoneyPages() {
  const { t, lang } = useM();
  const links = [
    { href: moneyPath(lang, "/earnings/songs"), icon: Music2, title: t.artistPage, help: t.artistHelp },
    { href: moneyPath(lang, "/advertise"), icon: Megaphone, title: t.advertise, help: t.advertiseHelp },
  ];
  return (
    <nav aria-label={t.pages} className="grid gap-3 sm:grid-cols-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand/50 hover:bg-surface-hover">
          <l.icon className="h-6 w-6 shrink-0 text-brand-strong" />
          <span className="min-w-0">
            <span className="block font-semibold">{l.title}</span>
            <span className="block text-sm text-muted">{l.help}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

function Activity({ data }: { data: Data }) {
  const { t, money, num } = useM();
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
        <h2 className="text-lg font-bold">{t.last30}</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground tabular-nums">{money(month)}</span> · <Eye className="inline h-3.5 w-3.5" />{" "}
          {t.paidViews(num(data.paidViews))} · {t.per1000(money(rpm(data.lifetime, data.paidViews)))}
        </p>
      </div>
      <div className="mt-4 flex h-32 items-end gap-[3px]" dir="ltr" role="img" aria-label={`${t.last30}: ${money(month)}`}>
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-gradient-to-t from-brand/60 to-vocals/80 transition-opacity group-hover:opacity-100"
              style={{ height: `${d.micros ? Math.max(4, (d.micros / max) * 100) : 2}%`, opacity: d.micros ? 0.85 : 0.2 }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-1.5 py-0.5 text-[10px] group-hover:block">
              {d.day.slice(5)} · {money(d.micros)}
            </span>
          </div>
        ))}
      </div>
      {data.lifetime > 0 && <Statements asOf={data.asOf} />}
      {data.lifetime === 0 && (
        <p className="mt-4 text-sm text-muted">
          {t.nothingYet}{" "}
          <Link href="/studio" className="text-brand-strong hover:underline">
            {t.openStudio}
          </Link>
        </p>
      )}
    </section>
  );
}

/** The last 12 months, each a CSV download (for taxes and records). */
function Statements({ asOf }: { asOf: number }) {
  const { t, lang } = useM();
  const months = useMemo(() => {
    const now = new Date(asOf);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      return {
        value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      };
    });
  }, [asOf, lang]);
  const [month, setMonth] = useState(months[0].value);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="statement-month" className="text-muted">
        {t.statement}
      </label>
      <select id="statement-month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full border border-border bg-surface-raised px-3 py-1.5">
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <a href={`/api/earnings/statement?month=${month}`} download className="rounded-full border border-border px-3 py-1.5 font-semibold hover:bg-surface-hover">
        {t.downloadCsv}
      </a>
    </div>
  );
}

function Badges({ data }: { data: Data }) {
  const { t, lang, num } = useM();
  const badges = earnBadges({ paidViews: data.paidViews, lifetimeMicros: data.lifetime, ...data.facts });
  const done = badges.filter((b) => b.done).length;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Award className="h-5 w-5 text-drums" /> {t.milestones}{" "}
        <span className="text-sm font-normal text-muted">
          {num(done)}/{num(badges.length)}
        </span>
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {badges.map((b) => {
          const [label, description] = lang === "fa" ? (BADGE_FA[b.id] ?? [b.label, b.description]) : [b.label, b.description];
          return (
            <li key={b.id} className={`rounded-xl border p-2.5 ${b.done ? "border-drums/40 bg-drums/10" : "border-border bg-surface-raised/50"}`} title={description}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                {b.done ? <Sparkles className="h-3.5 w-3.5 text-drums" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
                <span className="truncate">{label}</span>
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted">{description}</p>
              {!b.done && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full bg-drums/70" style={{ width: `${(b.value / b.goal) * 100}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sources({ data }: { data: Data }) {
  const { t, money, num, lang } = useM();
  if (!data.sources.length) return null;
  const top = Math.max(1, ...data.sources.map((s) => s.micros));
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">{t.whereFrom}</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {data.sources.map((s) => (
          <li key={s.key} className="relative overflow-hidden rounded-xl px-3 py-2.5">
            <div className="absolute inset-y-0 start-0 bg-brand/10" style={{ width: `${(s.micros / top) * 100}%` }} aria-hidden />
            <div className="relative flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {s.kind === "remix" ? (
                  <Link href={`/remixes/${s.id}`} className="block truncate font-medium hover:underline">
                    {s.title === "Removed" ? t.removed : s.title}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{s.title === "Removed" ? t.removed : s.title}</span>
                )}
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {s.roles.map((r) => (
                    <span key={r} className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted">
                      {roleLabel(lang, r)}
                    </span>
                  ))}
                </span>
              </div>
              <span className="text-xs text-muted tabular-nums">{t.views(num(s.views))}</span>
              <span className="w-28 text-end font-semibold tabular-nums">{money(s.micros)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Claims({ data, onChange }: { data: Data; onChange: () => void }) {
  const { t, money } = useM();
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
      setNote(t.claimSent);
      setPicked(null);
      setEvidence("");
      onChange();
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.claimFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="claims" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <BadgeCheck className="h-5 w-5 text-vocals" /> {t.yourSongs}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.songsHelp}</p>

      {data.claims.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.claims.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised/40 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              {c.heldMicros > 0 && <span className="text-xs text-muted tabular-nums">{t.kept(money(c.heldMicros))}</span>}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  c.status === "verified" ? "bg-success/15 text-success" : c.status === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"
                }`}
              >
                {c.status === "verified" ? t.verified : c.status === "rejected" ? t.notAccepted : t.beingChecked}
              </span>
              {c.note && (
                <span className="hidden max-w-[16rem] truncate text-xs text-muted sm:block" title={c.note}>
                  {c.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/40 p-4">
          <p className="text-sm font-semibold">{t.claimASong}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.slice(0, 30).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPicked(c.id === picked ? null : c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${picked === c.id ? "border-vocals bg-vocals/15" : "border-border hover:bg-surface-hover"}`}
              >
                {c.title}
                {c.held > 0 && <span className="ms-1.5 text-xs text-muted">{money(c.held)}</span>}
              </button>
            ))}
          </div>
          {picked && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} maxLength={3000} className="input" placeholder={t.evidence} dir="auto" />
              <p className="text-xs text-muted">{t.falseClaim}</p>
              <button
                type="button"
                onClick={claim}
                disabled={busy || evidence.trim().length < 20}
                className="self-start rounded-full bg-vocals px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? t.sending : t.claimThis}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">{t.howToClaim}</p>
      )}
      {note && <p className="mt-3 text-sm">{note}</p>}
    </section>
  );
}

type Pick = { userId: string; name: string; bp: number };

/** Each remix: a link to its ads panel, and who it's shared with. */
function Remixes({ data, onChange }: { data: Data; onChange: () => void }) {
  const { t, lang, num } = useM();
  const [open, setOpen] = useState<string | null>(null);
  if (!data.remixes.length) return null;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Users className="h-5 w-5 text-brand-strong" /> {t.yourRemixes}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.remixesHelp}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {data.remixes.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface-raised/30">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <Link
                href={moneyPath(lang, `/earnings/remix/${r.id}`)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-surface-hover"
              >
                <Settings2 className="h-3.5 w-3.5" /> {t.adSettings}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(open === r.id ? null : r.id)}
                aria-expanded={open === r.id}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-hover"
              >
                {t.share}: {r.splits.length ? r.splits.map((s) => `${s.name} ${num(s.bp / 100)}%`).join(" · ") : t.justYou}
              </button>
            </div>
            {open === r.id && <SplitEditor remixId={r.id} initial={r.splits} onSaved={onChange} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SplitEditor({ remixId, initial, onSaved }: { remixId: string; initial: Pick[]; onSaved: () => void }) {
  const { t, num } = useM();
  const [rows, setRows] = useState<Pick[]>(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; artist_name: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d: { users?: { id: string; artist_name: string }[] }) => setFound(d.users ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const given = rows.reduce((s, r) => s + r.bp, 0);
  async function save() {
    setNote(null);
    try {
      await send("/api/earnings/splits", "PUT", { remixId, splits: rows.map((r) => ({ userId: r.userId, bp: r.bp })) });
      setNote(t.savedSplits);
      onSaved();
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.saveFailed);
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
            aria-label={r.name}
          />
          <span className="w-12 text-end text-sm tabular-nums">{num(r.bp / 100)}%</span>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`− ${r.name}`} className="text-muted hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="relative mt-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input w-full" placeholder={t.addCollaborator} dir="auto" />
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-surface-hover"
                  >
                    <Plus className="h-3.5 w-3.5" /> {f.artist_name}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-xs ${given > 9000 ? "text-danger" : "text-muted"}`}>{t.youKeep(Math.max(0, (10_000 - given) / 100))}</span>
        <button type="button" onClick={save} disabled={given > 9000} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {t.save}
        </button>
      </div>
      {note && <p className="mt-2 text-sm">{note}</p>}
    </div>
  );
}

function PayoutAccount({ data, onChange }: { data: Data; onChange: () => void }) {
  const { t, lang } = useM();
  const saved = data.account?.method;
  const [method, setMethod] = useState<string>(
    saved && (PAYOUT_METHODS as readonly string[]).includes(saved) ? saved : lang === "fa" ? "Iranian bank (Sheba / card, Toman)" : PAYOUT_METHODS[0]
  );
  const [details, setDetails] = useState(data.account?.details ?? "");
  const [note, setNote] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    try {
      await send("/api/earnings/account", "PUT", { method, details });
      setNote(t.saved);
      onChange();
    } catch (err) {
      setNote(err instanceof Error ? err.message : t.saveFailed);
    }
  }
  const p = t.placeholders;
  const placeholder = method.startsWith("PayPal") ? p.paypal : isTomanMethod(method) ? p.sheba : method.startsWith("Bank") ? p.iban : method.startsWith("Crypto") ? p.crypto : p.other;
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">{t.howPaid}</h2>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="input" aria-label={t.howPaid}>
        {PAYOUT_METHODS.map((m) => (
          <option key={m} value={m}>
            {t.method(m)}
          </option>
        ))}
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={400} className="input" placeholder={placeholder} dir="ltr" />
      {isTomanMethod(method) && <p className="text-xs text-muted">{t.tomanNote}</p>}
      <p className="text-xs text-muted">{t.privateNote}</p>
      <button type="submit" className="self-start rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-surface-hover">
        {t.save}
      </button>
      {note && <p className="text-sm">{note}</p>}
    </form>
  );
}

function PayoutHistory({ data }: { data: Data }) {
  const { minMicros } = useSettings().payouts;
  const { t, money, date, num, lang } = useM();
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">{t.payouts}</h2>
      {data.payouts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.noPayouts(money(minMicros))}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.payouts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="text-muted tabular-nums">{date(p.created_at)}</span>
              <span className="flex-1 truncate">{t.method(p.method)}</span>
              <span className="font-semibold tabular-nums">
                {p.currency === "IRT" && p.toman !== null ? `${num(p.toman)} ${lang === "fa" ? "تومان" : "Toman"}` : money(p.micros)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${p.status === "paid" ? "bg-success/15 text-success" : p.status === "rejected" ? "bg-danger/15 text-danger" : "bg-drums/15 text-drums"}`}
              >
                {p.status === "paid" ? t.sent : p.status === "rejected" ? t.returned : t.onWay}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
