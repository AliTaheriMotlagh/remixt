"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { DjEngine } from "@/lib/client/dj/djEngine";
import { loadDjTrack } from "@/lib/client/dj/djTracks";
import { MISSIONS } from "@/lib/client/dj/scenarios";
import { progressStore } from "@/lib/client/dj/progress";
import CopilotPanel from "./CopilotPanel";
import DjConsole from "./DjConsole";
import DjHome from "./DjHome";
import MissionSession from "./MissionSession";

type Mode = { kind: "free" } | { kind: "practice" } | { kind: "mission"; id: string };

/** Free play / practice: the decks, optionally with the co-pilot, and a one-tap starter pair. */
function OpenDecks({ engine, practice }: { engine: DjEngine; practice: boolean }) {
  const [assist, setAssist] = useState(practice);
  const [busy, setBusy] = useState(false);
  const quickStart = async () => {
    setBusy(true);
    try {
      await engine.applySetup(
        {
          tempoRange: 16,
          decks: { A: { trackId: "warehouse-lights", startBar: 8 }, B: { trackId: "golden-hour", startBar: 8 } },
          crossfader: 0,
        },
        loadDjTrack
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          <p className="font-semibold text-foreground">{practice ? "Practice mode" : "Open decks"}</p>
          <p className="mt-1">
            {practice
              ? "No goals and no score: just the decks with the co-pilot watching. Load two tracks, match them and blend."
              : "Free play with everything on. Load a track on each deck with the Load buttons."}
          </p>
          <button
            type="button"
            onClick={() => void quickStart()}
            disabled={busy}
            className="mt-3 flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            <Sparkles /> {busy ? "Loading…" : "Quick start: load two tracks"}
          </button>
        </div>
        <CopilotPanel engine={engine} enabled={assist} onToggle={setAssist} />
      </div>
      <DjConsole engine={engine} />
      <p className="text-xs text-muted">
        Why stem kills are cool: because every song here is made of separate vocals, drums, bass and other parts, you can mute any of them live. That&apos;s
        what Remixt&apos;s splitter does for any song you{" "}
        <Link href="/upload" className="font-semibold text-brand-strong underline">
          upload
        </Link>
        .
      </p>
    </div>
  );
}

export default function DjApp() {
  const progress = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, progressStore.getServerSnapshot);
  const [engine, setEngine] = useState<DjEngine | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<DjEngine | null>(null);

  // Whatever happens, the audio context goes when the page does.
  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    []
  );

  // Entering is a click or tap, so the browser lets the audio context start.
  const enter = (next: Mode) => {
    setError(null);
    let e = engineRef.current;
    if (!e) {
      try {
        e = new DjEngine();
      } catch {
        setError("Your browser couldn't start audio. Try a different browser.");
        return;
      }
      engineRef.current = e;
      setEngine(e);
    }
    e.unlock();
    setMode(next);
  };

  const leave = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setEngine(null);
    setMode(null);
  };

  if (!mode || !engine) {
    return (
      <div>
        <DjHome
          progress={progress}
          onMission={(id) => enter({ kind: "mission", id })}
          onFree={() => enter({ kind: "free" })}
          onPractice={() => enter({ kind: "practice" })}
          onReset={() => {
            if (window.confirm("Reset all your DJ missions, stars and rank?")) progressStore.reset();
          }}
        />
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const mission = mode.kind === "mission" ? MISSIONS.find((m) => m.id === mode.id) : undefined;
  const index = mission ? MISSIONS.indexOf(mission) : -1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={leave} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
          <ArrowLeft /> Menu
        </button>
        <span className="text-sm font-semibold text-muted">{mode.kind === "free" ? "Open decks" : mode.kind === "practice" ? "Practice" : "Training"}</span>
      </div>
      {mode.kind === "mission" && mission ? (
        <MissionSession
          key={mission.id}
          engine={engine}
          mission={mission}
          progress={progress}
          hasNext={index < MISSIONS.length - 1}
          onExit={leave}
          onNext={() => setMode({ kind: "mission", id: MISSIONS[index + 1].id })}
        />
      ) : (
        <OpenDecks engine={engine} practice={mode.kind === "practice"} />
      )}
    </div>
  );
}
