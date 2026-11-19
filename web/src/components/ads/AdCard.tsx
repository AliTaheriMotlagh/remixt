"use client";

// An ad spot. What makes it a good one:
// - Its size is held from the first paint (no page jumping when it fills).
// - It says what it is: "Sponsored" (a paying ad) or "From Remixt" (ours).
// - A view counts only once at least half of it has been on screen for a
//   second in a visible tab (the IAB/MRC standard) — nothing on load.
// - A paying ad says who the view supports — the remixer, the songs'
//   artists, Remixt — with each one's share, so a listener sees the ad
//   is how the people behind the music get paid.
// - Never in the Studio, DJ decks, embeds, the console or forms (see
//   lib/monetize/spots.ts): only where people read and listen.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, HeartHandshake, Info, X } from "lucide-react";
import { houseAd } from "@/lib/monetize/houseAds";
import { ROLE_TEXT, type Placement, type Role } from "@/lib/monetize/policy";
import { useSettings } from "@/components/SettingsProvider";
import { visitorId } from "@/lib/client/presence";

type Supporter = { name: string; role: Role; bp: number; held: boolean };
type Served = {
  /** The page's maker keeps ads off here (or an artist blocked it): nothing at all shows. */
  off?: boolean;
  ad: { id: string; advertiser: string; title: string; body: string; cta: string; image: string | null } | null;
  token: string | null;
  supports: Supporter[];
};

/** The roles in lowercase, as the line under an ad says them ("Ali · remixer"). */
const ROLE = Object.fromEntries(
  Object.entries(ROLE_TEXT).map(([k, v]) => [k, { ...v, en: k === "platform" ? v.en : v.en.toLowerCase() }])
) as Record<Role, { en: string; fa: string; color: string }>;

const TONE = {
  brand: "from-brand/25 via-brand/10",
  vocals: "from-vocals/25 via-vocals/10",
  beat: "from-beat/25 via-beat/10",
  drums: "from-drums/25 via-drums/10",
};

