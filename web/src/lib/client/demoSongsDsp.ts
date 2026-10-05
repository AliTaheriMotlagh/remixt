// Procedural synthesis for the demo songs: drums, bass, chords and a sung
// lead, written straight into Float32Arrays. No Web Audio, no DOM, no
// recorded audio — the same input always gives the same samples (seeded
// noise), and it runs in Node, which is how the tests check it.

import {
  CHORD_INTERVALS,
  songBars,
  vocalPlan,
  type DemoSongDef,
  type DemoStem,
  type SongStyle,
} from "./demoSongDefs";

export const SAMPLE_RATE = 44100;
const SR = SAMPLE_RATE;

export type Stereo = { l: Float32Array; r: Float32Array };

const TAU = Math.PI * 2;
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (n: number, m: number) => ((n % m) + m) % m;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function songLength(def: DemoSongDef) {
  return Math.round(((songBars(def) * 4 * 60) / def.bpm) * SR);
}

function blank(def: DemoSongDef): Stereo {
  const n = songLength(def);
  return { l: new Float32Array(n), r: new Float32Array(n) };
}

type BarInfo = {
  section: number;
  name: string;
  energy: number;
  barInSection: number;
  sectionBars: number;
  firstBar: boolean;
  lastBar: boolean;
  lastSection: boolean;
};

function barTable(def: DemoSongDef): BarInfo[] {
  const out: BarInfo[] = [];
  def.sections.forEach((s, si) => {
    for (let b = 0; b < s.bars; b++) {
      out.push({
        section: si,
        name: s.name,
        energy: s.energy,
        barInSection: b,
        sectionBars: s.bars,
        firstBar: b === 0,
        lastBar: b === s.bars - 1,
        lastSection: si === def.sections.length - 1,
      });
    }
  });
  return out;
}

const gains = (pan: number) => {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)] as const;
};

// ---------------------------------------------------------------- drums

type DrumPattern = {
  kick: string;
  snare: string;
  clap?: string;
  rim?: string;
  hat: string;
  open?: string;
  swing: number;
};

const DRUM_PATTERNS: Record<SongStyle, DrumPattern> = {
  hiphop: { kick: "x.....x.x.x.....", snare: "....x.......x..o", hat: "x.o.x.o.x.o.x.o.", open: "..............o.", swing: 0.22 },
  house: { kick: "x...x...x...x...", snare: "", clap: "....x.......x...", hat: "xoxoxoxoxoxoxoxo", open: "..x...x...x...x.", swing: 0.02 },
  pop: { kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.o.x.o.x.o.x.o.", open: "..............x.", swing: 0 },
  reggae: { kick: "........x.......", snare: "", rim: "........x.......", hat: "x.o.x.o.x.o.x.o.", open: "......o.......o.", swing: 0.35 },
  trap: { kick: "x.....x...x.....", snare: "........x.......", clap: "........x.......", hat: "xoxoxoxoxoxoxoxo", open: "......x.........", swing: 0 },
  synth: { kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.o.x.o.x.o.x.o.", swing: 0 },
};

const vel = (c: string | undefined) => (c === "x" ? 1 : c === "o" ? 0.45 : 0);

type Writer = { L: Float32Array; R: Float32Array };

function addKick(w: Writer, start: number, v: number, style: SongStyle) {
  const decay = style === "hiphop" ? 0.2 : style === "trap" ? 0.12 : 0.15;
  const f1 = style === "house" ? 120 : 140;
  const n = Math.floor(0.55 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    ph += (TAU * (46 + f1 * Math.exp(-t / 0.026))) / SR;
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.0015);
    const click = i < 60 ? (1 - i / 60) * 0.35 * Math.sin(i * 1.7) : 0;
    const s = (Math.sin(ph) * env + click) * v;
    w.L[idx] += s;
    w.R[idx] += s;
  }
}

function addSnare(w: Writer, start: number, v: number, rng: () => number, style: SongStyle) {
  const n = Math.floor(0.35 * SR);
  let p1 = 0;
  let p2 = 0;
  const decay = style === "synth" ? 0.16 : 0.09;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    const noise = rng() * 2 - 1;
    const hp = noise - 1.4 * p1 + 0.4 * p2;
    p2 = p1;
    p1 = noise;
    const body = Math.sin(TAU * (190 - 40 * Math.min(1, t * 20)) * t) * Math.exp(-t / 0.055) * 0.55;
    const s = (hp * 0.45 * Math.exp(-t / decay) + body) * v;
    w.L[idx] += s;
    w.R[idx] += s;
  }
}

