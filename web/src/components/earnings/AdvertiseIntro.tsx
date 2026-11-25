import Link from "next/link";
import { AudioLines, BadgeCheck, Image as ImageIcon, Megaphone, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { getSettings } from "@/lib/settings/server";
import { formatMoney } from "@/lib/monetize/policy";
import { NEVER, NEVER_FA } from "@/lib/monetize/adRules";
import { JsonLd, faqJsonLd } from "@/lib/seo";

// What /advertise says to someone not signed in (and to search engines): what
// can be bought, where it shows, how it's paid for — the owner's real numbers.
// Every claim must stay true of the ad system (lib/monetize).
export default async function AdvertiseIntro({ lang }: { lang: "en" | "fa" }) {
  const fa = lang === "fa";
  const { ads, audio } = await getSettings();
  const price = (m: number) => formatMoney(m);
  // The questions an advertiser has before paying — also given to search engines as FAQ data.
  const faq = fa
    ? [
        { q: "هزینهٔ تبلیغ چقدر است؟", a: `قیمت هر ۱٬۰۰۰ بازدید را خودتان تعیین می‌کنید: از ${price(ads.floors.card)} برای تبلیغ تصویری و ${price(ads.floors.audio)} برای صوتی. قیمت بالاتر بیشتر نمایش داده می‌شود. هر مبلغی بخواهید اعتبار می‌گذارید و تا تمام شدنش نمایش داده می‌شود.` },
        { q: "چه چیزی بازدید حساب می‌شود؟", a: `وقتی دست‌کم ${ads.viewShare / 100}٪ از تبلیغ ${ads.viewMs / 1000} ثانیه در یک صفحهٔ باز دیده شود، یا ${audio.paidAfter} ثانیه از تبلیغ صوتی شنیده شود. ربات‌ها و بازدیدهای تکراری حساب نمی‌شوند و کلیک رایگان است.` },
        { q: "تبلیغم کی نمایش داده می‌شود؟", a: "پس از سه گام: تبلیغ را می‌سازید و برای بررسی می‌فرستید، ریمیکست آن را بررسی می‌کند (معمولاً تا یک روز)، و پرداخت شما تأیید می‌شود. بلافاصله پس از آن نمایش شروع می‌شود و وضعیت هر گام را در صفحهٔ تبلیغ‌هایتان می‌بینید." },
        { q: "چطور پرداخت کنم؟", a: "کارت به کارت، انتقال بانکی یا تتر — جزئیات در صفحهٔ «افزودن اعتبار» است. شمارهٔ پیگیری را می‌فرستید و ما رسیدنش را تأیید می‌کنیم." },
        { q: "تبلیغ کجا نمایش داده می‌شود؟", a: "تصویری: فهرست‌ها، صفحهٔ ابزارها و راهنماها، زیر پخش‌کنندهٔ ریمیکس‌ها و در رادیو. صوتی: پیش از ریمیکس‌ها و در وقفه‌های رادیو. معرفی ویژه: بالای فهرست ریمیکس‌ها یا کتابخانه." },
      ]
    : [
        { q: "How much does advertising cost?", a: `You set your price per 1,000 views: from ${price(ads.floors.card)} for picture ads and ${price(ads.floors.audio)} for audio. A higher price shows more often. Add any budget you like; the ad runs until it's spent.` },
        { q: "What counts as a view?", a: `At least ${ads.viewShare / 100}% of the ad on screen for ${ads.viewMs / 1000} second${ads.viewMs === 1000 ? "" : "s"} in a visible tab, or ${audio.paidAfter} seconds of an audio ad heard. Robots and repeat views don't count, and clicks are free.` },
        { q: "When does my ad start showing?", a: "After three steps: you make it and send it for review, Remixt checks it (usually within a day), and your payment is confirmed. It starts the moment all three are done, and your ads page shows which step each ad is on." },
        { q: "How do I pay?", a: "By card, bank transfer or USDT — the details are under “Add money”. You send the reference and we confirm it arrived." },
        { q: "Where do the ads appear?", a: "Picture ads: lists, tool pages and guides, under remix players and on the radio. Audio ads: before remixes and in radio breaks. Promotions: first in the remixes list or the library." },
      ];
  const kinds = [
    {
      icon: ImageIcon,
      title: fa ? "تبلیغ تصویری" : "Picture ads",
      text: fa
        ? `زیر پخش‌کنندهٔ ریمیکس‌ها، در صفحهٔ رادیو و صفحه‌های ابزار. از ${price(ads.floors.card)} برای هر ۱٬۰۰۰ بازدید.`
        : `Under remix players, on the radio page and the tool pages. From ${price(ads.floors.card)} per 1,000 views.`,
    },
    {
      icon: AudioLines,
      title: fa ? "تبلیغ صوتی" : "Audio ads",
      text: fa
        ? `تا ${audio.maxSeconds} ثانیه پیش از ریمیکس‌ها و در وقفه‌های رادیو. از ${price(ads.floors.audio)} برای هر ۱٬۰۰۰ شنیدن.`
        : `Up to ${audio.maxSeconds} seconds before remixes and in radio breaks. From ${price(ads.floors.audio)} per 1,000 listens.`,
    },
    {
      icon: Sparkles,
      title: fa ? "معرفی ویژه" : "Promote your music",
      text: fa
        ? `ریمیکس یا آهنگت اولِ فهرست‌ها با برچسب «ویژه». از ${price(ads.floors.promote)} برای هر ۱٬۰۰۰ بازدید.`
        : `Your remix or song first in the lists, marked “Promoted”. From ${price(ads.floors.promote)} per 1,000 views.`,
    },
  ];
  const promises = fa
    ? [
        "فقط برای تبلیغی که واقعاً دیده یا شنیده شد پول می‌دهی (نیمی از آن، یک ثانیه، در تبِ باز).",
        "هر تبلیغ پیش از اجرا بررسی می‌شود؛ ربات‌ها و بازدیدهای تکراری حساب نمی‌شوند.",
        "پولِ هر بازدید بینِ هنرمندان، ریمیکسرها و ریمیکست تقسیم می‌شود.",
        "گزارشِ بازدید، کلیک و خرج، روز به روز.",
      ]
    : [
        "You pay only for ads really seen or heard (half on screen for a second, in a visible tab).",
        "Every ad is reviewed before it runs; robots and repeat views don't count.",
        "Each view's money is shared with the artists and remixers behind the music.",
        "Views, clicks and spend, day by day.",
      ];
  return (
    <div className="flex flex-col gap-8" dir={fa ? "rtl" : undefined}>
      <header className="rounded-3xl border border-border bg-gradient-to-br from-brand/25 via-surface to-vocals/10 p-6 sm:p-10">
        <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
          <Megaphone className="h-8 w-8 text-brand-strong" aria-hidden /> {fa ? "در ریمیکست تبلیغ کن" : "Advertise on Remixt"}
        </h1>
        <p className="mt-3 max-w-2xl text-muted sm:text-lg">
          {fa
            ? "به کسانی برس که موسیقی می‌سازند و گوش می‌دهند — روی ریمیکس‌ها، رادیو و ابزارها. خودت بساز، بودجه بگذار، و فقط برای بازدیدِ واقعی پول بده."
            : "Reach people who make and listen to music — on remixes, the radio and the tools. Make it yourself, set a budget, and pay only for real views."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/login?next=${encodeURIComponent(fa ? "/fa/advertise" : "/advertise")}`} className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25">
            {fa ? "ورود و ساختِ تبلیغ" : "Sign in to make your ad"}
          </Link>
          <Link href="/signup" className="rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold hover:bg-surface-hover">
            {fa ? "ساخت حساب رایگان" : "Create a free account"}
          </Link>
        </div>
      </header>

      <section aria-labelledby="ad-kinds">
        <h2 id="ad-kinds" className="text-xl font-bold">{fa ? "چه می‌توانی بخری" : "What you can run"}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {kinds.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-5">
              <Icon className="h-6 w-6 text-brand-strong" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ad-promise" className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 id="ad-promise" className="text-xl font-bold">{fa ? "چطور کار می‌کند" : "How it works"}</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {promises.map((p) => (
              <li key={p} className="flex gap-2">
                <BadgeCheck className="h-5 w-5 shrink-0 text-success" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-5 w-5 text-brand-strong" aria-hidden /> {fa ? "هرگز در ریمیکست" : "Never on Remixt"}
          </h2>
          <p className="mt-2 text-muted">{(fa ? NEVER_FA : NEVER).join(" · ")}</p>
          <p className="mt-4 flex items-center gap-2 text-muted">
            <Radio className="h-4 w-4" aria-hidden />
            {fa ? "سازندهٔ هر ریمیکس انتخاب می‌کند چه نوع تبلیغی و کجای صفحه‌اش باشد." : "Each remix's maker chooses which kinds of ad show on their page, and where."}
          </p>
        </div>
      </section>

      <section aria-labelledby="ad-faq">
        <JsonLd data={faqJsonLd(faq)} />
        <h2 id="ad-faq" className="text-xl font-bold">{fa ? "پرسش‌های تبلیغ‌دهنده‌ها" : "Questions advertisers ask"}</h2>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {faq.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-border bg-surface/60 px-4 py-3 open:bg-surface">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {f.q}
                <span className="text-lg text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
