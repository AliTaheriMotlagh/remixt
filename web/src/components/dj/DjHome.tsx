"use client";

import Link from "next/link";
import { ArrowRight, Disc3, Headphones, Lock, Plane, RotateCcw } from "lucide-react";
import { MISSIONS } from "@/lib/client/dj/scenarios";
import { isUnlocked, nextMissionIndex, rankOf, totalStars, type DjProgress } from "@/lib/client/dj/progress";
import { RANKS } from "@/lib/client/dj/scoring";
import { Stars } from "./MissionPanel";

/** The landing section: what this is, ways in, and the mission list. */
export default function DjHome({
  progress,
  onMission,
  onFree,
  onPractice,
  onReset,
}: {
  progress: DjProgress;
  onMission: (id: string) => void;
  onFree: () => void;
  onPractice: () => void;
  onReset: () => void;
}) {
  const ids = MISSIONS.map((m) => m.id);
  const rank = rankOf(progress);
  const stars = totalStars(progress);
  const next = nextMissionIndex(progress, ids);
  const started = Object.keys(progress.missions).length > 0;
  const nextRank = RANKS.find((r) => r.minStars > stars);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-brand/20 via-surface to-beat/15 p-5 sm:p-8">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-strong">
          <Plane /> DJ flight simulator
        </p>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Learn to DJ before you ever touch a real mixer</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Two decks, a mixer, effects and a crowd, all in your browser, with original music made on the spot. Fly guided missions from
          &ldquo;press play&rdquo; to a full club night, with a co-pilot that tells you in plain words what to fix. Because the songs come as separate
          stems, you can also kill the vocals or the bass live: the whole idea behind Remixt.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onMission(MISSIONS[next].id)}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-white hover:bg-brand-strong"
          >
            {started ? "Continue training" : "Start training"} <ArrowRight />
          </button>
          <button type="button" onClick={onFree} className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-base font-semibold hover:bg-surface-hover">
            <Disc3 /> Open decks
          </button>
          <button type="button" onClick={onPractice} className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-base font-semibold hover:bg-surface-hover">
            <Headphones /> Practice with co-pilot
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Sound on. Best with headphones. New to the idea of matching songs?{" "}
          <Link href="/examples" className="font-semibold text-brand-strong underline">
            See it explained in the Examples lab
          </Link>
          .
        </p>
      </section>

      <section aria-label="Your rank" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Rank</p>
          <p className="text-xl font-bold">{rank.label}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Stars</p>
          <p className="text-xl font-bold tabular-nums">
            {stars} <span className="text-sm font-normal text-muted">/ {MISSIONS.length * 3}</span>
          </p>
        </div>
        <p className="text-xs text-muted">
          {nextRank ? `${nextRank.minStars - stars} more star${nextRank.minStars - stars === 1 ? "" : "s"} to ${nextRank.label}.` : "You've reached the top rank."} Ranks: Rookie → Booth Pilot →
          Resident → Headliner.
        </p>
        {started && (
          <button type="button" onClick={onReset} className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground">
            <RotateCcw /> Reset progress
          </button>
        )}
      </section>

      <section aria-label="Missions">
        <h2 className="mb-3 text-xl font-bold">Missions</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MISSIONS.map((m, i) => {
            const unlocked = isUnlocked(progress, i, ids);
            const rec = progress.missions[m.id];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onMission(m.id)}
                  aria-label={`Mission ${m.number}: ${m.title}${unlocked ? "" : ", locked: finish the previous mission first"}`}
                  className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors ${
                    unlocked ? "border-border bg-surface hover:bg-surface-hover" : "border-border/50 bg-surface/50 opacity-60"
                  } ${i === next && unlocked ? "ring-2 ring-brand" : ""}`}
                >
                  <span className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>Mission {m.number}{m.kind === "club" ? " · finale" : ""}</span>
                    {unlocked ? <Stars count={rec?.stars ?? 0} size="text-sm" /> : <Lock className="text-muted" />}
                  </span>
                  <span className="text-base font-bold leading-tight">{m.title}</span>
                  <span className="text-sm text-muted">{m.tagline}</span>
                  {rec && <span className="mt-auto pt-1 text-[11px] text-muted">Best {rec.best}/100 · {rec.attempts} attempt{rec.attempts === 1 ? "" : "s"}</span>}
                  {!unlocked && <span className="mt-auto pt-1 text-[11px] text-muted">Earn a star in mission {m.number - 1} to unlock.</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
