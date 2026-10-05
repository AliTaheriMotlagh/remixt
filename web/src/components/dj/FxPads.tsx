"use client";

import type { DjEngine } from "@/lib/client/dj/djEngine";
import type { DeckId } from "@/lib/client/dj/djTypes";
import { HoldButton } from "./ui";

const PAD = "min-h-14 text-xs sm:text-sm px-1";

function TapPad({ label, onClick, hint, tone, dj }: { label: string; onClick: () => void; hint: string; tone: string; dj?: string }) {
  return (
    <button
      type="button"
      data-dj={dj}
      onClick={onClick}
      title={hint}
      aria-label={`${label}: ${hint}`}
      className={`${PAD} select-none rounded-lg font-bold text-black transition-transform active:scale-95 ${tone}`}
    >
      {label}
    </button>
  );
}

/** Master FX and per-deck performance pads (brake, spin-back, roll). */
export default function FxPads({ engine }: { engine: DjEngine }) {
  return (
    <section aria-label="FX and sampler pads" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide">FX &amp; pads</h3>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        <TapPad dj="FX-echo" label="Echo out" hint="The dry music drops away and an echo rings out (key 1)" onClick={() => engine.echoOut()} tone="bg-beat" />
        <HoldButton label="Echo: hold for an echo on the music" title="Hold for an echo" onDown={() => engine.echoHold(true)} onUp={() => engine.echoHold(false)} className={PAD} litClass="bg-beat/70 text-black" idleClass="bg-beat/40 text-foreground">
          Echo
        </HoldButton>
        <TapPad label="Reverb" hint="A burst of reverb on the master (key 2)" onClick={() => engine.reverbThrow()} tone="bg-other" />
        <HoldButton label="Siren: hold" title="Siren while held (key 3)" onDown={() => engine.sirenOn()} onUp={() => engine.sirenOff()} className={PAD} litClass="bg-vocals text-white" idleClass="bg-vocals/60 text-black">
          Siren
        </HoldButton>
        <TapPad label="Horn" hint="Air horn (key 4)" onClick={() => engine.airHorn()} tone="bg-drums" />
      </div>
      {(["A", "B"] as DeckId[]).map((id) => (
        <div key={id} className="grid grid-cols-[2rem_repeat(4,1fr)] items-center gap-1.5">
          <span className="text-center text-xs font-black text-muted">{id}</span>
          <TapPad label="Brake" hint={`Deck ${id} slows to a stop like a turntable`} onClick={() => engine.brake(id)} tone="bg-bass" />
          <TapPad label="Spin back" hint={`Deck ${id} rewinds quickly and carries on`} onClick={() => engine.spinBack(id)} tone="bg-bass" />
          <HoldButton label={`Roll half beat on deck ${id}: hold`} title="Slip roll ½ beat: loops while held, then rejoins the track" onDown={() => engine.rollStart(id, 0.5)} onUp={() => engine.rollEnd(id)} className={PAD} litClass="bg-brand text-white" idleClass="bg-brand/30">
            Roll ½
          </HoldButton>
          <HoldButton label={`Roll quarter beat on deck ${id}: hold`} title="Slip roll ¼ beat: a fast stutter while held" onDown={() => engine.rollStart(id, 0.25)} onUp={() => engine.rollEnd(id)} className={PAD} litClass="bg-brand text-white" idleClass="bg-brand/30">
            Roll ¼
          </HoldButton>
        </div>
      ))}
    </section>
  );
}
