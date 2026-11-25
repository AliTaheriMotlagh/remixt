"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, GraduationCap, Sparkles } from "lucide-react";
import LiveStudioBar, { GoLiveStudioButton } from "@/components/live/LiveStudioBar";
import { DjEngine } from "@/lib/client/dj/djEngine";
import { djStageOf, startDjBroadcast } from "@/lib/client/dj/djLive";
import type { PartyMusic } from "@/lib/client/party/partyWorld";
import { djOnAir } from "@/lib/liveDj";
import { openingPair } from "@/lib/client/dj/djLibrary";
import { libraryEntries, loadAnyTrack, retainTracks } from "@/lib/client/dj/djLibraryTracks";
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
function OpenDecks({
  engine,
  practice,
  initialView,
  gear,
  onGear,
  handoff,
}: {
  engine: DjEngine;
  practice: boolean;
  initialView: View;
  gear: GearProfile;
  onGear: (id: GearId) => void;
  /** A saved set handed over by the set planner: the Auto DJ plays it, so no two songs are put on first. */
  handoff: string | null;
}) {
  const [assist, setAssist] = useState(practice);
  const [view, setView] = useState<View>(handoff ? "easy" : initialView);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState<"library" | "demo" | null>(null);
  const quickStart = useCallback(async () => {
    setBusy(true);
    try {
      // Two songs from your library that fit together; the demo songs only when it has fewer than two.
      const library = await libraryEntries()
        .then((r) => r.entries)
        .catch(() => []);
      const pair = openingPair(library);
      setFrom(pair ? "library" : "demo");
      await engine.applySetup(
        {
          tempoRange: 16,
          decks: pair
            ? { A: { trackId: pair[0].id, startBar: 0 }, B: { trackId: pair[1].id, startBar: 0 } }
            : { A: { trackId: "warehouse-lights", startBar: 8 }, B: { trackId: "golden-hour", startBar: 8 } },
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
    // A set handed over fills the decks itself (the Auto DJ), so nothing goes on them first.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the external audio engine on arrival
    if (!handoff) void quickStart();
  }, [engine, quickStart, handoff]);

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
          <Sparkles /> {busy ? (from === "demo" ? "Loading two demo songs…" : "Loading two songs from your library…") : from === "demo" ? "Reload the two demo songs" : "Two songs that fit"}
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
        <EasyDecks engine={engine} handoff={handoff} />
      ) : (
        <>
          <CopilotPanel engine={engine} enabled={assist} onToggle={setAssist} />
          <DjConsole engine={engine} gear={gear} />
        </>
      )}
      <p className="text-xs text-muted">
        {from === "demo" ? "Your library has fewer than two songs, so these are two demo songs made for practice. " : "The decks play songs from your library, split into their parts, so you can mute any of them live. "}
        Remixt splits any song you{" "}
        <Link href="/upload" className="font-semibold text-brand-strong underline">
          upload
        </Link>{" "}
        the same way, and it shows up under Load, in the Library tab.
      </p>
    </div>
  );
}

const ORDER = ALL_SCENARIOS;

/** DJing live: the session's bar over the decks, sending them to the room. */
function DjLive({ engine, streamId, userId }: { engine: DjEngine; streamId: string; userId: string }) {
  const broadcast = useCallback((id: string) => startDjBroadcast(id, engine), [engine]);
  // The host's dance floor moves to the deck the room hears most.
  const music = useCallback((): PartyMusic => {
    const stage = djStageOf(engine.getUi());
    const on = djOnAir(stage);
    const deck = on ? stage.decks[on] : null;
    const bpm = deck?.bpm ? deck.bpm * deck.rate : 120;
    const lvl = deck ? Math.min(1, engine.levels().master * 1.4) : 0;
    return { playing: !!deck, beats: deck ? (engine.deckPosition(on!) * bpm) / 60 : 0, bpm, low: lvl, mid: lvl * 0.8, high: lvl * 0.6 };
  }, [engine]);
  return <LiveStudioBar place="dj" streamId={streamId} userId={userId} broadcast={broadcast} music={music} />;
}

