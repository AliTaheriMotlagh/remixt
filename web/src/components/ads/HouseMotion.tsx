"use client";

// Remixt's own animated ad: the promo video's story told in the ad box, in
// code — a few KB instead of a video file, sharp at any size, no download on
// a slow line. Four beats on an 8-second loop, like the promo:
//   1. "Got a song you love?" — one waveform.
//   2. It splits: vocals (pink) rise, beat (cyan) falls.
//   3. "Drop any vocal on any beat." — the two lanes slide into a mix.
//   4. "Remix it your way." — the mark and the button.
// It moves only while on screen, and holds still under reduced motion
// (the last beat, which says it all).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import RemixtMark from "@/components/RemixtMark";

const LINES = {
  en: ["Got a song you love?", "Split it: vocals and beat.", "Drop any vocal on any beat.", "Remix it your way."],
  fa: ["آهنگی داری که دوستش داری؟", "جدا کن: صدا و بیت.", "هر صدایی را روی هر بیتی بگذار.", "ریمیکس، به سبکِ خودت."],
};

// A fixed, natural-looking waveform (no randomness: the server and the page draw the same).
const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37 + 1)));

export default function HouseMotion({
  lang,
  title,
  body,
  cta,
  href,
  onOpen,
  compact = false,
}: {
  lang: "en" | "fa";
  title: string;
  body: string;
  cta: string;
  href: string;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const box = useRef<HTMLAnchorElement>(null);
  const [playing, setPlaying] = useState(false);
  const fa = lang === "fa";
  const lines = LINES[lang];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlaying(!!e?.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const external = /^https?:/.test(href);
  return (
    <Link
      ref={box}
      href={href}
      onClick={onOpen}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      aria-label={`${title}. ${body}`}
      className={`house-motion @container group relative flex items-center gap-4 overflow-hidden bg-[radial-gradient(120%_140%_at_0%_0%,rgba(236,72,153,0.22),transparent_55%),radial-gradient(120%_140%_at_100%_100%,rgba(6,182,212,0.2),transparent_55%)] p-4 ${
        compact ? "h-14 py-2" : "h-[8.5rem]"
      } ${playing ? "" : "paused"}`}
    >
      {/* The story, one line at a time. Screen readers get the title and body above instead. */}
      <span aria-hidden className={`relative min-w-0 flex-1 ${compact ? "h-6" : "h-16"}`}>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{fa ? "از ریمیکست" : "From Remixt"}</span>
        {!compact &&
          lines.map((line, i) => (
            <span
              key={i}
              className={`hm-line ${i === 3 ? "hm-last" : ""} absolute inset-x-0 top-5 block truncate text-lg font-bold sm:text-xl`}
              style={{ animationDelay: `${i * 2}s` }}
            >
              {i === 3 ? (
                fa ? (
                  <>ریمیکس، به <span className="bg-gradient-to-r from-vocals to-beat bg-clip-text text-transparent">سبکِ خودت</span>.</>
                ) : (
                  <>Remix it <span className="bg-gradient-to-r from-vocals to-beat bg-clip-text text-transparent">your way</span>.</>
                )
              ) : (
                line
              )}
            </span>
          ))}
        {!compact && <span className="absolute inset-x-0 bottom-0 block truncate text-xs text-muted">{body}</span>}
        {compact && <span className="ms-2 truncate text-sm font-semibold">{title}</span>}
      </span>

      {/* The waveform that splits into vocals and beat, then becomes a mix. */}
      <span aria-hidden className={`relative shrink-0 ${compact ? "hidden" : "hidden h-24 w-40 @[34rem]:block @[44rem]:w-56"}`}>
        <svg viewBox="0 0 340 120" className="h-full w-full" preserveAspectRatio="none">
          {BARS.map((h, i) => (
            <g key={i} transform={`translate(${i * 10 + 2} 60)`}>
              <rect className="hm-vocal" x="0" width="6" rx="3" y={-h * 26} height={h * 26 * 2} style={{ animationDelay: `${i * 18}ms` }} />
              <rect className="hm-beat" x="0" width="6" rx="3" y={-h * 22} height={h * 22 * 2} style={{ animationDelay: `${i * 18}ms` }} />
            </g>
          ))}
        </svg>
        <span className="hm-mark absolute inset-0 flex items-center justify-center">
          <RemixtMark className="h-14 w-14 drop-shadow-[0_0_24px_rgba(139,92,246,0.6)]" />
        </span>
      </span>

      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-[0_0_20px_-6px_var(--brand)] transition-transform group-hover:scale-[1.04]">
        {cta} <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
      </span>
    </Link>
  );
}
