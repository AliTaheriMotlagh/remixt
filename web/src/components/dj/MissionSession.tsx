"use client";

import { useCallback, useRef, useState } from "react";
import { Library, Loader2 } from "lucide-react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { AiDj } from "@/lib/client/dj/aiDj";
import { QUIZ_PASS, quizFor } from "@/lib/client/dj/curriculum";
import { loadAnyTrack, retainTracks, type LoadStage } from "@/lib/client/dj/djLibraryTracks";
import { applyGear, gearById, type GearProfile } from "@/lib/client/dj/gear";
import { libraryApplies, prepareLibraryMission, type LibraryPrep } from "@/lib/client/dj/missionLibrary";
import { progressStore, recordResult, type DjProgress } from "@/lib/client/dj/progress";
import { ScenarioRunner, type MissionResult } from "@/lib/client/dj/scenarioRunner";
import type { Mission, QuizQuestion } from "@/lib/client/dj/scenarios";
import { newStats, starsFor } from "@/lib/client/dj/scoring";
import CopilotPanel from "./CopilotPanel";
import DjConsole from "./DjConsole";
import { Briefing, Debrief, LiveMission, Quiz, type RunnerView } from "./MissionPanel";
import { useInterval } from "./useInterval";

type Phase = "briefing" | "quiz" | "running" | "debrief";

/** The gear an exercise runs on: its own (scratching needs turntables), else yours, unless it needs features turntables lack. */
export function sessionGear(mission: Mission, mine: GearProfile): { gear: GearProfile; note: string | null } {
  if (mission.gear) {
    const g = gearById(mission.gear);
    return { gear: g, note: g.id !== mine.id ? `This exercise uses the ${g.short.toLowerCase()} setup.` : null };
  }
  const needsPlayer = mission.category !== "gig" && mission.category !== "drill";
  if (mine.turntable && needsPlayer) return { gear: gearById("club"), note: "This exercise needs hot cues and stems, so it uses the club booth setup." };
  return { gear: mine, note: null };
}

/**
 * Runs one exercise of any kind: the briefing (with the option to use
 * songs from your library), a theory quiz if it has one, the live attempt
 * with objectives, spotlight and co-pilot (and an AI DJ for back-to-back),
 * then the debrief.
 */