export default function AdCard({
  placement,
  target,
  lang = "en",
  seed = 0,
  className = "",
}: {
  placement: Placement;
  /** "remix:<id>" or "track:<id>": whose this spot is. Left out: an ordinary page (the site's). */
  target?: string | null;
  lang?: "en" | "fa";
  /** Varies which of Remixt's own ads shows, when there's no paying one. */
  seed?: number;
  className?: string;
}) {
  const box = useRef<HTMLElement>(null);
  const [served, setServed] = useState<Served | null>(null);
  const [why, setWhy] = useState(false);
  const fa = lang === "fa";
  const { ads: adRules } = useSettings();
  const viewable = { fraction: adRules.viewShare / 10_000, ms: adRules.viewMs };

  // Asked for only once the spot comes near the screen (an ad below the fold costs nothing until then).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        const q = new URLSearchParams({ placement, lang, ...(target ? { target } : {}) });
        fetch(`/api/ads?${q}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<Served>)
          .then((s) => !cancelled && setServed(s))
          .catch(() => !cancelled && setServed({ ad: null, token: null, supports: [] }));
      },
      { rootMargin: "400px 0px" }
    );
    near.observe(el);
    return () => {
      cancelled = true;
      near.disconnect();
    };
  }, [placement, target, lang]);

  // The view: half on screen for a second, page visible. Once.
  useEffect(() => {
    const el = box.current;
    const token = served?.token;
    if (!el || !token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const send = () => {
      done = true;
      seen.disconnect();
      const body = JSON.stringify({ token, visitor: visitorId() });
      fetch("/api/ads/view", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const seen = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (done || !entry || entry.intersectionRatio < viewable.fraction || document.hidden) return;
        timer = setTimeout(() => !document.hidden && send(), viewable.ms);
      },
      { threshold: [0, viewable.fraction, 1] }
    );
    seen.observe(el);
    const onHidden = () => document.hidden && clearTimeout(timer);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearTimeout(timer);
      seen.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [served?.token, viewable.fraction, viewable.ms]);

  const house = useMemo(() => houseAd(lang, seed), [lang, seed]);
  const ad = served?.ad;
  const supporters = (served?.supports ?? []).filter((s) => s.bp > 0);
  const people = supporters.filter((s) => s.role !== "platform");

  if (served?.off) return null;
  return (
    <aside
      ref={box}
      aria-label={fa ? "تبلیغ" : "Advertisement"}
      dir={fa ? "rtl" : undefined}
      // The size is fixed before anything arrives, so nothing moves when it does.
      className={`relative min-h-[8.5rem] overflow-hidden rounded-2xl border border-border bg-surface ${className}`}
    >
      {!served ? (
        <div className="h-[8.5rem] animate-pulse bg-gradient-to-r from-surface via-surface-raised to-surface" />
      ) : ad ? (
        <div className="flex h-full flex-col">
          <a
            href={`/api/ads/click?t=${encodeURIComponent(served.token ?? "")}`}
            target="_blank"
            rel="sponsored noopener"
            className="group flex flex-1 items-center gap-4 p-4 transition-colors hover:bg-surface-hover"
          >
            {ad.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- an advertiser's picture on their own host
              <img src={ad.image} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/40 to-vocals/30 text-2xl font-bold sm:h-24 sm:w-24">
                {(ad.advertiser || ad.title).slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-foreground/80">{fa ? "تبلیغ" : "Sponsored"}</span>
                {ad.advertiser && <span className="truncate normal-case tracking-normal">{ad.advertiser}</span>}
              </span>
              <span className="mt-1 block truncate font-semibold">{ad.title}</span>
              {ad.body && <span className="mt-0.5 line-clamp-2 text-sm text-muted">{ad.body}</span>}
            </span>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-transform group-hover:scale-[1.03] sm:inline-flex">
              {ad.cta} <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
            </span>
          </a>
          {people.length > 0 && (
            <div className="border-t border-border/70 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setWhy((v) => !v)}
                className="flex w-full items-center gap-2 text-start text-xs text-muted hover:text-foreground"
                aria-expanded={why}
              >
                <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-vocals" />
                <span className="min-w-0 flex-1 truncate">
                  {fa ? "این تبلیغ حامیِ " : "This ad supports "}
                  <span className="text-foreground">{people.slice(0, 2).map((p) => p.name).join(fa ? " و " : " & ")}</span>
                  {people.length > 2 && (fa ? ` و ${people.length - 2} نفر دیگر` : ` + ${people.length - 2} more`)}
                </span>
                <SplitBar supporters={supporters} />
                {why ? <X className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
              </button>
              {why && (
                <ul className="mt-2.5 grid gap-1.5 text-xs">
                  {supporters.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {/* The share first, so a long name on a phone never pushes it out of sight. */}
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: ROLE[s.role].color }} />
                      <span className="w-11 shrink-0 font-semibold tabular-nums">{(s.bp / 100).toFixed(s.bp % 100 ? 1 : 0)}%</span>
                      <span className="min-w-0 flex-1 break-words">
                        {s.name}
                        {s.role !== "platform" && <span className="text-muted"> · {fa ? ROLE[s.role].fa : ROLE[s.role].en}</span>}
                        {s.held && <span className="text-muted">{fa ? " · نگه‌داشته تا هنرمند بیاید" : " · kept for them until they join"}</span>}
                      </span>
                    </li>
                  ))}
                  <li className="pt-1">
                    <Link href="/earnings" className="text-brand-strong hover:underline">
                      {fa ? "درآمد چطور تقسیم می‌شود ←" : "How ads pay artists →"}
                    </Link>
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <Link href={house.href} className={`group flex h-[8.5rem] items-center gap-4 bg-gradient-to-br ${TONE[house.tone]} to-transparent p-4 transition-colors`}>
          <span className="min-w-0 flex-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{fa ? "از ریمیکست" : "From Remixt"}</span>
            <span className="mt-1 block truncate text-base font-semibold">{house.title}</span>
            <span className="mt-0.5 line-clamp-2 text-sm text-muted">{house.body}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface/80 px-3.5 py-2 text-sm font-semibold backdrop-blur transition-transform group-hover:scale-[1.03]">
            {house.cta}
          </span>
        </Link>
      )}
    </aside>
  );
}

/** Each share as a slice of one thin bar, in its role's colour. */
function SplitBar({ supporters }: { supporters: Supporter[] }) {
  return (
    <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-raised sm:flex" aria-hidden>
      {supporters.map((s, i) => (
        <span key={i} style={{ width: `${s.bp / 100}%`, background: ROLE[s.role].color, opacity: s.held ? 0.55 : 1 }} />
      ))}
    </span>
  );
}
