"use client";

// The DJ simulator's own Web Audio engine: two decks (four stem sources
// each, so stems can be killed), 3-band EQ, a filter, channel faders, a
// crossfader, master with a limiter, a cue bus and a few FX. It never touches
// the Studio's engine or its AudioContext.
//
// Position is tracked analytically (anchor + elapsed × rate) rather than
// polled from the nodes, so the waveforms and the beat-match meter are exact
// and cheap. All timing that matters is scheduled on the audio clock;
// the few setTimeouts (brake end) are cleared on dispose.

import { DEMO_STEMS, type DemoStem } from "../demoSongDefs";
import { alignedPosition, alignShiftSeconds, beatSeconds, clamp, effBpm, floorToGrid, rateToMatch, xfadeGains } from "./djMath";
import type { LoadedTrack } from "./djTracks";
import {
  EQ_MAX_DB,
  EQ_MIN_DB,
  KILL_DB,
  emptyDeck,
  type Curve,
  type DeckId,
  type DeckState,
  type DjSnapshot,
  type EqBand,
  type LoopState,
} from "./djTypes";
import type { MissionSetup } from "./scenarios";

const BEND_DEPTH = 0.06;
const EQ_FREQ: Record<EqBand, number> = { low: 200, mid: 1100, high: 3800 };

type Voice = { src: AudioBufferSourceNode; env: GainNode };

class DeckUnit {
  readonly id: DeckId;
  readonly ctx: AudioContext;
  readonly stemGain = {} as Record<DemoStem, GainNode>;
  readonly input: GainNode;
  readonly eq: Record<EqBand, BiquadFilterNode>;
  readonly hp: BiquadFilterNode;
  readonly lp: BiquadFilterNode;
  readonly pre: GainNode;
  readonly pflSend: GainNode;
  readonly fader: GainNode;
  readonly xf: GainNode;
  readonly meter: AnalyserNode;

  track: LoadedTrack | null = null;
  playing = false;
  pausedPos = 0;
  anchorPos = 0;
  anchorTime = 0;
  tempoPct = 0;
  tempoRange = 8;
  bend = 0;
  volume = 0.8;
  eqDb: Record<EqBand, number> = { low: 0, mid: 0, high: 0 };
  kill: Record<EqBand, boolean> = { low: false, mid: false, high: false };
  filter = 0;
  loop: LoopState = { active: false, start: 0, end: 0, beats: null };
  loopIn: number | null = null;
  cue = 0;
  pfl = false;
  stems: Record<DemoStem, boolean> = { drums: false, bass: false, chords: false, vocal: false };
  voices: Voice[] = [];
  brake: { t0: number; T: number; r0: number; pos0: number } | null = null;
  roll: { pos: number; time: number } | null = null;
  cueHeld = false;
  level = 0;
  private readonly scratch = new Float32Array(1024);

  constructor(id: DeckId, ctx: AudioContext, master: AudioNode, cueBus: AudioNode) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    for (const s of DEMO_STEMS) {
      this.stemGain[s] = ctx.createGain();
      this.stemGain[s].connect(this.input);
    }
    const mk = (type: BiquadFilterType, freq: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      return f;
    };
    this.eq = { low: mk("lowshelf", EQ_FREQ.low), mid: mk("peaking", EQ_FREQ.mid), high: mk("highshelf", EQ_FREQ.high) };
    this.eq.mid.Q.value = 0.7;
    this.hp = mk("highpass", 10);
    this.lp = mk("lowpass", 22000);
    this.hp.Q.value = 0.7;
    this.lp.Q.value = 0.7;
    this.pre = ctx.createGain();
    this.pflSend = ctx.createGain();
    this.pflSend.gain.value = 0;
    this.fader = ctx.createGain();
    this.xf = ctx.createGain();
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;

