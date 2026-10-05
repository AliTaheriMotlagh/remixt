"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, Minus, Plus, Settings2 } from "lucide-react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { loadAnyTrack, retainTracks, type LoadStage } from "@/lib/client/dj/djLibraryTracks";
import { effBpm } from "@/lib/client/dj/djMath";
import type { DeckId } from "@/lib/client/dj/djTypes";
import type { GearProfile } from "@/lib/client/dj/gear";
import type { ScenarioRules } from "@/lib/client/dj/scenarios";
import BeatMatchMeter from "./BeatMatchMeter";
import DeckPanel from "./DeckPanel";
import DeckWave, { DeckOverview, ZOOMS, type WaveMode } from "./DeckWave";
import FxPads from "./FxPads";
import MidiPanel from "./MidiPanel";
import { BoothSection, ChannelStrip, HeadphoneSection, MasterSection } from "./Mixer";
import Spotlight from "./Spotlight";
import TrackLibrary, { type OtherDeck } from "./TrackLibrary";
import { Toggle } from "./ui";

const ACCENT: Record<DeckId, string> = { A: "var(--beat)", B: "var(--vocals)" };

const SHORTCUTS: [string, string][] = [
  ["Q / P", "Play or pause Deck A / B"],
  ["W / O", "CUE Deck A / B (hold to preview)"],
  ["E / I", "SYNC Deck A / B"],
  ["A, S / K, L", "Nudge Deck A / B slower, faster (hold)"],
  ["D / J", "4-beat loop on Deck A / B"],
  ["Z X / N M", "Hot cues 1, 2 on Deck A / B"],
  ["← →", "Crossfader (Shift: bigger steps), C centres"],
  ["↑ ↓", "Master volume"],
  ["1 2 3 4", "Echo out, reverb, siren (hold), air horn"],
  ["- / =", "Zoom the waveforms out / in"],
  ["?", "Show or hide this list"],
];

export function useEngineUi(engine: DjEngine) {
  return useSyncExternalStore(engine.subscribe, engine.getUi, engine.getUi);
}

/**
 * The console: both waveforms stacked (so the beat phase is visible), the
 * decks and the mixer laid out for the screen: tabs on a phone held
 * upright, three columns on a phone held sideways, a tablet or a desktop.
 * Keyboard shortcuts, MIDI, and the track browser.
 */
