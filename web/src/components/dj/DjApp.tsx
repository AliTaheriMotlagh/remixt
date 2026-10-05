"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { DjEngine } from "@/lib/client/dj/djEngine";
import { loadAnyTrack, retainTracks } from "@/lib/client/dj/djLibraryTracks";
import { ALL_SCENARIOS, scenarioById } from "@/lib/client/dj/curriculum";
import { GEAR, applyGear, gearById, gearStore, type GearId, type GearProfile } from "@/lib/client/dj/gear";
import { progressStore } from "@/lib/client/dj/progress";
import CopilotPanel from "./CopilotPanel";
import DjConsole from "./DjConsole";
import DjHome from "./DjHome";
import MissionSession from "./MissionSession";

type Mode = { kind: "free" } | { kind: "practice" } | { kind: "scenario"; id: string };

/** Free play / practice: the decks, optionally with the co-pilot, and a one-tap starter pair. */
function OpenDecks({ engine, practice, gear, onGear }: { engine: DjEngine; practice: boolean; gear: GearProfile; onGear: (id: GearId) => void }) {
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
        (id) => loadAnyTrack(id, engine.ctx)
      );
      retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
      applyGear(engine, gear);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          <p className="font-semibold text-foreground">{practice ? "Practice with the co-pilot" : "Open decks"}</p>
          <p className="mt-1">
            {practice
              ? "No goals and no score: just the decks with the co-pilot watching. Load two tracks, match them and blend."
              : "Free play with everything on. Load a track on each deck: songs from the library or the demo songs."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void quickStart()}
              disabled={busy}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
            >
              <Sparkles /> {busy ? "Loading…" : "Quick start: two demo songs"}
            </button>
            <label className="flex min-h-10 items-center gap-1.5 text-xs">
              Gear
              <select value={gear.id} onChange={(e) => onGear(e.target.value as GearId)} className="min-h-10 rounded-lg border border-border bg-surface-raised px-2 text-sm text-foreground">
                {GEAR.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.short}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <CopilotPanel engine={engine} enabled={assist} onToggle={setAssist} />
      </div>
      <DjConsole engine={engine} gear={gear} />
      <p className="text-xs text-muted">
        Why stem kills are cool: every song here is made of separate vocals, drums, bass and other parts, so you can mute any of them live. That&apos;s what
        Remixt&apos;s splitter does for any song you{" "}
        <Link href="/upload" className="font-semibold text-brand-strong underline">
          upload
        </Link>
        , and those songs show up in the deck browser&apos;s Library tab.
      </p>
    </div>
  );
}

const ORDER = ALL_SCENARIOS;

export default function DjApp() {
  const progress = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, progressStore.getServerSnapshot);
  const gearId = useSyncExternalStore(gearStore.subscribe, gearStore.getSnapshot, gearStore.getServerSnapshot);
  const gear = gearById(gearId);
  const [engine, setEngine] = useState<DjEngine | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<DjEngine | null>(null);

  // Whatever happens, the audio context goes when the page does.
  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      retainTracks([]);
    },
    []
  );

  // Changing gear in free play applies at once.
  useEffect(() => {
    if (engine && mode && mode.kind !== "scenario") applyGear(engine, gear);
  }, [engine, mode, gear]);

  // Entering is a click or tap, so the browser lets the audio context start.
  const enter = (next: Mode) => {
    setError(null);
    let e = engineRef.current;
    if (!e) {
      try {
        e = new DjEngine({ quantize: true });
      } catch {
        setError("Your browser couldn't start audio. Try a different browser.");
        return;
      }
      engineRef.current = e;
      setEngine(e);
    }
    e.unlock();
    applyGear(e, gear);
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  const leave = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    retainTracks([]);
    setEngine(null);
    setMode(null);
  };

  if (!mode || !engine) {
    return (
      <div className="min-w-0">
        <DjHome
          progress={progress}
          gear={gearId}
          onGear={(id) => gearStore.set(id)}
          onOpen={(id) => enter({ kind: "scenario", id })}
          onFree={() => enter({ kind: "free" })}
          onPractice={() => enter({ kind: "practice" })}
          onReset={() => {
            if (window.confirm("Reset all your DJ progress, stars and certificates?")) progressStore.reset();
          }}
        />
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const scenario = mode.kind === "scenario" ? scenarioById(mode.id) : undefined;
  // "Next" stays within the same kind of exercise (the next lesson, drill, gig…).
  const siblings = scenario ? ORDER.filter((m) => (m.category ?? "mission") === (scenario.category ?? "mission")) : [];
  const index = scenario ? siblings.indexOf(scenario) : -1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={leave} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
          <ArrowLeft /> Menu
        </button>
        <span className="truncate text-sm font-semibold text-muted">
          {mode.kind === "free" ? "Open decks" : mode.kind === "practice" ? "Practice" : scenario?.title} · {gear.short}
        </span>
      </div>
      {mode.kind === "scenario" && scenario ? (
        <MissionSession
          key={scenario.id}
          engine={engine}
          mission={scenario}
          progress={progress}
          gear={gear}
          hasNext={index >= 0 && index < siblings.length - 1}
          onExit={leave}
          onNext={() => setMode({ kind: "scenario", id: siblings[index + 1].id })}
        />
      ) : (
        <OpenDecks engine={engine} practice={mode.kind === "practice"} gear={gear} onGear={(id) => gearStore.set(id)} />
      )}
    </div>
  );
}