function addClap(w: Writer, start: number, v: number, rng: () => number) {
  const n = Math.floor(0.3 * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    lp += 0.45 * ((rng() * 2 - 1) - lp);
    const burst = t < 0.036 ? Math.exp(-(t % 0.011) / 0.003) * 0.7 : 0;
    const tail = Math.exp(-t / 0.09) * 0.45;
    const s = lp * (burst + tail) * 1.1 * v;
    w.L[idx] += s;
    w.R[idx] += s;
  }
}

function addHat(w: Writer, start: number, v: number, rng: () => number, open: boolean, pan: number) {
  const n = Math.floor((open ? 0.4 : 0.07) * SR);
  const [gl, gr] = gains(pan);
  let p1 = 0;
  let p2 = 0;
  const tau = open ? 0.11 : 0.017;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    const noise = rng() * 2 - 1;
    const hp = noise - 2 * p1 + p2;
    p2 = p1;
    p1 = noise;
    const s = hp * 0.22 * Math.exp(-t / tau) * v;
    w.L[idx] += s * gl;
    w.R[idx] += s * gr;
  }
}

function addRim(w: Writer, start: number, v: number, rng: () => number) {
  const n = Math.floor(0.06 * SR);
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    const s = (Math.sin(TAU * 1750 * t) * 0.5 + (rng() * 2 - 1) * 0.25) * Math.exp(-t / 0.01) * v;
    w.L[idx] += s;
    w.R[idx] += s;
  }
}

function addCrash(w: Writer, start: number, v: number, rng: () => number) {
  const n = Math.floor(1.8 * SR);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= w.L.length) break;
    const t = i / SR;
    const noise = rng() * 2 - 1;
    const hp = noise - 1.8 * p1 + 0.8 * p2;
    p2 = p1;
    p1 = noise;
    const s = hp * 0.16 * Math.exp(-t / 0.55) * v;
    w.L[idx] += s;
    w.R[idx] += s;
  }
}

function renderDrums(def: DemoSongDef): Stereo {
  const out = blank(def);
  const w: Writer = { L: out.l, R: out.r };
  const rng = mulberry32(def.seed ^ 0x1111);
  const pat = DRUM_PATTERNS[def.style];
  const barSec = 240 / def.bpm;
  const stepSec = barSec / 16;
  const bars = barTable(def);

  const at = (bar: number, step: number) => {
    let delay = 0;
    if (step % 4 === 2) delay = pat.swing * 2 * stepSec;
    else if (step % 2 === 1) delay = pat.swing * stepSec;
    return Math.round((bar * barSec + step * stepSec + delay) * SR);
  };

  bars.forEach((info, bar) => {
    const e = info.energy;
    const fill = info.lastBar && !info.lastSection && e >= 0.55 && info.sectionBars >= 4;
    if (info.firstBar && e >= 0.9 && bar > 0) addCrash(w, at(bar, 0), 0.8, rng);
    for (let step = 0; step < 16; step++) {
      const s = at(bar, step);
      const inFill = fill && step >= 12;
      // Hats: always, softer in quiet parts.
      const hv = vel(pat.hat[step]);
      if (hv > 0 && !inFill) {
        const pan = step % 4 === 0 ? -0.25 : 0.25;
        addHat(w, s, hv * (e < 0.45 ? 0.8 : 1), rng, false, pan);
        if (def.style === "trap" && step % 2 === 1 && info.barInSection % 2 === 1 && step >= 12 && e >= 0.6) {
          addHat(w, s + Math.round(stepSec * 0.5 * SR), hv * 0.7, rng, false, 0.3);
        }
      }
      if (e >= 0.7 && pat.open && vel(pat.open[step]) > 0 && !inFill) {
        addHat(w, s, vel(pat.open[step]), rng, true, 0.35);
      }
      // Kick: from a hint of the downbeat in the intro to the full pattern.
      const kv = vel(pat.kick[step]);
      if (e >= 0.45 ? kv > 0 : e >= 0.3 && step === 0 && bar % 2 === 0) {
        addKick(w, s, e >= 0.45 ? kv * (0.8 + 0.2 * e) : 0.7, def.style);
      }
      if (e >= 0.55 && !inFill) {
        if (vel(pat.snare[step]) > 0) addSnare(w, s, vel(pat.snare[step]), rng, def.style);
        if (pat.clap && vel(pat.clap[step]) > 0) addClap(w, s, vel(pat.clap[step]), rng);
        if (pat.rim && vel(pat.rim[step]) > 0) addRim(w, s, 0.9, rng);
      }
      if (inFill) addSnare(w, s, 0.45 + ((step - 12) / 3) * 0.55, rng, def.style);
    }
  });
  return out;
}

