import { Eye, PieChart, Wallet, Wand2 } from "lucide-react";
import { UNCLAIMED_NOTE } from "@/lib/monetize/howText";
import { MICROS, SITE_SPLIT, type Split } from "@/lib/monetize/policy";
import { persianNumber } from "@/lib/monetize/adRules";
import type { Lang } from "@/lib/monetize/moneyText";
import type { PublicSettings } from "@/lib/settings/registry";

// The rules, drawn from the owner's settings (Admin → Settings) that the
// ledger itself uses, so this page can't promise something the money doesn't do.

type Part = { key: string; en: string; fa: string; color: string; bp: number };

/** A split as slices: on music, the songs' uploaders and miners are paid out of Remixt's part. */
function partsOf(split: Split, s: PublicSettings, music: boolean): Part[] {
  const helpers = music ? s.shares.uploader + s.shares.miner : 0;
  // A song played as it is has no remixer: a remixers' part set for songs stays with Remixt.
  const noRemixer = music && split === s.shares.song;
  const parts: Part[] = [
    { key: "artists", en: "Artists of the songs used", fa: "هنرمندانِ آهنگ‌های استفاده‌شده", color: "var(--vocals)", bp: split.artists },
    { key: "remixers", en: "Remixers", fa: "ریمیکسرها", color: "var(--brand)", bp: noRemixer ? 0 : split.remixers },
    { key: "uploader", en: "Who uploaded each song", fa: "آپلودکنندهٔ هر آهنگ", color: "var(--beat)", bp: music ? s.shares.uploader : 0 },
    { key: "miner", en: "Who split (mined) each song", fa: "جداکنندهٔ (ماینرِ) هر آهنگ", color: "var(--drums)", bp: music ? s.shares.miner : 0 },
    { key: "platform", en: "Remixt", fa: "ریمیکست", color: "var(--muted)", bp: split.platform - helpers + (noRemixer ? split.remixers : 0) },
  ];
  return parts.filter((p) => p.bp > 0);
}

