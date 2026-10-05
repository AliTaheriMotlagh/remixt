// The DJ setups you can try in the simulator. Each is a generic version of
// a kind of real gear (no brands): what the players can do, how the mixer
// is laid out, and the look. The console reads a profile to decide which
// controls exist. Pure data, plus the saved choice.

import type { Curve } from "./djTypes";

export type GearId = "club" | "controller" | "turntables" | "touch";

export type PadMode = "hotcue" | "roll" | "sampler" | "jump";

export type GearProfile = {
  id: GearId;
  name: string;
  short: string;
  blurb: string;
  /** What you'd learn on it in the real world. */
  realWorld: string;
  player: "cdj" | "controller" | "turntable";
  sync: boolean;
  keyLock: boolean;
  hotCues: number;
  beatJump: boolean;
  slip: boolean;
  quantize: boolean;
  /** Performance pad modes (controllers). */
  padModes: PadMode[];
  /** Turntables: motor start/stop buttons and needle drop instead of CUE/SYNC. */
  turntable: boolean;
  stemKills: boolean;
  /** Jog starts in vinyl (scratch) mode. */
  vinylDefault: boolean;
  tempoRanges: number[];
  defaultRange: number;
  crossfaderCurve: Curve;
  /** Advanced panels (MIDI, booth routing, recorder) shown by default. */
  advanced: boolean;
  /** Platter look. */
  platter: "cdj" | "controller" | "vinyl";
};

export const GEAR: GearProfile[] = [
  {
    id: "club",
    name: "Club booth: 2 players + mixer",
    short: "Club booth",
    blurb: "Two club-standard media players with big jog wheels and a 2-channel club mixer: the setup in most clubs.",
    realWorld: "What you'll find in a club booth: players with hot cues, beat jump, master tempo and slip, into a separate mixer with isolator EQs and a headphone cue.",
    player: "cdj",
    sync: true,
    keyLock: true,
    hotCues: 8,
    beatJump: true,
    slip: true,
    quantize: true,
    padModes: ["hotcue"],
    turntable: false,
    stemKills: true,
    vinylDefault: false,
    tempoRanges: [6, 10, 16, 100],
    defaultRange: 10,
    crossfaderCurve: "blend",
    advanced: true,
    platter: "cdj",
  },
  {
    id: "controller",
    name: "All-in-one controller",
    short: "Controller",
    blurb: "Jogs, performance pads and the mixer in one unit, running DJ software: how most DJs start and many play.",
    realWorld: "Controllers put everything in one box. The pads switch modes: hot cues, loop rolls, a sampler and beat jumps.",
    player: "controller",
    sync: true,
    keyLock: true,
    hotCues: 8,
    beatJump: true,
    slip: true,
    quantize: true,
    padModes: ["hotcue", "roll", "sampler", "jump"],
    turntable: false,
    stemKills: true,
    vinylDefault: true,
    tempoRanges: [6, 10, 16, 100],
    defaultRange: 10,
    crossfaderCurve: "blend",
    advanced: true,
    platter: "controller",
  },
  {
    id: "turntables",
    name: "Turntables + battle mixer",
    short: "Turntables",
    blurb: "Two direct-drive turntables and a scratch mixer: no sync, no key lock, no hot cues. Your ears and hands do the work.",
    realWorld:
      "Vinyl DJing (or DVS, timecode records driving software). Beatmatch with the pitch fader and your hand on the record, start the motor on the beat, drop the needle where you want it, scratch with a sharp crossfader.",
    player: "turntable",
    sync: false,
    keyLock: false,
    hotCues: 0,
    beatJump: false,
    slip: false,
    quantize: false,
    padModes: [],
    turntable: true,
    stemKills: false,
    vinylDefault: true,
    tempoRanges: [8, 16],
    defaultRange: 8,
    crossfaderCurve: "cut",
    advanced: true,
    platter: "vinyl",
  },
  {
    id: "touch",
    name: "Phone / tablet touch layout",
    short: "Touch",
    blurb: "A layout made for fingers: big jog wheels and pads, the essentials up front, the rest a tap away.",
    realWorld: "Mobile DJ apps work like this: fewer controls at once, big targets. Good for practising transitions anywhere.",
    player: "controller",
    sync: true,
    keyLock: true,
    hotCues: 4,
    beatJump: true,
    slip: false,
    quantize: true,
    padModes: ["hotcue", "roll", "sampler"],
    turntable: false,
    stemKills: true,
    vinylDefault: false,
    tempoRanges: [10, 16, 100],
    defaultRange: 10,
    crossfaderCurve: "blend",
    advanced: false,
    platter: "controller",
  },
];

export function gearById(id: string | null | undefined): GearProfile {
  return GEAR.find((g) => g.id === id) ?? GEAR[0];
}

const GEAR_KEY = "remixt-dj-gear-v1";

export function loadGearChoice(): GearId | null {
  try {
    const v = globalThis.localStorage?.getItem(GEAR_KEY);
    return GEAR.some((g) => g.id === v) ? (v as GearId) : null;
  } catch {
    return null;
  }
}

export function saveGearChoice(id: GearId) {
  try {
    globalThis.localStorage?.setItem(GEAR_KEY, id);
  } catch {
    // Not remembered; the choice still holds for this visit.
  }
}

/** A sensible first choice: the touch layout on a small touch screen, else the club booth. */
export function defaultGear(): GearId {
  try {
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse) and (max-width: 700px)").matches) return "touch";
  } catch {
    // No matchMedia: fall through.
  }
  return "club";
}

/** The engine settings a gear implies (call after loading a setup, which resets the mixer). */
export function applyGear(
  engine: {
    setQuantize: (id: "A" | "B", on: boolean) => void;
    setKeyLock: (id: "A" | "B", on: boolean) => void;
    setVinyl: (id: "A" | "B", on: boolean) => void;
    setSlip: (id: "A" | "B", on: boolean) => void;
    setCurve: (c: Curve) => void;
    setTempoRange: (id: "A" | "B", r: number) => void;
    deckState: (id: "A" | "B") => { tempoRange: number };
  },
  gear: GearProfile,
  rules: { noQuantize?: boolean } = {}
) {
  for (const id of ["A", "B"] as const) {
    engine.setQuantize(id, gear.quantize && !rules.noQuantize);
    if (!gear.keyLock) engine.setKeyLock(id, false);
    if (!gear.slip) engine.setSlip(id, false);
    engine.setVinyl(id, gear.vinylDefault);
    const r = engine.deckState(id).tempoRange;
    if (!gear.tempoRanges.includes(r)) engine.setTempoRange(id, gear.tempoRanges.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), gear.defaultRange));
  }
  engine.setCurve(gear.crossfaderCurve);
}

// A tiny external store so React reads the saved gear without a hydration mismatch.
const gearListeners = new Set<() => void>();
let gearMemory: GearId | null = null;

export const gearStore = {
  subscribe(fn: () => void) {
    gearListeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key === GEAR_KEY || e.key === null) fn();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      gearListeners.delete(fn);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): GearId {
    return loadGearChoice() ?? gearMemory ?? defaultGear();
  },
  getServerSnapshot(): GearId {
    return "club";
  },
  set(id: GearId) {
    gearMemory = id;
    saveGearChoice(id);
    for (const l of gearListeners) l();
  },
};