// ----------------------------------------------------------------- bass

type BassHit = { step: number; len: number; semis: number };

const BASS_PATTERNS: Record<SongStyle, BassHit[]> = {
  hiphop: [
    { step: 0, len: 6, semis: 0 },
    { step: 8, len: 4, semis: 0 },
    { step: 12, len: 3, semis: 7 },
  ],
  house: [2, 6, 10, 14].map((step) => ({ step, len: 2, semis: 0 })),
  pop: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, len: 2, semis: step === 6 || step === 14 ? 12 : 0 })),
  reggae: [
    { step: 0, len: 3, semis: 0 },
    { step: 5, len: 2, semis: 7 },
    { step: 8, len: 3, semis: 0 },
    { step: 13, len: 2, semis: 5 },
  ],
  trap: [
    { step: 0, len: 9, semis: 0 },
    { step: 10, len: 3, semis: 0 },
    { step: 14, len: 2, semis: -5 },
  ],
  synth: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, len: 2, semis: step % 4 === 2 ? 12 : 0 })),
};

function renderBass(def: DemoSongDef): Stereo {
  const out = blank(def);
  const barSec = 240 / def.bpm;
  const stepSec = barSec / 16;
  const bars = barTable(def);
  const pat = BASS_PATTERNS[def.style];
  const drive = def.style === "trap" ? 3 : def.style === "hiphop" ? 1.8 : 1.4;

  bars.forEach((info, bar) => {
    if (info.energy < 0.5) return;
    const chord = def.progression[bar % def.progression.length];
    const rootPc = mod(def.key.tonic + chord.root, 12);
    const base = 28 + mod(rootPc - 28, 12);
    for (const hit of pat) {
      const start = bar * barSec + hit.step * stepSec;
      const dur = hit.len * stepSec * (def.style === "trap" ? 1 : 0.92);
      const f0 = midiHz(base + hit.semis);
      const n = Math.floor((dur + 0.06) * SR);
      const s0 = Math.round(start * SR);
      let ph = 0;
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const idx = s0 + i;
        if (idx >= out.l.length) break;
        const t = i / SR;
        const slide = def.style === "trap" ? 1 + 0.45 * Math.exp(-t / 0.05) : 1;
        ph += (TAU * f0 * slide) / SR;
        let env = Math.min(1, t / 0.004);
        if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.06);
        env *= def.style === "hiphop" || def.style === "trap" ? Math.exp(-t / (dur * 1.6)) * 0.6 + 0.4 : 1;
        let x = Math.sin(ph) + 0.28 * Math.sin(2 * ph + 0.4);
        if (def.style === "pop" || def.style === "synth" || def.style === "house") {
          // A buzzy layer so it reads on small speakers, low-passed.
          const saw = 2 * (ph / TAU - Math.floor(ph / TAU)) - 1;
          lp += 0.09 * (saw - lp);
          x += lp * 0.7;
        }
        const s = Math.tanh(x * drive * env) * 0.6;
        out.l[idx] += s;
        out.r[idx] += s;
      }
    }
  });
  applyDuck(out, def);
  return out;
}

