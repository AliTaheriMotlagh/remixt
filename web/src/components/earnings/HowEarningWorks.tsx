import { AUDIO, FREQUENCY, UNCLAIMED_NOTE } from "@/lib/monetize/howText";
import { HOLD_DAYS, MICROS, PAYOUT_MIN_MICROS, PARENT_SHARE_BP, SONG_HELPERS, SPLITS, UNCLAIMED_YEARS, VIEWABLE, type Split } from "@/lib/monetize/policy";
import { persianNumber } from "@/lib/monetize/adRules";
import type { Lang } from "@/lib/monetize/moneyText";

// The rules, drawn from the numbers the ledger uses (lib/monetize/policy.ts,
// adRules.ts), so this page can't promise something the money doesn't do.

type Part = { key: string; en: string; fa: string; color: string; bp: number };

/** A split as slices: on music, the songs' uploaders and miners are paid out of Remixt's part. */
function partsOf(split: Split, music: boolean): Part[] {
  const helpers = music ? SONG_HELPERS.uploader + SONG_HELPERS.miner : 0;
  const parts: Part[] = [
    { key: "artists", en: "Artists of the songs used", fa: "هنرمندانِ آهنگ‌های استفاده‌شده", color: "var(--vocals)", bp: split.artists },
    { key: "remixers", en: "Remixers", fa: "ریمیکسرها", color: "var(--brand)", bp: split.remixers },
    { key: "uploader", en: "Who uploaded each song", fa: "آپلودکنندهٔ هر آهنگ", color: "var(--beat)", bp: music ? SONG_HELPERS.uploader : 0 },
    { key: "miner", en: "Who split (mined) each song", fa: "جداکنندهٔ (ماینرِ) هر آهنگ", color: "var(--drums)", bp: music ? SONG_HELPERS.miner : 0 },
    { key: "platform", en: "Remixt", fa: "ریمیکست", color: "var(--muted)", bp: split.platform - helpers },
  ];
  return parts.filter((p) => p.bp > 0);
}

