"use client";

import { Headphones } from "lucide-react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import type { Curve, DeckId, DjSnapshot, EqBand } from "@/lib/client/dj/djTypes";
import { EQ_MAX_DB, EQ_MIN_DB } from "@/lib/client/dj/djTypes";
import { LevelMeter, Slider, Toggle } from "./ui";

const BANDS: { band: EqBand; label: string }[] = [
  { band: "high", label: "High" },
  { band: "mid", label: "Mid" },
  { band: "low", label: "Low" },
];

const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)} dB`;

export function ChannelStrip({ engine, id, ui, accent }: { engine: DjEngine; id: DeckId; ui: DjSnapshot; accent: string }) {
  const deck = ui.decks[id];
  return (
    <section aria-label={`Channel ${id}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
      <h3 className="text-xs font-bold uppercase tracking-wide">Channel {id}</h3>
      <div className="flex flex-col gap-1.5">
        {BANDS.map(({ band, label }) => (
          <div key={band} className="flex items-end gap-1.5">
            <Slider
              label={`${label} EQ`}
              value={deck.kill[band] ? EQ_MIN_DB : deck.eq[band]}
              min={EQ_MIN_DB}
              max={EQ_MAX_DB}
              step={0.5}
              center={0}
              onChange={(v) => {
                if (deck.kill[band]) engine.setKill(id, band, false);
                engine.setEq(id, band, v);
              }}
              format={(v) => (deck.kill[band] ? "KILL" : db(v))}
              className="flex-1"
            />
            <Toggle
              pressed={deck.kill[band]}
              onClick={() => engine.setKill(id, band, !deck.kill[band])}
              label={`Kill ${label.toLowerCase()} on channel ${id}`}
              litClass="bg-danger text-white"
              className="mb-px min-h-9 w-11"
              title={`Kill ${label.toLowerCase()} frequencies`}
            >
              KILL
            </Toggle>
          </div>
        ))}
      </div>
      <Slider
        label="Filter (LP ← → HP)"
        value={deck.filter}
        min={-1}
        max={1}
        step={0.01}
        center={0}
        onChange={(v) => engine.setFilter(id, Math.abs(v) < 0.04 ? 0 : v)}
        format={(v) => (Math.abs(v) < 0.04 ? "off" : v < 0 ? `LP ${Math.round(-v * 100)}%` : `HP ${Math.round(v * 100)}%`)}
        accent="accent-beat"
      />
      <div className="flex items-end gap-3">
        <Slider label="Volume" value={deck.volume} min={0} max={1} step={0.01} onChange={(v) => engine.setVolume(id, v)} format={(v) => `${Math.round(v * 100)}%`} className="flex-1" accent="accent-success" />
        <LevelMeter label={`Channel ${id} level`} read={() => engine.deckState(id).level} className="h-12 w-3" />
      </div>
      <Toggle
        pressed={deck.pfl}
        onClick={() => engine.setPfl(id, !deck.pfl)}
        label={`Headphone cue for channel ${id}`}
        title="PFL: hear this channel before its fader. With one output, it's mixed quietly into the speakers."
        litClass="bg-drums text-black"
        className="flex min-h-9 items-center justify-center gap-1.5"
      >
        <Headphones /> CUE (PFL)
      </Toggle>
    </section>
  );
}

const CURVES: { id: Curve; label: string; hint: string }[] = [
  { id: "blend", label: "Blend", hint: "Smooth equal-power curve" },
  { id: "linear", label: "Linear", hint: "Straight line" },
  { id: "cut", label: "Cut", hint: "Both decks full until the edges: for quick cuts" },
];

export function MasterSection({ engine, ui }: { engine: DjEngine; ui: DjSnapshot }) {
  return (
    <section aria-label="Crossfader and master" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
      <div>
        <div className="mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span style={{ color: "var(--beat)" }}>A</span>
          <span>Crossfader</span>
          <span style={{ color: "var(--vocals)" }}>B</span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={ui.mix.crossfader}
          aria-label="Crossfader"
          aria-valuetext={ui.mix.crossfader < -0.05 ? `towards A ${Math.round(-ui.mix.crossfader * 100)}%` : ui.mix.crossfader > 0.05 ? `towards B ${Math.round(ui.mix.crossfader * 100)}%` : "centre"}
          onChange={(e) => engine.setCrossfader(Number(e.target.value))}
          onDoubleClick={() => engine.setCrossfader(0)}
          className="h-8 w-full accent-brand"
        />
        <div className="mt-1 flex gap-1" role="group" aria-label="Crossfader curve">
          {CURVES.map((c) => (
            <Toggle key={c.id} pressed={ui.mix.curve === c.id} onClick={() => engine.setCurve(c.id)} label={`Crossfader curve: ${c.label}`} title={c.hint} className="min-h-8 flex-1">
              {c.label}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-3">
        <Slider label="Master" value={ui.mix.master} min={0} max={1} step={0.01} onChange={(v) => engine.setMaster(v)} format={(v) => `${Math.round(v * 100)}%`} className="flex-1" />
        <LevelMeter label="Master level" read={() => engine.levels().master} className="h-12 w-3" />
      </div>
    </section>
  );
}
