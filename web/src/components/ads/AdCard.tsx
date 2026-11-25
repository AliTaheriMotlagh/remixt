"use client";

// An ad spot. What makes it a good one:
// - Its size is held from the first paint (no page jumping when it fills).
// - It says what it is: "Sponsored" (a paying ad) or "From Remixt" (ours).
// - A view counts only once at least half of it has been on screen for a
//   second in a visible tab (the IAB/MRC standard) — nothing on load.
// - A paying ad says who the view supports — the remixer, the songs'
//   artists, Remixt — with each one's share, so a listener sees the ad
//   is how the people behind the music get paid.
// - On a remix, its maker decides where it sits (`spot`), how it looks
//   (full card or a slim strip) and whether Remixt's own may fill in.
// - Never in the Studio, DJ decks, embeds, the console or forms: only where
//   people read and listen.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, HeartHandshake, Info, Volume2, VolumeX, X } from "lucide-react";
import type { AdSpot, AdStyle } from "@/lib/monetize/adRules";
import type { HouseKind, HouseTone } from "@/lib/monetize/houseAds";
import { ROLE_TEXT, type Placement, type Role } from "@/lib/monetize/policy";
import { useSettings, useShowsAds } from "@/components/SettingsProvider";
import { visitorId } from "@/lib/client/presence";
import HouseMotion from "./HouseMotion";

type Supporter = { name: string; role: Role; bp: number; held: boolean };
export type House = { id: string; kind: HouseKind; title: string; body: string; cta: string; tone: HouseTone; media: string | null; href?: string };
type Served = {
  /** The page's maker keeps ads off here (or an artist blocked it): nothing at all shows. */
  off?: boolean;
  ad: { id: string; advertiser: string; title: string; body: string; cta: string; image: string | null } | null;
  /** One of Remixt's own, when no paying ad fits. */
  house?: House | null;
  token: string | null;
  supports: Supporter[];
  style?: AdStyle;
};

/** The roles in lowercase, as the line under an ad says them ("Ali · remixer"). */
const ROLE = Object.fromEntries(
  Object.entries(ROLE_TEXT).map(([k, v]) => [k, { ...v, en: k === "platform" ? v.en : v.en.toLowerCase() }])
) as Record<Role, { en: string; fa: string; color: string }>;

const TONE: Record<HouseTone, string> = {
  brand: "from-brand/25 via-brand/10",
  vocals: "from-vocals/25 via-vocals/10",
  beat: "from-beat/25 via-beat/10",
  drums: "from-drums/25 via-drums/10",
};

/** Counted without waiting: the page may be leaving. */
function sendClick(token: string | null) {
  if (!token) return;
  try {
    if (!navigator.sendBeacon?.("/api/ads/click", token)) {
      void fetch("/api/ads/click", { method: "POST", body: token, keepalive: true }).catch(() => {});
    }
  } catch {
    // An ad's count is never worth an error.
  }
}

export default function AdCard({
  placement,
  target,
  spot,
  lang = "en",
  className = "",
}: {
  placement: Placement;
  /** "remix:<id>" or "track:<id>": whose this spot is. Left out: an ordinary page (the site's). */
  target?: string | null;
  /** Where on a remix's page this spot is (its maker chooses which show). */
  spot?: AdSpot;
  lang?: "en" | "fa";
  /** Kept for older callers; which of ours shows is chosen by the server now. */
  seed?: number;
  className?: string;
}) {
  const box = useRef<HTMLElement>(null);
  const [served, setServed] = useState<Served | null>(null);
  const [why, setWhy] = useState(false);
  const fa = lang === "fa";
  const { ads: adRules } = useSettings();
  const showsAds = useShowsAds();
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
        const q = new URLSearchParams({ placement, lang, ...(target ? { target } : {}), ...(spot ? { spot } : {}) });
        fetch(`/api/ads?${q}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<Served>)
          .then((s) => !cancelled && setServed(s))
          .catch(() => !cancelled && setServed({ ad: null, house: null, token: null, supports: [] }));
      },
      { rootMargin: "400px 0px" }
    );
    near.observe(el);
    return () => {
      cancelled = true;
      near.disconnect();
    };
  }, [placement, target, lang, spot]);

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

  const ad = served?.ad;
  const house = served?.house ?? null;
  const compact = served?.style === "compact";
  const supporters = (served?.supports ?? []).filter((s) => s.bp > 0);
  const people = supporters.filter((s) => s.role !== "platform");

  // Off by the page's maker, or nothing at all to show (ours turned off), or a Plus member: the spot closes.
  if (!showsAds || (served && (served.off || (!ad && !house)))) return null;
  const height = compact ? "min-h-14" : "min-h-[8.5rem]";
  return (
    <aside
      ref={box}
      aria-label={fa ? "تبلیغ" : "Advertisement"}
      dir={fa ? "rtl" : undefined}
      // The size is fixed before anything arrives, so nothing moves when it does.
      className={`relative ${height} overflow-hidden rounded-2xl border border-border bg-surface ${className}`}
    >
      {!served ? (
        <div className="skeleton h-[8.5rem]" />
      ) : ad ? (
        <div className="flex h-full flex-col">
          <a
            href={`/api/ads/click?t=${encodeURIComponent(served.token ?? "")}`}
            target="_blank"
            rel="sponsored noopener"
            className={`group flex flex-1 items-center transition-colors hover:bg-surface-hover ${compact ? "gap-3 px-3 py-2" : "gap-3 p-3 sm:gap-4 sm:p-4"}`}
          >
            {ad.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- an advertiser's picture on their own host
              <img src={ad.image} alt="" loading="lazy" className={`shrink-0 rounded-xl object-cover ${compact ? "h-10 w-10 rounded-lg" : "h-16 w-16 sm:h-24 sm:w-24"}`} />
            ) : (
              <span className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/40 to-vocals/30 font-bold ${compact ? "h-10 w-10 rounded-lg" : "h-16 w-16 text-2xl sm:h-24 sm:w-24"}`}>
                {(ad.advertiser || ad.title).slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-foreground/80">{fa ? "تبلیغ" : "Sponsored"}</span>
                {ad.advertiser && <span className="truncate normal-case tracking-normal">{ad.advertiser}</span>}
              </span>
              <span className={`block break-words font-semibold leading-snug ${compact ? "line-clamp-2 text-sm" : "mt-1 line-clamp-3 sm:line-clamp-2"}`}>{ad.title}</span>
              {ad.body && !compact && <span className="mt-0.5 line-clamp-3 break-words text-sm text-muted sm:line-clamp-2">{ad.body}</span>}
              {/* On a phone the button would squeeze the words: the action is a line under them instead (the whole card is the link). */}
              {!compact && (
                <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong sm:hidden">
                  {ad.cta} <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              )}
            </span>
            <span className={`shrink-0 items-center gap-1 rounded-full bg-brand font-semibold text-white transition-transform group-hover:scale-[1.03] ${compact ? "inline-flex px-3 py-1.5 text-xs" : "hidden px-3.5 py-2 text-sm sm:inline-flex"}`}>
              {ad.cta} <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
            </span>
          </a>
          {people.length > 0 && !compact && (
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
      ) : house ? (
        <HouseSpot house={house} lang={lang} compact={compact} onOpen={() => sendClick(served.token)} />
      ) : null}
    </aside>
  );
}