function applyDuck(s: Stereo, def: DemoSongDef) {
  const depth = def.style === "house" ? 0.6 : def.style === "pop" ? 0.32 : 0;
  if (depth === 0) return;
  const beat = 60 / def.bpm;
  for (let i = 0; i < s.l.length; i++) {
    const t = mod(i / SR, beat);
    const g = 1 - depth * Math.exp(-t / 0.11);
    s.l[i] *= g;
    s.r[i] *= g;
  }
}

// -------------------------------------------------------------- chords

type ToneOpts = {
  start: number;
  dur: number;
  midi: number;
  wave: "saw" | "sine" | "tri" | "organ" | "bell";
  gain: number;
  pan: number;
  detune?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  cutoff?: number;
  cutoffEnv?: number;
  cutoffTau?: number;
};

function polyBlep(t: number, dt: number) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function addTone(out: Stereo, o: ToneOpts) {
  const attack = o.attack ?? 0.005;
  const decay = o.decay ?? 0.4;
  const sustain = o.sustain ?? 0.6;
  const release = o.release ?? 0.12;
  const cutoff = o.cutoff ?? 4000;
  const cutoffEnv = o.cutoffEnv ?? 0;
  const cutoffTau = o.cutoffTau ?? 0.1;
  const freq = midiHz(o.midi + (o.detune ?? 0) / 100);
  const dt = freq / SR;
  const [gl, gr] = gains(o.pan);
  const s0 = Math.round(o.start * SR);
  const n = Math.floor((o.dur + release) * SR);
  let phase = (o.midi * 0.37 + o.pan * 0.11) % 1;
  if (phase < 0) phase += 1;
  let y1 = 0;
  let y2 = 0;
  let a = 0.1;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    if (idx >= out.l.length) break;
    const t = i / SR;
    if ((i & 15) === 0) {
      const fc = Math.min(18000, cutoff + cutoffEnv * Math.exp(-t / cutoffTau));
      a = 1 - Math.exp((-TAU * fc) / SR);
    }
    phase += dt;
    if (phase >= 1) phase -= 1;
    let v: number;
    switch (o.wave) {
      case "saw":
        v = 2 * phase - 1 - polyBlep(phase, dt);
        break;
      case "tri":
        v = 4 * Math.abs(phase - 0.5) - 1;
        break;
      case "organ": {
        const p = TAU * phase;
        v = Math.sin(p) + 0.55 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p) + 0.18 * Math.sin(4 * p);
        v *= 0.55;
        break;
      }
      case "bell": {
        const p = TAU * phase;
        v = Math.sin(p) + 0.45 * Math.sin(2.76 * p) * Math.exp(-t / 0.18) + 0.25 * Math.sin(5.4 * p) * Math.exp(-t / 0.08);
        v *= 0.7;
        break;
      }
      default:
        v = Math.sin(TAU * phase);
    }
    y1 += a * (v - y1);
    y2 += a * (y1 - y2);
    let env: number;
    if (t < attack) env = t / attack;
    else env = sustain + (1 - sustain) * Math.exp(-(t - attack) / decay);
    if (t > o.dur) env *= Math.max(0, 1 - (t - o.dur) / release);
    const s = y2 * env * o.gain;
    out.l[idx] += s * gl;
    out.r[idx] += s * gr;
  }
}

function chordMidis(def: DemoSongDef, bar: number) {
  const chord = def.progression[bar % def.progression.length];
  const rootPc = mod(def.key.tonic + chord.root, 12);
  const base = 48 + mod(rootPc - 48, 12);
  return CHORD_INTERVALS[chord.quality].map((i) => base + i);
}