export default function DjApp() {
  const params = useSearchParams();
  /** A live session of the decks (?live=), and a set handed over by the set planner (?set=). */
  const liveId = params.get("live");
  const handoff = params.get("set");
  /** Who's signed in (undefined while asking): going live needs it. */
  const [user, setUser] = useState<{ id: string } | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { id: string } | null } | null) => !cancelled && setUser(data?.user ?? null))
      .catch(() => !cancelled && setUser(null));
    return () => {
      cancelled = true;
    };
  }, []);
  const progress = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, progressStore.getServerSnapshot);
  const gearId = useSyncExternalStore(gearStore.subscribe, gearStore.getSnapshot, gearStore.getServerSnapshot);
  const gear = gearById(gearId);
  const [engine, setEngine] = useState<DjEngine | null>(null);
  // The decks first; null is the Learn page (lessons, drills, gigs).
  const [mode, setMode] = useState<Mode | null>({ kind: "free", view: "easy" });
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

  /** The engine, made once. Made without a tap its sound waits (suspended) for the first one: every control unlocks it. */
  const engineNow = useCallback(() => {
    let e = engineRef.current;
    if (!e) {
      try {
        e = new DjEngine({ quantize: true });
      } catch {
        setError("Your browser couldn't start audio. Try a different browser.");
        return null;
      }
      engineRef.current = e;
      setEngine(e);
      // For the rigs under scripts/ (dj-check.mjs): the engine by name. Development only.
      if (process.env.NODE_ENV !== "production") {
        const w = window as unknown as { __remixtDj?: DjEngine; __remixtDjLoad?: (deck: "A" | "B", id: string) => Promise<void> };
        w.__remixtDj = e;
        w.__remixtDjLoad = async (deck, id) => e!.loadTrack(deck, await loadAnyTrack(id, e!.ctx));
      }
    }
    return e;
  }, []);

  // Arriving: straight onto the decks. The audio engine is outside React; it's made here, once, on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- creating the external audio engine on arrival
    const e = engineNow();
    if (e) applyGear(e, gearById(gearStore.getSnapshot()));
  }, [engineNow]);

  // Changing gear in free play applies at once.
  useEffect(() => {
    if (engine && mode && mode.kind !== "scenario") applyGear(engine, gear);
  }, [engine, mode, gear]);

  // Entering is a click or tap, so the browser lets the audio context start.
  const enter = (next: Mode) => {
    setError(null);
    const e = engineNow();
    if (!e) return;
    e.unlock();
    applyGear(e, gear);
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  /** To the Learn page: the decks stop and let go of their songs. */
  const leave = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    retainTracks([]);
    setEngine(null);
    setMode(null);
    window.scrollTo({ top: 0 });
  };

  if (!mode) {
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
  if (!engine) {
    return error ? (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    ) : (
      // Server-drawn too: the page's heading is there before the decks are.
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">DJ decks</h1>
        <p className="text-sm text-muted">Setting up the decks…</p>
      </div>
    );
  }

  const scenario = mode.kind === "scenario" ? scenarioById(mode.id) : undefined;
  // "Next" stays within the same kind of exercise (the next lesson, drill, gig…).
  const siblings = scenario ? ORDER.filter((m) => (m.category ?? "mission") === (scenario.category ?? "mission")) : [];
  const index = scenario ? siblings.indexOf(scenario) : -1;

  return (
    <div className="flex min-w-0 flex-col gap-3" onPointerDownCapture={() => engine.unlock()}>
      <div className="flex items-center gap-2">
        {mode.kind === "free" ? (
          <>
            <h1 className="truncate text-lg font-bold">DJ decks</h1>
            <span className="ml-auto flex items-center gap-2">
              {!liveId && user !== undefined && <GoLiveStudioButton place="dj" signedIn={!!user} defaultTitle={() => "DJing live"} />}
              {/* On air, the decks stay: Learn would stop them. */}
              {!liveId && (
                <button type="button" onClick={leave} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
                  <GraduationCap /> Learn to DJ
                </button>
              )}
            </span>
          </>
        ) : (
          <>
            <button type="button" onClick={leave} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
              <ArrowLeft /> Learn
            </button>
            <span className="truncate text-sm font-semibold text-muted">{mode.kind === "practice" ? "Practice" : scenario?.title}</span>
          </>
        )}
      </div>
      {mode.kind === "free" && liveId && user && <DjLive engine={engine} streamId={liveId} userId={user.id} />}
      {mode.kind === "free" && liveId && user === null && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/dj?live=${liveId}`)}`} className="font-semibold text-brand-strong hover:underline">
            Sign in
          </Link>{" "}
          to DJ this live session.
        </p>
      )}
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
        <OpenDecks
          engine={engine}
          practice={mode.kind === "practice"}
          initialView={mode.kind === "free" ? mode.view : "pro"}
          gear={gear}
          onGear={(id) => gearStore.set(id)}
          handoff={mode.kind === "free" ? handoff : null}
        />
      )}
    </div>
  );
}
