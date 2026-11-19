import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { monetizeSettings } from "@/lib/monetize/store";
import type { Lang } from "@/lib/monetize/moneyText";

// The frame of a signed-in money page (artist songs, a remix's ads, the
// advertiser page) in either language: asks to sign in first, and hands the
// page the Toman rate.
export default async function MemberPage({
  lang,
  path,
  children,
}: {
  lang: Lang;
  /** The English path: the Persian one is /fa + it. */
  path: string;
  children: (rate: number) => React.ReactNode;
}) {
  const user = await getCurrentUser();
  const fa = lang === "fa";
  const here = fa ? `/fa${path}` : path;
  const rate = user ? (await monetizeSettings().catch(() => null))?.tomanRate ?? 0 : 0;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="mb-4 text-end text-sm">
        <Link href={fa ? path : `/fa${path}`} hrefLang={fa ? "en" : "fa"} className="text-brand-strong hover:underline">
          {fa ? "English" : "فارسی"}
        </Link>
      </p>
      {user ? (
        children(rate)
      ) : (
        <div className="rounded-3xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">{fa ? "برای دیدن این صفحه وارد شوید." : "Sign in to see this page."}</p>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white">
            {fa ? "ورود" : "Log in"}
          </Link>
        </div>
      )}
    </div>
  );
}