function renderChords(def: DemoSongDef): Stereo {
  const out = blank(def);
  const barSec = 240 / def.bpm;
  const stepSec = barSec / 16;
  const bars = barTable(def);
  const spread = (k: number, n: number) => (n === 1 ? 0 : (k / (n - 1) - 0.5) * 0.7);

  const pad = (bar: number, gain: number, cutoff: number, attack = 0.25) => {
    const tones = chordMidis(def, bar);
    tones.forEach((m, k) => {
      for (const side of [-1, 1]) {
        addTone(out, {
          start: bar * barSec,
          dur: barSec * 0.98,
          midi: m,
          wave: "saw",
          gain: (gain / Math.sqrt(tones.length)) * 0.5,
          pan: side * 0.8 + spread(k, tones.length) * 0.2,
          detune: side * 7,
          attack,
          decay: 1,
          sustain: 0.85,
          release: 0.45,
          cutoff,
        });
      }
    });
  };

  bars.forEach((info, bar) => {
    const e = info.energy;
    const tones = chordMidis(def, bar);
    const at = (step: number) => bar * barSec + step * stepSec;
    switch (def.style) {
      case "hiphop":
        for (const [step, len] of [[0, 6], [8, e >= 0.6 ? 5 : 6], ...(e >= 0.8 ? [[14, 2]] : [])] as number[][]) {
          tones.forEach((m, k) =>
            addTone(out, {
              start: at(step) + k * 0.006,
              dur: len * stepSec,
              midi: m,
              wave: "tri",
              gain: 0.34,
              pan: spread(k, tones.length),
              attack: 0.006,
              decay: 0.5,
              sustain: 0.25,
              release: 0.18,
              cutoff: 1500,
              cutoffEnv: 2500,
              cutoffTau: 0.12,
            })
          );
        }
        break;
      case "house":
        if (e < 0.55) pad(bar, 0.7, 1100, 0.15);
        else {
          pad(bar, 0.35, 1400);
          for (const step of [3, 6, 11, 14]) {
            tones.forEach((m, k) =>
              addTone(out, {
                start: at(step),
                dur: stepSec * 1.2,
                midi: m + 12,
                wave: "saw",
                gain: 0.18,
                pan: spread(k, tones.length),
                attack: 0.003,
                decay: 0.08,
                sustain: 0.1,
                release: 0.06,
                cutoff: 900,
                cutoffEnv: 3200,
                cutoffTau: 0.07,
              })
            );
          }
        }
        break;
      case "pop":
        pad(bar, 0.8, 2200);
        if (e >= 0.55) {
          const steps = e >= 0.9 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 6, 10];
          steps.forEach((step, j) =>
            addTone(out, {
              start: at(step),
              dur: stepSec * 1.7,
              midi: tones[j % tones.length] + 12,
              wave: "tri",
              gain: 0.3,
              pan: j % 2 ? 0.4 : -0.4,
              attack: 0.003,
              decay: 0.12,
              sustain: 0.2,
              release: 0.1,
              cutoff: 2500,
              cutoffEnv: 2000,
              cutoffTau: 0.08,
            })
          );
        }
        break;
      case "reggae":
        for (const step of [2, 6, 10, 14]) {
          tones.forEach((m, k) =>
            addTone(out, {
              start: at(step),
              dur: stepSec * 1.6,
              midi: m + 12,
              wave: "organ",
              gain: 0.2,
              pan: spread(k, tones.length) * 0.8,
              attack: 0.004,
              decay: 0.2,
              sustain: 0.55,
              release: 0.04,
              cutoff: 3500,
            })
          );
        }
        if (e >= 0.8) {
          tones.forEach((m, k) =>
            addTone(out, {
              start: at(0),
              dur: barSec * 0.95,
              midi: m,
              wave: "organ",
              gain: 0.08,
              pan: spread(k, tones.length),
              attack: 0.05,
              sustain: 0.9,
              release: 0.2,
              cutoff: 1800,
            })
          );
        }
        break;
      case "trap":
        pad(bar, 0.75, 750, 0.35);
        if (e >= 0.5) {
          [0, 3, 6, 10, 12].forEach((step, j) =>
            addTone(out, {
              start: at(step),
              dur: stepSec * 3,
              midi: tones[(j + bar) % tones.length] + 24,
              wave: "bell",
              gain: 0.2,
              pan: j % 2 ? 0.55 : -0.55,
              attack: 0.002,
              decay: 0.25,
              sustain: 0.05,
              release: 0.2,
              cutoff: 6000,
            })
          );
        }
        break;
      case "synth": {
        pad(bar, 0.65, 1300, 0.12);
        if (e >= 0.5) {
          const pattern = [0, 1, 2, 1];
          for (let step = 0; step < 16; step += e >= 0.9 ? 1 : 2) {
            const k = pattern[(step >> (e >= 0.9 ? 0 : 1)) % 4] % tones.length;
            addTone(out, {
              start: at(step),
              dur: stepSec * 1.4,
              midi: tones[k] + 24,
              wave: "saw",
              gain: 0.14,
              pan: step % 4 === 0 ? -0.3 : 0.3,
              attack: 0.002,
              decay: 0.1,
              sustain: 0.1,
              release: 0.08,
              cutoff: 600,
              cutoffEnv: 3500,
              cutoffTau: 0.09,
            });
          }
        }
        break;
      }
    }
  });
  applyDuck(out, def);
  return out;
}

