"use client";

// The DJ simulator's own Web Audio engine, laid out like a club setup: two
// players (a buffer source per stem, so stems can be killed; key lock and
// scratching through the JS voices in djVoices.ts), and a 2-channel mixer
// with trim/auto gain, a 3-band isolator EQ (Linkwitz-Riley crossovers, as
// in club mixers: each band can be cut to silence), a colour filter,
// channel faders with a selectable curve, a crossfader, a master with a
// limiter and L/R meters, and a headphone section: cue mix, split cue, or
// the cue on a second audio device. Plus FX, a talkover mic duck and a
// master recorder. It never touches the Studio's engine or its AudioContext.
//
// Position is tracked analytically (anchor + elapsed × rate) rather than
// polled from the nodes, so the waveforms and the beat-match meter are exact
// and cheap. All timing that matters is scheduled on the audio clock;
// the few setTimeouts (brake end) are cleared on dispose.

import { alignedPosition, alignShiftSeconds, beatSeconds, clamp, effBpm, floorToGrid, rateToMatch, xfadeGains } from "./djMath";
import { autoGainDb, dbToGain, emptyHotCues, faderGain, quantizePos, quantizedJump, resizeLoop, withHotCue } from "./djControls";
import type { LoadedTrack } from "./djTracks";
import {
  DEFAULT_TEMPO_RANGE,
  EQ_MAX_DB,
  EQ_MIN_DB,
  HOT_CUE_COUNT,
  STEM_SLOTS,
  TRIM_DB,
  emptyDeck,
  type Curve,
  type DeckId,
  type DeckState,
  type DjSnapshot,
  type EqBand,
  type FaderCurve,
  type LoopState,
  type MonitorMode,
  type StemSlot,
} from "./djTypes";
import { KeyLockVoice, ScratchVoice, canRunJsVoices, type VoiceHost } from "./djVoices";
import type { MissionSetup } from "./scenarios";
import type { DemoStem } from "../demoSongDefs";

const BEND_DEPTH = 0.06;
/** Isolator crossover points (Hz). */
const XOVER = { low: 250, high: 2500 };

type Voice = { src: AudioBufferSourceNode; env: GainNode };
type Ramp = { t0: number; T: number; r0: number; pos0: number };

class DeckUnit {
  readonly id: DeckId;
  readonly ctx: AudioContext;
  readonly stemGain = {} as Record<StemSlot, GainNode>;
  readonly input: GainNode;
  readonly trimGain: GainNode;
  readonly band: Record<EqBand, GainNode>;
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
  tempoRange = DEFAULT_TEMPO_RANGE;
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
  jsVoice: KeyLockVoice | null = null;
  brake: Ramp | null = null;
  spinUp: Ramp | null = null;
  roll: { pos: number; time: number } | null = null;
  cueHeld = false;
  level = 0;
  keyLock = false;
  quantize = false;
  slip = false;
  vinyl = false;
  hotCues: (number | null)[] = emptyHotCues();
  trim = 0;
  autoGain = true;
  /** Slip mode: where the track would be (at the base rate) since `time`. */
  slipShadow: { pos: number; time: number } | null = null;
  scratch: { wasPlaying: boolean; target: number; voice: ScratchVoice | null } | null = null;
  heldHotCue: number | null = null;
  scratchDir = 0;
  private readonly scratchBuf = new Float32Array(1024);

  constructor(id: DeckId, ctx: AudioContext, master: AudioNode, cueBus: AudioNode) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    for (const s of STEM_SLOTS) {
      this.stemGain[s] = ctx.createGain();
      this.stemGain[s].connect(this.input);
    }
    const mk = (type: BiquadFilterType, freq: number, q = Math.SQRT1_2) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    this.trimGain = ctx.createGain();
    // Isolator: Linkwitz-Riley 4th-order crossovers (two Butterworth stages
    // each), so the three bands sum back flat and each can go to silence.
    this.band = { low: ctx.createGain(), mid: ctx.createGain(), high: ctx.createGain() };
    const sum = ctx.createGain();
    this.input.connect(this.trimGain);
    this.trimGain.connect(mk("lowpass", XOVER.low)).connect(mk("lowpass", XOVER.low)).connect(this.band.low).connect(sum);
    const upper = ctx.createGain();
    this.trimGain.connect(mk("highpass", XOVER.low)).connect(mk("highpass", XOVER.low)).connect(upper);
    upper.connect(mk("lowpass", XOVER.high)).connect(mk("lowpass", XOVER.high)).connect(this.band.mid).connect(sum);
    upper.connect(mk("highpass", XOVER.high)).connect(mk("highpass", XOVER.high)).connect(this.band.high).connect(sum);

    this.hp = mk("highpass", 10, 0.7);
    this.lp = mk("lowpass", 22000, 0.7);
    this.pre = ctx.createGain();
    this.pflSend = ctx.createGain();
    this.pflSend.gain.value = 0;
    this.fader = ctx.createGain();
    this.xf = ctx.createGain();
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;

