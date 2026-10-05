"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, Loader2 } from "lucide-react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { loadDjTrack } from "@/lib/client/dj/djTracks";
import type { DeckId } from "@/lib/client/dj/djTypes";
import BeatMatchMeter from "./BeatMatchMeter";
import DeckPanel from "./DeckPanel";
import DeckWave, { DeckOverview } from "./DeckWave";
import FxPads from "./FxPads";
import { ChannelStrip, MasterSection } from "./Mixer";
import TrackLibrary from "./TrackLibrary";

const ACCENT: Record<DeckId, string> = { A: "var(--beat)", B: "var(--vocals)" };

const SHORTCUTS: [string, string][] = [
  ["Q / P", "Play or pause Deck A / B"],
  ["W / O", "CUE Deck A / B (hold to preview)"],
  ["E / I", "SYNC Deck A / B"],
  ["A, S / K, L", "Nudge Deck A / B slower, faster (hold)"],
  ["D / J", "4-beat loop on Deck A / B"],
  ["← →", "Crossfader (Shift: bigger steps), C centres"],
  ["↑ ↓", "Master volume"],
  ["1 2 3 4", "Echo out, reverb, siren (hold), air horn"],
  ["?", "Show or hide this list"],
];

export function useEngineUi(engine: DjEngine) {
  return useSyncExternalStore(engine.subscribe, engine.getUi, engine.getUi);
}

/** The two decks, the mixer, pads and the beat-match meter, with keyboard shortcuts. */
export default function DjConsole({ engine }: { engine: DjEngine }) {
  const ui = useEngineUi(engine);
  const [tab, setTab] = useState<"A" | "M" | "B">("A");
  const [library, setLibrary] = useState<DeckId | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [syncNote, setSyncNote] = useState<{ deck: DeckId; text: string } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    []
  );

  const pick = useCallback(
    async (deck: DeckId, trackId: string) => {
      setLoading(trackId);
      setError(null);
      try {
        const track = await loadDjTrack(trackId);
        engine.loadTrack(deck, track);
        setLibrary(null);
      } catch {
        setError("Couldn't load that track. Try again.");
      } finally {
        setLoading(null);
      }
    },
    [engine]
  );

  const sync = useCallback(
    (deck: DeckId) => {
      const result = engine.sync(deck);
      const text =
        result === "out-of-range"
          ? `Can't reach that tempo within the pitch range: widen it (±16% or ±50%) or pick a closer track.`
          : result === "no-track"
            ? "Load a track on both decks first."
            : null;
      if (noteTimer.current) clearTimeout(noteTimer.current);
      setSyncNote(text ? { deck, text } : null);
      if (text) noteTimer.current = setTimeout(() => setSyncNote(null), 5000);
    },
    [engine]
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const ignore = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "range" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) return true;
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || ignore(e) || library) return;
      engine.unlock();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.repeat && !k.startsWith("Arrow")) {
        if (k.length === 1 && "qpwoeiaskldjc1234?".includes(k)) e.preventDefault();
        return;
      }
      const ui = engine.getUi();
      let handled = true;
      switch (k) {
        case "q": engine.togglePlay("A"); break;
        case "p": engine.togglePlay("B"); break;
        case "w": engine.cueDown("A"); break;
        case "o": engine.cueDown("B"); break;
        case "e": sync("A"); break;
        case "i": sync("B"); break;
        case "a": engine.setBend("A", -1); break;
        case "s": engine.setBend("A", 1); break;
        case "k": engine.setBend("B", -1); break;
        case "l": engine.setBend("B", 1); break;
        case "d": engine.loopBeats("A", 4); break;
        case "j": engine.loopBeats("B", 4); break;
        case "c": engine.setCrossfader(0); break;
        case "1": engine.echoOut(); break;
        case "2": engine.reverbThrow(); break;
        case "3": engine.sirenOn(); break;
        case "4": engine.airHorn(); break;
        case "?": setHelp((h) => !h); break;
        case "ArrowLeft": engine.setCrossfader(ui.mix.crossfader - (e.shiftKey ? 0.3 : 0.1)); break;
        case "ArrowRight": engine.setCrossfader(ui.mix.crossfader + (e.shiftKey ? 0.3 : 0.1)); break;
        case "ArrowUp": engine.setMaster(ui.mix.master + 0.05); break;
        case "ArrowDown": engine.setMaster(ui.mix.master - 0.05); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (k) {
        case "w": engine.cueUp("A"); break;
        case "o": engine.cueUp("B"); break;
        case "a": case "s": engine.setBend("A", 0); break;
        case "k": case "l": engine.setBend("B", 0); break;
        case "3": engine.sirenOff(); break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [engine, library, sync]);

  const trackA = engine.deckTrack("A");
  const trackB = engine.deckTrack("B");
  const panel = (id: DeckId) => (
    <DeckPanel
      engine={engine}
      id={id}
      deck={ui.decks[id]}
      accent={ACCENT[id]}
      onLoad={() => setLibrary(id)}
      onSync={() => sync(id)}
      syncNote={syncNote?.deck === id ? syncNote.text : null}
    />
  );

  return (
    <div className="touch-targets flex flex-col gap-3" onPointerDownCapture={() => engine.unlock()}>
      <div className="flex flex-col gap-1.5">
        {(["A", "B"] as DeckId[]).map((id) => (
          <div key={id} className="flex flex-col gap-1">
            <DeckWave engine={engine} id={id} track={id === "A" ? trackA : trackB} height={78} />
            <DeckOverview engine={engine} id={id} track={id === "A" ? trackA : trackB} />
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Console section" className="grid grid-cols-3 gap-1 md:hidden">
        {(
          [
            ["A", "Deck A"],
            ["M", "Mixer"],
            ["B", "Deck B"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${tab === id ? "bg-brand text-white" : "bg-surface text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.15fr_1fr]">
        <div className={`${tab === "A" ? "" : "max-md:hidden"} lg:order-1`}>{panel("A")}</div>
        <div className={`${tab === "B" ? "" : "max-md:hidden"} lg:order-3`}>{panel("B")}</div>
        <div className={`${tab === "M" ? "" : "max-md:hidden"} flex flex-col gap-3 md:col-span-2 lg:order-2 lg:col-span-1`}>
          <div className="grid grid-cols-2 gap-3">
            <ChannelStrip engine={engine} id="A" ui={ui} accent={ACCENT.A} />
            <ChannelStrip engine={engine} id="B" ui={ui} accent={ACCENT.B} />
          </div>
          <MasterSection engine={engine} ui={ui} />
          <BeatMatchMeter engine={engine} />
        </div>
      </div>

      <FxPads engine={engine} />

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <button type="button" onClick={() => setHelp(!help)} aria-expanded={help} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-semibold hover:bg-surface-hover">
          <Keyboard /> Keyboard shortcuts
        </button>
        <span>Tempo faders here are vinyl-style: changing the speed also changes the pitch (no key lock).</span>
      </div>
      {help && (
        <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-border bg-surface p-3 text-xs sm:grid-cols-2">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 font-mono font-bold">{k}</dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {library && (
        <TrackLibrary deck={library} other={engine.deckTrack(library === "A" ? "B" : "A")?.info ?? null} loadingId={loading} onPick={(id) => void pick(library, id)} onClose={() => setLibrary(null)} />
      )}
      {loading && !library && (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 className="animate-spin" /> Loading track…
        </p>
      )}
    </div>
  );
}
