// Runs one mission: feeds it snapshots, checks the current objective, keeps
// the score statistics (and the crowd, for the club night), and produces the
// result and debrief. No Web Audio: tests drive it with hand-made snapshots.

import { crowdScore, newCrowd, stepCrowd, type CrowdState } from "./crowd";
import { derive } from "./djDerived";
import { detectEqSwap, effBpm, lowDb, type EqSample } from "./djMath";
import { accumulate, newStats, scoreRun, type RunStats, type Score } from "./scoring";
import type { CheckCtx, Mission } from "./scenarios";
import type { DeckId, DjSnapshot } from "./djTypes";

export type RunStatus = "running" | "complete" | "timeout" | "abandoned";

export type Debrief = { wentWell: string[]; improve: string[] };

export type MissionResult = {
  missionId: string;
  status: RunStatus;
  completed: boolean;
  elapsed: number;
  objectivesDone: number;
  objectivesTotal: number;
  score: Score;
  stats: RunStats;
  crowd: CrowdState | null;
  debrief: Debrief;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ScenarioRunner {
  readonly mission: Mission;
  status: RunStatus = "running";
  index = 0;
  elapsed = 0;
  stats: RunStats = newStats();
  crowd: CrowdState | null = null;
  doneAt: number[] = [];
  result: MissionResult | null = null;
  private holds = new Map<string, number>();
  private memo: Record<string, number | boolean | string> = {};
  private history: EqSample[] = [];
  private rng: () => number;
  private lastSnap: DjSnapshot | null = null;

  constructor(mission: Mission, seed = 1) {
    this.mission = mission;
    this.rng = mulberry32(seed);
    if (mission.kind === "club") this.crowd = newCrowd(this.rng);
  }

  get objective() {
    return this.mission.objectives[this.index] ?? null;
  }

  /** 0..1 on the current objective, when it reports progress. */
  progress(snap: DjSnapshot): number | null {
    const o = this.objective;
    if (!o?.progress) return null;
    return o.progress(this.ctx(snap, 0));
  }

  /** The current objective's hint for this state, if it has one. */
  hint(snap: DjSnapshot): string | null {
    const o = this.objective;
    return o?.hint ? o.hint(this.ctx(snap, 0)) : null;
  }

  private ctx(snap: DjSnapshot, dt: number): CheckCtx {
    return {
      snap,
      d: derive(snap),
      dt,
      time: this.elapsed,
      hold: (key, cond, seconds) => {
        const v = cond ? (this.holds.get(key) ?? 0) + dt : 0;
        this.holds.set(key, v);
        return v >= seconds;
      },
      holdTime: (key) => this.holds.get(key) ?? 0,
      memo: this.memo,
      eqSwap: (out: DeckId, bars = 2) => {
        const bpm = effBpm(snap.decks[out]) || 120;
        return detectEqSwap(this.history, this.elapsed, out, (bars * 4 * 60) / bpm);
      },
      crowd: this.crowd,
    };
  }

  /** Advance by `dt` seconds with the state `snap`. Returns the objective that was just completed, if any. */
  tick(snap: DjSnapshot, dt: number): { completed: number | null; finished: boolean } {
    this.lastSnap = snap;
    if (this.status !== "running") return { completed: null, finished: true };
    dt = Math.min(Math.max(dt, 0), 0.5);
    this.elapsed += dt;
    this.history.push({ t: this.elapsed, low: { A: lowDb(snap.decks.A), B: lowDb(snap.decks.B) } });
    while (this.history.length > 0 && this.history[0].t < this.elapsed - 30) this.history.shift();

    if (this.crowd) this.crowd = stepCrowd(this.crowd, snap, dt, this.rng);
    if (this.index >= (this.mission.scoreFrom ?? 0)) accumulate(this.stats, snap, dt);

    let completed: number | null = null;
    const o = this.objective;
    if (o && o.check(this.ctx(snap, dt))) {
      completed = this.index;
      this.doneAt[this.index] = this.elapsed;
      this.index++;
      this.holds.clear();
      this.memo = {};
      if (this.index >= this.mission.objectives.length) this.end("complete");
    }
    if (this.status === "running" && this.mission.timeLimit && this.elapsed >= this.mission.timeLimit) this.end("timeout");
    return { completed, finished: this.status !== "running" };
  }

  /** Ends the run early (the learner left, or asked for the debrief). */
  abandon() {
    if (this.status === "running" && this.lastSnap) this.end("abandoned");
    else if (this.status === "running") {
      this.status = "abandoned";
      this.result = this.buildResult();
    }
  }

  private end(status: RunStatus) {
    this.status = status;
    this.result = this.buildResult();
  }

  private buildResult(): MissionResult {
    const total = this.mission.objectives.length;
    if (this.crowd) this.stats.crowdScore = crowdScore(this.crowd);
    const completed = this.status === "complete" || (this.index >= total);
    // The club night can finish at the bell with the work only partly done: partial credit, no stars.
    const completion = completed ? 1 : this.index / total;
    const score = scoreRun(this.stats, this.mission.weights, completion);
    return {
      missionId: this.mission.id,
      status: this.status,
      completed,
      elapsed: this.elapsed,
      objectivesDone: this.index,
      objectivesTotal: total,
      score,
      stats: this.stats,
      crowd: this.crowd,
      debrief: buildDebrief(this.mission, this.stats, score, this.crowd, completed),
    };
  }
}

const sec = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} s`;

export function buildDebrief(mission: Mission, stats: RunStats, score: Score, crowd: CrowdState | null, completed: boolean): Debrief {
  const good: string[] = [];
  const better: string[] = [];
  const p = score.parts;
  if (!completed) better.push("You didn't finish every objective. Re-read the briefing and try again; the co-pilot can help.");
  if (p.timing !== null) {
    if (p.timing >= 85) good.push("Your beats stayed locked: the kicks landed together.");
    else if (p.timing < 65) better.push("The beats drifted apart. Check the phase meter before bringing a deck up, and nudge in short taps.");
  }
  if (p.tempo !== null) {
    if (p.tempo >= 85) good.push("Tempos matched closely.");
    else if (p.tempo < 65) better.push("The tempos were too far apart for too long. Match the BPM with the fader before you blend.");
  }
  if (p.eq !== null) {
    if (stats.bassClash < 1.5) good.push("Clean low end: you never had two basses fighting.");
    else better.push(`Both bass lines were open together for ${sec(stats.bassClash)}. Cut one deck's low EQ (or kill its bass stem) before the blend, then swap.`);
  }
  if (p.key !== null) {
    if (p.key >= 85) good.push("The keys worked together.");
    else if (p.key < 65) better.push("Some of the blend was in clashing keys. Pick tracks within one step on the Camelot wheel.");
  }
  if (p.smoothness !== null) {
    if (stats.deadAir > 2) better.push(`There was ${sec(stats.deadAir)} of dead air. Always have the next track playing before the last one ends.`);
    if (stats.jolts > 0) better.push(`The volume jumped suddenly ${stats.jolts} time${stats.jolts === 1 ? "" : "s"}. Ride faders smoothly.`);
    if (stats.deadAir <= 2 && stats.jolts === 0) good.push("Smooth: no dead air and no sudden volume jumps.");
  }
  if (crowd) {
    const avg = crowd.energyTime > 0 ? crowd.energySum / crowd.energyTime : 0;
    if (avg >= 60) good.push(`The floor stayed lively: average energy ${Math.round(avg)}%.`);
    else better.push(`Average crowd energy was ${Math.round(avg)}%. Blend tracks smoothly and keep the groove going.`);
    if (crowd.completed > 0) good.push(`You answered ${crowd.completed} request${crowd.completed === 1 ? "" : "s"}.`);
    if (crowd.failed > 0) better.push(`${crowd.failed} request${crowd.failed === 1 ? " was" : "s were"} ignored: watch the request cards.`);
  }
  if (good.length === 0) good.push("You got through it. Every mission gets easier on the second run.");
  if (better.length === 0 && completed) better.push(`Nothing major. For three stars in "${mission.title}", aim for every sub-score above 90.`);
  return { wentWell: good, improve: better };
}
