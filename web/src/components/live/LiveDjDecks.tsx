"use client";

import { useEffect, useState } from "react";
import { Disc3, ListMusic } from "lucide-react";
import SongArt from "@/components/SongArt";
import { djDeckGain, djDeckPosition, djOnAir, type DjLiveDeck, type DjLiveDeckId, type DjLiveStage } from "@/lib/liveDj";
import { formatClock } from "./Stage";

// The host's two decks as the room sees them: what's on each, where it is,
// how fast, which one the room hears, and the crossfader between them.

const ACCENT: Record<DjLiveDeckId, string> = { A: "var(--vocals)", B: "var(--beat)" };

function Deck({ id, deck, position, onAir, gain }: { id: DjLiveDeckId; deck: DjLiveDeck; position: number; onAir: boolean; gain: number }) {
  const pct = deck.duration > 0 ? Math.min(100, (position / deck.duration) * 100) : 0;
  const tempo = deck.bpm ? Math.round(deck.bpm * deck.rate * 10) / 10 : null;
  const cuts = (["vocal", "drums", "bass", "chords"] as const).filter((s) => deck.stems[s]);
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 transition-colors ${onAir ? "bg-surface-raised" : "border-border bg-surface"}`}
      style={onAir ? { borderColor: ACCENT[id] } : undefined}
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
        <span style={{ color: ACCENT[id] }}>Deck {id}</span>
        {onAir && <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] text-white">On air</span>}
        {!onAir && deck.playing && gain === 0 && <span className="text-muted">Cued up</span>}
        {deck.loop && <span className="text-drums">Loop</span>}
      </div>
      {deck.id ? (
        <>
          <div className="flex min-w-0 items-center gap-2.5">
            {deck.cover ? (
              <SongArt stemId={deck.cover} title={deck.title} artist={deck.artist} className={`h-12 w-12 shrink-0 rounded-lg ${deck.playing ? "" : "opacity-60"}`} />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
                <Disc3 className={`h-6 w-6 text-muted ${deck.playing ? "animate-spin [animation-duration:2s]" : ""}`} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-sm font-semibold">
                {deck.title}
              </p>
              <p dir="auto" className="truncate text-xs text-muted">
                {deck.artist}
              </p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-label={`Deck ${id} position`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT[id] }} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-muted">
            <span>
              {formatClock(position)} / {formatClock(deck.duration)}
            </span>
            {tempo && <span>{tempo} BPM</span>}
            {deck.camelot && <span>{deck.camelot}</span>}
            {cuts.length > 0 && <span className="text-drums">{cuts.map((c) => (c === "chords" ? "melody" : c)).join(", ")} cut</span>}
          </p>
        </>
      ) : (
        <p className="py-3 text-xs text-muted">Empty</p>
      )}
    </div>
  );
}

export default function LiveDjDecks({ stage, stateAt, serverNow, live }: { stage: DjLiveStage; stateAt: number; serverNow: () => number; live: boolean }) {
  // Four times a second: the playheads move between the host's updates.
  const [now, setNow] = useState(() => stateAt);
  useEffect(() => {
    const tick = () => setNow(serverNow());
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [serverNow]);
  const elapsed = live ? Math.max(0, now - stateAt) / 1000 : 0;
  const onAir = djOnAir(stage);
  return (
    <div className="flex flex-col gap-2">
      {stage.set && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ListMusic className="h-3.5 w-3.5" /> Playing the set “{stage.set}”
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {(["A", "B"] as const).map((id) => (
          <Deck key={id} id={id} deck={stage.decks[id]} position={djDeckPosition(live ? stage.decks[id] : { ...stage.decks[id], playing: false }, elapsed)} onAir={onAir === id} gain={djDeckGain(stage, id)} />
        ))}
      </div>
      <div className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted" aria-label="Crossfader">
        <span style={{ color: ACCENT.A }}>A</span>
        <div className="relative h-1.5 flex-1 rounded-full bg-surface-raised">
          <span className="absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground" style={{ left: `${((stage.crossfader + 1) / 2) * 100}%` }} />
        </div>
        <span style={{ color: ACCENT.B }}>B</span>
      </div>
    </div>
  );
}
