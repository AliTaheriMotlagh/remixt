"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, Hand, Headphones, Loader2, Lock, MonitorPlay, Play, Plus, Radio, Sparkles, Users, Vote, Waves } from "lucide-react";
import type { StationCard } from "@/lib/radio";
import { TRANSITION_TEXT, TRANSITIONS } from "@/lib/radioTransitions";
import { LiveDot, RadioArt } from "./RadioBits";
import { RADIO_FAQ, STATIONS_PER_ACCOUNT } from "@/lib/radioPage";

// The radio's front page: the house station on air (one tap to tune in),
// every other station, how the changes between songs are mixed, and starting
// your own. Rendered on the server with the stations (so the page is whole
// before any script runs, for people and search engines), then kept fresh.


function StartStation() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/radio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tagline }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Couldn't start the station");
          router.push(`/radio/${data.slug}/console`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't start the station");
          setBusy(false);
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 60))}
        placeholder="Station name — e.g. Late Night Persian Rap"
        aria-label="Station name"
        required
        className="min-h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/50 outline-none focus:border-white/60 sm:text-sm"
      />
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value.slice(0, 140))}
        placeholder="One line about it (optional)"
        aria-label="Tagline"
        className="min-h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/50 outline-none focus:border-white/60 sm:text-sm"
      />
      <button type="submit" disabled={busy || !name.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition hover:scale-[1.02] disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Start the station
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}

