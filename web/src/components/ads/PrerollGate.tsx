"use client";

// The audio ad before a remix plays (like YouTube's pre-roll), only where
// the remix's maker allows it (or an artist chose Monetize), and gently:
// never on the first remix of a visit, at most once per listener every 30
// minutes (adRules.ts prerollDue), never to the music's own makers (the
// server sends none). Up to 15 s, skippable after 5 s, paid once 5 s of it
// were heard.
//
// The ad is fetched and loaded ahead, while the page is open, so the play
// tap can start it straight away — phones only let a page start sound
// inside a tap. The mix starts by itself when the ad ends or is skipped
// (audioEngine.setBeforePlay unlocked it in the same tap).

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, HeartHandshake, SkipForward } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { visitorId } from "@/lib/client/presence";
import { adHeard, prerollDue, type ListenerAds } from "@/lib/monetize/adRules";
import { useSettings } from "@/components/SettingsProvider";
import RemixtMark from "@/components/RemixtMark";

type Ad = { id: string; advertiser: string; title: string; body: string; cta: string; image: string | null; audio: string | null; seconds: number | null };
type Served = {
  ad: Ad | null;
  /** One of Remixt's own sounds (only when the owner turned that on: Admin → Settings). */
  house?: { id: string; title: string; body: string; cta: string; href: string; media: string | null; seconds: number | null } | null;
  token: string | null;
  supports: { name: string; role: string; bp: number }[];
};

/** A paying ad as it is, or one of ours dressed as one (with where its button goes). */
function playable(s: Served): (Ad & { own: boolean; href: string | null }) | null {
  if (s.ad?.audio) return { ...s.ad, own: false, href: null };
  const h = s.house;
  if (!h?.media) return null;
  return { id: h.id, advertiser: "Remixt", title: h.title, body: h.body, cta: h.cta, image: null, audio: h.media, seconds: h.seconds, own: true, href: h.href };
}

const KEY = "remixt-audio-ads";

function readState(): ListenerAds | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as ListenerAds | null;
  } catch {
    return null;
  }
}
function writeState(s: ListenerAds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: every visit is a first visit, so no ads — fine.
  }
}