    sum.connect(this.hp).connect(this.lp).connect(this.pre);
    // Channel meters read before the fader, as on a club mixer: set trim by them.
    this.pre.connect(this.meter);
    this.pre.connect(this.pflSend).connect(cueBus);
    this.pre.connect(this.fader);
    this.fader.connect(this.xf).connect(master);
  }

  get baseRate() {
    return 1 + this.tempoPct / 100;
  }
  get rate() {
    return this.baseRate * (1 + this.bend * BEND_DEPTH);
  }

  autoGainDb() {
    return this.autoGain && this.track ? autoGainDb(this.track.loudnessDb) : 0;
  }

  applyTrim() {
    this.trimGain.gain.setTargetAtTime(dbToGain(this.trim + this.autoGainDb()), this.ctx.currentTime, 0.02);
  }

  /** Where the analytic clock puts the playhead at audio time `t` (playing, no brake or scratch). */
  positionAt(t: number): number {
    const tr = this.track;
    if (!tr) return 0;
    let p: number;
    if (this.spinUp) {
      const s = this.spinUp;
      const tau = Math.max(0, t - s.t0);
      p = tau < s.T ? s.pos0 + (s.r0 * tau * tau) / (2 * s.T) : s.pos0 + (s.r0 * s.T) / 2 + s.r0 * (tau - s.T);
    } else p = this.anchorPos + Math.max(0, t - this.anchorTime) * this.rate;
    if (this.loop.active && p >= this.loop.end) {
      const len = this.loop.end - this.loop.start;
      if (len > 0.001) p = this.loop.start + ((p - this.loop.start) % len);
    }
    return Math.min(p, tr.info.duration);
  }

  position(): number {
    const t = this.track;
    if (!t) return 0;
    if (this.scratch) return this.scratch.voice?.position ?? this.scratch.target;
    if (!this.playing) return this.pausedPos;
    const now = this.ctx.currentTime;
    if (this.brake) {
      const b = this.brake;
      const tau = clamp(now - b.t0, 0, b.T);
      return b.pos0 + b.r0 * (tau - (tau * tau) / (2 * b.T));
    }
    return this.positionAt(now);
  }

  slipPosition(): number | null {
    if (!this.slipShadow || !this.track) return null;
    return Math.min(this.track.info.duration, this.slipShadow.pos + (this.ctx.currentTime - this.slipShadow.time) * this.baseRate);
  }

  reanchor() {
    if (!this.playing) return;
    this.anchorPos = this.position();
    this.anchorTime = this.ctx.currentTime;
    this.spinUp = null;
  }

  applyRate() {
    if (!this.playing || this.brake || this.spinUp) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.src.playbackRate.setValueAtTime(this.rate, now);
    // The key-lock voice reads the rate itself every block.
  }

  /** The stems this track has, in a fixed order, and the gain each should have. */
  slots(): StemSlot[] {
    const t = this.track;
    return t ? STEM_SLOTS.filter((s) => t.stems[s]) : [];
  }

  slotGain(s: StemSlot) {
    if (s === "beat") return this.stems.drums && this.stems.bass && this.stems.chords ? 0 : 1;
    return this.stems[s] ? 0 : 1;
  }

  voiceHost(): VoiceHost | null {
    const t = this.track;
    if (!t) return null;
    const slots = this.slots();
    return {
      buffers: slots.map((s) => t.stems[s]!),
      gains: () => slots.map((s) => this.slotGain(s)),
      loop: () => this.loop,
      duration: t.info.duration,
    };
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
    this.jsVoice?.stop();
    this.jsVoice = null;
  }

  /** Starts playback voices at `offset` at audio time `when`. Key lock uses the time-stretch voice unless `vinyl` is forced. */
  startVoices(offset: number, when: number, onNaturalEnd: () => void, forceBuffers = false) {
    const track = this.track;
    if (!track) return;
    this.stopVoices();
    if (this.keyLock && !forceBuffers && canRunJsVoices(this.ctx)) {
      const host = this.voiceHost();
      if (host && host.buffers.length) {
        this.jsVoice = new KeyLockVoice(this.ctx, this.input, host, {
          positionAt: (t) => this.positionAt(t),
          rate: () => (this.playing && !this.brake ? this.rate : 0),
          startsAt: when,
        });
        return;
      }
    }
    const group: Voice[] = [];
    for (const s of this.slots()) {
      const src = this.ctx.createBufferSource();
      src.buffer = track.stems[s]!;
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
    if (group[0]) {
      group[0].src.onended = () => {
        if (this.voices === group) onNaturalEnd();
      };
    }
  }

  measure() {
    this.meter.getFloatTimeDomainData(this.scratchBuf);
    let peak = 0;
    for (let i = 0; i < this.scratchBuf.length; i++) peak = Math.max(peak, Math.abs(this.scratchBuf[i]));
    // Fast attack, slower fall.
    this.level = peak > this.level ? peak : this.level * 0.85 + peak * 0.15;
    return this.level;
  }

  /** The latest raw peak (for the VU meters, which do their own ballistics). */
  peak() {
    this.meter.getFloatTimeDomainData(this.scratchBuf);
    let peak = 0;
    for (let i = 0; i < this.scratchBuf.length; i++) peak = Math.max(peak, Math.abs(this.scratchBuf[i]));
    return peak;
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
      keyLock: this.keyLock,
      quantize: this.quantize,
      slip: this.slip,
      vinyl: this.vinyl,
      scratching: !!this.scratch,
      slipPosition: this.slipPosition(),
      hotCues: [...this.hotCues],
      trim: this.trim,
      autoGain: this.autoGain,
      autoGainDb: this.autoGainDb(),
    };
  }
}