/** A row of level-meter bars (still under reduced motion). */
function Equalizer({ bars = 48, className = "" }: { bars?: number; className?: string }) {
  return (
    <div className={`flex items-end gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => {
        const h = 30 + ((i * 37) % 70);
        return (
          <span
            key={i}
            className="eq-bar block flex-1 rounded-t-sm bg-gradient-to-t from-brand via-vocals to-beat"
            style={{ height: `${h}%`, transformOrigin: "bottom", ["--d" as string]: `${-((i * 0.137) % 1.1).toFixed(2)}s`, opacity: 0.35 + (h / 100) * 0.5 }}
          />
        );
      })}
    </div>
  );
}

const FEATURES = [
  { Icon: Users, title: "One moment for everyone", text: "Every listener hears the same second of the same song, on any device." },
  { Icon: Vote, title: "Vote on what's next", text: "A few songs are up for each next slot; the most votes wins it." },
  { Icon: Hand, title: "Requests that climb", text: "Ask for a song or a remix; the more people ask, the sooner it plays." },
  { Icon: Lock, title: "Made for phones", text: "One tap to tune in, with the song and its cover on your lock screen." },
  { Icon: MonitorPlay, title: "Embed and broadcast", text: "A player for your site, and a page made for OBS to stream live." },
  { Icon: BarChart3, title: "Reports for owners", text: "What played, how it was chosen, skips, votes and peak listeners." },
] as const;

export default function RadioHome({ signedIn, initial }: { signedIn: boolean; initial: StationCard[] | null }) {
  const [stations, setStations] = useState<StationCard[] | null>(initial);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/radio", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setStations(d.stations ?? []))
        .catch(() => alive && setStations((s) => s ?? []));
    if (initial === null) void load();
    // Fresh while it's looked at; a hidden tab doesn't keep asking (and catches up when shown).
    const timer = setInterval(() => !document.hidden && load(), 15_000);
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial]);
  const [house, ...rest] = stations ?? [];
  const listening = (stations ?? []).reduce((n, s) => n + s.listeners, 0);
  const onAir = (stations ?? []).filter((s) => s.now).length;
  const styles = TRANSITIONS.filter((t) => t !== "auto");

  return (
    <div className="flex min-w-0 flex-col gap-8 sm:gap-12">
      {/* The hero: what this is, and the house station one tap away. */}
      <section className="relative isolate overflow-hidden rounded-[32px] border border-white/10 bg-black text-white">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -left-24 -top-32 size-[28rem] rounded-full bg-brand/45 blur-3xl" />
          <div className="absolute -bottom-40 right-[-6rem] size-[30rem] rounded-full bg-vocals/30 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 size-80 rounded-full bg-beat/25 blur-3xl" />
          {house?.now && <RadioArt item={house.now} className="absolute inset-0 size-full scale-125 opacity-20 blur-3xl" />}
        </div>
        <div className="grid gap-8 p-5 pb-24 sm:p-10 sm:pb-28 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/70">
              <Radio className="size-4" /> Remixt Radio
              {onAir > 0 && <LiveDot label={`${onAir} on air`} className="ms-2 text-red-400" />}
            </p>
            <h1 className="mt-3 text-4xl font-black leading-[1.02] tracking-tight text-balance sm:text-6xl">
              Radio that mixes itself. <span className="bg-gradient-to-r from-vocals via-brand to-beat bg-clip-text text-transparent">You choose what&rsquo;s next.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">
              Stations of songs and remixes, every change mixed like a DJ would — beats locked, basses swapped. Everyone hears the same moment, votes on the next song and sends requests.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {house ? (
                <Link href={`/radio/${house.slug}`} className="group flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-black text-black shadow-[0_0_40px_-8px_rgba(255,255,255,0.6)] transition hover:scale-105">
                  <Play className="size-4 fill-current" /> Tune in now
                </Link>
              ) : (
                <span className="flex min-h-12 items-center gap-2 rounded-full bg-white/20 px-6 font-black">
                  <Loader2 className="size-4 animate-spin" /> Finding stations
                </span>
              )}
              <a href="#start" className="flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-5 font-semibold text-white/90 transition hover:bg-white/10">
                <Plus className="size-4" /> Start your own station
              </a>
            </div>
            {stations && (
              <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div>
                  <dt className="text-white/60">Listening now</dt>
                  <dd className="text-2xl font-black tabular-nums">{listening}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Stations</dt>
                  <dd className="text-2xl font-black tabular-nums">{stations.length}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Ways to mix a change</dt>
                  <dd className="text-2xl font-black tabular-nums">{styles.length}</dd>
                </div>
              </dl>
            )}
          </div>

          {house && (
            <Link
              href={`/radio/${house.slug}`}
              className="group relative mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-xl transition hover:border-white/40"
              aria-label={`Listen to ${house.name}${house.now ? `: ${house.now.title} by ${house.now.artist}` : ""}`}
            >
              <div className="relative">
                <RadioArt item={house.now ?? { title: house.name, artist: house.owner ?? "", cover: null }} className="aspect-square w-full rounded-2xl shadow-xl" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                  <span className="flex size-16 items-center justify-center rounded-full bg-white text-black shadow-2xl">
                    <Play className="size-7 fill-current" />
                  </span>
                </span>
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <LiveDot label={house.now ? "On air now" : "Ready"} className="text-red-400" />
                  <p className="mt-1 truncate text-lg font-black">{house.now?.title ?? house.name}</p>
                  <p className="truncate text-sm text-white/70">{house.now ? house.now.artist : house.tagline}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs">
                  <Headphones className="size-3.5" /> {house.listeners}
                </span>
              </div>
              <p className="mt-2 truncate text-xs text-white/60">{house.name}</p>
            </Link>
          )}
        </div>
        <Equalizer className="pointer-events-none absolute inset-x-0 bottom-0 h-16 px-4 sm:h-20" />
      </section>

      {/* Every other station. */}
      <section aria-labelledby="stations">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="stations" className="text-2xl font-black tracking-tight sm:text-3xl">Stations</h2>
          {stations && <p className="text-sm text-muted">{onAir} on air · {listening} listening</p>}
        </div>
        {stations === null ? (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          /* grid-cols-1, not the implicit column: a long "now playing" line must truncate, not widen the page past a phone's screen. */
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...(house ? [house] : []), ...rest].map((s) => (
              <li key={s.slug} className="min-w-0">
                <Link href={`/radio/${s.slug}`} className="group relative isolate flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-[0_12px_40px_-16px_var(--brand)]">
                  <div className="absolute inset-0 -z-10 opacity-0 transition group-hover:opacity-30" aria-hidden>
                    <RadioArt item={s.now ?? { title: s.name, artist: s.owner ?? "", cover: null }} className="size-full scale-150 blur-2xl" />
                  </div>
                  <div className="relative shrink-0">
                    <RadioArt item={s.now ?? { title: s.name, artist: s.owner ?? "", cover: null }} className="size-20 rounded-xl" />
                    {s.now && <Equalizer bars={5} className="absolute bottom-1.5 left-1.5 h-4 w-6" />}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{s.now ? `${s.now.title} · ${s.now.artist}` : s.tagline || `by ${s.owner}`}</span>
                    <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                      {s.now && <LiveDot label="Live" className="text-danger" />}
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {s.listeners}
                      </span>
                      {s.mine && <span className="rounded-full bg-brand/20 px-2 py-0.5 font-semibold text-brand-strong">Yours</span>}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How the changes are mixed: the reason it sounds like a DJ, not a playlist. */}
      <section aria-labelledby="mixed" className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden style={{ background: "radial-gradient(circle at 90% 0%, var(--beat-dim), transparent 50%)" }} />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand-strong">
            <Waves className="size-4" /> Mixed like a DJ
          </p>
          <h2 id="mixed" className="mt-2 max-w-2xl text-2xl font-black tracking-tight text-balance sm:text-3xl">No gaps, no fades to silence: every change is a mix.</h2>
          <p className="mt-2 max-w-2xl text-muted">{TRANSITION_TEXT.auto.help}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {styles.map((t) => (
              <li key={t} className={`rounded-2xl border p-4 ${t === "automix" ? "border-brand/50 bg-brand/10 sm:col-span-2 lg:col-span-1" : "border-border bg-surface-raised/40"}`}>
                <p className="flex items-center gap-2 font-bold">
                  {t === "automix" && <Sparkles className="size-4 text-brand-strong" aria-hidden />} {TRANSITION_TEXT[t].en}
                </p>
                <p className="mt-1 text-sm text-muted">{TRANSITION_TEXT[t].help}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="why">
        <h2 id="why" className="text-2xl font-black tracking-tight sm:text-3xl">Radio, but yours to steer</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-vocals/25 to-beat/25 text-brand-strong">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Your own station. */}
      <section id="start" aria-labelledby="own" className="relative isolate scroll-mt-24 overflow-hidden rounded-[28px] border border-white/10 bg-black p-5 text-white sm:p-10">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute -bottom-32 left-0 size-96 rounded-full bg-beat/25 blur-3xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 id="own" className="text-3xl font-black tracking-tight text-balance sm:text-4xl">Start your own station</h2>
            <p className="mt-3 max-w-lg text-white/75">
              Your playlist and your rules: pick the songs and remixes, switch voting and requests on or off, choose how changes are mixed, and see what played and who listened.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            {signedIn ? (
              <StartStation />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-white/75">A free account runs up to {STATIONS_PER_ACCOUNT} stations.</p>
                <Link href="/signup?next=/radio%23start" className="flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-black text-black transition hover:scale-[1.02]">
                  Sign up free
                </Link>
                <Link href="/login?next=/radio%23start" className="flex min-h-11 items-center justify-center rounded-xl border border-white/25 px-4 text-sm font-semibold">
                  Log in
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="radio-faq" className="max-w-3xl">
        <h2 id="radio-faq" className="text-2xl font-black tracking-tight sm:text-3xl">Questions</h2>
        <div className="mt-4 flex flex-col gap-3">
          {RADIO_FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-surface p-4 open:border-brand/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                <h3>{f.q}</h3>
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
