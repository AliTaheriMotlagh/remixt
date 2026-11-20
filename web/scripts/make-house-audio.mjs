// Remixt's own sounds for its audio ad spots, made from nothing (no samples,
// no voices, nothing anyone else owns): `node scripts/make-house-audio.mjs`
// writes public/ads/remixt-radio-id.mp3 (the station ID played in a radio
// break no paying ad takes) and public/ads/remixt-sting.mp3 (the short one
// before a remix, only when the owner turns that on).
//
// The sound: a filtered-noise riser, an impact (kick + sub drop) on the
// brand chord (F minor 9, saw pads), then the three-note "re-mix-t" motif on
// a bell, echoed on the beat (3/16 at 120 BPM) into a small reverb. Levelled
// to about −16 LUFS-ish RMS with peaks under −1 dBFS, like the music it sits
// between (the radio's songs are mastered near −14).
//
// Deterministic: the same files every run (seeded noise).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createMp3Encoder } from "wasm-media-encoders";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SR = 44_100;
const BPM = 120;
const BEAT = 60 / BPM;

let seed = 0x5eed;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 31 - 1;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function buffer(seconds) {
  return [new Float32Array(Math.ceil(seconds * SR)), new Float32Array(Math.ceil(seconds * SR))];
}

/** One-pole low-pass, cutoff per sample. */
function lowpass(x, cutoff) {
  let y = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const c = typeof cutoff === "function" ? cutoff(i / SR) : cutoff;
    const a = 1 - Math.exp((-2 * Math.PI * c) / SR);
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

function addAt([l, r], mono, at, gain = 1, pan = 0) {
  const start = Math.round(at * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < mono.length && start + i < l.length; i++) {
    l[start + i] += mono[i] * gl;
    r[start + i] += mono[i] * gr;
  }
}

/** A noise swell that opens up (the "whoosh" into the hit). */
function riser(seconds) {
  const n = Math.round(seconds * SR);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = noise();
  const shaped = lowpass(raw, (t) => 300 + 9000 * (t / seconds) ** 2);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    shaped[i] *= t ** 2.2 * 0.9;
  }
  return shaped;
}

/** Kick with a falling pitch, plus a sub that drops under it. */
function impact() {
  const n = Math.round(1.6 * SR);
  const out = new Float32Array(n);
  let phase = 0;
  let sub = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 45 + 110 * Math.exp(-t * 28);
    phase += (2 * Math.PI * f) / SR;
    const kick = Math.sin(phase) * Math.exp(-t * 7);
    sub += (2 * Math.PI * (55 - 15 * Math.min(1, t / 1.2))) / SR;
    const subTone = Math.sin(sub) * Math.exp(-t * 2.2) * 0.55;
    const click = t < 0.004 ? noise() * (1 - t / 0.004) * 0.5 : 0;
    out[i] = Math.tanh(1.6 * (kick + subTone + click)) * 0.9;
  }
  return out;
}

/** Detuned saws, low-passed, slow attack and long release: the brand chord. */
function pad(notes, seconds) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (const midi of notes) {
    for (const detune of [-0.11, 0, 0.09]) {
      const f = hz(midi + detune);
      let p = 0;
      for (let i = 0; i < n; i++) {
        p += f / SR;
        if (p >= 1) p -= 1;
        out[i] += (2 * p - 1) * 0.06;
      }
    }
  }
  const filtered = lowpass(out, (t) => 600 + 2600 * Math.exp(-t * 1.4));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    filtered[i] *= Math.min(1, t / 0.02) * Math.exp(-t * 0.9);
  }
  return filtered;
}

/** A bell: two-operator FM, bright attack, ringing tail. */
function bell(midi, seconds = 1.4) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const f = hz(midi);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const index = 2.2 * Math.exp(-t * 6);
    const mod = Math.sin(2 * Math.PI * f * 3.5 * t) * index;
    out[i] = Math.sin(2 * Math.PI * f * t + mod) * Math.exp(-t * 3) * Math.min(1, t / 0.003) * 0.5;
  }
  return out;
}

/** A tempo echo (3/16) with damping, ping-ponged. */
function echo([l, r], time, feedback = 0.38, mix = 0.35) {
  const d = Math.round(time * SR);
  const outL = Float32Array.from(l);
  const outR = Float32Array.from(r);
  const bufL = new Float32Array(l.length);
  const bufR = new Float32Array(r.length);
  let lpL = 0;
  let lpR = 0;
  for (let i = d; i < l.length; i++) {
    lpL += 0.45 * (bufR[i - d] * feedback + l[i - d] - lpL);
    lpR += 0.45 * (bufL[i - d] * feedback + r[i - d] * 0.6 - lpR);
    bufL[i] = lpL;
    bufR[i] = lpR;
    outL[i] += bufL[i] * mix;
    outR[i] += bufR[i] * mix;
  }
  return [outL, outR];
}