function SplitCard({ title, note, split, lang, s, music = true }: { title: string; note: string; split: Split; lang: Lang; s: PublicSettings; music?: boolean }) {
  const parts = partsOf(split, s, music);
  const pct = (bp: number) => (lang === "fa" ? `${persianNumber(bp / 100)}٪` : `${bp / 100}%`);
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{note}</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${p.bp / 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="flex-1">{lang === "fa" ? p.fa : p.en}</span>
            <span className="font-semibold tabular-nums">{pct(p.bp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The questions under "How the money is shared" — also the page's FAQ for search engines (EarningsPage). */
export function earningFaq(lang: Lang, s: PublicSettings): { q: string; a: string }[] {
  const fa = lang === "fa";
  const n = (x: number) => (fa ? persianNumber(x) : String(x));
  const { shares, payouts, ads, audio } = s;
  const viewPct = ads.viewShare / 100;
  const viewSeconds = ads.viewMs / 1000;
  const minUsd = payouts.minMicros / MICROS;
  const cards: [string, string][] = fa
    ? [
        ["آیا هنرمندان پول می‌گیرند؟", `سهم هنرمندان بین آهنگ‌هایی که ریمیکس استفاده می‌کند تقسیم می‌شود (وکال ${n(shares.vocalWeight)} برابر حساب می‌شود). تِیکی که خودتان در استودیو خوانده‌اید به شما پرداخت می‌شود. سهم هر آهنگ تا وقتی هنرمندش ادعا کند و تأیید شود برایش نگه داشته می‌شود. ${UNCLAIMED_NOTE.fa(n(payouts.unclaimedYears))}`],
        ["هنرمند می‌تواند تصمیم بگیرد؟", "هنرمندِ تأییدشده برای هر آهنگش انتخاب می‌کند: «کسب درآمد» (تبلیغ روی همهٔ ریمیکس‌هایش می‌ماند، حتی اگر ریمیکسر خاموشش کند)، «تصمیم با ریمیکسر»، یا «مسدود» (ریمیکس‌هایش نمی‌توانند عمومی باشند)."],
        ["آپلودکننده و ماینر چه می‌گیرند؟", `کسی که آهنگ را به ریمیکست آورده ${n(shares.uploader / 100)}٪ و کسی که کامپیوترش آن را جدا کرده (ماینر) ${n(shares.miner / 100)}٪ از هر تبلیغی که از آن آهنگ استفاده کند می‌گیرد — از سهم ریمیکست، نه از سهم هنرمندان یا ریمیکسرها. اگر آهنگ را در مرورگر خودتان جدا کرده باشید، هر دو مال شماست.`],
        ["ریمیکسرها چه می‌گیرند؟", `سازندهٔ ریمیکس سهم ریمیکسرها را می‌گیرد و می‌تواند با همکارانش تقسیم کند (حداقل ${n(shares.ownerKeeps / 100)}٪ برای خودش). ریمیکسِ یک ریمیکس ${n(shares.parent / 100)}٪ از آن را به ریمیکس اصلی می‌فرستد. سازنده برای هر ریمیکس انتخاب می‌کند: تبلیغ روشن یا خاموش، چه نوع تبلیغی، و چه موضوع‌هایی نه.`],
        ["چه چیزی یک بازدید حساب می‌شود؟", `یک بازدید وقتی حساب می‌شود که دست‌کم ${n(viewPct)}٪ از تبلیغ ${n(viewSeconds)} ثانیه در یک صفحهٔ باز دیده شود، روزی یک بار برای هر نفر و هر جا. تبلیغ صوتی وقتی حساب می‌شود که ${n(audio.paidAfter)} ثانیه‌اش شنیده شود. بازدید خودتان از کار خودتان و ربات‌ها حساب نمی‌شوند. کلیک هیچ‌وقت پولی ندارد، پس برای کمک روی تبلیغ کلیک نکنید.`],
        ["تبلیغ صوتی هر چند وقت پخش می‌شود؟", `پیش از ریمیکس حداکثر هر ${n(audio.prerollEveryMinutes)} دقیقه یک بار برای هر شنونده${audio.prerollFreeFirst ? " و هرگز روی اولین ریمیکسِ یک بازدید" : ""}؛ حداکثر ${n(audio.maxSeconds)} ثانیه و پس از ${n(audio.skipAfter)} ثانیه رد شدنی. در رادیو اولین وقفه پس از حدود ${n(audio.radioFirstMinutes)} دقیقه شنیدن، سپس تقریباً هر ${n(audio.radioEveryMinutes)} دقیقه یک بار. هرگز برای خودِ سازندگان موسیقی.`],
        ["کی و چطور پولم را می‌گیرم؟", `درآمد ${n(payouts.holdDays)} روز صبر می‌کند (اگر بازدیدهای تبلیغ‌دهنده نامعتبر باشد)، بعد از ${n(minUsd)} دلار قابل برداشت است — به تومان و با نرخ روز به حساب شبا. وقتی پرداخت انجام شود در اعلان‌ها خبر می‌دهیم و صورت‌حساب هر ماه به‌صورت CSV دانلود می‌شود. مالیات درآمدتان با خودتان است.`],
      ]
    : [
        ["Do the artists get paid?", `The artists' share is split between the songs a remix uses (a vocal counts ${shares.vocalWeight}×). A take you sang in the Studio pays you. A song's share is kept for its artist until they claim it and we check it's theirs. ${UNCLAIMED_NOTE.en(payouts.unclaimedYears)}`],
        ["Can an artist decide about ads on their song?", "A verified artist chooses for each song: Monetize (ads stay on every remix of it, even if the remixer turns them off), Follow the remixer, or Block (remixes of it can't be public)."],
        ["What do uploaders and miners get?", `Whoever brought a song to Remixt gets ${shares.uploader / 100}% of every ad that uses it, and whoever's computer split it (its miner) ${shares.miner / 100}% — out of Remixt's part, never the artists' or remixers'. Split it in your own browser and both are yours.`],
        ["What do remixers get?", `The remix's maker gets the remixers' share, and can share it with collaborators (keeping at least ${shares.ownerKeeps / 100}%). A remix of a remix sends ${shares.parent / 100}% of it to the remix it came from. The maker chooses for each remix: ads on or off, which kinds, and topics they don't want.`],
        ["What counts as a view?", `A view counts when at least ${viewPct}% of the ad is on screen for ${viewSeconds} second${viewSeconds === 1 ? "" : "s"} in a visible tab, once a day per person and spot; an audio ad when ${audio.paidAfter} seconds of it were heard. Your own views of your own work don't count, nor do robots. Clicks are never paid, so please don't click ads to help.`],
        ["How often do audio ads play?", `Before a remix at most once per listener every ${audio.prerollEveryMinutes} minutes${audio.prerollFreeFirst ? " and never on the first remix of a visit" : ""}; ${audio.maxSeconds} s at most, skippable after ${audio.skipAfter} s. On the radio the first break after about ${audio.radioFirstMinutes} minutes of listening, then about one every ${audio.radioEveryMinutes} minutes. Never for the music's own makers.`],
        ["When and how do I get paid?", `Earnings wait ${payouts.holdDays} days (in case an advertiser's views turn out to be invalid), then they're yours to withdraw from $${minUsd}. You're told in your notifications when a payout is sent, and each month's statement downloads as a CSV. Taxes on what you earn are yours to declare where you live.`],
      ];
  return cards.map(([q, a]) => ({ q, a }));
}

export default function HowEarningWorks({ lang = "en", settings: s }: { lang?: Lang; settings: PublicSettings }) {
  const fa = lang === "fa";
  const n = (x: number) => (fa ? persianNumber(x) : String(x));
  const { shares, payouts } = s;
  const faq = earningFaq(lang, s);
  const journey = fa
    ? [
        { icon: Wand2, title: "بسازید یا بیاورید", body: "یک ریمیکس منتشر کنید، آهنگی آپلود کنید، یا آهنگ خودتان را ادعا کنید." },
        { icon: Eye, title: "مردم گوش می‌دهند", body: "تبلیغ‌ها کنار موسیقی شما دیده و شنیده می‌شوند — فقط بازدید واقعی." },
        { icon: PieChart, title: "سهم شما ثبت می‌شود", body: `هر بازدید همان لحظه بین سازندگان تقسیم می‌شود (ریمیکسرها ${n(shares.remix.remixers / 100)}٪، هنرمندان ${n(shares.remix.artists / 100)}٪).` },
        { icon: Wallet, title: "برداشت کنید", body: `پس از ${n(payouts.holdDays)} روز، از ${n(payouts.minMicros / MICROS)} دلار به بالا به حسابتان.` },
      ]
    : [
        { icon: Wand2, title: "Make or bring music", body: "Publish a remix, upload a song, or claim a song that's yours." },
        { icon: Eye, title: "People listen", body: "Ads are seen and heard next to your music — real views only." },
        { icon: PieChart, title: "Your share is booked", body: `Each view is split at once between the makers (remixers ${shares.remix.remixers / 100}%, artists ${shares.remix.artists / 100}%).` },
        { icon: Wallet, title: "Cash out", body: `After ${payouts.holdDays} days, from $${payouts.minMicros / MICROS} to your account.` },
      ];
  return (
    <section className="mt-12" aria-labelledby="how-earning-works">
      <h2 id="how-earning-works" className="text-2xl font-bold tracking-tight">
        {fa ? "پول تبلیغ چطور تقسیم می‌شود" : "How the money is shared"}
      </h2>
      <p className="mt-2 max-w-3xl text-muted">
        {fa
          ? "تبلیغ‌دهنده‌ها برای هر بازدید از تبلیغشان پول می‌دهند. جای تبلیغ می‌گوید مال کیست: صفحهٔ یک ریمیکس مال کسانی است که آن موسیقی را ساخته‌اند، یک صفحهٔ معمولی مال ریمیکست."
          : "Advertisers pay for each view of their ad. Where the ad sits says whose it is: a remix's page belongs to the people who made that music, an ordinary page to Remixt."}
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={fa ? "چطور درآمد دارید" : "How you earn"}>
        {journey.map((j, i) => (
          <li key={j.title} className="relative rounded-2xl border border-border bg-surface p-4">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/30 to-vocals/20 text-brand-strong">
                <j.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">{fa ? `گام ${n(i + 1)}` : `Step ${i + 1}`}</span>
            </span>
            <h3 className="mt-3 font-semibold">{j.title}</h3>
            <p className="mt-1 text-sm text-muted">{j.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SplitCard lang={lang} s={s} title={fa ? "روی یک ریمیکس" : "On a remix"} note={fa ? "صفحهٔ ریمیکس، یا پخش آن در رادیو." : "The remix's page, or the remix playing on the radio."} split={shares.remix} />
        <SplitCard lang={lang} s={s} title={fa ? "یک آهنگ در رادیو" : "A song on the radio"} note={fa ? "آهنگی از کتابخانه که همان‌طور پخش می‌شود." : "A library song played as it is."} split={shares.song} />
        <SplitCard
          lang={lang}
          s={s}
          title={fa ? "جاهای دیگر" : "Everywhere else"}
          note={fa ? "صفحهٔ اصلی، ابزارها، فهرست‌ها و پروفایل‌ها سایت را سرپا نگه می‌دارند؛ و پولِ معرفی ویژه." : "Home, tools, lists and profiles keep the site running; and money paid to promote a remix."}
          split={SITE_SPLIT}
          music={false}
        />
      </div>

      <h3 className="mt-10 text-lg font-bold">{fa ? "پرسش‌های رایج" : "Questions people ask"}</h3>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        {faq.map(({ q, a }) => (
          <details key={q} className="group rounded-2xl border border-border bg-surface/60 px-4 py-3 open:bg-surface">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {q}
              <span className="text-lg text-muted transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-2 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
