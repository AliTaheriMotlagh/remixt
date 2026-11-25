import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import EarningsDashboard from "./EarningsDashboard";
import HowEarningWorks, { earningFaq } from "./HowEarningWorks";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import type { Lang } from "@/lib/monetize/moneyText";
import { getSettings } from "@/lib/settings/server";
import { publicSettings } from "@/lib/settings/registry";

// /earnings and /fa/earnings: a member's dashboard, or (signed out) the
// public page explaining how ads pay the people behind the music.
export default async function EarningsPage({ lang }: { lang: Lang }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const fa = lang === "fa";
  const next = fa ? "/fa/earnings" : "/earnings";
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <JsonLd data={[faqJsonLd(earningFaq(lang, publicSettings(settings))), breadcrumbJsonLd([{ name: fa ? "درآمد" : "Earnings", path: next }])]} />
      <p className="mb-4 text-end text-sm">
        <Link href={fa ? "/earnings" : "/fa/earnings"} hrefLang={fa ? "en" : "fa"} className="text-brand-strong hover:underline">
          {fa ? "English" : "فارسی"}
        </Link>
      </p>
      {user ? (
        <EarningsDashboard artistName={user.artist_name} lang={lang} />
      ) : (
        <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/25 via-vocals/10 to-beat/10 p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-strong">{fa ? "ریمیکست برای هنرمندان" : "Remixt for artists"}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {fa ? "هر ریمیکس به سازندگان موسیقی پول می‌دهد" : "Every remix pays the people who made the music"}
          </h1>
          <p className="mt-3 max-w-2xl text-muted sm:text-lg">
            {fa
              ? "پول تبلیغ روی یک ریمیکس بین ریمیکسرها، هنرمندانِ آهنگ‌هایی که استفاده کرده و ریمیکست تقسیم می‌شود. سهم هنرمندانی که هنوز عضو نشده‌اند برایشان نگه داشته می‌شود."
              : "Ads on a remix are shared between its remixers, the artists of the songs it uses, and Remixt. Artists who haven't joined yet have their share kept for them."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/signup?next=${next}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">
              {fa ? "شروع کسب درآمد" : "Start earning"}
            </Link>
            <Link href={`/login?next=${next}`} className="rounded-full border border-border bg-surface/70 px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover">
              {fa ? "ورود" : "Log in"}
            </Link>
            <Link href={fa ? "/fa/advertise" : "/advertise"} className="rounded-full border border-border bg-surface/70 px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover">
              {fa ? "تبلیغ در ریمیکست" : "Advertise on Remixt"}
            </Link>
          </div>
        </header>
      )}
      <HowEarningWorks lang={lang} settings={publicSettings(settings)} />
    </div>
  );
}