// ---------------------------------------------------------------- vocal

/** [startBeat, lengthBeats, pentatonic index] — every phrase ends a beat before the bar line. */
export const PHRASE_TEMPLATES: [number, number, number][][] = [
  [[0, 1.5, 5], [1.5, 0.5, 4], [2, 2, 3], [4.5, 1, 4], [5.5, 1.5, 2]],
  [[0.5, 1, 3], [1.5, 1, 4], [2.5, 1.5, 5], [4, 3, 6]],
  [[0, 3, 2], [3, 1, 3], [4, 1, 4], [5, 2, 3]],
  [[0, 4, 5], [4, 2.5, 4]],
  [[0, 1, 3], [1, 1, 2], [2, 1, 3], [3, 1, 5], [4, 3, 4]],
];

const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];

type Vowel = [number, number, number];
const VOWELS: Record<string, Vowel> = {
  oo: [320, 850, 2250],
  oh: [470, 840, 2800],
  ah: [800, 1220, 2800],
  eh: [600, 1850, 2550],
};
const VOWEL_CYCLE = ["oo", "ah", "oh", "ah", "oo", "eh"];
const FORMANT_Q = [6, 10, 14];
const FORMANT_GAIN = [1, 0.62, 0.34];

type SungNote = { t0: number; t1: number; midi: number; v1: Vowel; v2: Vowel };

