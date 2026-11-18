"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Hand, Loader2, MonitorPlay, Plus, Radio, Users, Vote } from "lucide-react";
import type { StationCard } from "@/lib/radio";
import { LiveDot, RadioArt } from "./RadioBits";

// Every station, the house one first and then the busiest, and starting
// your own.

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
        className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm"
      />
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value.slice(0, 140))}
        placeholder="One line about it (optional)"
        aria-label="Tagline"
        className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm"
      />
      <button type="submit" disabled={busy || !name.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Start the station
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

export default function RadioHome({ signedIn }: { signedIn: boolean }) {
  const [stations, setStations] = useState<StationCard[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/radio", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setStations(d.stations ?? []))
        .catch(() => alive && setStations([]));
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const [house, ...rest] = stations ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-black p-5 text-white sm:p-10">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -left-20 -top-28 size-96 rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute -bottom-32 right-0 size-96 rounded-full bg-vocals/25 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-beat/20 blur-3xl" />
        </div>
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/70">
          <Radio className="size-4" /> Remixt Radio
        </p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">Radio where the listeners choose the next song.</h1>
        <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
          Everyone hears the same moment. Vote on what plays next, request songs and remixes, or run your own station — then put it in your app, your game or on YouTube Live.
        </p>
        <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
          {[
            [Vote, "Vote on every next song"],
            [Hand, "Requests that climb when many ask"],
            [MonitorPlay, "Embed it, or broadcast it with OBS"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Vote;
            return (
              <li key={text as string} className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur">
                <I className="size-4 shrink-0" /> {text as string}
              </li>
            );
          })}
        </ul>
      </section>

      {stations === null ? (
        <div className="flex justify-center py-10 text-muted">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <>
          {house && (
            <Link href={`/radio/${house.slug}`} className="group relative isolate flex flex-col gap-4 overflow-hidden rounded-[28px] border border-border bg-surface p-4 transition hover:border-brand/60 sm:flex-row sm:items-center sm:p-6">
              <div className="absolute inset-0 -z-10 opacity-40" aria-hidden>
                <RadioArt item={house.now} className="size-full scale-125 blur-3xl" />
              </div>
              <RadioArt item={house.now} className="aspect-square w-full rounded-2xl shadow-xl sm:w-40" />
              <div className="min-w-0 flex-1">
                <LiveDot label={house.now ? "On air now" : "Ready"} className="text-danger" />
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">{house.name}</h2>
                <p className="text-sm text-muted">{house.tagline}</p>
                {house.now && (
                  <p className="mt-2 truncate text-base">
                    <span className="font-semibold">{house.now.title}</span> <span className="text-muted">· {house.now.artist}</span>
                  </p>
                )}
              </div>
              <span className="flex items-center gap-3 sm:flex-col sm:items-end">
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Users className="size-4" /> {house.listeners} listening
                </span>
                <span className="flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-black text-black transition group-hover:scale-105">
                  Listen <ArrowRight className="size-4" />
                </span>
              </span>
            </Link>
          )}

          <section>
            <h2 className="mb-3 text-xl font-bold">Stations</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((s) => (
                <li key={s.slug}>
                  <Link href={`/radio/${s.slug}`} className="flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition hover:border-brand/60 hover:bg-surface-hover">
                    <RadioArt item={s.now ?? { title: s.name, artist: s.owner ?? "", cover: null }} className="size-20 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{s.name}</span>
                      <span className="block truncate text-xs text-muted">{s.now ? `${s.now.title} · ${s.now.artist}` : s.tagline || `by ${s.owner}`}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        {s.now && <LiveDot label="Live" className="text-danger" />}
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> {s.listeners}
                        </span>
                        {s.mine && <span className="rounded-full bg-brand/20 px-2 py-0.5 font-semibold text-brand-strong">Yours</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              <li className="rounded-2xl border border-dashed border-border bg-surface/50 p-4">
                <h3 className="mb-1 font-bold">Your own station</h3>
                <p className="mb-3 text-sm text-muted">Your playlist, your rules: voting, requests, and reports on what played and who listened.</p>
                {signedIn ? (
                  <StartStation />
                ) : (
                  <Link href="/login?next=/radio" className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
                    Log in to start one
                  </Link>
                )}
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