function SplitCard({ title, note, split, lang, music = true }: { title: string; note: string; split: Split; lang: Lang; music?: boolean }) {
  const parts = partsOf(split, music);
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

export default function HowEarningWorks({ lang = "en" }: { lang?: Lang }) {
  const fa = lang === "fa";
  const n = (x: number) => (fa ? persianNumber(x) : String(x));
  const cards: [string, string][] = fa
    ? [
        ["همیشه برای هنرمندان", `سهم هنرمندان بین آهنگ‌هایی که ریمیکس استفاده می‌کند تقسیم می‌شود (وکال دو برابر حساب می‌شود). تِیکی که خودتان در استودیو خوانده‌اید به شما پرداخت می‌شود. سهم هر آهنگ تا وقتی هنرمندش ادعا کند و تأیید شود برایش نگه داشته می‌شود. ${UNCLAIMED_NOTE.fa(n(UNCLAIMED_YEARS))}`],
        ["هنرمند تصمیم می‌گیرد", "هنرمندِ تأییدشده برای هر آهنگش انتخاب می‌کند: «کسب درآمد» (تبلیغ روی همهٔ ریمیکس‌هایش می‌ماند، حتی اگر ریمیکسر خاموشش کند)، «تصمیم با ریمیکسر»، یا «مسدود» (ریمیکس‌هایش نمی‌توانند عمومی باشند)."],
        ["آپلودکننده و ماینر", `کسی که آهنگ را به ریمیکست آورده ${n(SONG_HELPERS.uploader / 100)}٪ و کسی که کامپیوترش آن را جدا کرده (ماینر) ${n(SONG_HELPERS.miner / 100)}٪ از هر تبلیغی که از آن آهنگ استفاده کند می‌گیرد — از سهم ریمیکست، نه از سهم هنرمندان یا ریمیکسرها. اگر آهنگ را در مرورگر خودتان جدا کرده باشید، هر دو مال شماست.`],
        ["همیشه برای ریمیکسرها", `سازندهٔ ریمیکس سهم ریمیکسرها را می‌گیرد و می‌تواند با همکارانش تقسیم کند (حداقل ۱۰٪ برای خودش). ریمیکسِ یک ریمیکس ${n(PARENT_SHARE_BP / 100)}٪ از آن را به ریمیکس اصلی می‌فرستد. سازنده برای هر ریمیکس انتخاب می‌کند: تبلیغ روشن یا خاموش، چه نوع تبلیغی، و چه موضوع‌هایی نه.`],
        ["فقط بازدید واقعی", `یک بازدید وقتی حساب می‌شود که دست‌کم نیمی از تبلیغ ${n(VIEWABLE.ms / 1000)} ثانیه در یک صفحهٔ باز دیده شود، روزی یک بار برای هر نفر و هر جا. تبلیغ صوتی وقتی حساب می‌شود که ${n(AUDIO.paidAfter)} ثانیه‌اش شنیده شود. بازدید خودتان از کار خودتان و ربات‌ها حساب نمی‌شوند. کلیک هیچ‌وقت پولی ندارد، پس برای کمک روی تبلیغ کلیک نکنید.`],
        ["تبلیغ صوتی، با ملاحظه", `پیش از ریمیکس حداکثر هر ${n(FREQUENCY.prerollEveryMs / 60_000)} دقیقه یک بار برای هر شنونده و هرگز روی اولین ریمیکسِ یک بازدید؛ حداکثر ${n(AUDIO.maxSeconds)} ثانیه و پس از ${n(AUDIO.skipAfter)} ثانیه رد شدنی. در رادیو تقریباً هر ${n(FREQUENCY.radioEveryMs / 60_000)} دقیقه شنیدن یک وقفه. هرگز برای خودِ سازندگان موسیقی.`],
        ["دریافت پول", `درآمد ${n(HOLD_DAYS)} روز صبر می‌کند (اگر بازدیدهای تبلیغ‌دهنده نامعتبر باشد)، بعد از ${n(PAYOUT_MIN_MICROS / MICROS)} دلار قابل برداشت است — به تومان و با نرخ روز به حساب شبا. وقتی پرداخت انجام شود در اعلان‌ها خبر می‌دهیم و صورت‌حساب هر ماه به‌صورت CSV دانلود می‌شود. مالیات درآمدتان با خودتان است.`],
      ]
    : [
        ["Artists, always", `The artists' share is split between the songs a remix uses (a vocal counts double). A take you sang in the Studio pays you. A song's share is kept for its artist until they claim it and we check it's theirs. ${UNCLAIMED_NOTE.en(UNCLAIMED_YEARS)}`],
        ["Artists decide", "A verified artist chooses for each song: Monetize (ads stay on every remix of it, even if the remixer turns them off), Follow the remixer, or Block (remixes of it can't be public)."],
        ["Uploaders and miners", `Whoever brought a song to Remixt gets ${SONG_HELPERS.uploader / 100}% of every ad that uses it, and whoever's computer split it (its miner) ${SONG_HELPERS.miner / 100}% — out of Remixt's part, never the artists' or remixers'. Split it in your own browser and both are yours.`],
        ["Remixers, always", `The remix's maker gets the remixers' share, and can share it with collaborators (keeping at least 10%). A remix of a remix sends ${PARENT_SHARE_BP / 100}% of it to the remix it came from. The maker chooses for each remix: ads on or off, which kinds, and topics they don't want.`],
        ["Real views only", `A view counts when at least half the ad is on screen for ${VIEWABLE.ms / 1000} second in a visible tab, once a day per person and spot; an audio ad when ${AUDIO.paidAfter} seconds of it were heard. Your own views of your own work don't count, nor do robots. Clicks are never paid, so please don't click ads to help.`],
        ["Audio ads, gently", `Before a remix at most once per listener every ${FREQUENCY.prerollEveryMs / 60_000} minutes and never on the first remix of a visit; ${AUDIO.maxSeconds} s at most, skippable after ${AUDIO.skipAfter} s. On the radio a break about every ${FREQUENCY.radioEveryMs / 60_000} minutes of listening. Never for the music's own makers.`],
        ["Getting paid", `Earnings wait ${HOLD_DAYS} days (in case an advertiser's views turn out to be invalid), then they're yours to withdraw from $${PAYOUT_MIN_MICROS / MICROS}. You're told in your notifications when a payout is sent, and each month's statement downloads as a CSV. Taxes on what you earn are yours to declare where you live.`],
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
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SplitCard lang={lang} title={fa ? "روی یک ریمیکس" : "On a remix"} note={fa ? "صفحهٔ ریمیکس، یا پخش آن در رادیو." : "The remix's page, or the remix playing on the radio."} split={SPLITS.remix} />
        <SplitCard lang={lang} title={fa ? "یک آهنگ در رادیو" : "A song on the radio"} note={fa ? "آهنگی از کتابخانه که همان‌طور پخش می‌شود." : "A library song played as it is."} split={SPLITS.song} />
        <SplitCard
          lang={lang}
          title={fa ? "جاهای دیگر" : "Everywhere else"}
          note={fa ? "صفحهٔ اصلی، ابزارها، فهرست‌ها و پروفایل‌ها سایت را سرپا نگه می‌دارند؛ و پولِ معرفی ویژه." : "Home, tools, lists and profiles keep the site running; and money paid to promote a remix."}
          split={SPLITS.site}
          music={false}
        />
      </div>

      <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        {cards.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-border bg-surface/60 p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1.5 text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
