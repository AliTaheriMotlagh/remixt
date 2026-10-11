"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import EasyDecks from "./EasyDecks";
import MissionSession from "./MissionSession";

type View = "easy" | "pro";
type Mode = { kind: "free"; view: View } | { kind: "practice" } | { kind: "scenario"; id: string };

/** Free play / practice: easy decks or the full console (with the co-pilot when practising), two songs loaded at once. */
function OpenDecks({ engine, practice, initialView, gear, onGear }: { engine: DjEngine; practice: boolean; initialView: View; gear: GearProfile; onGear: (id: GearId) => void }) {
  const [assist, setAssist] = useState(practice);
  const [view, setView] = useState<View>(initialView);
  const [busy, setBusy] = useState(false);
  const quickStart = useCallback(async () => {
    setBusy(true);
    try {
      await engine.applySetup(
        {
          tempoRange: 16,
          decks: { A: { trackId: "warehouse-lights", startBar: 8 }, B: { trackId: "golden-hour", startBar: 8 } },
          crossfader: -1,
        },
        (id) => loadAnyTrack(id, engine.ctx)
      );
      retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
      applyGear(engine, gear);
    } catch {
      // The decks stay empty; Load on each deck still works.
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the gear at the moment it's pressed
  }, [engine]);
  // Nothing to set up first: two songs are on the decks as soon as you arrive (the screen stays usable while they load).
  const started = useRef(false);
  useEffect(() => {
    if (started.current || engine.deckTrack("A") || engine.deckTrack("B")) return;
    started.current = true;
    void quickStart();
  }, [engine, quickStart]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-border text-sm font-semibold" role="radiogroup" aria-label="Decks">
          {(
            [
              ["easy", "Easy decks", "Big controls, live visuals, Auto-mix"],
              ["pro", "Pro console", "Every control of a club booth"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              title={hint}
              onClick={() => setView(id)}
              className={`min-h-10 px-4 transition-colors ${view === id ? "bg-brand text-white" : "bg-surface text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void quickStart()}
          disabled={busy}
          className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-hover disabled:opacity-60"
        >
          <Sparkles /> {busy ? "Loading two songs…" : "Reload the two demo songs"}
        </button>
        {view === "pro" && (
          <label className="flex min-h-10 items-center gap-1.5 text-xs text-muted">
            Gear
            <select value={gear.id} onChange={(e) => onGear(e.target.value as GearId)} className="min-h-10 rounded-lg border border-border bg-surface-raised px-2 text-sm text-foreground">
              {GEAR.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.short}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {view === "easy" ? (
        <EasyDecks engine={engine} />
      ) : (
        <>
          <CopilotPanel engine={engine} enabled={assist} onToggle={setAssist} />
          <DjConsole engine={engine} gear={gear} />
        </>
      )}
      <p className="text-xs text-muted">
        Every song here comes as separate vocals, drums, bass and melody, so you can mute any of them live. Remixt splits any song you{" "}
        <Link href="/upload" className="font-semibold text-brand-strong underline">
          upload
        </Link>{" "}
        the same way, and it shows up under Load, in the Library tab.
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
          onFree={(view) => enter({ kind: "free", view })}
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
          {mode.kind === "free" ? "Open decks" : mode.kind === "practice" ? "Practice" : scenario?.title}
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
        <OpenDecks engine={engine} practice={mode.kind === "practice"} initialView={mode.kind === "free" ? mode.view : "pro"} gear={gear} onGear={(id) => gearStore.set(id)} />
      )}
    </div>
  );
}