export type SampleKind = "horn" | "laser" | "kick" | "clap" | "riser" | "drop" | "crash";
export const SAMPLE_KINDS: { kind: SampleKind; label: string }[] = [
  { kind: "horn", label: "Horn" },
  { kind: "laser", label: "Laser" },
  { kind: "riser", label: "Riser" },
  { kind: "drop", label: "Sub drop" },
  { kind: "kick", label: "Kick" },
  { kind: "clap", label: "Clap" },
  { kind: "crash", label: "Crash" },
];

export type RecordingResult = { blob: Blob; mime: string; seconds: number };

export class DjEngine {
  readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly duck: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly masterOut: GainNode;
  private readonly masterMeter: AnalyserNode;
  private readonly meterL: AnalyserNode | null = null;
  private readonly meterR: AnalyserNode | null = null;
  private readonly cueBus: GainNode;
  private readonly mainOut: GainNode;
  private readonly singleCue: GainNode;
  private readonly splitCue: GainNode | null = null;
  private readonly splitMaster: GainNode | null = null;
  private phones: { cue: GainNode; master: GainNode; dest: MediaStreamAudioDestinationNode; el: HTMLAudioElement } | null = null;
  private recorder: { rec: MediaRecorder; chunks: Blob[]; started: number; mime: string } | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private mic: { stream: MediaStream; node: MediaStreamAudioSourceNode; gain: GainNode } | null = null;
  private readonly fxOut: GainNode;
  private readonly echoSend: GainNode;
  private readonly echoDelay: DelayNode;
  private readonly reverbSend: GainNode;
  private readonly decks: Record<DeckId, DeckUnit>;
  private readonly scratchBuf = new Float32Array(1024);
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly voicesFx = new Set<{ stop: () => void }>();
  private sirenNodes: { stop: () => void } | null = null;
  private crossfader = 0;
  private curve: Curve = "blend";
  private faderCurve: FaderCurve = "smooth";
  private master = 0.85;
  private masterLevel = 0;
  private cueMix = 0.5;
  private phonesLevel = 0.8;
  private monitor: MonitorMode = "single";
  private talkover = false;
  private fx: Record<string, number> = {};
  private cached: DjSnapshot;
  private disposed = false;