function renderVocal(def: DemoSongDef): Stereo {
  const out = blank(def);
  const rng = mulberry32(def.seed ^ 0x7777);
  const barSec = 240 / def.bpm;
  const beatSec = 60 / def.bpm;
  const scale = def.key.mode === "minor" ? MINOR_PENT : MAJOR_PENT;
  const target = def.vocalCentre - 3;
  const base = target - mod(target - def.key.tonic, 12);
  const pitch = (idx: number) => base + 12 * Math.floor(idx / 5) + scale[mod(idx, 5)];
  const bars = barTable(def);
  let noteCounter = 0;

  const kA = 1 - Math.exp(-1 / (0.022 * SR));
  const kR = 1 - Math.exp(-1 / (0.07 * SR));
  const kG = 1 - Math.exp(-1 / (0.03 * SR));
  const kF = 1 - Math.exp(-1 / (0.05 * SR));

  for (const phrase of vocalPlan(def)) {
    const info = bars[phrase.bar];
    const phraseStart = phrase.bar * barSec;
    const notes: SungNote[] = PHRASE_TEMPLATES[phrase.template].map(([beat, len, idx]) => {
      const n = noteCounter++;
      const v1 = VOWELS[VOWEL_CYCLE[(n + def.seed) % VOWEL_CYCLE.length]];
      const v2 = len >= 2 ? VOWELS[VOWEL_CYCLE[(n + def.seed + 1) % VOWEL_CYCLE.length]] : v1;
      return { t0: phraseStart + beat * beatSec, t1: phraseStart + (beat + len) * beatSec - 0.025, midi: pitch(idx), v1, v2 };
    });
    const level = (info.name === "chorus" ? 1 : 0.82) * (0.8 + 0.2 * info.energy);

    // An audible breath just before the phrase.
    const b0 = Math.round((notes[0].t0 - 0.2) * SR);
    const b1 = Math.round((notes[0].t0 - 0.03) * SR);
    let bp1 = 0;
    for (let i = b0; i < b1; i++) {
      if (i < 0 || i >= out.l.length) continue;
      const u = (i - b0) / (b1 - b0);
      const noise = rng() * 2 - 1;
      bp1 += 0.5 * (noise - bp1);
      const s = (noise - bp1) * Math.sin(Math.PI * u) * 0.035 * level;
      out.l[i] += s;
      out.r[i] += s;
    }

    const s0 = Math.max(0, Math.round((notes[0].t0 - 0.02) * SR));
    const s1 = Math.min(out.l.length, Math.round((notes[notes.length - 1].t1 + 0.4) * SR));
    let phase = 0;
    let f = midiHz(notes[0].midi);
    let amp = 0;
    let drift = 0;
    const F: Vowel = [...notes[0].v1] as Vowel;
    const z = [0, 0, 0, 0, 0, 0];
    const coefB = [0, 0, 0];
    const coefA1 = [0, 0, 0];
    const coefA2 = [0, 0, 0];
    let k = -1;
    const vphase = rng() * TAU;

    for (let i = s0; i < s1; i++) {
      const t = i / SR;
      while (k + 1 < notes.length && t >= notes[k + 1].t0) k++;
      const cur = notes[Math.max(0, k)];
      const active = k >= 0 && t < cur.t1;
      amp += ((active ? 1 : 0) - amp) * (active ? kA : kR);
      f += (midiHz(cur.midi) - f) * kG;
      const age = t - cur.t0;
      const depth = 0.012 * Math.min(1, Math.max(0, (age - 0.15) / 0.35));
      drift += (rng() * 2 - 1) * 0.00006 - drift * 0.0006;
      const hz = f * (1 + depth * Math.sin(TAU * 5.4 * t + vphase) + drift);
      const dt = hz / SR;
      phase += dt;
      if (phase >= 1) phase -= 1;
      const saw = 2 * phase - 1 - polyBlep(phase, dt);
      const x = saw * 0.8 + (rng() * 2 - 1) * 0.05;

      const long = cur.v2 !== cur.v1 && (t - cur.t0) / (cur.t1 - cur.t0) > 0.55;
      const tv = long ? cur.v2 : cur.v1;
      for (let j = 0; j < 3; j++) F[j] += (tv[j] - F[j]) * kF;
      if (((i - s0) & 15) === 0) {
        for (let j = 0; j < 3; j++) {
          const w0 = (TAU * F[j]) / SR;
          const alpha = Math.sin(w0) / (2 * FORMANT_Q[j]);
          const a0 = 1 + alpha;
          coefB[j] = alpha / a0;
          coefA1[j] = (-2 * Math.cos(w0)) / a0;
          coefA2[j] = (1 - alpha) / a0;
        }
      }
      let y = 0;
      for (let j = 0; j < 3; j++) {
        const b = coefB[j];
        const out0 = b * x + z[j * 2];
        z[j * 2] = -coefA1[j] * out0 + z[j * 2 + 1];
        z[j * 2 + 1] = -b * x - coefA2[j] * out0;
        y += out0 * FORMANT_GAIN[j];
      }
      // Fixed brightness peak and the soft attack of the voice.
      const s = y * amp * level * 0.9;
      out.l[i] += s;
      out.r[i] += s;
    }
  }
  addReverb(out, 0.2, 0.74);
  return out;
}

function combBank(src: Float32Array, delays: number[], feedback: number, damp: number) {
  const n = src.length;
  const out = new Float32Array(n);
  for (const d of delays) {
    const buf = new Float32Array(d);
    let p = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[p];
      lp += damp * (y - lp);
      buf[p] = src[i] + lp * feedback;
      p = p + 1 === d ? 0 : p + 1;
      out[i] += y * 0.25;
    }
  }
  return out;
}