    this.input.connect(this.eq.low).connect(this.eq.mid).connect(this.eq.high).connect(this.hp).connect(this.lp).connect(this.pre);
    this.pre.connect(this.pflSend).connect(cueBus);
    this.pre.connect(this.fader);
    this.fader.connect(this.meter);
    this.fader.connect(this.xf).connect(master);
    this.setVolume(this.volume);
  }

  get baseRate() {
    return 1 + this.tempoPct / 100;
  }
  get rate() {
    return this.baseRate * (1 + this.bend * BEND_DEPTH);
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    this.fader.gain.setTargetAtTime(Math.pow(this.volume, 1.6), this.ctx.currentTime, 0.01);
  }

  position(): number {
    const t = this.track;
    if (!t) return 0;
    if (!this.playing) return this.pausedPos;
    const now = this.ctx.currentTime;
    if (this.brake) {
      const b = this.brake;
      const tau = clamp(now - b.t0, 0, b.T);
      return b.pos0 + b.r0 * (tau - (tau * tau) / (2 * b.T));
    }
    let p = this.anchorPos + Math.max(0, now - this.anchorTime) * this.rate;
    if (this.loop.active && p >= this.loop.end) {
      const len = this.loop.end - this.loop.start;
      if (len > 0.001) p = this.loop.start + ((p - this.loop.start) % len);
    }
    return Math.min(p, t.info.duration);
  }

  reanchor() {
    if (!this.playing) return;
    this.anchorPos = this.position();
    this.anchorTime = this.ctx.currentTime;
  }

  applyRate() {
    if (!this.playing || this.brake) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.src.playbackRate.setValueAtTime(this.rate, now);
  }

  stopVoices() {
    const now = this.ctx.currentTime;
    const old = this.voices;
    this.voices = [];
    for (const v of old) {
      try {
        v.src.onended = () => {
          v.src.disconnect();
          v.env.disconnect();
        };
        v.env.gain.cancelScheduledValues(now);
        v.env.gain.setValueAtTime(v.env.gain.value, now);
        v.env.gain.linearRampToValueAtTime(0, now + 0.006);
        v.src.stop(now + 0.012);
      } catch {
        // Already stopped.
      }
    }
  }

  startVoices(offset: number, when: number, onNaturalEnd: () => void) {
    const track = this.track;
    if (!track) return;
    this.stopVoices();
    const group: Voice[] = [];
    for (const s of DEMO_STEMS) {
      const src = this.ctx.createBufferSource();
      src.buffer = track.stems[s];
      src.playbackRate.value = this.rate;
      if (this.loop.active) {
        src.loop = true;
        src.loopStart = this.loop.start;
        src.loopEnd = this.loop.end;
      }
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(1, when + 0.005);
      src.connect(env).connect(this.stemGain[s]);
      src.start(when, clamp(offset, 0, track.info.duration - 0.01));
      group.push({ src, env });
    }
    this.voices = group;
    group[0].src.onended = () => {
      if (this.voices === group) onNaturalEnd();
    };
  }

  measure() {
    this.meter.getFloatTimeDomainData(this.scratch);
    let peak = 0;
    for (let i = 0; i < this.scratch.length; i++) peak = Math.max(peak, Math.abs(this.scratch[i]));
    // Fast attack, slower fall.
    this.level = peak > this.level ? peak : this.level * 0.85 + peak * 0.15;
    return this.level;
  }

  state(): DeckState {
    const base = emptyDeck();
    return {
      ...base,
      track: this.track?.info ?? null,
      playing: this.playing,
      position: this.position(),
      rate: this.baseRate,
      tempoPct: this.tempoPct,
      tempoRange: this.tempoRange,
      bend: this.bend,
      volume: this.volume,
      eq: { ...this.eqDb },
      kill: { ...this.kill },
      filter: this.filter,
      loop: { ...this.loop },
      cue: this.cue,
      pfl: this.pfl,
      stems: { ...this.stems },
      level: this.level,
    };
  }
}

