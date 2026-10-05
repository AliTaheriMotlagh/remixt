"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, RotateCcw, Star, Users } from "lucide-react";
import type { CrowdState } from "@/lib/client/dj/crowd";
import { fmtTime } from "@/lib/client/dj/djMath";
import type { DjProgress } from "@/lib/client/dj/progress";
import { rankOf, totalStars } from "@/lib/client/dj/progress";
import type { MissionResult } from "@/lib/client/dj/scenarioRunner";
import type { Mission } from "@/lib/client/dj/scenarios";
import { SUB_SCORES, SUB_SCORE_LABELS, STAR_THRESHOLDS } from "@/lib/client/dj/scoring";

export type RunnerView = {
  index: number;
  progress: number | null;
  elapsed: number;
  crowd: CrowdState | null;
};

export function Stars({ count, size = "text-lg" }: { count: number; size?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${size}`} role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <Star key={n} className={n <= count ? "fill-drums text-drums" : "text-border"} />
      ))}
    </span>
  );
}

export function Briefing({ mission, busy, onStart, onBack }: { mission: Mission; busy: boolean; onStart: () => void; onBack: () => void }) {
  return (
    <section aria-label="Mission briefing" className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 to-beat/10 p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Mission {mission.number}</p>
      <h2 className="mt-0.5 text-2xl font-bold">{mission.title}</h2>
      <p className="text-sm text-muted">{mission.tagline}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Why it matters</h3>
            <p>{mission.briefing.why}</p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">In the real world</h3>
            <p>{mission.briefing.realWorld}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Objectives</h3>
            <ol className="list-decimal space-y-1 pl-5">
              {mission.objectives.map((o) => (
                <li key={o.id}>{o.text}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Tips</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {mission.briefing.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {mission.timeLimit && <p className="mt-3 text-xs text-drums">Time limit: {fmtTime(mission.timeLimit)}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onStart} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {busy ? <Loader2 className="animate-spin" /> : null} {busy ? "Preparing the decks…" : "Take off"}
        </button>
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-surface-hover">
          <ArrowLeft /> Back
        </button>
      </div>
    </section>
  );
}

export function LiveMission({ mission, view, onAbort }: { mission: Mission; view: RunnerView; onAbort: () => void }) {
  const left = mission.timeLimit ? Math.max(0, mission.timeLimit - view.elapsed) : null;
  return (
    <section aria-label="Mission objectives" className="rounded-2xl border border-border bg-surface p-3">
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold">
          Mission {mission.number}: {mission.title}
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {fmtTime(view.elapsed)}
          {left !== null && ` · ${fmtTime(left)} left`}
        </span>
        <button type="button" onClick={onAbort} className="ml-auto rounded-md border border-border px-2 py-1 text-xs font-medium text-muted hover:text-foreground">
          End mission
        </button>
      </header>
      <ol className="flex flex-col gap-1">
        {mission.objectives.map((o, i) => {
          const done = i < view.index;
          const current = i === view.index;
          return (
            <li key={o.id} aria-current={current ? "step" : undefined} className={`rounded-lg px-2 py-1.5 text-sm ${current ? "bg-brand/15" : ""} ${done ? "text-muted" : ""}`}>
              <span className="flex items-start gap-2">
                {done ? <CheckCircle2 className="mt-0.5 text-success" /> : <Circle className={`mt-0.5 ${current ? "text-brand-strong" : "text-border"}`} />}
                <span className={done ? "line-through" : current ? "font-semibold" : ""}>{o.text}</span>
              </span>
              {current && view.progress !== null && (
                <span className="ml-6 mt-1 block h-1.5 overflow-hidden rounded-full bg-black/40">
                  <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(view.progress * 100)}%` }} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {view.crowd && <CrowdBar crowd={view.crowd} />}
    </section>
  );
}

export function CrowdBar({ crowd }: { crowd: CrowdState }) {
  const e = Math.round(crowd.energy);
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
          <Users /> Crowd energy
        </span>
        <span className="font-mono font-bold tabular-nums">{e}%</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-black/40" role="meter" aria-label="Crowd energy" aria-valuenow={e} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-300 ${e > 66 ? "bg-success" : e > 33 ? "bg-drums" : "bg-danger"}`} style={{ width: `${e}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted" aria-live="polite">{crowd.mood}</p>
      {crowd.requests.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {crowd.requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-vocals/40 bg-vocals/10 px-2.5 py-1.5 text-sm">
              <p className="font-semibold">Request: {r.text}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/40">
                <div className="h-full bg-vocals" style={{ width: `${Math.max(0, (1 - r.age / r.deadline)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Debrief({
  mission,
  result,
  progress,
  hasNext,
  onRetry,
  onNext,
  onExit,
}: {
  mission: Mission;
  result: MissionResult;
  progress: DjProgress;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const { score } = result;
  const rank = rankOf(progress);
  const passed = score.stars >= 1;
  return (
    <section aria-label="Debrief" className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Debrief · Mission {mission.number}</p>
      <h2 className="text-2xl font-bold">{result.completed ? (passed ? "Mission complete" : "Finished, but not quite there") : result.status === "timeout" ? "Time's up" : "Mission ended early"}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="text-center">
          <p className="font-mono text-6xl font-black tabular-nums leading-none" aria-label={`Score ${score.total} out of 100`}>
            {score.total}
          </p>
          <p className="text-xs text-muted">out of 100</p>
        </div>
        <div className="flex flex-col gap-1">
          <Stars count={score.stars} size="text-3xl" />
          <p className="text-xs text-muted">
            {result.objectivesDone} of {result.objectivesTotal} objectives · {fmtTime(result.elapsed)}
          </p>
          <p className="text-sm">
            Rank: <strong>{rank.label}</strong> <span className="text-muted">({totalStars(progress)} stars)</span>
          </p>
          <p className="text-[11px] text-muted">
            Stars: {STAR_THRESHOLDS[0]}+ for one, {STAR_THRESHOLDS[1]}+ for two, {STAR_THRESHOLDS[2]}+ for three.
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SUB_SCORES.map((k) => {
          const v = score.parts[k];
          if (v === null || (mission.weights[k] ?? 0) === 0) return null;
          return (
            <div key={k}>
              <dt className="flex justify-between text-xs">
                <span className="text-muted">{SUB_SCORE_LABELS[k]}</span>
                <span className="font-mono font-bold">{v}</span>
              </dt>
              <dd className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
                <div className={`h-full rounded-full ${v >= 80 ? "bg-success" : v >= 55 ? "bg-drums" : "bg-danger"}`} style={{ width: `${v}%` }} />
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-success">What went well</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.debrief.wentWell.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-drums">To improve</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.debrief.improve.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      {result.crowd && result.crowd.history.length > 0 && (
        <div className="mt-4 text-sm">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Requests</h3>
          <ul className="space-y-0.5">
            {result.crowd.history.map((h, i) => (
              <li key={i} className={h.done ? "text-success" : "text-muted line-through"}>
                {h.done ? "Done: " : "Missed: "} {h.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-hover">
          <RotateCcw /> Try again
        </button>
        {hasNext && passed && (
          <button type="button" onClick={onNext} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong">
            Next mission <ArrowRight />
          </button>
        )}
        <button type="button" onClick={onExit} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-surface-hover">
          Mission list
        </button>
        <Link href="/examples" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted underline hover:text-foreground">
          See how matching works
        </Link>
      </div>
    </section>
  );
}
