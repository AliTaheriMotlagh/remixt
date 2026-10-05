// MIDI controllers, best effort: any controller's knobs, faders, buttons and
// jog wheels can be mapped to the simulator by "learn": pick an action,
// move the control, done. Mappings are saved in localStorage. The parsing
// and value maths are pure (tested); MidiLink wraps Web MIDI.

import type { DjEngine } from "./djEngine";
import type { DeckId, EqBand } from "./djTypes";
import { EQ_MAX_DB, EQ_MIN_DB } from "./djTypes";

export type MidiMsg = { kind: "note" | "cc"; channel: number; number: number; value: number; on: boolean };

/** A raw MIDI message to a note or CC event (note-off and note-on with velocity 0 count as release). */
export function parseMidi(data: ArrayLike<number>): MidiMsg | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0x90 || status === 0x80) return { kind: "note", channel, number: data[1], value: data[2], on: status === 0x90 && data[2] > 0 };
  if (status === 0xb0) return { kind: "cc", channel, number: data[1], value: data[2], on: data[2] > 0 };
  return null;
}

/** Stable key of a physical control. */
export const controlKey = (m: Pick<MidiMsg, "kind" | "channel" | "number">) => `${m.kind}:${m.channel}:${m.number}`;

/**
 * A relative encoder's value (jog wheels) as a signed step: the common
 * "two's complement" style, 1…63 clockwise, 65…127 anticlockwise (127 = −1).
 */
export function relativeStep(value: number) {
  if (value === 64 || value === 0) return 0;
  return value < 64 ? value : value - 128;
}

export type MidiAction =
  | `play-${DeckId}`
  | `cue-${DeckId}`
  | `sync-${DeckId}`
  | `volume-${DeckId}`
  | `tempo-${DeckId}`
  | `jog-${DeckId}`
  | `filter-${DeckId}`
  | `eq-${EqBand}-${DeckId}`
  | `pfl-${DeckId}`
  | `hotcue${1 | 2 | 3 | 4}-${DeckId}`
  | "crossfader"
  | "master";

export const MIDI_ACTIONS: { id: MidiAction; label: string }[] = (() => {
  const out: { id: MidiAction; label: string }[] = [];
  for (const d of ["A", "B"] as DeckId[]) {
    out.push(
      { id: `play-${d}`, label: `Play ${d}` },
      { id: `cue-${d}`, label: `Cue ${d}` },
      { id: `sync-${d}`, label: `Sync ${d}` },
      { id: `jog-${d}`, label: `Jog ${d}` },
      { id: `tempo-${d}`, label: `Tempo ${d}` },
      { id: `volume-${d}`, label: `Fader ${d}` },
      { id: `eq-high-${d}`, label: `High ${d}` },
      { id: `eq-mid-${d}`, label: `Mid ${d}` },
      { id: `eq-low-${d}`, label: `Low ${d}` },
      { id: `filter-${d}`, label: `Filter ${d}` },
      { id: `pfl-${d}`, label: `Headphone cue ${d}` },
      { id: `hotcue1-${d}`, label: `Hot cue 1 ${d}` },
      { id: `hotcue2-${d}`, label: `Hot cue 2 ${d}` },
      { id: `hotcue3-${d}`, label: `Hot cue 3 ${d}` },
      { id: `hotcue4-${d}`, label: `Hot cue 4 ${d}` }
    );
  }
  out.push({ id: "crossfader", label: "Crossfader" }, { id: "master", label: "Master" });
  return out;
})();

export type MidiMap = Record<string, MidiAction>;

const MAP_KEY = "remixt-dj-midi-v1";

export function loadMidiMap(): MidiMap {
  try {
    const raw = globalThis.localStorage?.getItem(MAP_KEY);
    const data = raw ? (JSON.parse(raw) as MidiMap) : {};
    const ok = new Set(MIDI_ACTIONS.map((a) => a.id));
    return Object.fromEntries(Object.entries(data).filter(([, v]) => ok.has(v)));
  } catch {
    return {};
  }
}

export function saveMidiMap(map: MidiMap) {
  try {
    globalThis.localStorage?.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // Not saved; it works for this visit.
  }
}

/** One mapping per action: learning a control for an action replaces its old control. */
export function learn(map: MidiMap, key: string, action: MidiAction): MidiMap {
  const next: MidiMap = {};
  for (const [k, a] of Object.entries(map)) if (a !== action && k !== key) next[k] = a;
  next[key] = action;
  return next;
}

/** Turns a mapped message into engine calls. */
export function applyMidi(engine: DjEngine, action: MidiAction, m: MidiMsg) {
  const v = m.value / 127;
  const deck = (action.slice(-1) as DeckId) === "B" ? "B" : "A";
  const press = m.kind === "note" ? m.on : m.value > 63;
  if (action === "crossfader") return engine.setCrossfader(v * 2 - 1);
  if (action === "master") return engine.setMaster(v);
  const base = action.replace(/-[AB]$/, "");
  switch (base) {
    case "play":
      if (press) engine.togglePlay(deck);
      return;
    case "cue":
      return press ? engine.cueDown(deck) : engine.cueUp(deck);
    case "sync":
      if (press) engine.sync(deck);
      return;
    case "pfl":
      if (press) engine.setPfl(deck, !engine.deckState(deck).pfl);
      return;
    case "volume":
      return engine.setVolume(deck, v);
    case "filter":
      return engine.setFilter(deck, Math.abs(v * 2 - 1) < 0.04 ? 0 : v * 2 - 1);
    case "tempo": {
      const range = engine.deckState(deck).tempoRange;
      // Down is faster, as on the hardware.
      return engine.setTempoPct(deck, Math.abs(v - 0.5) < 0.012 ? 0 : (v * 2 - 1) * range);
    }
    case "jog": {
      const step = m.kind === "cc" ? relativeStep(m.value) : 0;
      const st = engine.deckState(deck);
      if (st.scratching || !st.playing) {
        engine.scratchMove(deck, step * 0.012);
        return;
      }
      engine.setBend(deck, Math.max(-1, Math.min(1, step / 6)));
      return;
    }
    default:
      if (base.startsWith("eq-")) {
        const band = base.slice(3) as EqBand;
        // Centre is 0 dB; below centre cuts to the full kill, above boosts.
        const db = v >= 0.5 ? (v - 0.5) * 2 * EQ_MAX_DB : (0.5 - v) * 2 * EQ_MIN_DB;
        return engine.setEq(deck, band, Math.abs(v - 0.5) < 0.012 ? 0 : db);
      }
      if (base.startsWith("hotcue")) {
        const i = Number(base.slice(6)) - 1;
        if (m.kind === "note" ? m.on : press) engine.hotCueDown(deck, i);
        else engine.hotCueUp(deck, i);
      }
  }
}

/** Web MIDI access: every input, one listener. */
export class MidiLink {
  private access: MIDIAccess | null = null;
  private handler: ((m: MidiMsg) => void) | null = null;
  inputs: string[] = [];
  onChange: (() => void) | null = null;

  static supported() {
    return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  }

  async open(handler: (m: MidiMsg) => void) {
    this.handler = handler;
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.bind();
    this.access.onstatechange = () => {
      this.bind();
      this.onChange?.();
    };
  }

  private bind() {
    if (!this.access) return;
    this.inputs = [];
    this.access.inputs.forEach((input) => {
      this.inputs.push(input.name ?? "MIDI input");
      input.onmidimessage = (e) => {
        if (!e.data) return;
        const m = parseMidi(e.data);
        if (m) this.handler?.(m);
      };
    });
  }

  close() {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.handler = null;
  }
}