export class DjEngine {
  readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly masterMeter: AnalyserNode;
  private readonly cueBus: GainNode;
  private readonly fxOut: GainNode;
  private readonly echoSend: GainNode;
  private readonly echoDelay: DelayNode;
  private readonly reverbSend: GainNode;
  private readonly decks: Record<DeckId, DeckUnit>;
  private readonly scratch = new Float32Array(1024);
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly voicesFx = new Set<{ stop: () => void }>();
  private sirenNodes: { stop: () => void } | null = null;
  private crossfader = 0;
  private curve: Curve = "blend";
  private master = 0.85;
  private masterLevel = 0;
  private fx: Record<string, number> = {};
  private cached: DjSnapshot;
  private disposed = false;

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: "interactive" });
    const ctx = this.ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.limiter.connect(ctx.destination);
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 1024;
    this.limiter.connect(this.masterMeter);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.master;
    this.dryGain = ctx.createGain();
    this.masterGain.connect(this.dryGain).connect(this.limiter);

    this.cueBus = ctx.createGain();
    this.cueBus.gain.value = 0.5;
    this.cueBus.connect(this.limiter);

    // FX: an echo (dotted-eighth delay with feedback), a reverb, and a bus for synthesised sounds.
    this.fxOut = ctx.createGain();
    this.fxOut.connect(this.limiter);
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.echoDelay = ctx.createDelay(2);
    this.echoDelay.delayTime.value = 0.375;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.58;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 3200;
    this.masterGain.connect(this.echoSend);
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(echoTone).connect(feedback).connect(this.echoDelay);
    echoTone.connect(this.limiter);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.8;
    this.masterGain.connect(this.reverbSend);
    this.reverbSend.connect(convolver).connect(reverbOut).connect(this.limiter);

    this.decks = {
      A: new DeckUnit("A", ctx, this.masterGain, this.cueBus),
      B: new DeckUnit("B", ctx, this.masterGain, this.cueBus),
    };
    this.applyCrossfader();
    this.cached = this.snapshot();
  }

  // ----------------------------------------------------------- plumbing

  /** Call from any user gesture: browsers (iOS especially) start the context suspended. */
  unlock() {
    if (this.disposed) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** The last published state (positions are as of then): stable until something changes. */
  getUi = () => this.cached;

  private emit() {
    if (this.disposed) return;
    this.cached = this.snapshot();
    for (const l of this.listeners) l();
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(id);
  }

  /** Live state, with positions and meters as of now. */
  snapshot(): DjSnapshot {
    this.measureMaster();
    for (const d of Object.values(this.decks)) d.measure();
    return {
      time: this.ctx.currentTime,
      decks: { A: this.decks.A.state(), B: this.decks.B.state() },
      mix: { crossfader: this.crossfader, curve: this.curve, master: this.master, masterLevel: this.masterLevel },
      fx: { ...this.fx },
    };
  }

  private measureMaster() {
    this.masterMeter.getFloatTimeDomainData(this.scratch);
    let peak = 0;
    for (let i = 0; i < this.scratch.length; i++) peak = Math.max(peak, Math.abs(this.scratch[i]));
    this.masterLevel = peak > this.masterLevel ? peak : this.masterLevel * 0.85 + peak * 0.15;
  }

  /** Cheap live meter values for the UI's animation frames. */
  levels() {
    this.measureMaster();
    return { A: this.decks.A.measure(), B: this.decks.B.measure(), master: this.masterLevel };
  }

  deckPosition(id: DeckId) {
    return this.decks[id].position();
  }

  deckTrack(id: DeckId) {
    return this.decks[id].track;
  }

  /** The deck state without the cost of the meters. */
  deckState(id: DeckId) {
    return this.decks[id].state();
  }

  // -------------------------------------------------------------- tracks

  loadTrack(id: DeckId, track: LoadedTrack) {
    const d = this.decks[id];
    this.pause(id, false);
    d.track = track;
    d.pausedPos = 0;
    d.cue = 0;
    d.loop = { active: false, start: 0, end: 0, beats: null };
    d.loopIn = null;
    d.bend = 0;
    d.tempoPct = 0;
    d.brake = null;
    d.roll = null;
    for (const s of DEMO_STEMS) this.setStemKill(id, s, false, false);
    this.emit();
  }

  /** Empties a deck. */
  unloadTrack(id: DeckId) {
    const d = this.decks[id];
    this.pause(id, false);
    d.track = null;
    d.pausedPos = 0;
    d.cue = 0;
    d.loop = { active: false, start: 0, end: 0, beats: null };
    d.tempoPct = 0;
    d.bend = 0;
    d.brake = null;
    d.roll = null;
    this.emit();
  }

  // ----------------------------------------------------------- transport

  play(id: DeckId, when?: number) {
    const d = this.decks[id];
    this.unlock();
    if (!d.track) return;
    if (d.brake) this.cancelBrake(d);
    if (d.playing) return;
    if (d.pausedPos >= d.track.info.duration - 0.1) d.pausedPos = d.cue;
    const start = when ?? this.ctx.currentTime + 0.01;
    d.startVoices(d.pausedPos, start, () => this.trackEnded(id));
    d.anchorPos = d.pausedPos;
    d.anchorTime = start;
    d.playing = true;
    this.emit();
  }

  /** Starts several decks on the same audio-clock tick, so their relative phase is what was set up. */
  playTogether(ids: DeckId[]) {
    const when = this.ctx.currentTime + 0.05;
    for (const id of ids) this.play(id, when);
  }

  pause(id: DeckId, emit = true) {
    const d = this.decks[id];
    if (d.playing) {
      d.pausedPos = d.position();
      d.playing = false;
      d.brake = null;
      d.stopVoices();
    }
    if (emit) this.emit();
  }

  togglePlay(id: DeckId) {
    const d = this.decks[id];
    if (d.playing && !d.brake) this.pause(id);
    else this.play(id);
  }

  private trackEnded(id: DeckId) {
    const d = this.decks[id];
    if (!d.playing || !d.track) return;
    d.playing = false;
    d.pausedPos = d.track.info.duration;
    d.voices = [];
    this.emit();
  }

  seek(id: DeckId, pos: number) {
    const d = this.decks[id];
    if (!d.track) return;
    const p = clamp(pos, 0, d.track.info.duration - 0.05);
    if (d.playing) {
      // The new sources start a few ms from now, so start that much further in:
      // `pos` is where the playhead is meant to be right now.
      const lead = 0.004;
      const when = this.ctx.currentTime + lead;
      const at = Math.min(p + lead * d.rate, d.track.info.duration - 0.05);
      d.startVoices(at, when, () => this.trackEnded(id));
      d.anchorPos = at;
      d.anchorTime = when;
    } else d.pausedPos = p;
    this.emit();
  }

  jumpBeats(id: DeckId, beats: number) {
    const d = this.decks[id];
    if (!d.track) return;
    this.seek(id, d.position() + beats * beatSeconds(d.track.info));
  }

  /**
   * CUE the way hardware does it: while playing, jump back to the cue point
   * and stop; while stopped, press sets the cue (if the deck is away from it)
   * and plays while held; release returns.
   */
  cueDown(id: DeckId) {
    const d = this.decks[id];
    this.unlock();
    if (!d.track) return;
    if (d.playing) {
      this.pause(id, false);
      d.pausedPos = d.cue;
      this.emit();
      return;
    }
    if (Math.abs(d.pausedPos - d.cue) > 0.05) d.cue = d.pausedPos;
    this.play(id);
    d.cueHeld = true;
  }

  cueUp(id: DeckId) {
    const d = this.decks[id];
    if (!d.cueHeld) return;
    d.cueHeld = false;
    if (d.playing) {
      this.pause(id, false);
      d.pausedPos = d.cue;
      this.emit();
    }
  }

  setCue(id: DeckId) {
    const d = this.decks[id];
    if (!d.track) return;
    d.cue = d.position();
    this.emit();
  }

  // ---------------------------------------------------------------- loops

  private applyLoopToVoices(d: DeckUnit) {
    for (const v of d.voices) {
      v.src.loopStart = d.loop.start;
      v.src.loopEnd = d.loop.end;
      v.src.loop = d.loop.active;
    }
  }

  loopBeats(id: DeckId, beats: number) {
    const d = this.decks[id];
    if (!d.track) return;
    if (d.loop.active && d.loop.beats === beats) return this.loopExit(id);
    const pos = d.position();
    const start = floorToGrid(d.track.info, pos, beats);
    d.reanchor();
    d.loop = { active: true, start, end: start + beats * beatSeconds(d.track.info), beats };
    this.applyLoopToVoices(d);
    this.emit();
  }

  loopInPoint(id: DeckId) {
    const d = this.decks[id];
    if (!d.track) return;
    d.loopIn = d.position();
    this.emit();
  }

  loopOutPoint(id: DeckId) {
    const d = this.decks[id];
    if (!d.track || d.loopIn === null) return;
    const pos = d.position();
    if (pos - d.loopIn < 0.08) return;
    d.reanchor();
    d.loop = { active: true, start: d.loopIn, end: pos, beats: null };
    this.applyLoopToVoices(d);
    this.emit();
  }

  loopExit(id: DeckId) {
    const d = this.decks[id];
    if (!d.loop.active) return;
    d.reanchor();
    d.loop = { ...d.loop, active: false };
    this.applyLoopToVoices(d);
    this.emit();
  }

  /** A slip roll: loop while held, then rejoin the track where it would have been. */
  rollStart(id: DeckId, beats: number) {
    const d = this.decks[id];
    if (!d.track || !d.playing || d.roll) return;
    this.unlock();
    d.roll = { pos: d.position(), time: this.ctx.currentTime };
    this.fx.roll = (this.fx.roll ?? 0) + 1;
    this.loopBeats(id, beats);
  }

  rollEnd(id: DeckId) {
    const d = this.decks[id];
    if (!d.roll) return;
    const slip = d.roll;
    d.roll = null;
    this.loopExit(id);
    this.seek(id, slip.pos + (this.ctx.currentTime - slip.time) * d.baseRate);
  }

  // -------------------------------------------------------- tempo & bend

  setTempoPct(id: DeckId, pct: number) {
    const d = this.decks[id];
    d.reanchor();
    d.tempoPct = clamp(pct, -d.tempoRange, d.tempoRange);
    d.applyRate();
    this.emit();
  }

  setTempoRange(id: DeckId, range: number) {
    const d = this.decks[id];
    d.tempoRange = range;
    if (Math.abs(d.tempoPct) > range) this.setTempoPct(id, clamp(d.tempoPct, -range, range));
    else this.emit();
  }

  /** Nudge: -1 slows a little, +1 speeds up a little, 0 lets go. */
  setBend(id: DeckId, bend: number) {
    const d = this.decks[id];
    if (d.bend === bend) return;
    d.reanchor();
    d.bend = clamp(bend, -1, 1);
    d.applyRate();
    this.emit();
  }

  /** A short tap: a ~12 ms nudge either way. */
  tapNudge(id: DeckId, dir: -1 | 1) {
    this.setBend(id, dir);
    this.later(() => this.setBend(id, 0), 190);
  }

  /** Tempo and (if both are playing) beat match this deck to the other. Returns what happened. */
  sync(id: DeckId): "ok" | "out-of-range" | "no-track" {
    const d = this.decks[id];
    const otherId: DeckId = id === "A" ? "B" : "A";
    const o = this.decks[otherId];
    if (!d.track || !o.track) return "no-track";
    const otherBpm = effBpm(o.state());
    const rate = rateToMatch(d.track.info.bpm, otherBpm);
    const wanted = (rate - 1) * 100;
    const clamped = clamp(wanted, -d.tempoRange, d.tempoRange);
    d.reanchor();
    d.tempoPct = clamped;
    d.applyRate();
    if (d.playing && o.playing) {
      const shift = alignShiftSeconds(d.state(), o.state(), id);
      if (Math.abs(clamped - wanted) < 0.05) this.seek(id, d.position() + shift);
    }
    this.emit();
    return Math.abs(clamped - wanted) < 0.05 ? "ok" : "out-of-range";
  }

  // -------------------------------------------------------------- mixer

  setVolume(id: DeckId, v: number) {
    this.decks[id].setVolume(v);
    this.emit();
  }

  setEq(id: DeckId, band: EqBand, db: number) {
    const d = this.decks[id];
    d.eqDb[band] = clamp(db, EQ_MIN_DB, EQ_MAX_DB);
    this.applyEq(d, band);
    this.emit();
  }

  setKill(id: DeckId, band: EqBand, on: boolean) {
    const d = this.decks[id];
    d.kill[band] = on;
    this.applyEq(d, band);
    this.emit();
  }

  private applyEq(d: DeckUnit, band: EqBand) {
    d.eq[band].gain.setTargetAtTime(d.kill[band] ? KILL_DB : d.eqDb[band], this.ctx.currentTime, 0.012);
  }

  /** -1 low-pass … +1 high-pass. */
  setFilter(id: DeckId, v: number) {
    const d = this.decks[id];
    d.filter = clamp(v, -1, 1);
    const now = this.ctx.currentTime;
    const lpHz = d.filter < 0 ? 22000 * Math.pow(2, d.filter * 7) : 22000;
    const hpHz = d.filter > 0 ? 10 * Math.pow(2, d.filter * 9.5) : 10;
    const q = 0.7 + Math.abs(d.filter) * 2.2;
    d.lp.frequency.setTargetAtTime(lpHz, now, 0.015);
    d.hp.frequency.setTargetAtTime(hpHz, now, 0.015);
    d.lp.Q.setTargetAtTime(d.filter < 0 ? q : 0.7, now, 0.02);
    d.hp.Q.setTargetAtTime(d.filter > 0 ? q : 0.7, now, 0.02);
    this.emit();
  }

  setStemKill(id: DeckId, stem: DemoStem, killed: boolean, emit = true) {
    const d = this.decks[id];
    d.stems[stem] = killed;
    d.stemGain[stem].gain.setTargetAtTime(killed ? 0 : 1, this.ctx.currentTime, 0.008);
    if (emit) this.emit();
  }

  setPfl(id: DeckId, on: boolean) {
    const d = this.decks[id];
    d.pfl = on;
    d.pflSend.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
    this.emit();
  }

  setCrossfader(x: number) {
    this.crossfader = clamp(x, -1, 1);
    this.applyCrossfader();
    this.emit();
  }

  setCurve(curve: Curve) {
    this.curve = curve;
    this.applyCrossfader();
    this.emit();
  }

  private applyCrossfader() {
    const g = xfadeGains(this.crossfader, this.curve);
    const now = this.ctx.currentTime;
    this.decks.A.xf.gain.setTargetAtTime(g.A, now, 0.008);
    this.decks.B.xf.gain.setTargetAtTime(g.B, now, 0.008);
  }

  setMaster(v: number) {
    this.master = clamp(v, 0, 1);
    this.masterGain.gain.setTargetAtTime(this.master * 1.1, this.ctx.currentTime, 0.01);
    this.emit();
  }

  // ----------------------------------------------------------------- FX

  private countFx(name: string) {
    this.fx[name] = (this.fx[name] ?? 0) + 1;
  }

  /** The beat length of the louder playing deck, for tempo-synced effects. */
  private beatSec() {
    const a = this.decks.A;
    const b = this.decks.B;
    const pick = a.playing && (!b.playing || a.volume >= b.volume) ? a : b;
    return pick.track ? 60 / (pick.track.info.bpm * pick.baseRate) : 0.5;
  }

  /** Echo out: the dry sound drops away while an echo of it rings out. */
  echoOut() {
    this.unlock();
    const t = this.ctx.currentTime;
    this.echoDelay.delayTime.setValueAtTime(clamp(this.beatSec() * 0.75, 0.05, 1.9), t);
    this.echoSend.gain.cancelScheduledValues(t);
    this.echoSend.gain.setValueAtTime(0, t);
    this.echoSend.gain.linearRampToValueAtTime(1, t + 0.01);
    this.echoSend.gain.setValueAtTime(1, t + 0.18);
    this.echoSend.gain.linearRampToValueAtTime(0, t + 0.22);
    this.dryGain.gain.cancelScheduledValues(t);
    this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, t);
    this.dryGain.gain.linearRampToValueAtTime(0, t + 0.1);
    this.dryGain.gain.setValueAtTime(0, t + 3.4);
    this.dryGain.gain.linearRampToValueAtTime(1, t + 3.9);
    this.countFx("echo");
    this.emit();
  }

  /** Hold for an echo on top of the music. */
  echoHold(on: boolean) {
    this.unlock();
    const t = this.ctx.currentTime;
    if (on) this.echoDelay.delayTime.setValueAtTime(clamp(this.beatSec() * 0.75, 0.05, 1.9), t);
    this.echoSend.gain.cancelScheduledValues(t);
    this.echoSend.gain.setTargetAtTime(on ? 0.7 : 0, t, 0.02);
    if (on) {
      this.countFx("echo");
      this.emit();
    }
  }

  reverbThrow() {
    this.unlock();
    const t = this.ctx.currentTime;
    this.reverbSend.gain.cancelScheduledValues(t);
    this.reverbSend.gain.setValueAtTime(0, t);
    this.reverbSend.gain.linearRampToValueAtTime(1.3, t + 0.01);
    this.reverbSend.gain.setValueAtTime(1.3, t + 0.14);
    this.reverbSend.gain.linearRampToValueAtTime(0, t + 0.2);
    this.countFx("reverb");
    this.emit();
  }

  sirenOn() {
    this.unlock();
    if (this.sirenNodes) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const depth = ctx.createGain();
    depth.gain.value = 450;
    lfo.connect(depth).connect(osc.frequency);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3500;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.04);
    osc.connect(tone).connect(env).connect(this.fxOut);
    osc.start(t);
    lfo.start(t);
    const handle = {
      stop: () => {
        const now = ctx.currentTime;
        env.gain.cancelScheduledValues(now);
        env.gain.setTargetAtTime(0, now, 0.03);
        osc.stop(now + 0.25);
        lfo.stop(now + 0.25);
        osc.onended = () => {
          osc.disconnect();
          lfo.disconnect();
          depth.disconnect();
          tone.disconnect();
          env.disconnect();
        };
        this.voicesFx.delete(handle);
      },
    };
    this.voicesFx.add(handle);
    this.sirenNodes = handle;
    this.countFx("siren");
    this.emit();
  }

  sirenOff() {
    this.sirenNodes?.stop();
    this.sirenNodes = null;
  }

  airHorn() {
    this.unlock();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3, t + 0.02);
    env.gain.setValueAtTime(0.3, t + 0.55);
    env.gain.linearRampToValueAtTime(0, t + 0.85);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    tone.connect(env).connect(this.fxOut);
    const oscs = [466, 587, 698, 932].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 3 ? "square" : "sawtooth";
      o.frequency.setValueAtTime(f * 1.04, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.06);
      o.connect(tone);
      o.start(t);
      o.stop(t + 0.9);
      return o;
    });
    oscs[0].onended = () => {
      for (const o of oscs) o.disconnect();
      tone.disconnect();
      env.disconnect();
    };
    this.countFx("horn");
    this.emit();
  }

  /** The platter slowing to a stop. */
  brake(id: DeckId, seconds = 0.9, thenSpin = false) {
    const d = this.decks[id];
    if (!d.track || !d.playing || d.brake) return;
    this.unlock();
    d.roll = null;
    if (d.loop.active) this.loopExit(id);
    const now = this.ctx.currentTime;
    const r0 = d.rate;
    const pos0 = d.position();
    d.brake = { t0: now, T: seconds, r0, pos0 };
    for (const v of d.voices) {
      v.src.playbackRate.cancelScheduledValues(now);
      v.src.playbackRate.setValueAtTime(r0, now);
      v.src.playbackRate.linearRampToValueAtTime(0.01, now + seconds);
    }
    this.countFx(thenSpin ? "spin" : "brake");
    this.later(() => {
      if (d.brake?.t0 !== now) return;
      const stopped = pos0 + (r0 * seconds) / 2;
      d.brake = null;
      d.playing = false;
      d.pausedPos = stopped;
      d.stopVoices();
      if (thenSpin && d.track) {
        d.pausedPos = Math.max(0, stopped - 2 * beatSeconds(d.track.info));
        this.play(id);
      } else this.emit();
    }, seconds * 1000 + 40);
    this.emit();
  }

  spinBack(id: DeckId) {
    this.brake(id, 0.35, true);
  }

  private cancelBrake(d: DeckUnit) {
    if (!d.brake) return;
    const pos = d.position();
    d.brake = null;
    d.playing = false;
    d.pausedPos = pos;
    d.stopVoices();
  }

  // -------------------------------------------------------------- setups

  /** Puts the decks into a mission's starting state. `load` fetches (and caches) tracks. */
  async applySetup(setup: MissionSetup, load: (trackId: string) => Promise<LoadedTrack>) {
    this.unlock();
    this.stopAllFx();
    for (const id of ["A", "B"] as DeckId[]) {
      this.pause(id, false);
      if (!setup.decks[id]) this.unloadTrack(id);
      const d = this.decks[id];
      d.bend = 0;
      d.tempoRange = setup.tempoRange ?? 8;
      this.setVolume(id, 0.8);
      for (const band of ["low", "mid", "high"] as EqBand[]) {
        d.eqDb[band] = 0;
        d.kill[band] = false;
        this.applyEq(d, band);
      }
      this.setFilter(id, 0);
      this.setPfl(id, false);
    }
    this.crossfader = setup.crossfader ?? 0;
    this.curve = "blend";
    this.applyCrossfader();
    this.setMaster(0.85);

    const entries = Object.entries(setup.decks) as [DeckId, NonNullable<MissionSetup["decks"][DeckId]>][];
    const loaded = await Promise.all(entries.map(([, s]) => load(s.trackId)));
    if (this.disposed) return;
    entries.forEach(([id, s], i) => {
      const d = this.decks[id];
      this.loadTrack(id, loaded[i]);
      d.tempoRange = setup.tempoRange ?? 8;
      d.tempoPct = clamp(s.tempoPct ?? 0, -d.tempoRange, d.tempoRange);
      this.setVolume(id, s.volume ?? 0.8);
      d.pausedPos = (s.startBar ?? 0) * (240 / loaded[i].info.bpm);
      d.cue = 0;
      for (const stem of s.killStems ?? []) this.setStemKill(id, stem, true, false);
      if (s.killLow) {
        d.kill.low = true;
        this.applyEq(d, "low");
      }
    });
    const A = this.decks.A;
    const B = this.decks.B;
    if (setup.decks.A?.playing && setup.decks.B?.playing && A.track && B.track && setup.phaseOffsetMs !== undefined) {
      B.pausedPos = alignedPosition(A.state(), B.state(), B.pausedPos, setup.phaseOffsetMs);
    }
    const toPlay = entries.filter(([, s]) => s.playing).map(([id]) => id);
    this.emit();
    if (toPlay.length) this.playTogether(toPlay);
  }

  private stopAllFx() {
    this.sirenOff();
    this.echoSend.gain.cancelScheduledValues(this.ctx.currentTime);
    this.echoSend.gain.setValueAtTime(0, this.ctx.currentTime);
    this.dryGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.dryGain.gain.setValueAtTime(1, this.ctx.currentTime);
  }

  /** Silences everything (leaving a mission). */
  stopAll() {
    this.stopAllFx();
    for (const id of ["A", "B"] as DeckId[]) {
      const d = this.decks[id];
      d.roll = null;
      this.cancelBrake(d);
      this.pause(id, false);
    }
    this.emit();
  }

  // ------------------------------------------------------------ cleanup

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const v of [...this.voicesFx]) v.stop();
    for (const d of Object.values(this.decks)) {
      d.stopVoices();
      d.playing = false;
    }
    this.listeners.clear();
    void this.ctx.close().catch(() => {});
  }
}

/** A short noisy room for the reverb throw: deterministic, so it sounds the same every time. */
function makeImpulse(ctx: AudioContext) {
  const length = Math.floor(ctx.sampleRate * 2.4);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 1234567;
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      data[i] = noise * Math.pow(1 - i / length, 2.6);
    }
  }
  return buf;
}
