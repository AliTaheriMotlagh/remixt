"use client";

import { useCallback, useRef, useState } from "react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { loadDjTrack } from "@/lib/client/dj/djTracks";
import { progressStore, recordResult, type DjProgress } from "@/lib/client/dj/progress";
import { ScenarioRunner, type MissionResult } from "@/lib/client/dj/scenarioRunner";
import type { Mission } from "@/lib/client/dj/scenarios";
import CopilotPanel from "./CopilotPanel";
import DjConsole from "./DjConsole";
import { Briefing, Debrief, LiveMission, type RunnerView } from "./MissionPanel";
import { useInterval } from "./useInterval";

type Phase = "briefing" | "running" | "debrief";

/** Runs one mission: briefing, the live attempt with objectives and co-pilot, then the debrief. */
export default function MissionSession({
  engine,
  mission,
  progress,
  hasNext,
  onExit,
  onNext,
}: {
  engine: DjEngine;
  mission: Mission;
  progress: DjProgress;
  hasNext: boolean;
  onExit: () => void;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("briefing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RunnerView>({ index: 0, progress: null, elapsed: 0, crowd: null });
  const [result, setResult] = useState<MissionResult | null>(null);
  const [copilot, setCopilot] = useState(true);
  const runner = useRef<ScenarioRunner | null>(null);
  const last = useRef(0);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await engine.applySetup(mission.setup, loadDjTrack);
    } catch {
      setError("Couldn't prepare the decks. Check your connection and try again.");
      setBusy(false);
      return;
    }
    runner.current = new ScenarioRunner(mission, Math.floor(Math.random() * 1e6));
    last.current = performance.now();
    setView({ index: 0, progress: null, elapsed: 0, crowd: runner.current.crowd });
    setResult(null);
    setPhase("running");
    setBusy(false);
  };

  const finish = useCallback(
    (r: ScenarioRunner) => {
      const res = r.result;
      if (!res) return;
      if (res.status === "complete" || res.status === "timeout") {
        progressStore.save(recordResult(progressStore.getSnapshot(), mission.id, res.score.total, res.score.stars));
      }
      engine.stopAll();
      setResult(res);
      setPhase("debrief");
    },
    [engine, mission.id]
  );

  useInterval(
    () => {
      const r = runner.current;
      if (!r) return;
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
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
    return (
      <div className="flex flex-col gap-3">
        <Briefing mission={mission} busy={busy} onStart={() => void start()} onBack={exit} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (phase === "debrief" && result) {
    return (
      <Debrief
        mission={mission}
        result={result}
        progress={progress}
        hasNext={hasNext}
        onRetry={() => {
          setPhase("briefing");
        }}
        onNext={onNext}
        onExit={exit}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <LiveMission mission={mission} view={view} onAbort={abort} />
        <CopilotPanel
          engine={engine}
          enabled={copilot}
          onToggle={setCopilot}
          missionHint={() => {
            const r = runner.current;
            return r ? r.hint(engine.snapshot()) : null;
          }}
        />
      </div>
      <DjConsole engine={engine} />
    </div>
  );
}