export default function MissionSession({
  engine,
  mission,
  progress,
  gear: myGear,
  hasNext,
  onExit,
  onNext,
}: {
  engine: DjEngine;
  mission: Mission;
  progress: DjProgress;
  gear: GearProfile;
  hasNext: boolean;
  onExit: () => void;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("briefing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RunnerView>({ index: 0, progress: null, elapsed: 0, crowd: null });
  const [result, setResult] = useState<MissionResult | null>(null);
  const [copilot, setCopilot] = useState(!mission.rules?.noMeter);
  const [useLib, setUseLib] = useState(false);
  const [prep, setPrep] = useState<LibraryPrep | null>(null);
  const [prepStage, setPrepStage] = useState<LoadStage | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const runner = useRef<ScenarioRunner | null>(null);
  const ai = useRef<AiDj | null>(null);
  const fired = useRef(new Set<number>());
  const last = useRef(0);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const { gear, note: gearNote } = sessionGear(mission, myGear);
  const canLibrary = libraryApplies(mission);

  const prepareLibrary = async (withSeed = seed) => {
    setPrep(null);
    setPrepStage({ stage: "download", text: "Looking through your library…", progress: 0.02 });
    try {
      setPrep(await prepareLibraryMission(mission, engine.ctx, withSeed, setPrepStage));
    } catch {
      setPrep({ ok: false, reason: "Something went wrong preparing your songs, so the demo songs are used." });
    } finally {
      setPrepStage(null);
    }
  };

  const finishQuizOnly = (correct: number, total: number) => {
    const pct = total ? correct / total : 0;
    const totalScore = Math.round(pct * 100);
    const pass = mission.category !== "test" || pct >= QUIZ_PASS;
    const res: MissionResult = {
      missionId: mission.id,
      status: "complete",
      completed: true,
      elapsed: 0,
      objectivesDone: correct,
      objectivesTotal: total,
      score: { total: totalScore, parts: { timing: null, tempo: null, eq: null, key: null, smoothness: null, crowd: null }, stars: pass ? starsFor(totalScore) : 0 },
      stats: newStats(),
      crowd: null,
      debrief: {
        wentWell: pct >= 0.8 ? ["Strong theory: you know which keys and moves fit."] : ["You worked through every question."],
        improve: pct < 1 ? ["Read the explanations for the ones you missed, then run it again: the questions change each time."] : [],
      },
    };
    progressStore.save(recordResult(progressStore.getSnapshot(), mission.id, res.score.total, res.score.stars));
    setResult(res);
    setPhase("debrief");
  };

  const startPractical = async () => {
    setBusy(true);
    setError(null);
    const setup = useLib && prep?.ok ? prep.setup : mission.setupFor ? mission.setupFor(seed) : mission.setup;
    try {
      await engine.applySetup(setup, (id) => loadAnyTrack(id, engine.ctx));
      retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
      applyGear(engine, gear, mission.rules);
    } catch {
      setError("Couldn't prepare the decks. Check your connection and try again.");
      setBusy(false);
      return;
    }
    runner.current = new ScenarioRunner(mission, seed);
    ai.current = mission.aiDeck ? new AiDj(engine, mission.aiDeck, (id) => loadAnyTrack(id, engine.ctx)) : null;
    setAiStatus(ai.current?.status ?? null);
    fired.current = new Set();
    last.current = performance.now();
    setView({ index: 0, progress: null, elapsed: 0, crowd: runner.current.crowd });
    setResult(null);
    setPhase("running");
    setBusy(false);
  };

  const start = async () => {
    const qs = quizFor(mission, seed);
    setQuestions(qs);
    setQuizScore(null);
    if (qs.length) {
      setPhase("quiz");
      return;
    }
    await startPractical();
  };

  const finish = useCallback(
    (r: ScenarioRunner) => {
      const res = r.result;
      if (!res) return;
      let final = res;
      // Checkrides: theory counts 40 %, and 80 % theory is needed to pass.
      if (quizScore) {
        const pct = quizScore.correct / Math.max(1, quizScore.total);
        const total = Math.round(pct * 100 * 0.4 + res.score.total * 0.6);
        const pass = res.completed && pct >= QUIZ_PASS;
        final = { ...res, score: { ...res.score, total, stars: pass ? Math.max(1, starsFor(total)) as 1 | 2 | 3 : 0 } };
      }
      if (final.status === "complete" || final.status === "timeout") {
        progressStore.save(recordResult(progressStore.getSnapshot(), mission.id, final.score.total, final.score.stars));
      }
      engine.stopAll();
      ai.current = null;
      setResult(final);
      setPhase("debrief");
    },
    [engine, mission.id, quizScore]
  );

  useInterval(
    () => {
      const r = runner.current;
      if (!r) return;
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      // Scripted surprises (the dead-air gig): the deck just stops.
      mission.events?.forEach((ev, i) => {
        if (fired.current.has(i) || r.elapsed < ev.at) return;
        fired.current.add(i);
        if (ev.kind === "stop-a") engine.pause("A");
        else engine.stopAll();
      });
      if (ai.current) {
        ai.current.tick(Math.min(0.5, dt));
        setAiStatus(ai.current.status);
      }
      const snap = engine.snapshot();
      r.tick(snap, dt);
      setView({ index: r.index, progress: r.progress(snap), elapsed: r.elapsed, crowd: r.crowd });
      if (r.status !== "running") finish(r);
    },
    phase === "running" ? 100 : null
  );

  const abort = () => {
    const r = runner.current;
    if (!r) return onExit();
    r.abandon();
    finish(r);
  };

  const exit = () => {
    runner.current?.abandon();
    engine.stopAll();
    onExit();
  };

  if (phase === "briefing") {
    const extra = (
      <div className="mt-4 flex flex-col gap-2">
        {gearNote && <p className="text-xs text-drums">{gearNote}</p>}
        {mission.rules?.noSync && <p className="text-xs text-muted">SYNC is switched off{mission.rules.hideBpm ? " and the BPM readouts are hidden" : ""} for this one.</p>}
        {canLibrary && (
          <div className="rounded-xl border border-border bg-surface/70 p-3 text-sm">
            <label className="flex min-h-9 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={useLib}
                disabled={!!prepStage}
                onChange={(e) => {
                  setUseLib(e.target.checked);
                  if (e.target.checked && !prep) void prepareLibrary();
                }}
              />
              <Library /> Use songs from the library
            </label>
            {!useLib && <p className="text-xs text-muted">Off: the demo songs, set up exactly for this exercise. On: songs from your library that suit it, analysed for tempo, key and beat grid.</p>}
            {useLib && prepStage && (
              <div role="status" className="mt-1 text-xs">
                <p className="flex items-center gap-1.5">
                  <Loader2 className="animate-spin" /> {prepStage.text}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(prepStage.progress * 100)}%` }} />
                </div>
              </div>
            )}
            {useLib && prep && (prep.ok ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {prep.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-drums">{prep.reason}</p>
            ))}
            {useLib && prep && !prepStage && (
              <button type="button" onClick={() => {
                const next = Math.floor(Math.random() * 1e6);
                setSeed(next);
                void prepareLibrary(next);
              }} className="mt-1 text-xs font-semibold text-brand-strong underline">
                Pick other songs
              </button>
            )}
          </div>
        )}
      </div>
    );
    return (
      <div className="flex flex-col gap-3">
        <Briefing
          mission={mission}
          busy={busy || !!prepStage}
          onStart={() => void start()}
          onBack={exit}
          extra={extra}
          quizCount={quizFor(mission, seed).length}
          startLabel={mission.category === "lesson" ? "Start the lesson" : mission.category === "test" ? "Begin the checkride" : mission.category === "gig" ? "Start the gig" : undefined}
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (phase === "quiz") {
    return (
      <Quiz
        title={mission.title}
        questions={questions}
        onDone={(correct) => {
          setQuizScore({ correct, total: questions.length });
          if (mission.objectives.length === 0) finishQuizOnly(correct, questions.length);
          else void startPractical();
        }}
      />
    );
  }

  if (phase === "debrief" && result) {
    return (
      <Debrief
        mission={mission}
        result={result}
        progress={progress}
        hasNext={hasNext}
        quiz={quizScore}
        onRetry={() => {
          setSeed(Math.floor(Math.random() * 1e6));
          setPhase("briefing");
        }}
        onNext={onNext}
        onExit={exit}
      />
    );
  }

  const current = mission.objectives[view.index];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <LiveMission mission={mission} view={view} onAbort={abort} aiStatus={aiStatus} note={busy ? "Loading…" : null} />
        {!mission.rules?.noMeter ? (
          <CopilotPanel
            engine={engine}
            enabled={copilot}
            onToggle={setCopilot}
            missionHint={() => {
              const r = runner.current;
              return r ? r.hint(engine.snapshot()) : null;
            }}
          />
        ) : (
          <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">The co-pilot is off for this one: trust your ears.</p>
        )}
      </div>
      <DjConsole engine={engine} gear={gear} rules={mission.rules} spotlight={mission.category === "lesson" || mission.category === "mission" ? current?.target : null} spotlightLabel={mission.category === "lesson" ? "Here" : undefined} />
    </div>
  );
}