export default function PrerollGate({ remixId, lang = "en" }: { remixId: string; lang?: "en" | "fa" }) {
  const fa = lang === "fa";
  const { audio: AUDIO } = useSettings();
  const rules = useRef(AUDIO);
  // The latest rules, for the players' own events (they outlive a render).
  useEffect(() => {
    rules.current = AUDIO;
  }, [AUDIO]);
  const ready = useRef<{ served: Served; el: HTMLAudioElement } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const finish = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState<Served | null>(null);
  const [at, setAt] = useState(0);

  // Ahead of the tap: is one due on the next play? Then fetch and load it.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (ready.current || cancelled) return;
      if (!prerollDue(readState(), Date.now(), rules.current).due) return;
      const q = new URLSearchParams({ placement: "remix", format: "audio", target: `remix:${remixId}`, lang });
      fetch(`/api/ads?${q}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<Served>)
        .then((served) => {
          const sound = playable(served);
          if (cancelled || !sound?.audio || !served.token) return;
          const el = new Audio();
          el.preload = "auto";
          el.setAttribute("playsinline", "");
          el.src = sound.audio;
          ready.current = { served, el };
        })
        .catch(() => {});
    };
    load();
    // A visit that goes on (a second remix from this page's list) may make one due later.
    const again = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(again);
    };
  }, [remixId, lang]);

  useEffect(() => {
    const gate = () => {
      if (running.current) return running.current;
      const now = Date.now();
      const { due, next } = prerollDue(readState(), now, rules.current);
      writeState(next);
      const got = ready.current;
      if (!due || !got) return Promise.resolve();
      ready.current = null;
      const { served, el } = got;
      // Started here, inside the tap (no await before this line).
      const started = el.play();
      running.current = new Promise<void>((resolve) => {
        let paid = false;
        const total = Math.min(rules.current.maxSeconds, playable(served)?.seconds ?? rules.current.maxSeconds);
        // A sound that stalls never holds the remix back for long.
        const timeout = setTimeout(() => done(), (total + 7) * 1000);
        const tick = () => {
          setAt(el.currentTime);
          // Heard, not seen: it counts with the screen locked too.
          if (!paid && (el.currentTime >= Math.min(rules.current.paidAfter, total - 0.5) || el.ended)) {
            paid = true;
            writeState(adHeard(next, Date.now()));
            fetch("/api/ads/view", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: served.token, visitor: visitorId() }),
              keepalive: true,
            }).catch(() => {});
          }
        };
        function done() {
          clearTimeout(timeout);
          el.removeEventListener("timeupdate", tick);
          el.removeEventListener("ended", done);
          el.removeEventListener("error", done);
          el.pause();
          finish.current = null;
          running.current = null;
          setPlaying(null);
          setAt(0);
          resolve();
        }
        finish.current = done;
        el.addEventListener("timeupdate", tick);
        el.addEventListener("ended", done);
        el.addEventListener("error", done);
        // The browser refused (no tap, or no sound allowed): straight to the mix.
        started.catch(() => done());
      });
      setPlaying(served);
      return running.current;
    };
    audioEngine.setBeforePlay(gate, () => finish.current?.());
    return () => {
      finish.current?.();
      audioEngine.setBeforePlay(null);
    };
  }, []);

  const ad = playing ? playable(playing) : null;
  if (!playing || !ad) return null;
  // One of ours can be skipped straight away: it pays nobody, so it shouldn't hold anyone up.
  const left = ad.own ? 0 : Math.max(0, Math.ceil(AUDIO.skipAfter - at));
  const total = Math.min(AUDIO.maxSeconds, ad.seconds ?? AUDIO.maxSeconds);
  const people = playing.supports.filter((s) => s.role !== "platform" && s.bp > 0);

  return (
    <div
      role="dialog"
      aria-label={fa ? "تبلیغ صوتی" : "Audio ad"}
      dir={fa ? "rtl" : undefined}
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-lg overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-2xl sm:bottom-6"
    >
      <div className="h-1 bg-surface">
        <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${Math.min(100, (at / total) * 100)}%` }} />
      </div>
      <div className="flex items-center gap-3 p-3">
        {ad.own ? (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand via-vocals to-beat">
            <RemixtMark className="h-10 w-10" />
          </span>
        ) : ad.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- the advertiser's picture
          <img src={ad.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/40 to-vocals/30 text-xl font-bold">
            {(ad.advertiser || ad.title).slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {ad.own ? (fa ? "از ریمیکست" : "From Remixt") : fa ? "تبلیغ" : "Ad"} · {Math.max(0, Math.ceil(total - at))}s
            {!ad.own && ad.advertiser ? ` · ${ad.advertiser}` : ""}
          </p>
          <p className="line-clamp-2 break-words font-semibold leading-snug">{ad.title}</p>
          <a
            href={ad.own ? (ad.href ?? "/") : `/api/ads/click?t=${encodeURIComponent(playing.token ?? "")}`}
            onClick={() => {
              if (!ad.own || !playing.token) return;
              try {
                navigator.sendBeacon?.("/api/ads/click", playing.token);
              } catch {}
            }}
            target="_blank"
            rel={ad.own ? "noopener" : "sponsored noopener"}
            className="inline-flex items-center gap-1 text-sm text-brand-strong hover:underline"
          >
            {ad.cta} <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </a>
        </div>
        <button
          type="button"
          disabled={left > 0}
          onClick={() => finish.current?.()}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold disabled:text-muted sm:px-3.5 sm:text-sm"
        >
          {left > 0 ? (fa ? `رد کردن در ${left}` : `Skip in ${left}`) : fa ? "رد کردن" : "Skip ad"}
          {left === 0 && <SkipForward className="h-4 w-4 rtl:-scale-x-100" />}
        </button>
      </div>
      {people.length > 0 && (
        <p className="flex items-center gap-1.5 border-t border-border/70 px-3 py-2 text-xs text-muted">
          <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-vocals" />
          <span className="line-clamp-2">
            {fa ? "این تبلیغ حامیِ " : "This ad pays "}
            <span className="text-foreground">{people.slice(0, 3).map((p) => p.name).join(fa ? "، " : ", ")}</span>
          </span>
        </p>
      )}
    </div>
  );
}
