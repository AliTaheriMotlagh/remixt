"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Drum, FolderOpen, Guitar, Loader2, Mic, Pause, Piano, Play, RotateCcw, Sparkles, TriangleAlert, Wand2, X, Zap } from "lucide-react";
import type { DemoStem } from "@/lib/client/demoSongDefs";
import { AUTO_MIX_STEPS, AutoMix } from "@/lib/client/dj/autoMix";
import { beatIndex } from "@/lib/client/dj/djControls";
import { derive, type Derived } from "@/lib/client/dj/djDerived";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { effBpm, effectiveKey, onAirGain } from "@/lib/client/dj/djMath";
import type { DeckId, DeckState, DjSnapshot } from "@/lib/client/dj/djTypes";
import type { LoadStage } from "@/lib/client/dj/djLibraryTracks";
import { camelotCode, keyLabel } from "@/lib/client/musicKey";
import { useEngineUi } from "./DjConsole";
import DeckWave, { DeckOverview } from "./DeckWave";
import { RecordMix } from "./Mixer";
import TrackLibrary, { type OtherDeck } from "./TrackLibrary";
import { useDeckLoader } from "./useDeckLoader";
import { useInterval } from "./useInterval";
import { useRaf } from "./ui";

// The DJ decks for someone who has never touched a mixer (and for a
// producer who wants to hear their stems in a club-style blend): the two
// songs as big scrolling waveforms, lights that blink on every beat, one
// line that says whether the decks are in step, plain controls, and an
// Auto-mix that does a whole transition while showing each step on these
// same controls. Everything the pro console has is one tap away.

const ACCENT: Record<DeckId, string> = { A: "var(--beat)", B: "var(--vocals)" };

const STEMS: { stem: DemoStem; label: string; icon: typeof Mic; color: string }[] = [
  { stem: "vocal", label: "Vocals", icon: Mic, color: "var(--vocals)" },
  { stem: "drums", label: "Drums", icon: Drum, color: "var(--drums)" },
  { stem: "bass", label: "Bass", icon: Guitar, color: "var(--bass)" },
  { stem: "chords", label: "Melody", icon: Piano, color: "var(--other)" },
];

const SECTION_LABEL: Record<string, string> = { intro: "Intro", verse: "Verse", chorus: "Chorus", break: "Breakdown", outro: "Outro" };

/** Four lights per deck, lit in turn on each beat (the first of the bar brighter), drawn off React. */
function BeatLights({ engine, id }: { engine: DjEngine; id: DeckId }) {
  const box = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    const el = box.current;
    if (!el) return;
    const t = engine.deckTrack(id)?.info;
    const st = engine.deckState(id);
    const on = !!t && st.playing ? ((Math.floor(beatIndex(t, engine.deckPosition(id))) % 4) + 4) % 4 : -1;
    for (let i = 0; i < 4; i++) (el.children[i] as HTMLElement).dataset.on = String(i === on);
  });
  return (
    <span ref={box} className="flex gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`size-3 rounded-full bg-white/10 transition-[background,box-shadow] duration-75 data-[on=true]:shadow-[0_0_10px_currentColor] ${i === 0 ? "data-[on=true]:bg-white" : "data-[on=true]:bg-[currentColor]"}`}
          style={{ color: ACCENT[id] }}
        />
      ))}
    </span>
  );
}

/** The one line that tells a beginner what's going on between the decks, and what to do about it. */
function statusOf(d: Derived | null, snap: DjSnapshot): { tone: "good" | "warn" | "info"; text: string } {
  if (!d || !d.bothLoaded) return { tone: "info", text: "Load a song on both decks to start mixing." };
  const { A, B } = snap.decks;
  if (!A.playing && !B.playing) return { tone: "info", text: "Press play on a deck. Then try Auto-mix to hear a DJ transition." };
  if (!d.bothPlaying) return { tone: "info", text: `Deck ${A.playing ? "A" : "B"} is playing. Auto-mix brings in deck ${A.playing ? "B" : "A"}, or press its play and SYNC.` };
  if (Math.abs(d.tempoDiff) > 0.5) return { tone: "warn", text: `The speeds are ${Math.abs(d.tempoDiff).toFixed(1)} BPM apart: press SYNC on deck ${d.adjust}.` };
  if (Math.abs(d.phaseMs) > 30) return { tone: "warn", text: `Same speed, but the beats are ${Math.round(Math.abs(d.phaseMs))} ms apart: press SYNC on deck ${d.adjust} to line them up.` };
  return { tone: "good", text: "Beats locked: the two songs are in step. Move the crossfader to blend." };
}