/** A small Schroeder reverb (4 combs, 2 all-passes per side). */
function reverb([l, r], mix = 0.22) {
  const side = (x, spread) => {
    const combs = [1116, 1188, 1277, 1356].map((n) => n + spread);
    const acc = new Float32Array(x.length);
    for (const len of combs) {
      const buf = new Float32Array(len);
      let idx = 0;
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        const y = buf[idx];
        lp = y * 0.8 + lp * 0.2;
        buf[idx] = x[i] + lp * 0.82;
        idx = (idx + 1) % len;
        acc[i] += y * 0.25;
      }
    }
    for (const len of [556 + spread, 441 + spread]) {
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < acc.length; i++) {
        const b = buf[idx];
        const y = -acc[i] + b;
        buf[idx] = acc[i] + b * 0.5;
        idx = (idx + 1) % len;
        acc[i] = y;
      }
    }
    return x.map((v, i) => v + acc[i] * mix);
  };
  return [side(l, 0), side(r, 23)];
}

function finish([l, r], fadeOut) {
  // Peak under −1 dBFS after a gentle soft clip; fade the last `fadeOut` seconds.
  const fadeStart = l.length - Math.round(fadeOut * SR);
  let peak = 0;
  for (let i = 0; i < l.length; i++) {
    const f = i > fadeStart ? Math.cos(((i - fadeStart) / (l.length - fadeStart)) * (Math.PI / 2)) : 1;
    l[i] = Math.tanh(l[i] * 1.2) * f;
    r[i] = Math.tanh(r[i] * 1.2) * f;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const g = 0.891 / (peak || 1);
  for (let i = 0; i < l.length; i++) {
    l[i] *= g;
    r[i] *= g;
  }
  return [l, r];
}

function stationId() {
  const out = buffer(6.5);
  const hit = 1.0;
  addAt(out, riser(hit), 0, 0.55, -0.2);
  addAt(out, riser(hit), 0, 0.55, 0.2);
  addAt(out, impact(), hit, 1);
  // F minor 9: F2 · C3 · Ab3 · Eb4 · G4
  addAt(out, pad([41, 48, 56, 63, 67], 5.2), hit, 0.9, 0);
  // "re-mix-t": C5 → Eb5 → G5, then the answer down to F5 on the next beat.
  const motif = [
    [72, hit + BEAT * 1],
    [75, hit + BEAT * 1.5],
    [79, hit + BEAT * 2],
    [77, hit + BEAT * 3],
  ];
  motif.forEach(([midi, at], i) => addAt(out, bell(midi, 1.6), at, 0.42, i % 2 ? 0.3 : -0.3));
  return finish(reverb(echo(out, BEAT * 0.75)), 1.2);
}

function sting() {
  const out = buffer(3.6);
  const hit = 0.5;
  addAt(out, riser(hit), 0, 0.5);
  addAt(out, impact(), hit, 0.9);
  addAt(out, pad([41, 48, 56, 63, 67], 3), hit, 0.8);
  [[72, hit + BEAT * 0.5], [75, hit + BEAT], [79, hit + BEAT * 1.5]].forEach(([m, at], i) =>
    addAt(out, bell(m, 1.4), at, 0.42, i % 2 ? 0.3 : -0.3)
  );
  return finish(reverb(echo(out, BEAT * 0.75)), 0.9);
}

async function mp3([left, right]) {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate: SR, channels: 2, bitrate: 128 });
  const parts = [];
  const CHUNK = 1152 * 32;
  for (let s = 0; s < left.length; s += CHUNK) parts.push(encoder.encode([left.subarray(s, s + CHUNK), right.subarray(s, s + CHUNK)]).slice());
  parts.push(encoder.finalize().slice());
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

const dir = path.join(root, "public", "ads");
fs.mkdirSync(dir, { recursive: true });
for (const [name, make] of [
  ["remixt-radio-id.mp3", stationId],
  ["remixt-sting.mp3", sting],
]) {
  const pcm = make();
  const rms = Math.sqrt(pcm[0].reduce((a, v) => a + v * v, 0) / pcm[0].length);
  const file = path.join(dir, name);
  fs.writeFileSync(file, await mp3(pcm));
  console.log(`${name}: ${(pcm[0].length / SR).toFixed(1)} s, RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS, ${fs.statSync(file).size} bytes`);
}
