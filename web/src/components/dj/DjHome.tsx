"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Award, BookOpen, Check, ClipboardCheck, Disc3, Dumbbell, Headphones, Lock, Mic2, Plane, RotateCcw } from "lucide-react";
import { ALL_SCENARIOS, CHECKRIDES, GIGS, LEVELS, levelItems, levelUnlocked } from "@/lib/client/dj/curriculum";
import { GEAR, type GearId } from "@/lib/client/dj/gear";
import { rankOf, totalStars, type DjProgress } from "@/lib/client/dj/progress";
import { RANKS } from "@/lib/client/dj/scoring";
import type { Mission } from "@/lib/client/dj/scenarios";
import { Stars } from "./MissionPanel";

function ItemButton({ m, progress, locked, onOpen, icon }: { m: Mission; progress: DjProgress; locked: boolean; onOpen: (id: string) => void; icon: ReactNode }) {
  const rec = progress.missions[m.id];
  return (
    <li>
      <button
        type="button"
        disabled={locked}
        onClick={() => onOpen(m.id)}
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${locked ? "border-border/50 opacity-55" : "border-border bg-surface hover:bg-surface-hover"}`}
      >
        <span className="shrink-0 text-muted">{locked ? <Lock /> : icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{m.title}</span>
          <span className="block truncate text-xs text-muted">{m.tagline}</span>
        </span>
        {rec ? <Stars count={rec.stars} size="text-xs" /> : m.minutes ? <span className="shrink-0 text-[11px] text-muted">{m.minutes} min</span> : null}
      </button>
    </li>
  );
}

/** The landing section: the gear, the flight school (learn → practice → test), real gigs and free play. */
export default function DjHome({
  progress,
  gear,
  onGear,
  onOpen,
  onFree,
  onPractice,
  onReset,
}: {
  progress: DjProgress;
  gear: GearId;
  onGear: (id: GearId) => void;
  onOpen: (id: string) => void;
  onFree: () => void;
  onPractice: () => void;
  onReset: () => void;
}) {
  const rank = rankOf(progress);
  const stars = totalStars(progress);
  const started = Object.keys(progress.missions).length > 0;
  const nextRank = RANKS.find((r) => r.minStars > stars);
  const passed = (id: string) => (progress.missions[id]?.stars ?? 0) >= 1;
  const certificates = CHECKRIDES.filter((t) => passed(t.id));
  // The next thing to do: the first unfinished item of the highest open level.
  const nextItem = (() => {
    for (const l of LEVELS) {
      if (!levelUnlocked(l.level, passed)) break;
      const { lessons, practice, test } = levelItems(l.level);
      const todo = [...lessons, ...practice, ...(test ? [test] : [])].find((m) => !progress.missions[m.id]);
      if (todo) return todo;
    }
    return GIGS[0];
  })();

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-brand/20 via-surface to-beat/15 p-5 sm:p-8">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-strong">
          <Plane /> DJ flight simulator
        </p>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Learn to DJ before you ever touch a real mixer</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Pick your gear, then go through flight school: lessons that point at the control to touch, drills to practise until it&apos;s automatic, and
          checkrides that unlock the next level. Then play real gigs (a bar warm-up, a wedding, a radio show, back-to-back with an AI DJ), with the demo songs or
          songs from your library, analysed live for tempo, key and beat grid.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => onOpen(nextItem.id)} className="flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-white hover:bg-brand-strong">
            {started ? "Continue" : "Start flight school"} <ArrowRight />
          </button>
          <button type="button" onClick={onFree} className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-base font-semibold hover:bg-surface-hover">
            <Disc3 /> Open decks
          </button>
          <button type="button" onClick={onPractice} className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-base font-semibold hover:bg-surface-hover">
            <Headphones /> Practise with co-pilot
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          {started ? `Up next: ${nextItem.title}. ` : ""}Sound on, headphones recommended. New to matching songs?{" "}
          <Link href="/examples" className="font-semibold text-brand-strong underline">
            See it explained in the Examples lab
          </Link>
          .
        </p>
      </section>

      <section aria-label="Choose your gear">
        <h2 className="mb-1 text-xl font-bold">Your gear</h2>
        <p className="mb-3 text-sm text-muted">The console changes to match. Switch any time: your choice is remembered.</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GEAR.map((g) => {
            const on = g.id === gear;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onGear(g.id)}
                  className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors ${on ? "border-brand bg-brand/10 ring-2 ring-brand" : "border-border bg-surface hover:bg-surface-hover"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-bold">
                    {g.name} {on && <Check className="shrink-0 text-brand-strong" />}
                  </span>
                  <span className="text-xs text-muted">{g.blurb}</span>
                  <span className="mt-auto flex flex-wrap gap-1 pt-1 text-[10px] font-semibold uppercase">
                    {g.sync && <span className="rounded bg-surface-raised px-1.5 py-0.5">Sync</span>}
                    {g.keyLock && <span className="rounded bg-surface-raised px-1.5 py-0.5">Key lock</span>}
                    {g.hotCues > 0 && <span className="rounded bg-surface-raised px-1.5 py-0.5">{g.hotCues} hot cues</span>}
                    {g.padModes.length > 1 && <span className="rounded bg-surface-raised px-1.5 py-0.5">Pad modes</span>}
                    {g.turntable && <span className="rounded bg-surface-raised px-1.5 py-0.5">Motor · needle drop · scratch</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {GEAR.find((g) => g.id === gear)?.realWorld} A 4-deck controller isn&apos;t simulated: the engine is a 2-channel club setup.
        </p>
      </section>

      <section aria-label="Flight school">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Flight school</h2>
            <p className="text-sm text-muted">Learn → practise → pass the checkride to open the next level.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Rank: <strong>{rank.label}</strong> <span className="text-muted">({stars} ★)</span>
            </span>
            {started && (
              <button type="button" onClick={onReset} className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted hover:text-foreground">
                <RotateCcw /> Reset progress
              </button>
            )}
          </div>
        </div>
        <ol className="flex flex-col gap-3">
          {LEVELS.map((l) => {
            const open = levelUnlocked(l.level, passed);
            const { lessons, practice, test } = levelItems(l.level);
            return (
              <li key={l.level} className={`rounded-2xl border p-3 sm:p-4 ${open ? "border-border bg-surface/60" : "border-border/50 bg-surface/30"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{l.level}</span>
                  <h3 className="text-base font-bold">{l.title}</h3>
                  <span className="text-sm text-muted">{l.blurb}</span>
                  {test && passed(test.id) && (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-drums/20 px-2 py-0.5 text-xs font-semibold text-drums">
                      <Award /> Certified
                    </span>
                  )}
                  {!open && <span className="ml-auto flex items-center gap-1 text-xs text-muted"><Lock /> Pass checkride {l.level - 1} to open</span>}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted"><BookOpen /> Learn</p>
                    <ul className="flex flex-col gap-1.5">
                      {lessons.map((m) => (
                        <ItemButton key={m.id} m={m} progress={progress} locked={!open} onOpen={onOpen} icon={<BookOpen />} />
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted"><Dumbbell /> Practise</p>
                    <ul className="flex flex-col gap-1.5">
                      {practice.map((m) => (
                        <ItemButton key={m.id} m={m} progress={progress} locked={!open} onOpen={onOpen} icon={<Dumbbell />} />
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted"><ClipboardCheck /> Test</p>
                    <ul className="flex flex-col gap-1.5">{test && <ItemButton m={test} progress={progress} locked={!open} onOpen={onOpen} icon={<ClipboardCheck />} />}</ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {certificates.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Award className="text-drums" /> Certificates:{" "}
            {certificates.map((c) => (
              <span key={c.id} className="rounded-full border border-drums/50 px-2 py-0.5 text-xs">
                {c.title.replace(/^.*?: /, "")}
              </span>
            ))}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          {nextRank ? `${nextRank.minStars - stars} more star${nextRank.minStars - stars === 1 ? "" : "s"} to ${nextRank.label}.` : "Top rank reached."} {ALL_SCENARIOS.length} exercises in all.
        </p>
      </section>

      <section aria-label="Real gigs">
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Mic2 /> Real gigs
        </h2>
        <p className="mb-3 text-sm text-muted">The situations DJs actually play in. Several can use songs from your library.</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GIGS.map((m) => {
            const rec = progress.missions[m.id];
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m.id)} className="flex h-full w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-left hover:bg-surface-hover">
                  <span className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>Level {m.level} · ~{m.minutes} min</span>
                    {rec && <Stars count={rec.stars} size="text-xs" />}
                  </span>
                  <span className="text-base font-bold leading-tight">{m.title}</span>
                  <span className="text-sm text-muted">{m.tagline}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