export default function DjConsole({
  engine,
  gear,
  rules,
  spotlight,
  spotlightLabel,
}: {
  engine: DjEngine;
  gear: GearProfile;
  rules?: ScenarioRules;
  /** A lesson's current target (`data-dj` id). */
  spotlight?: string | null;
  spotlightLabel?: string;
}) {
  const ui = useEngineUi(engine);
  const [tab, setTab] = useState<"A" | "M" | "B">("A");
  const [library, setLibrary] = useState<DeckId | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [stage, setStage] = useState<Record<DeckId, LoadStage | null>>({ A: null, B: null });
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [extras, setExtras] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [waveMode, setWaveMode] = useState<WaveMode>("bands");
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
      setLoadingId(trackId);
      setLibrary(null);
      setError(null);
      setStage((s) => ({ ...s, [deck]: { stage: "download", text: "Preparing…", progress: 0.01 } }));
      try {
        const track = await loadAnyTrack(trackId, engine.ctx, (st) => setStage((s) => ({ ...s, [deck]: st })));
        engine.loadTrack(deck, track);
        // Free the decoded audio of songs no deck holds any more.
        retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
      } catch (err) {
        setError(err instanceof Error && err.message ? `Couldn't load that track: ${err.message}` : "Couldn't load that track. Try again.");
      } finally {
        setLoadingId(null);
        setStage((s) => ({ ...s, [deck]: null }));
      }
    },
    [engine]
  );

  const sync = useCallback(
    (deck: DeckId) => {
      if (rules?.noSync || !gear.sync) return;
      const result = engine.sync(deck);
      const text =
        result === "out-of-range"
          ? `Can't reach that tempo within the range: widen it (±16% or WIDE) or pick a closer track.`
          : result === "no-track"
            ? "Load a track on both decks first."
            : null;
      if (noteTimer.current) clearTimeout(noteTimer.current);
      setSyncNote(text ? { deck, text } : null);
      if (text) noteTimer.current = setTimeout(() => setSyncNote(null), 5000);
    },
    [engine, rules?.noSync, gear.sync]
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const ignore = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range" && (el as HTMLInputElement).type !== "checkbox")) return true;
      if (el.getAttribute("role") === "slider" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return true;
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || ignore(e) || library) return;
      engine.unlock();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.repeat && !k.startsWith("Arrow")) {
        if (k.length === 1 && "qpwoeiaskldjc1234?zxnm".includes(k)) e.preventDefault();
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
        case "z": engine.hotCueDown("A", 0); break;
        case "x": engine.hotCueDown("A", 1); break;
        case "n": engine.hotCueDown("B", 0); break;
        case "m": engine.hotCueDown("B", 1); break;
        case "c": engine.setCrossfader(0); break;
        case "1": engine.echoOut(); break;
        case "2": engine.reverbThrow(); break;
        case "3": engine.sirenOn(); break;
        case "4": engine.airHorn(); break;
        case "-": setZoom((z) => Math.min(ZOOMS.length - 1, z + 1)); break;
        case "=": setZoom((z) => Math.max(0, z - 1)); break;
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
        case "z": engine.hotCueUp("A", 0); break;
        case "x": engine.hotCueUp("A", 1); break;
        case "n": engine.hotCueUp("B", 0); break;
        case "m": engine.hotCueUp("B", 1); break;
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
  const span = ZOOMS[zoom];
  const otherOf = (id: DeckId): OtherDeck => {
    const o = ui.decks[id === "A" ? "B" : "A"];
    return o.track ? { bpm: effBpm(o), key: o.track.key, title: o.track.title } : null;
  };
  const panel = (id: DeckId) => (
    <DeckPanel
      engine={engine}
      id={id}
      deck={ui.decks[id]}
      gear={gear}
      rules={rules}
      accent={ACCENT[id]}
      onLoad={() => setLibrary(id)}
      onSync={() => sync(id)}
      syncNote={syncNote?.deck === id ? syncNote.text : null}
      loading={stage[id]}
    />
  );

  return (
    <div className="touch-targets flex min-w-0 flex-col gap-2.5" onPointerDownCapture={() => engine.unlock()}>
      <Spotlight
        target={spotlight}
        label={spotlightLabel}
        onReveal={(t) => {
          if (t.startsWith("A-")) setTab("A");
          else if (t.startsWith("B-")) setTab("B");
          else if (t.startsWith("M-") || t.startsWith("FX-")) setTab("M");
        }}
      />
      <section aria-label="Waveforms" className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span>Waveforms</span>
          <div className="ml-auto flex items-center gap-1">
            <Toggle pressed={waveMode === "bands"} onClick={() => setWaveMode("bands")} label="Waveform coloured by frequency" title="3-band: lows blue, mids amber, highs white" className="min-h-7 px-1.5 text-[10px]">
              3-band
            </Toggle>
            <Toggle pressed={waveMode === "stems"} onClick={() => setWaveMode("stems")} label="Waveform by stems" title="Stems: each stem in its colour" className="min-h-7 px-1.5 text-[10px]">
              Stems
            </Toggle>
            <button type="button" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoom out" className="flex size-7 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover pointer-coarse:size-9">
              <Minus />
            </button>
            <span className="w-8 text-center font-mono normal-case">{span}s</span>
            <button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Zoom in" className="flex size-7 items-center justify-center rounded-md bg-surface-raised hover:bg-surface-hover pointer-coarse:size-9">
              <Plus />
            </button>
          </div>
        </div>
        <DeckWave engine={engine} id="A" track={trackA} height={64} span={span} mode={waveMode} accent={ACCENT.A} />
        <DeckWave engine={engine} id="B" track={trackB} height={64} span={span} mode={waveMode} accent={ACCENT.B} />
        <DeckOverview engine={engine} id="A" track={trackA} label={gear.turntable ? "Needle drop" : "Needle search"} />
        <DeckOverview engine={engine} id="B" track={trackB} label={gear.turntable ? "Needle drop" : "Needle search"} />
      </section>

      {/* A phone held sideways (landscape, short) shows all three columns; tabs are for upright phones. */}
      <div role="tablist" aria-label="Console section" className="grid grid-cols-3 gap-1 md:hidden [@media(orientation:landscape)_and_(max-height:540px)]:hidden">
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

      <div className="grid min-w-0 gap-2.5 [@media(min-width:768px)_and_(max-width:1023.98px)_and_(min-height:541px)]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] [@media(orientation:landscape)_and_(max-height:540px)]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className={`min-w-0 ${tab === "A" ? "" : "max-md:hidden"} lg:order-1 [@media(orientation:landscape)_and_(max-height:540px)]:!block [@media(orientation:landscape)_and_(max-height:540px)]:order-1`}>{panel("A")}</div>
        <div className={`min-w-0 ${tab === "B" ? "" : "max-md:hidden"} lg:order-3 [@media(orientation:landscape)_and_(max-height:540px)]:!block [@media(orientation:landscape)_and_(max-height:540px)]:order-3`}>{panel("B")}</div>
        <div
          className={`${tab === "M" ? "" : "max-md:hidden"} flex min-w-0 flex-col gap-2.5 [@media(min-width:768px)_and_(max-width:1023.98px)_and_(min-height:541px)]:col-span-2 lg:order-2 [@media(orientation:landscape)_and_(max-height:540px)]:order-2 [@media(orientation:landscape)_and_(max-height:540px)]:!flex`}
        >
          <section aria-label="Mixer" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{gear.turntable ? "Battle mixer" : gear.id === "club" ? "Club mixer" : "Mixer"}</p>
            <div className="grid grid-cols-2 gap-2" data-dj="M-eq">
              <ChannelStrip engine={engine} id="A" ui={ui} accent={ACCENT.A} compact={gear.id === "touch"} />
              <ChannelStrip engine={engine} id="B" ui={ui} accent={ACCENT.B} compact={gear.id === "touch"} />
            </div>
            <MasterSection engine={engine} ui={ui} gear={gear} />
            <HeadphoneSection engine={engine} ui={ui} />
            <BoothSection engine={engine} ui={ui} />
          </section>
          {!rules?.noMeter && <BeatMatchMeter engine={engine} />}
        </div>
      </div>

      <FxPads engine={engine} />

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <button type="button" onClick={() => setHelp(!help)} aria-expanded={help} className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 font-semibold hover:bg-surface-hover">
          <Keyboard /> Keyboard shortcuts
        </button>
        {gear.advanced && (
          <button type="button" onClick={() => setExtras(!extras)} aria-expanded={extras} className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 font-semibold hover:bg-surface-hover">
            <Settings2 /> MIDI controller
          </button>
        )}
        <span className="min-w-0">
          {gear.keyLock ? "KEY on a deck locks its pitch while the tempo changes." : "Turntables: the tempo fader changes speed and pitch together, as on vinyl."}
        </span>
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
      {extras && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <MidiPanel engine={engine} />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {library && <TrackLibrary deck={library} other={otherOf(library)} loadingId={loadingId} onPick={(id) => void pick(library, id)} onClose={() => setLibrary(null)} />}
    </div>
  );
}