/** One of Remixt's own: the animated promo, an uploaded video, or a picture card (also Admin → Remixt ads' preview). */
export function HouseSpot({ house, lang, compact, onOpen }: { house: House; lang: "en" | "fa"; compact: boolean; onOpen: () => void }) {
  const fa = lang === "fa";
  const href = house.href ?? "/";
  if (house.kind === "motion") {
    return <HouseMotion lang={lang} title={house.title} body={house.body} cta={house.cta} href={href} onOpen={onOpen} compact={compact} />;
  }
  if (house.kind === "video" && house.media && !compact) {
    return <HouseVideo house={house} fa={fa} href={href} onOpen={onOpen} />;
  }
  const external = /^https?:/.test(href);
  return (
    <Link
      href={href}
      onClick={onOpen}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      className={`group flex items-center bg-gradient-to-br ${TONE[house.tone]} to-transparent transition-colors ${compact ? "min-h-14 gap-3 px-3 py-2" : "min-h-[8.5rem] gap-3 p-3 sm:gap-4 sm:p-4"}`}
    >
      {house.media && house.kind === "card" ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own upload, served by /api/ads/house
        <img src={house.media} alt="" loading="lazy" className={`shrink-0 object-cover ${compact ? "h-10 w-10 rounded-lg" : "h-16 w-16 rounded-xl sm:h-24 sm:w-24"}`} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{fa ? "از ریمیکست" : "From Remixt"}</span>
        <span className={`block break-words font-semibold leading-snug ${compact ? "line-clamp-2 text-sm" : "mt-1 line-clamp-2 text-base"}`}>{house.title}</span>
        {!compact && <span className="mt-0.5 line-clamp-3 break-words text-sm text-muted sm:line-clamp-2">{house.body}</span>}
        {!compact && <span className="mt-1.5 inline-flex text-sm font-semibold text-brand-strong sm:hidden">{house.cta} →</span>}
      </span>
      <span className={`${compact ? "inline-flex" : "hidden sm:inline-flex"} shrink-0 items-center gap-1 rounded-full border border-border bg-surface/80 font-semibold backdrop-blur transition-transform group-hover:scale-[1.03] ${compact ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm"}`}>
        {house.cta}
      </span>
    </Link>
  );
}

/** An uploaded video: plays muted while on screen (as browsers require), sound on a tap. */
function HouseVideo({ house, fa, href, onOpen }: { house: House; fa: boolean; href: string; onOpen: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !document.hidden) void el.play().catch(() => {});
      else el.pause();
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const external = /^https?:/.test(href);
  return (
    <div className="flex min-h-[8.5rem] items-center gap-3 bg-gradient-to-br from-brand/20 to-transparent p-3 sm:gap-4">
      <div className="relative h-full shrink-0 overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9", height: "7rem", maxWidth: "45%" }}>
        <video ref={video} src={house.media ?? undefined} muted={muted} playsInline loop preload="metadata" className="h-full w-full object-cover" aria-label={house.title} />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="absolute bottom-1.5 end-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
          aria-label={muted ? (fa ? "صدا را روشن کن" : "Sound on") : fa ? "بی‌صدا" : "Mute"}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      <Link href={href} onClick={onOpen} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined} className="group min-w-0 flex-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{fa ? "از ریمیکست" : "From Remixt"}</span>
        <span className="mt-1 line-clamp-2 block break-words font-semibold leading-snug">{house.title}</span>
        <span className="mt-0.5 line-clamp-2 break-words text-sm text-muted">{house.body}</span>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
          {house.cta} <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </span>
      </Link>
    </div>
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