const FIT: Record<string, { text: string; tone: "good" | "warn" | "info" }> = {
  same: { text: "Same key: sounds smooth together", tone: "good" },
  relative: { text: "Related keys: sounds smooth together", tone: "good" },
  neighbour: { text: "Neighbouring keys: blends fine", tone: "good" },
  far: { text: "Keys a little apart: keep the overlap short", tone: "warn" },
  clash: { text: "Keys clash: cut the melody or vocals while both play", tone: "warn" },
};

function Pill({ tone, children }: { tone: "good" | "warn" | "info"; children: ReactNode }) {
  const cls = tone === "good" ? "border-success/50 bg-success/10" : tone === "warn" ? "border-drums/60 bg-drums/10" : "border-border bg-surface-raised";
  const icon = tone === "good" ? <CheckCircle2 className="shrink-0 text-success" /> : tone === "warn" ? <TriangleAlert className="shrink-0 text-drums" /> : <Sparkles className="shrink-0 text-brand-strong" />;
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`} aria-live="polite">
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** How much of each deck the room hears, as one bar. */
function OnAir({ snap }: { snap: DjSnapshot }) {
  const a = snap.decks.A.track && snap.decks.A.playing ? onAirGain(snap.decks.A, "A", snap.mix) : 0;
  const b = snap.decks.B.track && snap.decks.B.playing ? onAirGain(snap.decks.B, "B", snap.mix) : 0;
  const total = a + b;
  const pa = total > 0.01 ? Math.round((a / total) * 100) : 0;
  const pb = total > 0.01 ? 100 - pa : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>On air: A {pa}%</span>
        <span>B {pb}%</span>
      </div>
      <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-black/40" role="img" aria-label={`The room hears deck A at ${pa}% and deck B at ${pb}%`}>
        <span className="h-full transition-[width] duration-200" style={{ width: `${pa}%`, background: ACCENT.A }} />
        <span className="h-full transition-[width] duration-200" style={{ width: `${pb}%`, background: ACCENT.B }} />
      </div>
    </div>
  );
}

function EasyDeck({
  engine,
  id,
  deck,
  loading,
  onLoad,
}: {
  engine: DjEngine;
  id: DeckId;
  deck: DeckState;
  loading: LoadStage | null;
  onLoad: () => void;
}) {
  const t = deck.track;
  const key = effectiveKey(deck);
  const section = t?.sections.find((s) => {
    const pos = beatIndex(t, deck.position) / 4;
    return pos >= s.startBar && pos < s.startBar + s.bars;
  });
  const [syncNote, setSyncNote] = useState<string | null>(null);
  useEffect(() => {
    if (!syncNote) return;
    const timer = setTimeout(() => setSyncNote(null), 4000);
    return () => clearTimeout(timer);
  }, [syncNote]);
  const sync = () => {
    const r = engine.sync(id);
    setSyncNote(r === "out-of-range" ? "Too far apart for this range: tap SYNC again to allow a wider one." : r === "no-track" ? "Load a song on both decks first." : null);
    if (r === "out-of-range") engine.setTempoRange(id, 100);
  };
  const two = t?.layout === "two";

  return (
    <section aria-label={`Deck ${id}`} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-2.5 sm:p-3" style={{ borderTopColor: ACCENT[id], borderTopWidth: 3 }}>
      <header className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-black" style={{ background: ACCENT[id] }} aria-hidden>
          {id}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{t ? t.title : loading ? "Loading…" : "Empty deck"}</p>
          <p className="truncate text-[11px] text-muted">{t ? t.artist : "Pick a song"}</p>
        </div>
        <button type="button" onClick={onLoad} className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold hover:bg-surface-hover" aria-label={`Load a song on deck ${id}`}>
          <FolderOpen /> <span className="max-sm:hidden">Load</span>
        </button>
      </header>

      {loading && (
        <div role="status" className="rounded-lg bg-background/60 p-2 text-[11px]">
          <p className="flex items-center gap-1.5 font-semibold">
            <Loader2 className="animate-spin" /> {loading.text}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-md bg-black/40 px-1.5 py-1 font-mono font-bold tabular-nums" title="Tempo, in beats per minute">
          {t ? effBpm(deck).toFixed(1) : "—"} <span className="font-sans font-normal text-muted">BPM</span>
        </span>
        <span className="rounded-md bg-black/40 px-1.5 py-1 font-mono font-bold" title={key ? `Key: ${keyLabel(key.key)}` : "Key"}>
          {key ? camelotCode(key.key) : "—"} <span className="font-sans font-normal text-muted">key</span>
        </span>
        {section && <span className="rounded-md bg-brand/20 px-1.5 py-1 font-semibold text-brand-strong">{SECTION_LABEL[section.name] ?? section.name}</span>}
        <span className="ml-auto">
          <BeatLights engine={engine} id={id} />
        </span>
      </div>

      <DeckOverview engine={engine} id={id} track={engine.deckTrack(id)} label="Tap to jump" />

      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
        <button
          type="button"
          onClick={() => engine.togglePlay(id)}
          disabled={!t}
          aria-label={deck.playing ? `Pause deck ${id}` : `Play deck ${id}`}
          aria-pressed={deck.playing}
          className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${deck.playing ? "bg-success text-black" : "bg-brand text-white hover:bg-brand-strong"}`}
        >
          {deck.playing ? <Pause /> : <Play />} {deck.playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={!t}
          title="SYNC: match the other deck's speed and line the beats up"
          className="min-h-12 rounded-xl bg-surface-raised px-3 text-sm font-bold hover:bg-surface-hover disabled:opacity-40"
        >
          SYNC
        </button>
        <button
          type="button"
          onClick={() => engine.seek(id, t?.firstBeat ?? 0)}
          disabled={!t}
          aria-label={`Back to the start of deck ${id}`}
          title="Back to the first beat"
          className="flex min-h-12 items-center justify-center rounded-xl bg-surface-raised px-3 hover:bg-surface-hover disabled:opacity-40"
        >
          <RotateCcw />
        </button>
      </div>
      {syncNote && <p className="text-[11px] text-drums">{syncNote}</p>}

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Parts: tap to mute or bring back</p>
        <div className={`grid gap-1 ${two ? "grid-cols-2" : "grid-cols-4"}`} role="group" aria-label={`Parts of the song on deck ${id}`}>
          {(two ? STEMS.slice(0, 1) : STEMS).map((s) => {
            const on = !deck.stems[s.stem];
            const StemIcon = s.icon;
            return (
              <button
                key={s.stem}
                type="button"
                aria-pressed={on}
                disabled={!t}
                onClick={() => engine.setStemKill(id, s.stem, on)}
                aria-label={`${s.label} on deck ${id}: ${on ? "playing, tap to mute" : "muted, tap to bring back"}`}
                className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold transition-colors disabled:opacity-40"
                style={{
                  borderColor: on ? s.color : "var(--border)",
                  background: on ? `color-mix(in srgb, ${s.color} 22%, transparent)` : "transparent",
                  color: on ? "var(--foreground)" : "var(--muted)",
                }}
              >
                <StemIcon style={{ color: on ? s.color : undefined }} />
                <span className={on ? "" : "line-through"}>{s.label}</span>
              </button>
            );
          })}
          {two && (
            <button
              type="button"
              aria-pressed={!deck.stems.drums}
              disabled={!t}
              onClick={() => engine.setBeatKill(id, !(deck.stems.drums && deck.stems.bass && deck.stems.chords))}
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold disabled:opacity-40"
              style={{ borderColor: deck.stems.drums ? "var(--border)" : "var(--beat)", background: deck.stems.drums ? "transparent" : "color-mix(in srgb, var(--beat) 22%, transparent)" }}
            >
              <Drum style={{ color: "var(--beat)" }} />
              <span className={deck.stems.drums ? "line-through" : ""}>Beat</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** What the panel shows of a transition, copied from the AutoMix on each tick. */
type MixView = { from: DeckId; to: DeckId; phase: AutoMix["phase"]; progress: number; beatsToGo: number };
const viewOf = (m: AutoMix): MixView => ({ from: m.from, to: m.to, phase: m.phase, progress: m.progress, beatsToGo: m.beatsToGo });

/** Auto-mix: the button, then each step lit as it happens. */
function AutoMixPanel({ engine, snap }: { engine: DjEngine; snap: DjSnapshot }) {
  const mix = useRef<AutoMix | null>(null);
  const [m, setM] = useState<MixView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const running = !!m && m.phase !== "done" && m.phase !== "stopped";

  useInterval(
    () => {
      const auto = mix.current;
      if (!auto) return;
      auto.tick();
      if (auto.phase === "stopped" && auto.reason) setNote(auto.reason);
      setM(viewOf(auto));
    },
    running ? 60 : null
  );
  useEffect(() => () => mix.current?.cancel(), []);

  const { A, B } = snap.decks;
  // Out of the deck the room hears most; the other comes in.
  const from: DeckId = A.playing && B.playing ? (onAirGain(A, "A", snap.mix) >= onAirGain(B, "B", snap.mix) ? "A" : "B") : B.playing ? "B" : "A";
  const blocker = AutoMix.blocker(snap, from);
  const current = m ? AUTO_MIX_STEPS.findIndex((s) => s.phase === m.phase) : -1;

  const go = () => {
    setNote(null);
    const next = new AutoMix(engine, from);
    mix.current = next;
    if (!next.start()) setNote(next.reason);
    setM(viewOf(next));
  };
  const cancel = () => {
    const auto = mix.current;
    if (!auto) return;
    auto.cancel();
    setM(viewOf(auto));
  };

  return (
    <section aria-label="Auto-mix" className="flex flex-col gap-2 rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 via-surface to-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button type="button" onClick={cancel} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-hover">
            <X /> Stop auto-mix
          </button>
        ) : (
          <button
            type="button"
            onClick={go}
            disabled={!!blocker}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50"
          >
            <Wand2 /> Auto-mix {from} → {from === "A" ? "B" : "A"}
          </button>
        )}
        <p className="min-w-0 flex-1 basis-48 text-xs text-muted">
          {running
            ? m!.phase === "wait"
              ? `Deck ${m!.to} starts in ${m!.beatsToGo} beat${m!.beatsToGo === 1 ? "" : "s"}, on the next phrase line. Watch the lights.`
              : "Watch the crossfader, the faders and the bass move: that's a DJ transition."
            : m?.phase === "done"
              ? `Done: deck ${m.to} is on air. Load a new song on deck ${m.from} and go again, or do it by hand this time.`
              : (blocker ?? "One tap and it blends the songs like a DJ, showing every step. Then try it yourself.")}
        </p>
      </div>
      {note && <p className="text-xs text-drums">{note}</p>}
      {(running || m?.phase === "done") && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-brand transition-[width] duration-150" style={{ width: `${Math.round((m?.progress ?? 0) * 100)}%` }} />
          </div>
          <ol className="grid gap-1 sm:grid-cols-5">
            {AUTO_MIX_STEPS.map((s, i) => {
              const done = m?.phase === "done" || (current >= 0 && i < current);
              const now = i === current;
              return (
                <li key={s.phase} className={`rounded-lg px-2 py-1.5 text-xs ${now ? "bg-brand/20" : ""}`} aria-current={now ? "step" : undefined}>
                  <span className="flex items-center gap-1.5 font-semibold">
                    {done ? <CheckCircle2 className="shrink-0 text-success" /> : <Circle className={`shrink-0 ${now ? "text-brand-strong" : "text-border"}`} />}
                    {s.label}
                  </span>
                  {now && <span className="mt-0.5 block text-[11px] text-muted">{s.detail}</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

/** The crossfader, each deck's bass, a few effects and the recorder. */
function EasyMixer({ engine, snap }: { engine: DjEngine; snap: DjSnapshot }) {
  return (
    <section aria-label="Mixer" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
      <OnAir snap={snap} />
      <div>
        <div className="flex items-center justify-between text-xs font-bold">
          <span style={{ color: ACCENT.A }}>◀ Deck A</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Crossfader</span>
          <span style={{ color: ACCENT.B }}>Deck B ▶</span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={snap.mix.crossfader}
          onChange={(e) => engine.setCrossfader(Number(e.target.value))}
          onDoubleClick={() => engine.setCrossfader(0)}
          aria-label="Crossfader: left is deck A, right is deck B"
          className="mt-1 h-10 w-full accent-brand"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["A", "B"] as const).map((id) => {
          const cut = snap.decks[id].kill.low;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={!cut}
              disabled={!snap.decks[id].track}
              onClick={() => engine.setKill(id, "low", !cut)}
              title="DJs keep only one bass line playing at a time: cut one while both decks play"
              className={`min-h-11 rounded-xl border text-xs font-bold disabled:opacity-40 ${cut ? "border-border text-muted line-through" : "border-bass/60 bg-bass/15"}`}
            >
              Bass {id}: {cut ? "cut" : "on"}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Effects</span>
        <button type="button" onClick={() => engine.echoOut()} className="flex min-h-10 items-center gap-1 rounded-lg bg-surface-raised px-3 text-xs font-bold hover:bg-surface-hover" title="Echo the sound out: a smooth way to end a song">
          <Zap /> Echo out
        </button>
        <button type="button" onClick={() => engine.reverbThrow()} className="min-h-10 rounded-lg bg-surface-raised px-3 text-xs font-bold hover:bg-surface-hover">
          Reverb
        </button>
        <button type="button" onClick={() => engine.airHorn()} className="min-h-10 rounded-lg bg-surface-raised px-3 text-xs font-bold hover:bg-surface-hover">
          Air horn
        </button>
      </div>
      <div className="border-t border-border pt-3">
        <RecordMix engine={engine} recording={snap.mix.recording} big />
        <p className="mt-1 text-[11px] text-muted">Records exactly what the room hears, ready to download.</p>
      </div>
    </section>
  );
}

export default function EasyDecks({ engine }: { engine: DjEngine }) {
  const ui = useEngineUi(engine);
  const { library, setLibrary, loadingId, stage, error, pick } = useDeckLoader(engine);
  // Live readings (positions, sections, the beat status) ten times a second; the controls follow the engine's own updates.
  const [snap, setSnap] = useState<DjSnapshot>(() => engine.snapshot());
  const [derived, setDerived] = useState<Derived | null>(null);
  useInterval(() => {
    const s = engine.snapshot();
    setSnap(s);
    setDerived(derive(s));
  }, 100);
  const live: DjSnapshot = { ...snap, decks: { A: { ...ui.decks.A, position: snap.decks.A.position }, B: { ...ui.decks.B, position: snap.decks.B.position } }, mix: { ...ui.mix } };
  const status = statusOf(derived, live);
  const fit = derived?.keyFit ? FIT[derived.keyFit] : null;
  const otherOf = (id: DeckId): OtherDeck => {
    const o = ui.decks[id === "A" ? "B" : "A"];
    return o.track ? { bpm: effBpm(o), key: o.track.key, title: o.track.title } : null;
  };

  return (
    <div className="touch-targets flex min-w-0 flex-col gap-2.5" onPointerDownCapture={() => engine.unlock()}>
      <section aria-label="Waveforms" className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-2">
        <p className="px-1 text-[11px] text-muted">
          The songs scroll past the white line. Each colour is a part: <span style={{ color: "var(--vocals)" }}>vocals</span>, <span style={{ color: "var(--drums)" }}>drums</span>,{" "}
          <span style={{ color: "var(--bass)" }}>bass</span>, <span style={{ color: "var(--other)" }}>melody</span>. In step, the red bar lines of both songs pass the line together.
        </p>
        <DeckWave engine={engine} id="A" track={engine.deckTrack("A")} height={60} span={8} mode="stems" accent={ACCENT.A} />
        <DeckWave engine={engine} id="B" track={engine.deckTrack("B")} height={60} span={8} mode="stems" accent={ACCENT.B} />
      </section>

      <div className="grid gap-2 md:grid-cols-2">
        <Pill tone={status.tone}>{status.text}</Pill>
        {fit ? <Pill tone={fit.tone}>{fit.text} ({derived?.key?.camelotA} · {derived?.key?.camelotB})</Pill> : <Pill tone="info">Keys show up once both decks hold a song.</Pill>}
      </div>

      <AutoMixPanel engine={engine} snap={live} />

      {/* Phones: deck A, the mixer, deck B, top to bottom. */}
      <div className="grid min-w-0 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 md:order-1">
          <EasyDeck engine={engine} id="A" deck={live.decks.A} loading={stage.A} onLoad={() => setLibrary("A")} />
        </div>
        <div className="min-w-0 md:order-2">
          <EasyMixer engine={engine} snap={live} />
        </div>
        <div className="min-w-0 md:order-3">
          <EasyDeck engine={engine} id="B" deck={live.decks.B} loading={stage.B} onLoad={() => setLibrary("B")} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {library && <TrackLibrary deck={library} other={otherOf(library)} loadingId={loadingId} onPick={(id) => void pick(library, id)} onClose={() => setLibrary(null)} />}
    </div>
  );
}