function allpass(x: Float32Array, d: number, g: number) {
  const buf = new Float32Array(d);
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const b = buf[p];
    const v = x[i] + b * g;
    buf[p] = v;
    x[i] = b - v * g;
    p = p + 1 === d ? 0 : p + 1;
  }
}

/** A small room: four damped combs and two all-passes, a little different each side. */
function addReverb(s: Stereo, wet: number, feedback: number) {
  const make = (src: Float32Array, spread: number) => {
    const r = combBank(src, [1687 + spread, 1601 + spread, 2053 + spread, 2251 + spread], feedback, 0.35);
    allpass(r, 225 + spread, 0.5);
    allpass(r, 556 + spread, 0.5);
    return r;
  };
  const wl = make(s.l, 0);
  const wr = make(s.r, 41);
  for (let i = 0; i < s.l.length; i++) {
    s.l[i] += wl[i] * wet;
    s.r[i] += wr[i] * wet;
  }
}

// --------------------------------------------------------------- mixing

const STEM_SEED: Record<DemoStem, (def: DemoSongDef) => Stereo> = {
  drums: renderDrums,
  bass: renderBass,
  chords: renderChords,
  vocal: renderVocal,
};

/** One stem, as synthesised (levels are balanced afterwards by balanceStems). */
export function renderRawStem(def: DemoSongDef, stem: DemoStem): Stereo {
  return STEM_SEED[stem](def);
}

const TARGET_RMS: Record<DemoStem, number> = { drums: 0.15, bass: 0.17, chords: 0.1, vocal: 0.14 };
const CEILING: Record<DemoStem, number> = { drums: 0.6, bass: 0.55, chords: 0.5, vocal: 0.6 };

function activeRms(s: Stereo) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < s.l.length; i++) {
    const v = s.l[i] * s.l[i] + s.r[i] * s.r[i];
    if (v > 1e-7) {
      sum += v / 2;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 1;
}

/**
 * Sets each stem's level, tames its peaks, then scales all four by one
 * factor so they sum to a mix peaking at 0.9: the stems add up to the full
 * song exactly, and nothing clips.
 */
export function balanceStems(def: DemoSongDef, raw: Record<DemoStem, Stereo>): Record<DemoStem, Stereo> {
  // In place: the raw arrays become the balanced ones, saving a copy of every stem.
  const names = ["drums", "bass", "chords", "vocal"] as DemoStem[];
  const n = songLength(def);
  const fade = Math.round(0.04 * SR);
  for (const name of names) {
    const src = raw[name];
    const k = TARGET_RMS[name] / activeRms(src);
    const ceil = CEILING[name];
    for (let i = 0; i < n; i++) {
      const end = i > n - fade ? (n - i) / fade : 1;
      src.l[i] = Math.tanh((src.l[i] * k) / ceil) * ceil * end;
      src.r[i] = Math.tanh((src.r[i] * k) / ceil) * ceil * end;
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(raw.drums.l[i] + raw.bass.l[i] + raw.chords.l[i] + raw.vocal.l[i]);
    const b = Math.abs(raw.drums.r[i] + raw.bass.r[i] + raw.chords.r[i] + raw.vocal.r[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const g = 0.9 / peak;
  for (const name of names) {
    for (let i = 0; i < n; i++) {
      raw[name].l[i] *= g;
      raw[name].r[i] *= g;
    }
  }
  return raw;
}

/** Everything at once (the tests; the app renders stem by stem to keep the page responsive). */
export function renderDemoChannels(def: DemoSongDef): Record<DemoStem, Stereo> {
  return balanceStems(def, {
    drums: renderDrums(def),
    bass: renderBass(def),
    chords: renderChords(def),
    vocal: renderVocal(def),
  });
}

export function sumStereo(parts: Stereo[]): Stereo {
  const n = parts[0].l.length;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (const p of parts) {
    for (let i = 0; i < n; i++) {
      l[i] += p.l[i];
      r[i] += p.r[i];
    }
  }
  return { l, r };
}