  constructor(opts: { quantize?: boolean } = {}) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: "interactive" });
    const ctx = this.ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.masterOut = ctx.createGain();
    this.limiter.connect(this.masterOut);
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 1024;
    this.masterOut.connect(this.masterMeter);
    if (typeof ctx.createChannelSplitter === "function") {
      const split = ctx.createChannelSplitter(2);
      this.meterL = ctx.createAnalyser();
      this.meterR = ctx.createAnalyser();
      this.meterL.fftSize = 1024;
      this.meterR.fftSize = 1024;
      this.masterOut.connect(split);
      split.connect(this.meterL, 0);
      split.connect(this.meterR, 1);
    }

    // Monitoring: the master to the main output; the cue laid over it, or split L/R, or on its own device.
    this.mainOut = ctx.createGain();
    this.masterOut.connect(this.mainOut).connect(ctx.destination);
    this.cueBus = ctx.createGain();
    this.singleCue = ctx.createGain();
    this.cueBus.connect(this.singleCue).connect(ctx.destination);
    if (typeof ctx.createChannelMerger === "function") {
      const merger = ctx.createChannelMerger(2);
      const mono = (g: GainNode) => {
        g.channelCount = 1;
        g.channelCountMode = "explicit";
        g.channelInterpretation = "speakers";
        return g;
      };
      this.splitCue = mono(ctx.createGain());
      this.splitMaster = mono(ctx.createGain());
      this.cueBus.connect(this.splitCue).connect(merger, 0, 0);
      this.masterOut.connect(this.splitMaster).connect(merger, 0, 1);
      merger.connect(ctx.destination);
    }

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.master;
    this.dryGain = ctx.createGain();
    this.duck = ctx.createGain();
    this.masterGain.connect(this.dryGain).connect(this.duck).connect(this.limiter);

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
    echoTone.connect(this.duck);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.8;
    this.masterGain.connect(this.reverbSend);
    this.reverbSend.connect(convolver).connect(reverbOut).connect(this.duck);

    this.decks = {
      A: new DeckUnit("A", ctx, this.masterGain, this.cueBus),
      B: new DeckUnit("B", ctx, this.masterGain, this.cueBus),
    };
    for (const d of Object.values(this.decks)) {
      d.quantize = !!opts.quantize;
      this.applyVolume(d);
      d.applyTrim();
    }
    this.applyCrossfader();
    this.applyMonitor();
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
      mix: {
        crossfader: this.crossfader,
        curve: this.curve,
        master: this.master,
        masterLevel: this.masterLevel,
        faderCurve: this.faderCurve,
        cueMix: this.cueMix,
        phones: this.phonesLevel,
        monitor: this.monitor,
        recording: !!this.recorder,
        talkover: this.talkover,
      },
      fx: { ...this.fx },
    };
  }

  private peakOf(a: AnalyserNode | null) {
    if (!a) return 0;
    a.getFloatTimeDomainData(this.scratchBuf);
    let peak = 0;
    for (let i = 0; i < this.scratchBuf.length; i++) peak = Math.max(peak, Math.abs(this.scratchBuf[i]));
    return peak;
  }

  private measureMaster() {
    const peak = this.peakOf(this.masterMeter);
    this.masterLevel = peak > this.masterLevel ? peak : this.masterLevel * 0.85 + peak * 0.15;
  }

  /** Cheap live meter values for the UI's animation frames. */
  levels() {
    this.measureMaster();
    this.checkEnds();
    return { A: this.decks.A.measure(), B: this.decks.B.measure(), master: this.masterLevel };
  }

  /** Raw peaks for the VU meters (pre-fader channels, master L/R). */
  peaks() {
    const m = this.meterL ? null : this.peakOf(this.masterMeter);
    return {
      A: this.decks.A.peak(),
      B: this.decks.B.peak(),
      L: m ?? this.peakOf(this.meterL),
      R: m ?? this.peakOf(this.meterR),
    };
  }

  /** The key-lock voice has no end event: stop decks that ran off the end. */
  private checkEnds() {
    for (const id of ["A", "B"] as DeckId[]) {
      const d = this.decks[id];
      if (d.jsVoice && d.playing && d.track && !d.loop.active && d.position() >= d.track.info.duration - 0.02) this.trackEnded(id);
    }
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

  /** Whether this browser can run key lock and audible scratching. */
  get jsVoicesSupported() {
    return canRunJsVoices(this.ctx);
  }

  // -------------------------------------------------------------- tracks

  loadTrack(id: DeckId, track: LoadedTrack) {
    const d = this.decks[id];
    this.endScratch(d, false);
    this.pause(id, false);
    d.track = track;
    // Auto cue: the first beat of the grid, as players do on load.
    d.pausedPos = track.info.firstBeat > 0.05 && track.info.firstBeat < 10 ? track.info.firstBeat : 0;
    d.cue = d.pausedPos;
    d.loop = { active: false, start: 0, end: 0, beats: null };
    d.loopIn = null;
    d.bend = 0;
    d.tempoPct = 0;
    d.brake = null;
    d.spinUp = null;
    d.roll = null;
    d.slipShadow = null;
    d.hotCues = emptyHotCues();
    d.trim = 0;
    d.applyTrim();
    for (const s of ["drums", "bass", "chords", "vocal"] as DemoStem[]) this.setStemKill(id, s, false, false);
    this.emit();
  }

  /** Empties a deck. */
  unloadTrack(id: DeckId) {
    const d = this.decks[id];
    this.endScratch(d, false);
    this.pause(id, false);
    d.track = null;
    d.pausedPos = 0;
    d.cue = 0;
    d.loop = { active: false, start: 0, end: 0, beats: null };
    d.tempoPct = 0;
    d.bend = 0;
    d.brake = null;
    d.spinUp = null;
    d.roll = null;
    d.slipShadow = null;
    d.hotCues = emptyHotCues();
    this.emit();
  }

  // ----------------------------------------------------------- transport

  /**
   * Starts a deck. `motorSeconds` > 0 spins it up from standstill like a
   * turntable's motor (the record takes that long to reach speed).
   */
  play(id: DeckId, when?: number, motorSeconds = 0) {
    const d = this.decks[id];
    this.unlock();
    if (!d.track || d.scratch) return;
    if (d.brake) this.cancelBrake(d);
    if (d.playing) return;
    if (d.pausedPos >= d.track.info.duration - 0.1) d.pausedPos = d.cue;
    const start = when ?? this.ctx.currentTime + 0.01;
    d.anchorPos = d.pausedPos;
    d.anchorTime = start;
    d.playing = true;
    if (motorSeconds > 0) {
      d.spinUp = { t0: start, T: motorSeconds, r0: d.rate, pos0: d.pausedPos };
      d.startVoices(d.pausedPos, start, () => this.trackEnded(id), true);
      for (const v of d.voices) {
        v.src.playbackRate.setValueAtTime(0.01, start);
        v.src.playbackRate.linearRampToValueAtTime(d.rate, start + motorSeconds);
      }
      this.later(() => {
        if (d.spinUp?.t0 !== start) return;
        d.reanchor();
        if (d.keyLock) this.restartVoices(d, id);
      }, (start - this.ctx.currentTime + motorSeconds) * 1000 + 20);
    } else d.startVoices(d.pausedPos, start, () => this.trackEnded(id));
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
      d.spinUp = null;
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
    d.stopVoices();
    this.emit();
  }

  /** Restarts a playing deck's voices where it is (after key lock flips, say). */
  private restartVoices(d: DeckUnit, id: DeckId) {
    if (!d.playing || !d.track) return;
    const lead = 0.004;
    const when = this.ctx.currentTime + lead;
    const at = Math.min(d.position() + lead * d.rate, d.track.info.duration - 0.05);
    d.anchorPos = at;
    d.anchorTime = when;
    d.spinUp = null;
    d.startVoices(at, when, () => this.trackEnded(id));
  }

  seek(id: DeckId, pos: number) {
    const d = this.decks[id];
    if (!d.track) return;
    const p = clamp(pos, 0, d.track.info.duration - 0.05);
    if (d.scratch) {
      d.scratch.target = p;
      this.emit();
      return;
    }
    if (d.playing) {
      // The new sources start a few ms from now, so start that much further in:
      // `pos` is where the playhead is meant to be right now.
      const lead = 0.004;
      const when = this.ctx.currentTime + lead;
      const at = Math.min(p + lead * d.rate, d.track.info.duration - 0.05);
      d.brake = null;
      d.spinUp = null;
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
    if (Math.abs(d.pausedPos - d.cue) > 0.05) {
      d.cue = quantizePos(d.track.info, d.pausedPos, d.quantize);
      d.pausedPos = d.cue;
    }
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
    d.cue = quantizePos(d.track.info, d.position(), d.quantize);
    this.emit();
  }

  // ------------------------------------------------------------ hot cues

  /**
   * Hot cue pad pressed: an empty pad stores the playhead (snapped to the
   * beat with quantize); a set one jumps there (keeping the beat phase with
   * quantize). Stopped, the deck starts from it. In slip mode the jump only
   * lasts while the pad is held (see hotCueUp).
   */
  hotCueDown(id: DeckId, index: number) {
    const d = this.decks[id];
    this.unlock();
    if (!d.track || index < 0 || index >= HOT_CUE_COUNT) return;
    const at = d.hotCues[index];
    if (at === null || at === undefined) {
      d.hotCues = withHotCue(d.hotCues, index, quantizePos(d.track.info, d.position(), d.quantize));
      this.emit();
      return;
    }
    if (d.playing) {
      if (d.slip) {
        d.slipShadow ??= { pos: d.position(), time: this.ctx.currentTime };
        d.heldHotCue = index;
      }
      this.seek(id, quantizedJump(d.track.info, d.position(), at, d.quantize));
    } else {
      d.pausedPos = at;
      this.play(id);
    }
  }

  hotCueUp(id: DeckId, index: number) {
    const d = this.decks[id];
    if (d.heldHotCue !== index) return;
    d.heldHotCue = null;
    this.slipReturn(id);
  }

  clearHotCue(id: DeckId, index: number) {
    const d = this.decks[id];
    d.hotCues = withHotCue(d.hotCues, index, null);
    this.emit();
  }

  // ---------------------------------------------------------------- loops

  private applyLoopToVoices(d: DeckUnit) {
    for (const v of d.voices) {
      v.src.loopStart = d.loop.start;
      v.src.loopEnd = d.loop.end;
      v.src.loop = d.loop.active;
    }
    // The key-lock voice reads the loop itself.
  }

  private startSlip(d: DeckUnit) {
    if (d.slip && d.playing && !d.slipShadow) d.slipShadow = { pos: d.position(), time: this.ctx.currentTime };
  }

  /** Slip mode: jump to where the track would have been, and stop shadowing. */
  private slipReturn(id: DeckId) {
    const d = this.decks[id];
    const to = d.slipPosition();
    d.slipShadow = null;
    if (to !== null) this.seek(id, to);
    else this.emit();
  }

  loopBeats(id: DeckId, beats: number) {
    const d = this.decks[id];
    if (!d.track) return;
    if (d.loop.active && d.loop.beats === beats) return this.loopExit(id);
    const pos = d.position();
    // Auto loops start on the grid with quantize (and always on the demo's
    // perfect grid); otherwise exactly here.
    const start = d.quantize || d.track.info.source !== "library" ? floorToGrid(d.track.info, pos, Math.min(1, beats)) : pos;
    this.startSlip(d);
    d.reanchor();
    d.loop = { active: true, start, end: Math.min(d.track.info.duration, start + beats * beatSeconds(d.track.info)), beats };
    this.applyLoopToVoices(d);
    this.emit();
  }

  loopInPoint(id: DeckId) {
    const d = this.decks[id];
    if (!d.track) return;
    d.loopIn = quantizePos(d.track.info, d.position(), d.quantize);
    this.emit();
  }

  loopOutPoint(id: DeckId) {
    const d = this.decks[id];
    if (!d.track || d.loopIn === null) return;
    let pos = d.position();
    if (d.quantize) {
      const q = quantizePos(d.track.info, pos, true);
      pos = q > d.loopIn ? q : d.loopIn + beatSeconds(d.track.info);
    }
    if (pos - d.loopIn < 0.08) return;
    this.startSlip(d);
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
    if (d.slipShadow && d.heldHotCue === null && !d.scratch) this.slipReturn(id);
    else this.emit();
  }

  /** RELOOP: switch the last loop back on (jumping into it if the playhead has passed it). */
  reloop(id: DeckId) {
    const d = this.decks[id];
    if (!d.track || d.loop.active || d.loop.end - d.loop.start < 0.01) return;
    const pos = d.position();
    d.reanchor();
    d.loop = { ...d.loop, active: true };
    this.applyLoopToVoices(d);
    if (pos > d.loop.end || pos < d.loop.start - 0.01) this.seek(id, d.loop.start);
    else this.emit();
  }

  /** Loop ½× / 2×: shortens or lengthens the loop from its start. */
  resizeLoop(id: DeckId, factor: 0.5 | 2) {
    const d = this.decks[id];
    if (!d.track) return;
    const next = resizeLoop(d.track.info, d.loop, factor);
    if (!next) return;
    const pos = d.position();
    d.reanchor();
    d.loop = next;
    this.applyLoopToVoices(d);
    if (next.active && pos >= next.end) this.seek(id, next.start + ((pos - next.start) % (next.end - next.start)));
    else this.emit();
  }

  /** A slip roll: loop while held, then rejoin the track where it would have been. */
  rollStart(id: DeckId, beats: number) {
    const d = this.decks[id];
    if (!d.track || !d.playing || d.roll) return;
    this.unlock();
    d.roll = { pos: d.position(), time: this.ctx.currentTime };
    this.fx.roll = (this.fx.roll ?? 0) + 1;
    const slip = d.slip;
    d.slip = false;
    this.loopBeats(id, beats);
    d.slip = slip;
  }

  rollEnd(id: DeckId) {
    const d = this.decks[id];
    if (!d.roll) return;
    const slip = d.roll;
    d.roll = null;
    d.reanchor();
    d.loop = { ...d.loop, active: false };
    this.applyLoopToVoices(d);
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

  /** Nudge (pitch bend): -1 slows a little, +1 speeds up a little, 0 lets go; anything between for a jog wheel. */
  setBend(id: DeckId, bend: number) {
    const d = this.decks[id];
    const b = clamp(bend, -1, 1);
    if (d.bend === b) return;
    d.reanchor();
    d.bend = b;
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

  // ------------------------------------------------- player modes & jog

  /** Master tempo: tempo without pitch change (needs the JS voice; see djVoices.ts). */
  setKeyLock(id: DeckId, on: boolean) {
    const d = this.decks[id];
    if (d.keyLock === on) return;
    d.keyLock = on && this.jsVoicesSupported;
    if (!d.brake && !d.spinUp && !d.scratch) this.restartVoices(d, id);
    this.emit();
  }

  setQuantize(id: DeckId, on: boolean) {
    this.decks[id].quantize = on;
    this.emit();
  }

  setSlip(id: DeckId, on: boolean) {
    const d = this.decks[id];
    d.slip = on;
    if (!on) d.slipShadow = null;
    this.emit();
  }

  setVinyl(id: DeckId, on: boolean) {
    this.decks[id].vinyl = on;
    this.emit();
  }

  /**
   * Hand on the platter: the deck stops following its clock and follows
   * the hand (scratchMove), audibly where the browser allows. On release
   * it carries on from where the hand left it (or, in slip mode, from
   * where it would have been).
   */
  scratchStart(id: DeckId) {
    const d = this.decks[id];
    if (!d.track || d.scratch) return;
    this.unlock();
    if (d.brake) this.cancelBrake(d);
    const pos = d.position();
    const wasPlaying = d.playing;
    this.startSlip(d);
    if (d.playing) {
      d.pausedPos = pos;
      d.playing = false;
      d.spinUp = null;
      d.stopVoices();
    }
    const s: NonNullable<DeckUnit["scratch"]> = { wasPlaying, target: pos, voice: null };
    d.scratch = s;
    const host = d.voiceHost();
    if (host && this.jsVoicesSupported) s.voice = new ScratchVoice(this.ctx, d.input, host, pos, () => s.target);
    this.fx.scratch = (this.fx.scratch ?? 0) + 1;
    this.emit();
  }

  /** Moves the record under the hand by `deltaSec` of track time. */
  scratchMove(id: DeckId, deltaSec: number) {
    const d = this.decks[id];
    if (!d.scratch || !d.track) return;
    d.scratch.target = clamp(d.scratch.target + deltaSec, 0, d.track.info.duration - 0.05);
    // Count changes of direction (a baby scratch is one push and one pull), ignoring jitter.
    if (Math.abs(deltaSec) > 0.002) {
      const dir = Math.sign(deltaSec);
      if (d.scratchDir !== 0 && dir !== d.scratchDir) this.countFx("scratchTurn");
      d.scratchDir = dir;
    }
  }

  scratchEnd(id: DeckId) {
    this.endScratch(this.decks[id], true);
  }

  private endScratch(d: DeckUnit, resume: boolean) {
    const s = d.scratch;
    if (!s) return;
    const pos = s.voice?.position ?? s.target;
    s.voice?.stop();
    d.scratch = null;
    const back = d.slipPosition();
    d.slipShadow = null;
    d.pausedPos = clamp(back ?? pos, 0, (d.track?.info.duration ?? 0.05) - 0.05);
    if (resume && s.wasPlaying) this.play(d.id);
    else this.emit();
  }

  // -------------------------------------------------------------- mixer

  private applyVolume(d: DeckUnit) {
    d.fader.gain.setTargetAtTime(faderGain(d.volume, this.faderCurve), this.ctx.currentTime, 0.01);
  }

  setVolume(id: DeckId, v: number) {
    const d = this.decks[id];
    d.volume = clamp(v, 0, 1);
    this.applyVolume(d);
    this.emit();
  }

  setFaderCurve(curve: FaderCurve) {
    this.faderCurve = curve;
    for (const d of Object.values(this.decks)) this.applyVolume(d);
    this.emit();
  }

  setTrim(id: DeckId, db: number) {
    const d = this.decks[id];
    d.trim = clamp(db, -TRIM_DB, TRIM_DB);
    d.applyTrim();
    this.emit();
  }

  setAutoGain(id: DeckId, on: boolean) {
    const d = this.decks[id];
    d.autoGain = on;
    d.applyTrim();
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
    // Isolator: full cut at the bottom of the knob, as on club mixers.
    const db = d.eqDb[band];
    const g = d.kill[band] || db <= EQ_MIN_DB + 0.01 ? 0 : dbToGain(db);
    d.band[band].gain.setTargetAtTime(g, this.ctx.currentTime, 0.012);
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

  private applyStemGains(d: DeckUnit) {
    const now = this.ctx.currentTime;
    for (const s of STEM_SLOTS) d.stemGain[s].gain.setTargetAtTime(d.slotGain(s), now, 0.008);
  }

  setStemKill(id: DeckId, stem: DemoStem, killed: boolean, emit = true) {
    const d = this.decks[id];
    d.stems[stem] = killed;
    this.applyStemGains(d);
    if (emit) this.emit();
  }

  /** A two-stem song's BEAT button: drums, bass and melody together. */
  setBeatKill(id: DeckId, killed: boolean) {
    const d = this.decks[id];
    d.stems.drums = killed;
    d.stems.bass = killed;
    d.stems.chords = killed;
    this.applyStemGains(d);
    this.emit();
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

  // --------------------------------------------------------- headphones

  setCueMix(v: number) {
    this.cueMix = clamp(v, 0, 1);
    this.applyMonitor();
    this.emit();
  }

  setPhones(v: number) {
    this.phonesLevel = clamp(v, 0, 1);
    this.applyMonitor();
    this.emit();
  }

  setMonitor(mode: MonitorMode) {
    this.monitor = mode === "split" && !this.splitCue ? "single" : mode;
    if (this.monitor !== "device") this.closePhones();
    this.applyMonitor();
    this.emit();
  }

  private applyMonitor() {
    const now = this.ctx.currentTime;
    const h = this.phonesLevel;
    const cueAmt = Math.cos((this.cueMix * Math.PI) / 2);
    const masAmt = Math.sin((this.cueMix * Math.PI) / 2);
    const set = (g: GainNode | null | undefined, v: number) => g?.gain.setTargetAtTime(v, now, 0.02);
    const m = this.monitor;
    set(this.mainOut, m === "split" ? 0 : 1);
    // One output: the cue is laid over the master at the cue-mix level.
    set(this.singleCue, m === "single" ? cueAmt * h : 0);
    set(this.splitCue, m === "split" ? h : 0);
    set(this.splitMaster, m === "split" ? h : 0);
    set(this.phones?.cue, m === "device" ? cueAmt * h : 0);
    set(this.phones?.master, m === "device" ? masAmt * h : 0);
  }

  /** Can the headphone cue go to its own audio output in this browser? */
  static phonesDeviceSupported() {
    return typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  }

  /** Can the master be sent to a chosen audio output? */
  get mainDeviceSupported() {
    return "setSinkId" in this.ctx;
  }

  async setMainDevice(deviceId: string) {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (c.setSinkId) await c.setSinkId(deviceId);
  }

  /** Sends the headphone mix to another audio output (a second sound card or USB headphones). */
  async setPhonesDevice(deviceId: string) {
    if (!DjEngine.phonesDeviceSupported() || typeof this.ctx.createMediaStreamDestination !== "function") throw new Error("This browser can't send audio to a second output.");
    if (!this.phones) {
      const dest = this.ctx.createMediaStreamDestination();
      const cue = this.ctx.createGain();
      const master = this.ctx.createGain();
      cue.gain.value = 0;
      master.gain.value = 0;
      this.cueBus.connect(cue).connect(dest);
      this.masterOut.connect(master).connect(dest);
      const el = new Audio();
      el.srcObject = dest.stream;
      this.phones = { cue, master, dest, el };
    }
    const el = this.phones.el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    await el.setSinkId(deviceId);
    await el.play();
    this.monitor = "device";
    this.applyMonitor();
    this.emit();
  }

  private closePhones() {
    const p = this.phones;
    if (!p) return;
    this.phones = null;
    p.el.pause();
    p.el.srcObject = null;
    p.cue.disconnect();
    p.master.disconnect();
  }

  // ---------------------------------------------------------- talkover

  /** Talkover: the music ducks ~14 dB so an announcement cuts through (a live mic joins if allowed). */
  setTalkover(on: boolean) {
    this.talkover = on;
    this.duck.gain.setTargetAtTime(on ? 0.2 : 1, this.ctx.currentTime, on ? 0.03 : 0.25);
    this.mic?.gain.gain.setTargetAtTime(on ? 1.2 : 0, this.ctx.currentTime, 0.02);
    if (on) this.countFx("talkover");
    this.emit();
  }

  get talkoverOn() {
    return this.talkover;
  }

  /** Opens the microphone for talkover. Resolves false if there's no mic or it was refused. */
  async enableMic() {
    if (this.mic) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const node = this.ctx.createMediaStreamSource(stream);
      const gain = this.ctx.createGain();
      gain.gain.value = this.talkover ? 1.2 : 0;
      node.connect(gain).connect(this.limiter);
      this.mic = { stream, node, gain };
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------- recording

  static recordingSupported() {
    return typeof MediaRecorder !== "undefined";
  }

  /** Records the master output (what the crowd hears, after the limiter). */
  startRecording() {
    if (this.recorder || !DjEngine.recordingSupported()) return false;
    this.unlock();
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.masterOut.connect(this.recDest);
    }
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
    const rec = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.start(1000);
    this.recorder = { rec, chunks, started: this.ctx.currentTime, mime: rec.mimeType || mime || "audio/webm" };
    this.emit();
    return true;
  }

  recordingSeconds() {
    return this.recorder ? this.ctx.currentTime - this.recorder.started : 0;
  }

  stopRecording(): Promise<RecordingResult | null> {
    const r = this.recorder;
    if (!r) return Promise.resolve(null);
    this.recorder = null;
    const seconds = this.ctx.currentTime - r.started;
    return new Promise((resolve) => {
      r.rec.onstop = () => {
        resolve({ blob: new Blob(r.chunks, { type: r.mime }), mime: r.mime, seconds });
        this.emit();
      };
      r.rec.stop();
    });
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

  /**
   * Sampler pad one-shots (a controller's SAMPLER mode), synthesised so
   * there's no audio to ship: a laser zap, a kick, a clap, a riser, a
   * sub drop, a crash, and the air horn.
   */
  sample(kind: SampleKind) {
    this.unlock();
    if (kind === "horn") return this.airHorn();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.connect(this.fxOut);
    const nodes: AudioNode[] = [env];
    let end = t + 0.5;
    const noise = (seconds: number) => {
      const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 987654321;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      nodes.push(src);
      return src;
    };
    const osc = (type: OscillatorType) => {
      const o = ctx.createOscillator();
      o.type = type;
      nodes.push(o);
      return o;
    };
    switch (kind) {
      case "laser": {
        const o = osc("sawtooth");
        o.frequency.setValueAtTime(2400, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.35);
        env.gain.setValueAtTime(0.18, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(env);
        o.start(t);
        o.stop((end = t + 0.42));
        break;
      }
      case "kick": {
        const o = osc("sine");
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        env.gain.setValueAtTime(0.9, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(env);
        o.start(t);
        o.stop((end = t + 0.5));
        break;
      }
      case "clap": {
        const n = noise(0.3);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1500;
        bp.Q.value = 0.8;
        nodes.push(bp);
        env.gain.setValueAtTime(0, t);
        for (const k of [0, 0.012, 0.024]) {
          env.gain.setValueAtTime(0.6, t + k);
          env.gain.exponentialRampToValueAtTime(0.05, t + k + 0.01);
        }
        env.gain.setValueAtTime(0.5, t + 0.036);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        n.connect(bp).connect(env);
        n.start(t);
        n.stop((end = t + 0.3));
        break;
      }
      case "riser": {
        const n = noise(2.2);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 3;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(7000, t + 2);
        nodes.push(bp);
        env.gain.setValueAtTime(0.001, t);
        env.gain.exponentialRampToValueAtTime(0.4, t + 1.9);
        env.gain.linearRampToValueAtTime(0, t + 2.1);
        n.connect(bp).connect(env);
        n.start(t);
        n.stop((end = t + 2.2));
        break;
      }
      case "drop": {
        const o = osc("sine");
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
        env.gain.setValueAtTime(0.8, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.connect(env);
        o.start(t);
        o.stop((end = t + 1.55));
        break;
      }
      case "crash": {
        const n = noise(1.6);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 5000;
        nodes.push(hp);
        env.gain.setValueAtTime(0.35, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        n.connect(hp).connect(env);
        n.start(t);
        n.stop((end = t + 1.6));
        break;
      }
    }
    this.later(() => nodes.forEach((n) => n.disconnect()), (end - t) * 1000 + 100);
    this.countFx(`sample:${kind}`);
    this.emit();
  }

  /** The platter slowing to a stop (also a turntable's STOP button). */
  brake(id: DeckId, seconds = 0.9, thenSpin = false) {
    const d = this.decks[id];
    if (!d.track || !d.playing || d.brake || d.scratch) return;
    this.unlock();
    d.roll = null;
    if (d.loop.active) this.loopExit(id);
    const now = this.ctx.currentTime;
    const r0 = d.rate;
    const pos0 = d.position();
    // A brake is a vinyl effect: it always slows the pitch too.
    if (d.jsVoice) {
      d.anchorPos = pos0;
      d.anchorTime = now;
      d.startVoices(pos0, now, () => this.trackEnded(id), true);
    }
    d.spinUp = null;
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
      this.endScratch(this.decks[id], false);
      this.pause(id, false);
      if (!setup.decks[id]) this.unloadTrack(id);
      const d = this.decks[id];
      d.bend = 0;
      d.tempoRange = setup.tempoRange ?? DEFAULT_TEMPO_RANGE;
      d.slipShadow = null;
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
      const t = loaded[i];
      this.loadTrack(id, t);
      d.tempoRange = setup.tempoRange ?? DEFAULT_TEMPO_RANGE;
      d.tempoPct = clamp(s.tempoPct ?? 0, -d.tempoRange, d.tempoRange);
      this.setVolume(id, s.volume ?? 0.8);
      d.pausedPos = clamp(t.info.firstBeat + (s.startBar ?? 0) * (240 / t.info.bpm), 0, Math.max(0, t.info.duration - 1));
      d.cue = t.info.firstBeat < 10 ? t.info.firstBeat : 0;
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
    if (this.talkover) this.setTalkover(false);
  }

  /** Silences everything (leaving a mission). */
  stopAll() {
    this.stopAllFx();
    for (const id of ["A", "B"] as DeckId[]) {
      const d = this.decks[id];
      d.roll = null;
      this.endScratch(d, false);
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
      d.scratch?.voice?.stop();
      d.scratch = null;
      d.stopVoices();
      d.playing = false;
    }
    if (this.recorder) {
      try {
        this.recorder.rec.stop();
      } catch {
        // Already stopped.
      }
      this.recorder = null;
    }
    this.closePhones();
    this.mic?.stream.getTracks().forEach((t) => t.stop());
    this.mic = null;
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
