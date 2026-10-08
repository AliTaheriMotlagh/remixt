"use client";

import {
  createLaneChain,
  createMasterChain,
  needsOwnRender,
  scheduleLane,
  type ClipBufferLookup,
  type LaneChain,
  type MasterChain,
} from "./audioGraph";
import { scheduleModulation } from "./modulation";
import { renderPitchTempo, stretchEngine } from "./pitchTempo";
import { previewPlayer } from "./previewPlayer";
import { keepScreenOn } from "./wakeLock";
import { deviceGb, isConstrainedDevice } from "./device";
import { getPlayingRemix, setNowPlaying } from "./mediaSession";
import {
  disableNowPlayingAnchor,
  onNowPlayingAnchorLost,
  startNowPlayingAnchor,
  stopNowPlayingAnchor,
} from "./nowPlayingAnchor";
import { fetchStem } from "./stemFetch";
import {
  beatLength,
  getAudibleLaneIds,
  laneGain,
  subscribeMix,
  useStudioStore,
  type LaneClip,
  type Pad,
  type StudioLane,
} from "./studioStore";

/**
 * A stem's decoded audio and what was rendered from it — kept by stem, so
 * a lane that goes and comes back (A/B on an AI idea that swaps the beat
 * for its parts, undo) plays at once instead of downloading, decoding and
 * stretching it all over again.
 */
type DecodedStem = {
  raw: AudioBuffer;
  /** Whole-stem renders at a speed and pitch (see renderKey). */
  renders: Map<string, AudioBuffer>;
  /** Clips with a speed of their own, each rendered separately (see clipKey). */
  clipBuffers: Map<string, AudioBuffer>;
};

type LoadedLane = {
  stemId: string;
  rawBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  appliedTempo: number;
  appliedPitch: number;
  chain: LaneChain;
  /** One per clip while playing (just one for a lane that isn't arranged). */
  sources: AudioBufferSourceNode[];
  renders: Map<string, AudioBuffer>;
  clipBuffers: Map<string, AudioBuffer>;
};

/**
 * Phones get far tighter limits: they reload the page, with no warning,
 * once it holds more than they allow (see device.ts) — and the lanes
 * playing already take a few hundred MB there.
 */
const PHONE = isConstrainedDevice();

/**
 * Memory for audio kept in case it's wanted again — renders and clips no
 * lane plays right now (the other side of Before/After, the idea before),
 * and stems no lane plays (a beat swapped for its parts). Past this, the
 * least recently used goes. A four-minute stem rendered once is ~90 MB:
 * on a phone that's about one, so flipping Before/After on the last
 * change stays instant without piling up every idea tried.
 */
const SPARE_BYTES = (PHONE ? 96 : Math.min(384, Math.max(128, deviceGb() * 48))) * 2 ** 20;
/** Decoded stems kept for lanes that are gone, in case they come back (a beat swapped for its three parts and back). */
const PARKED_STEMS = PHONE ? 1 : 3;
/**
 * Stretch renders running at once, and how many seconds of audio between
 * them: while one runs it holds several copies of what it stretches, so a
 * few full-length ones side by side can take a phone's memory. (One
 * always runs, however long — on a phone, a whole stem runs alone.)
 */
const MAX_RENDERS = PHONE ? 2 : 4;
const MAX_RENDER_SECONDS = PHONE ? 150 : Math.min(480, Math.max(180, deviceGb() * 75));

/** Identifies a whole-stem render. */
function renderKey(tempo: number, pitch: number) {
  return `${tempo.toFixed(4)}|${pitch}|${stretchEngine()}`;
}

/** When each kept buffer (or stem) was last used, for letting go of the least recently used first. */
const lastUsed = new WeakMap<object, number>();
let useClock = 0;
function used(thing: object) {
  lastUsed.set(thing, ++useClock);
}

const bytesOf = (buffer: AudioBuffer) => buffer.length * buffer.numberOfChannels * 4;

/** A render dropped from the queue before it started: by its turn, nothing wanted it any more. */
class RenderSkipped extends Error {
  constructor() {
    super("No longer wanted");
  }
}

/** Who wants a render: a lane waiting on it (`urgent`) or a look-ahead; `wanted` turns false when they've moved on. */
type RenderAsk = { urgent: boolean; wanted: () => boolean };

type QueuedRender = { seconds: number; urgent: () => boolean; wanted: () => boolean; start: () => void; skip: () => void };

/**
 * Stretch renders take their turn: only a few at once (see MAX_RENDERS),
 * what a lane is waiting on before any look-ahead, and one nobody wants
 * any more by its turn (the lane moved on to another idea) never runs.
 */
class RenderQueue {
  private running = 0;
  private seconds = 0;
  private queued: QueuedRender[] = [];

  run<T>(seconds: number, ask: Pick<QueuedRender, "urgent" | "wanted">, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queued.push({
        seconds,
        ...ask,
        start: () => {
          this.running++;
          this.seconds += seconds;
          Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              this.running--;
              this.seconds -= seconds;
              this.next();
            });
        },
        skip: () => reject(new RenderSkipped()),
      });
      this.next();
    });
  }

  private next() {
    const gone = this.queued.filter((job) => !job.wanted());
    this.queued = this.queued.filter((job) => !gone.includes(job));
    for (const job of gone) job.skip();
    while (this.queued.length) {
      const job = this.queued.find((j) => j.urgent()) ?? this.queued[0];
      // One always runs, however long.
      if (this.running > 0 && (this.running >= MAX_RENDERS || this.seconds + job.seconds > MAX_RENDER_SECONDS)) return;
      this.queued.splice(this.queued.indexOf(job), 1);
      job.start();
    }
  }
}

const renderQueue = new RenderQueue();

/** Identifies one clip render: its slice of the stem, the speed and pitch it was rendered at, and direction. */
function clipKey(lane: StudioLane, clip: LaneClip) {
  return `${clip.from}|${clip.to}|${(lane.tempoRatio * (clip.stretch ?? 1)).toFixed(5)}|${lane.pitchSemitones}|${clip.reverse ? "r" : "f"}`;
}

/** Whether two clip lists play the same (an idea worked out again cuts the same clips with fresh ids). */
function sameClips(a: StudioLane["clips"], b: StudioLane["clips"]) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((clip, i) => {
    const other = b[i] as Record<string, unknown>;
    const fields = new Set([...Object.keys(clip), ...Object.keys(other)]);
    return [...fields].every((f) => f === "id" || f === "label" || (clip as Record<string, unknown>)[f] === other[f]);
  });
}

/** Copies `from`..`to` seconds of a buffer, backwards if asked. */
function sliceBuffer(ctx: BaseAudioContext, raw: AudioBuffer, from: number, to: number, reverse = false) {
  const start = Math.floor(from * raw.sampleRate);
  const end = Math.min(raw.length, Math.ceil(to * raw.sampleRate));
  if (end - start < 16) return null;
  const slice = ctx.createBuffer(raw.numberOfChannels, end - start, raw.sampleRate);
  for (let c = 0; c < raw.numberOfChannels; c++) {
    const data = raw.getChannelData(c).slice(start, end);
    if (reverse) data.reverse();
    slice.copyToChannel(data, c);
  }
  return slice;
}

function stopSources(sources: AudioBufferSourceNode[], when?: number) {
  for (const source of sources) {
    try {
      source.stop(when);
    } catch {
      // already stopped
    }
  }
}

/** The phone didn't let audio start (iOS kept the session interrupted). */
export class PlaybackBlockedError extends Error {
  constructor() {
    super("The phone didn't let the audio start. Tap play again.");
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: MasterChain | null = null;
  private lanes = new Map<string, LoadedLane>();
  private loading = new Map<string, Promise<void>>();
  /** Whole-stem renders asked for, by stem and speed/pitch — one render for every lane (or look-ahead) that wants it. */
  private rendersRunning = new Map<string, { promise: Promise<AudioBuffer>; asks: RenderAsk[] }>();
  /** How many renders each lane is waiting on (it shows as rendering while any are). */
  private waitingOn = new Map<string, number>();
  /** Bumped by every prepare, so an older look-ahead stops. */
  private prepareRun = 0;
  private decoded = new Map<string, DecodedStem>();
  private decoding = new Map<string, Promise<DecodedStem>>();
  private startedAtContextTime = 0;
  private startedAtPlayhead = 0;
  private rafId: number | null = null;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private nextClickBeat = 0;
  /** Bumped by every play, pause and stop, so a play still loading knows it was overtaken. */
  private playRequest = 0;
  /** Set when resume() never came through; the next tap starts on a fresh context. */
  private staleContext = false;
  /** The microphone is open on this context (recording a vocal). */
  private micActive = false;
  /** A tap on the mix for visuals (the live party's lights and crowd). */
  private analyser: AnalyserNode | null = null;

  /**
   * The mix's spectrum, for visuals. Taken before the master fader, so a
   * listener turning their volume down doesn't dim the lights. Null until
   * audio has started.
   */
  getAnalyser(): AnalyserNode | null {
    if (!this.ctx || !this.master) return null;
    if (!this.analyser || this.analyser.context !== this.ctx) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      this.master.input.connect(this.analyser);
    }
    return this.analyser;
  }

  /**
   * Recording keeps the phone's audio session in play-and-record mode —
   * in "playback" mode iOS hands the page a silent microphone.
   */
  setMicActive(on: boolean) {
    this.micActive = on;
    this.applyAudioSession();
  }

  private applyAudioSession() {
    // Web Audio on iOS follows the ringer switch unless the page asks for
    // media playback, which is why the mix could be silent while library
    // previews (an <audio> element) were not. Safari 16.4+.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    const wanted = this.micActive ? "play-and-record" : "playback";
    if (session && session.type !== wanted) session.type = wanted;
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = createMasterChain(ctx, ctx.destination, useStudioStore.getState().master);
      this.master.gain.gain.value = useStudioStore.getState().masterVolume;
      // iOS stops the audio clock when the page is backgrounded, a call
      // comes in or another app takes the audio (state "interrupted" or
      // "suspended"). Pause the transport at that point so the playhead
      // and the play button reflect what's actually heard; the next tap
      // on play resumes from there.
      ctx.addEventListener("statechange", () => {
        if (this.ctx !== ctx) return;
        if (ctx.state !== "running" && useStudioStore.getState().isPlaying) this.pause();
      });
    }
    return this.ctx;
  }

  /**
   * Swaps in a new AudioContext, rebuilding the master bus and every lane's
   * FX chain on it. Decoded and rendered buffers aren't tied to a context,
   * so they carry over and nothing is downloaded or rendered again.
   */
  private resetContext(): AudioContext {
    const old = this.ctx;
    this.stopAllSources();
    this.stopMetronome();
    for (const entry of this.lanes.values()) entry.chain.disconnect();
    this.ctx = null;
    this.master = null;
    this.staleContext = false;
    void old?.close().catch(() => {});

    const ctx = this.getContext();
    const { lanes, projectBpm } = useStudioStore.getState();
    for (const [laneId, entry] of this.lanes) {
      const lane = lanes.find((l) => l.laneId === laneId);
      if (!lane) {
        this.lanes.delete(laneId);
        continue;
      }
      entry.chain = createLaneChain(ctx, lane, projectBpm, this.master!.input);
    }
    return ctx;
  }

  /**
   * Mobile Safari only lets audio start from inside a tap, so this must
   * run synchronously in the gesture, before anything is awaited.
   */
  private unlock({ keepContext = false } = {}): Promise<AudioContext> {
    // After a call, Siri, backgrounding or another player (including our
    // own library preview) iOS can leave the context "interrupted" with
    // resume() never settling — play then did nothing until a reload. A
    // context made inside this tap starts cleanly. (Not while the mic is
    // open on the current one: opening it is itself what interrupts it on
    // iOS, and a new context would leave the recording deaf.)
    const state = this.ctx?.state as string | undefined;
    const ctx =
      !keepContext && (this.staleContext || state === "interrupted" || state === "closed")
        ? this.resetContext()
        : this.getContext();

    this.applyAudioSession();

    // Besides "suspended", iOS has a non-standard "interrupted" state
    // that also needs resuming.
    const resumed = ctx.state === "running" ? Promise.resolve() : ctx.resume();

    // Older iOS only fully unlocks once a sound starts within the gesture.
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silence.connect(ctx.destination);
    silence.start();

    // resume() can stay pending while iOS keeps the session interrupted;
    // don't leave the play button spinning on it forever.
    return Promise.race([
      resumed.catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    ]).then(() => ctx);
  }

  /**
   * Unlocks audio from inside a tap (see unlock) for things that start
   * playback a moment later — recording asks for the microphone first.
   */
  prepareAudio(): Promise<AudioContext> {
    previewPlayer.stop();
    return this.unlock();
  }

  /** Where on the project timeline the audio clock's `contextTime` falls, while playing. */
  timelineAt(contextTime: number) {
    return this.startedAtPlayhead + (contextTime - this.startedAtContextTime);
  }

  async ensureLane(laneId: string, stemId: string) {
    if (this.lanes.has(laneId) || this.loading.has(laneId)) {
      await this.loading.get(laneId);
      return;
    }
    const { projectBpm } = useStudioStore.getState();

    const promise = this.decodedStem(stemId)
      .then((stem) => {
        const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
        if (!lane) return;
        // The context may have been replaced while this downloaded.
        const chain = createLaneChain(this.getContext(), lane, projectBpm, this.master!.input);
        this.lanes.set(laneId, {
          stemId,
          rawBuffer: stem.raw,
          processedBuffer: stem.raw,
          appliedTempo: 1,
          appliedPitch: 0,
          chain,
          sources: [],
          renders: stem.renders,
          clipBuffers: stem.clipBuffers,
        });
      })
      .finally(() => {
        this.loading.delete(laneId);
      });

    this.loading.set(laneId, promise);
    await promise;
  }

  /** A stem's decoded audio: kept from before (a lane that came back), or downloaded and decoded. */
  private decodedStem(stemId: string): Promise<DecodedStem> {
    const kept = this.decoded.get(stemId);
    if (kept) {
      used(kept);
      return Promise.resolve(kept);
    }
    // A vocal and its layers play the same stem: one download for all of them.
    let pending = this.decoding.get(stemId);
    if (!pending) {
      pending = fetchStem(stemId)
        .then((bytes) => this.getContext().decodeAudioData(bytes))
        .then((raw) => {
          const stem: DecodedStem = { raw, renders: new Map(), clipBuffers: new Map() };
          used(stem);
          this.decoded.set(stemId, stem);
          this.trimCaches();
          return stem;
        })
        .finally(() => this.decoding.delete(stemId));
      this.decoding.set(stemId, pending);
    }
    return pending;
  }

  /**
   * Keeps the audio held in memory within bounds. What lanes play now —
   * their stems, renders and clips — always stays; of the rest (renders
   * and clips kept for Before/After or the idea before, stems no lane
   * plays) the least recently used goes first, past SPARE_BYTES. Every
   * stem shares the one budget, so trying idea after idea never piles up.
   */
  private trimCaches() {
    const { lanes } = useStudioStore.getState();
    const needed = new Set<AudioBuffer>();
    const stemsInUse = new Set<string>();
    for (const [laneId, entry] of this.lanes) {
      stemsInUse.add(entry.stemId);
      needed.add(entry.processedBuffer);
      const lane = lanes.find((l) => l.laneId === laneId);
      if (!lane) continue;
      const now = entry.renders.get(renderKey(lane.tempoRatio, lane.pitchSemitones));
      if (now) needed.add(now);
      for (const key of this.wantedClips(lane).keys()) {
        const clip = entry.clipBuffers.get(key);
        if (clip) needed.add(clip);
      }
    }
    type Spare = { bytes: number; at: number; drop: () => void };
    const spare: Spare[] = [];
    const parked: [string, DecodedStem][] = [];
    for (const [stemId, stem] of this.decoded) {
      if (!stemsInUse.has(stemId)) {
        parked.push([stemId, stem]);
        continue;
      }
      for (const map of [stem.renders, stem.clipBuffers]) {
        for (const [key, buffer] of map) {
          if (!needed.has(buffer)) spare.push({ bytes: bytesOf(buffer), at: lastUsed.get(buffer) ?? 0, drop: () => map.delete(key) });
        }
      }
    }
    // A stem no lane plays goes as a whole: its audio and everything rendered from it.
    parked.sort(([, a], [, b]) => (lastUsed.get(a) ?? 0) - (lastUsed.get(b) ?? 0));
    for (const [n, [stemId, stem]] of parked.entries()) {
      const drop = () => this.decoded.delete(stemId);
      if (n < parked.length - PARKED_STEMS) drop();
      else {
        const bytes = [stem.raw, ...stem.renders.values(), ...stem.clipBuffers.values()].reduce((sum, b) => sum + bytesOf(b), 0);
        spare.push({ bytes, at: lastUsed.get(stem) ?? 0, drop });
      }
    }
    let total = spare.reduce((sum, s) => sum + s.bytes, 0);
    if (total <= SPARE_BYTES) return;
    spare.sort((a, b) => a.at - b.at);
    for (const s of spare) {
      if (total <= SPARE_BYTES) break;
      s.drop();
      total -= s.bytes;
    }
  }

  /** Loads every lane in the project — used before an export bounce. */
  async ensureAllLoaded() {
    const { lanes } = useStudioStore.getState();
    await Promise.all(lanes.map((l) => this.ensureLane(l.laneId, l.stemId)));
    await Promise.all(lanes.map((l) => this.ensureTransform(l.laneId)));
    await Promise.all(lanes.map((l) => this.ensureClips(l.laneId)));
  }

  /** Where a lane's separately rendered clips are, for scheduling it. */
  clipLookup(laneId: string): ClipBufferLookup {
    return (clip) => {
      const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
      const buffer = lane ? this.lanes.get(laneId)?.clipBuffers.get(clipKey(lane, clip)) : undefined;
      if (buffer) used(buffer);
      return buffer;
    };
  }

  private clipRendering = new Map<string, Promise<void>>();

  /** The clips of `lane` that play at a speed of their own, by render key. */
  private wantedClips(lane: StudioLane) {
    const wanted = new Map<string, LaneClip>();
    for (const clip of lane.clips ?? []) if (needsOwnRender(clip)) wanted.set(clipKey(lane, clip), clip);
    return wanted;
  }

  /**
   * One clip cut from the stem and rendered at its lane's speed and pitch,
   * into the stem's clips (null: too short to play). Takes its turn (see
   * RenderQueue); rejects with RenderSkipped if `ask` stops wanting it first.
   */
  private async renderClip(entry: LoadedLane, lane: StudioLane, key: string, clip: LaneClip, ask: RenderAsk) {
    const rendered = await renderQueue.run(Math.max(0, clip.to - clip.from), { urgent: () => ask.urgent, wanted: ask.wanted }, async () => {
      const slice = sliceBuffer(this.getContext(), entry.rawBuffer, clip.from, clip.to, clip.reverse);
      if (!slice) return null;
      return renderPitchTempo(this.getContext(), slice, {
        tempo: lane.tempoRatio * (clip.stretch ?? 1),
        pitchSemitones: lane.pitchSemitones,
        voice: lane.kind === "vocals",
      });
    });
    if (rendered) {
      entry.clipBuffers.set(key, rendered);
      used(rendered);
      this.trimCaches();
    }
    return rendered;
  }

  /** Marks a lane as waiting on one more (or one fewer) render. */
  private waiting(laneId: string, delta: 1 | -1) {
    const count = (this.waitingOn.get(laneId) ?? 0) + delta;
    if (count > 0) this.waitingOn.set(laneId, count);
    else this.waitingOn.delete(laneId);
    if (count === (delta > 0 ? 1 : 0)) useStudioStore.getState()._setLaneRendering(laneId, count > 0);
  }

  /**
   * Renders every clip of the lane that plays at a speed of its own. Until
   * a clip's render is ready it plays from the lane's buffer at the lane's
   * speed, so nothing waits on this; once done, a running transport picks
   * the new renders up. Renders no clip uses any more are kept a while
   * (flipping Before/After, or between ideas, wants them again) — see
   * trimCaches.
   */
  async ensureClips(laneId: string): Promise<void> {
    const running = this.clipRendering.get(laneId);
    if (running) {
      await running;
      return this.ensureClips(laneId);
    }
    const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    const entry = this.lanes.get(laneId);
    if (!lane || !entry) return;

    const wanted = this.wantedClips(lane);
    for (const key of wanted.keys()) {
      const rendered = entry.clipBuffers.get(key);
      if (rendered) used(rendered);
    }
    this.trimCaches();
    const missing = [...wanted].filter(([key]) => !entry.clipBuffers.has(key));
    if (missing.length === 0) return;

    // Moved on (another idea, Before/After) by its turn: a clip no longer wanted isn't rendered.
    const stillWanted = (key: string) => () => {
      const now = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
      return !!now && this.lanes.get(laneId) === entry && this.wantedClips(now).has(key);
    };
    const promise = (async () => {
      this.waiting(laneId, 1);
      try {
        await Promise.all(
          missing.map(([key, clip]) =>
            this.renderClip(entry, lane, key, clip, { urgent: true, wanted: stillWanted(key) }).catch((error) => {
              if (!(error instanceof RenderSkipped)) throw error;
            })
          )
        );
        if (useStudioStore.getState().isPlaying) this.rescheduleLane(laneId);
      } finally {
        this.waiting(laneId, -1);
        this.clipRendering.delete(laneId);
      }
    })();
    this.clipRendering.set(laneId, promise);
    return promise;
  }

  getProcessedBuffer(laneId: string): AudioBuffer | null {
    return this.lanes.get(laneId)?.processedBuffer ?? null;
  }

  /** The decoded stem before any pitch/tempo render — what analysis reads. */
  getRawBuffer(laneId: string): AudioBuffer | null {
    return this.lanes.get(laneId)?.rawBuffer ?? null;
  }

  /** Whether a lane's loaded audio is at the speed and pitch the lane is set to. */
  private inTune(entry: LoadedLane, lane: StudioLane) {
    return Math.abs(entry.appliedTempo - lane.tempoRatio) < 0.001 && Math.abs(entry.appliedPitch - lane.pitchSemitones) < 0.001;
  }

  /**
   * The stem at a speed and pitch: the stem itself, a render kept from
   * before, or a render — already asked for by another lane or a
   * look-ahead, or asked for now. It takes its turn (see RenderQueue), and
   * rejects with RenderSkipped if by then nobody who asked wants it.
   */
  private render(entry: LoadedLane, tempo: number, pitch: number, voice: boolean, ask: RenderAsk): AudioBuffer | Promise<AudioBuffer> {
    if (Math.abs(tempo - 1) < 0.001 && Math.abs(pitch) < 0.001) return entry.rawBuffer;
    const key = renderKey(tempo, pitch);
    const kept = entry.renders.get(key);
    if (kept) {
      used(kept);
      return kept;
    }
    const id = `${entry.stemId}#${key}`;
    const running = this.rendersRunning.get(id);
    if (running) {
      running.asks.push(ask);
      return running.promise;
    }
    const asks = [ask];
    const { renders, rawBuffer } = entry;
    const promise = renderQueue
      .run(
        rawBuffer.duration,
        { urgent: () => asks.some((a) => a.urgent), wanted: () => asks.some((a) => a.wanted()) },
        () => renderPitchTempo(this.getContext(), rawBuffer, { tempo, pitchSemitones: pitch, voice })
      )
      .then((rendered) => {
        if (rendered !== rawBuffer) {
          renders.set(key, rendered);
          used(rendered);
          this.trimCaches();
        }
        return rendered;
      })
      .finally(() => this.rendersRunning.delete(id));
    this.rendersRunning.set(id, { promise, asks });
    return promise;
  }

  /**
   * Brings a lane's audio to the speed and pitch it's set to. A render kept
   * from before (Before/After, flipping between ideas) is used at once; a
   * new one renders while the rest of the mix plays on, and the lane joins
   * in when it's ready. If the lane moves on to another speed meanwhile,
   * that one is asked for straight away, and the earlier one — if it
   * hasn't started yet — is dropped.
   */
  async ensureTransform(laneId: string): Promise<void> {
    const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    const entry = this.lanes.get(laneId);
    if (!lane || !entry || this.inTune(entry, lane)) return;

    const tempo = lane.tempoRatio;
    const pitch = lane.pitchSemitones;
    const stillWanted = () => {
      const now = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
      return !!now && this.lanes.get(laneId) === entry && Math.abs(now.tempoRatio - tempo) < 0.001 && Math.abs(now.pitchSemitones - pitch) < 0.001;
    };
    const pending = this.render(entry, tempo, pitch, lane.kind === "vocals", { urgent: true, wanted: stillWanted });
    let buffer: AudioBuffer;
    if ("then" in pending) {
      this.waiting(laneId, 1);
      try {
        buffer = await pending;
      } catch (error) {
        // The lane moved on before its turn: what it's set to now is on its way.
        if (error instanceof RenderSkipped) return;
        throw error;
      } finally {
        this.waiting(laneId, -1);
      }
    } else {
      buffer = pending;
    }

    const now = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    const current = this.lanes.get(laneId);
    if (!now || !current || this.inTune(current, now)) return;
    if (Math.abs(now.tempoRatio - tempo) >= 0.001 || Math.abs(now.pitchSemitones - pitch) >= 0.001) return;
    current.processedBuffer = buffer;
    current.appliedTempo = tempo;
    current.appliedPitch = pitch;
    // What it played before is kept only as spare now.
    this.trimCaches();
    if (useStudioStore.getState().isPlaying) this.rescheduleLane(laneId);
  }

  /**
   * Renders ahead what lanes would ask for — the speeds and pitches (`speeds`)
   * and clips (`clips`) the AI ideas most likely to be tried want — so
   * trying one is instant. Only into the caches: nothing playing changes.
   * One render at a time, after whatever a lane is waiting on, and only up
   * to half the memory kept spare (so it never pushes out what was just
   * heard); a newer prepare stops this one.
   */
  async prepare({ speeds = [], clips = [] }: { speeds?: StudioLane[]; clips?: StudioLane[] }) {
    const run = ++this.prepareRun;
    const ask: RenderAsk = { urgent: false, wanted: () => run === this.prepareRun };
    const idle = async () => {
      while (this.waitingOn.size && run === this.prepareRun) await new Promise((r) => setTimeout(r, 250));
      return run === this.prepareRun;
    };
    let bytes = 0;
    const roomFor = (seconds: number, entry: LoadedLane) => (bytes += seconds * entry.rawBuffer.sampleRate * 8) <= SPARE_BYTES / 2;
    try {
      for (const lane of speeds) {
        const entry = this.lanes.get(lane.laneId);
        if (!entry || entry.stemId !== lane.stemId) continue;
        if (entry.renders.has(renderKey(lane.tempoRatio, lane.pitchSemitones))) continue;
        if (!roomFor(entry.rawBuffer.duration / lane.tempoRatio, entry)) return;
        if (!(await idle())) return;
        await this.render(entry, lane.tempoRatio, lane.pitchSemitones, lane.kind === "vocals", ask);
      }
      for (const lane of clips) {
        const entry = this.lanes.get(lane.laneId);
        if (!entry || entry.stemId !== lane.stemId) continue;
        for (const [key, clip] of this.wantedClips(lane)) {
          if (entry.clipBuffers.has(key)) continue;
          if (!roomFor((clip.to - clip.from) / (lane.tempoRatio * (clip.stretch ?? 1)), entry)) return;
          if (!(await idle())) return;
          await this.renderClip(entry, lane, key, clip, ask);
        }
      }
    } catch {
      // Only a look-ahead (or a newer one took over): the real render tries again (and reports) if it's needed.
    }
  }

  /**
   * Renders every stretched or re-keyed lane and clip again — after the
   * stretch engine was switched (see pitchTempo.ts), so it's heard at once.
   */
  async rerenderAll(): Promise<void> {
    this.padBuffers.clear();
    const ids = [...this.lanes.keys()];
    for (const entry of this.lanes.values()) entry.appliedTempo = Number.NaN;
    for (const stem of this.decoded.values()) {
      stem.renders.clear();
      stem.clipBuffers.clear();
    }
    await Promise.all(ids.flatMap((id) => [this.ensureTransform(id), this.ensureClips(id)]));
  }

  removeLane(laneId: string) {
    const entry = this.lanes.get(laneId);
    if (entry) stopSources(entry.sources);
    entry?.chain.disconnect();
    this.lanes.delete(laneId);
    // Its stem may be parked now: the newest parked, the last to go.
    const stem = entry && this.decoded.get(entry.stemId);
    if (stem) used(stem);
    this.trimCaches();
  }

  /** Pushes volume/mute/solo, per-lane FX and master volume into the graph. */
  applyMixState() {
    const { lanes, projectBpm, masterVolume, crossfader, master } = useStudioStore.getState();
    const audible = getAudibleLaneIds(lanes);
    if (this.master) {
      this.master.update(master);
      this.master.gain.gain.setTargetAtTime(
        masterVolume,
        this.ctx!.currentTime,
        0.015
      );
    }
    for (const lane of lanes) {
      const entry = this.lanes.get(lane.laneId);
      if (!entry) continue;
      entry.chain.volumeGain.gain.setTargetAtTime(
        laneGain(lane, audible, crossfader),
        this.ctx!.currentTime,
        0.015
      );
      entry.chain.update(lane, projectBpm);
    }
  }

  isReady(laneId: string) {
    return this.lanes.has(laneId);
  }

  getLoadedLaneIds(): string[] {
    return Array.from(this.lanes.keys());
  }

  /**
   * Starts the transport. Normally every lane is loaded and rendered first,
   * so they all start together. With `join` (playing on after a seek, or
   * hearing an AI idea) it starts at once with the lanes that are ready;
   * the others join in, in time, as soon as their audio is.
   */
  async play({ join = false }: { join?: boolean } = {}) {
    const request = ++this.playRequest;
    // Only one thing plays at a time: starting the transport stops any
    // library preview that's still running. Done before resuming, since on
    // iOS a playing <audio> element can hold the context interrupted.
    previewPlayer.stop();
    // What the lock screen and Dynamic Island hold on to (see
    // nowPlayingAnchor); started here, still inside the tap. Not while
    // recording, which has the phone's audio set up for the microphone.
    const anchored = !this.micActive && startNowPlayingAnchor();

    const ctx = await this.unlock({ keepContext: this.micActive });
    if (request !== this.playRequest) return;
    if (ctx.state !== "running") {
      // Scheduling now would show the transport as playing with a frozen
      // clock and no sound. Fail instead; the next tap gets a new context.
      this.staleContext = true;
      // If the phone wouldn't start the mix beside the silent <audio>,
      // the next tap tries without it.
      if (anchored) disableNowPlayingAnchor();
      throw new PlaybackBlockedError();
    }

    const state = useStudioStore.getState();
    const { lanes } = state;
    let playhead = state.playhead;
    // At (or seeked past) the end, play would stop again on the first frame.
    if (state.duration > 0 && playhead >= state.duration) playhead = 0;
    if (state.loopEnabled && (playhead < state.loopStart || playhead >= state.loopEnd)) {
      playhead = state.loopStart;
    }

    if (join) {
      for (const lane of lanes) if (!this.lanes.has(lane.laneId)) void this.prefetchLane(lane.laneId, lane.stemId);
      for (const lane of lanes) if (this.lanes.has(lane.laneId)) void this.ensureTransform(lane.laneId).catch(() => {});
    } else {
      await Promise.all(lanes.map((l) => this.ensureLane(l.laneId, l.stemId)));
      await Promise.all(lanes.map((l) => this.ensureTransform(l.laneId)));
    }
    // Paused, stopped or a preview started while the stems loaded.
    if (request !== this.playRequest || this.ctx !== ctx) return;

    const audible = getAudibleLaneIds(lanes);
    const startTime = ctx.currentTime + 0.08;

    for (const lane of lanes) {
      const entry = this.lanes.get(lane.laneId);
      if (!entry) continue;
      stopSources(entry.sources);
      entry.sources = [];
      entry.chain.update(lane, useStudioStore.getState().projectBpm);
      entry.chain.volumeGain.gain.value = laneGain(lane, audible, useStudioStore.getState().crossfader);
      // Still rendering at its new speed: it joins in when that's ready (see ensureTransform).
      if (!this.inTune(entry, lane)) continue;

      entry.sources = scheduleLane({
        ctx,
        lane,
        buffer: entry.processedBuffer,
        chain: entry.chain,
        startTime,
        playhead,
        clipBuffer: this.clipLookup(lane.laneId),
      });
      this.modulate(lane, entry.chain, startTime, playhead);
    }

    this.startedAtContextTime = startTime;
    this.startedAtPlayhead = playhead;
    useStudioStore.getState()._setPlaybackState(true, playhead);
    this.startMetronome(playhead);
    this.tick();
  }

  pause() {
    this.playRequest++;
    const ctx = this.ctx;
    const elapsed = ctx
      ? Math.max(0, ctx.currentTime - this.startedAtContextTime)
      : 0;
    const wasPlaying = useStudioStore.getState().isPlaying;
    const newPlayhead = wasPlaying ? this.startedAtPlayhead + elapsed : useStudioStore.getState().playhead;

    this.stopAllSources();
    this.stopMetronome();
    stopNowPlayingAnchor();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    useStudioStore.getState()._setPlaybackState(false, newPlayhead);
  }

  /** Stop: silence everything and return the playhead to the start. */
  stop() {
    this.playRequest++;
    this.stopAllSources();
    this.stopMetronome();
    stopNowPlayingAnchor();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const { loopEnabled, loopStart } = useStudioStore.getState();
    // Stopped, not paused: off the lock screen until it plays again.
    mixOnLockScreen = false;
    useStudioStore.getState()._setPlaybackState(false, loopEnabled ? loopStart : 0);
  }

  private stopAllSources() {
    for (const entry of this.lanes.values()) {
      stopSources(entry.sources);
      entry.sources = [];
    }
  }

  /**
   * Re-schedules one lane against the running transport, e.g. while its
   * clip is being dragged. The other lanes keep playing untouched; this
   * one is restarted a few milliseconds ahead at the position the
   * transport will have reached by then, so it lands sample-aligned.
   */
  rescheduleLane(laneId: string) {
    const ctx = this.ctx;
    const state = useStudioStore.getState();
    if (!ctx || !state.isPlaying) return;
    const lane = state.lanes.find((l) => l.laneId === laneId);
    const entry = this.lanes.get(laneId);
    if (!lane || !entry) return;

    const now = ctx.currentTime;
    const startTime = now + 0.02;
    if (entry.sources.length) {
      // Duck the outgoing source over a few ms instead of cutting it
      // mid-waveform, which would click on every drag step.
      const fade = entry.chain.fadeGain.gain;
      fade.cancelScheduledValues(now);
      fade.setTargetAtTime(0, now, 0.004);
      stopSources(entry.sources, startTime);
      entry.sources = [];
    }

    // At its old speed it would play out of time with the rest: it waits
    // for its render instead, and joins in then (see ensureTransform).
    if (!this.inTune(entry, lane)) return;

    const playhead = this.startedAtPlayhead + (startTime - this.startedAtContextTime);
    const audible = getAudibleLaneIds(state.lanes);
    entry.chain.volumeGain.gain.value = laneGain(lane, audible, state.crossfader);
    entry.sources = scheduleLane({
      ctx,
      lane,
      buffer: entry.processedBuffer,
      chain: entry.chain,
      startTime,
      playhead,
      clipBuffer: this.clipLookup(laneId),
    });
    this.modulate(lane, entry.chain, startTime, playhead);
  }

  /** Schedules a lane's automation and ducking from `playhead` (heard at `when`) to the end. */
  private modulate(lane: StudioLane, chain: LaneChain, when: number, playhead: number) {
    const { lanes, duration } = useStudioStore.getState();
    scheduleModulation({ chain, lane, lanes, when, playhead, length: Math.max(0, duration - playhead) + 3 });
  }

  /**
   * Re-plans automation and ducking for every lane from where playback is
   * now — after a point was drawn, a duck amount changed, or a vocal moved.
   * The audio keeps playing; only the curves change.
   */
  rescheduleModulation() {
    const ctx = this.ctx;
    const state = useStudioStore.getState();
    if (!ctx || !state.isPlaying) return;
    const when = ctx.currentTime + 0.02;
    const playhead = this.startedAtPlayhead + (when - this.startedAtContextTime);
    for (const lane of state.lanes) {
      const entry = this.lanes.get(lane.laneId);
      if (entry) this.modulate(lane, entry.chain, when, playhead);
    }
  }

  // --- Sample pads -------------------------------------------------------------

  private stemBuffers = new Map<string, Promise<AudioBuffer>>();
  private padBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private padVoices = new Map<string, AudioBufferSourceNode>();

  /** A stem's decoded audio: a loaded lane's, or downloaded once for the pads. */
  private stemBuffer(stemId: string): Promise<AudioBuffer> {
    const kept = this.decoded.get(stemId);
    if (kept) return Promise.resolve(kept.raw);
    for (const [laneId, entry] of this.lanes) {
      const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
      if (lane?.stemId === stemId) return Promise.resolve(entry.rawBuffer);
    }
    let pending = this.stemBuffers.get(stemId);
    if (!pending) {
      // A whole stem is ~85 MB and a pad only keeps its slice: just the latest stem stays, for the next pad cut from it.
      this.stemBuffers.clear();
      pending = fetchStem(stemId).then((bytes) => this.getContext().decodeAudioData(bytes));
      pending.catch(() => this.stemBuffers.delete(stemId));
      this.stemBuffers.set(stemId, pending);
    }
    return pending;
  }

  /** A pad's sound, cut and rendered at the speed and pitch it was taken at (once). */
  private padBuffer(pad: Pad): Promise<AudioBuffer | null> {
    const key = `${pad.stemId}|${pad.from}|${pad.to}|${pad.tempoRatio}|${pad.pitchSemitones}|${pad.reverse ? "r" : "f"}`;
    let pending = this.padBuffers.get(key);
    if (!pending) {
      pending = this.stemBuffer(pad.stemId).then(async (raw) => {
        const ctx = this.getContext();
        const slice = sliceBuffer(ctx, raw, pad.from, pad.to, pad.reverse);
        if (!slice) return null;
        return renderPitchTempo(ctx, slice, { tempo: pad.tempoRatio, pitchSemitones: pad.pitchSemitones, voice: pad.kind === "vocals" });
      });
      pending.catch(() => this.padBuffers.delete(key));
      this.padBuffers.set(key, pending);
    }
    return pending;
  }

  /** Gets a pad's sound ready ahead of the first tap. */
  preparePad(pad: Pad) {
    void this.padBuffer(pad).catch(() => {});
  }

  /**
   * Plays a pad once, on top of whatever is playing (retriggering a pad
   * cuts its previous hit). Runs from a tap, so it unlocks audio first.
   */
  async triggerPad(pad: Pad) {
    previewPlayer.stop();
    const ctx = await this.unlock();
    const buffer = await this.padBuffer(pad);
    if (!buffer || ctx.state !== "running" || !this.master) return;
    this.padVoices.get(pad.id)?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    // A few ms of fade each end so a hit never clicks.
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.004);
    gain.gain.setValueAtTime(1, now + Math.max(0.005, buffer.duration - 0.01));
    gain.gain.linearRampToValueAtTime(0, now + buffer.duration);
    source.connect(gain);
    gain.connect(this.master.input);
    source.onended = () => {
      gain.disconnect();
      if (this.padVoices.get(pad.id) === source) this.padVoices.delete(pad.id);
    };
    source.start(now);
    this.padVoices.set(pad.id, source);
  }

  /**
   * Loads a lane that was added to the project in the background, so its
   * audio (and key analysis) is ready before the next play — and, if the
   * transport is already running, joins it in straight away.
   */
  async prefetchLane(laneId: string, stemId: string) {
    try {
      await this.ensureLane(laneId, stemId);
      await this.ensureTransform(laneId);
      void this.ensureClips(laneId);
    } catch {
      // Play retries the load and surfaces the failure then.
      return;
    }
    const entry = this.lanes.get(laneId);
    const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    if (useStudioStore.getState().isPlaying && entry && lane && !entry.sources.length && this.inTune(entry, lane)) {
      this.rescheduleLane(laneId);
    }
  }

  seek(seconds: number) {
    const wasPlaying = useStudioStore.getState().isPlaying;
    if (wasPlaying) this.pause();
    const clamped = Math.max(0, seconds);
    useStudioStore.getState()._setPlaybackState(false, clamped);
    if (wasPlaying) void this.play({ join: true }).catch(() => {});
  }

  private startMetronome(fromPlayhead: number) {
    this.stopMetronome();
    if (!useStudioStore.getState().metronome) return;
    const beat = beatLength(useStudioStore.getState().projectBpm);
    this.nextClickBeat = Math.ceil(fromPlayhead / beat);
    // Lookahead scheduler: a timer this coarse would be audibly uneven if
    // it triggered the clicks itself, so it only queues them a little ahead
    // of time and the audio clock does the timing.
    this.metronomeTimer = setInterval(() => this.scheduleClicks(), 25);
    this.scheduleClicks();
  }

  private stopMetronome() {
    if (this.metronomeTimer !== null) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  private scheduleClicks() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const { projectBpm, metronome } = useStudioStore.getState();
    if (!metronome) {
      this.stopMetronome();
      return;
    }
    const beat = beatLength(projectBpm);
    const horizon = ctx.currentTime + 0.25;

    for (;;) {
      const beatTime = this.nextClickBeat * beat;
      const when =
        this.startedAtContextTime + (beatTime - this.startedAtPlayhead);
      if (when > horizon) break;
      if (when >= ctx.currentTime) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const downbeat = this.nextClickBeat % 4 === 0;
        osc.frequency.value = downbeat ? 1600 : 1000;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(downbeat ? 0.35 : 0.2, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + 0.06);
      }
      this.nextClickBeat++;
    }
  }

  private tick = () => {
    if (!this.ctx) return;
    const elapsed = this.ctx.currentTime - this.startedAtContextTime;
    const playhead = this.startedAtPlayhead + Math.max(0, elapsed);
    const { duration, loopEnabled, loopStart, loopEnd } = useStudioStore.getState();

    if (loopEnabled && loopEnd > loopStart && playhead >= loopEnd) {
      useStudioStore.getState()._setPlaybackState(true, loopStart);
      this.stopAllSources();
      void this.play().catch(() => this.pause());
      return;
    }

    if (duration > 0 && playhead >= duration) {
      this.stop();
      return;
    }

    useStudioStore.getState()._setPlaybackState(true, playhead);
    this.rafId = requestAnimationFrame(this.tick);
  };
}

export const audioEngine = new AudioEngine();

/** Whether the mix has played since it was last stopped — only then is it on the lock screen. */
let mixOnLockScreen = false;

/** Tells the lock screen / media notification about the mix (see mediaSession). */
function reportMixNowPlaying(state: ReturnType<typeof useStudioStore.getState>) {
  if (state.isPlaying) mixOnLockScreen = true;
  if (!mixOnLockScreen || state.lanes.length === 0) {
    setNowPlaying("mix", null);
    return;
  }
  const artists = [...new Set(state.lanes.map((l) => l.artistName))];
  const remix = getPlayingRemix();
  setNowPlaying("mix", {
    title: state.sourceRemix?.title ?? state.challenge?.title ?? "Untitled mix",
    artist: remix?.artist ?? artists.slice(0, 3).join(" × "),
    album: "Remixt",
    artwork: remix ? remix.cover : state.sourceRemix?.cover,
    playing: state.isPlaying,
    position: state.playhead,
    duration: state.duration,
    play: () => void audioEngine.play().catch(() => {}),
    pause: () => audioEngine.pause(),
    stop: () => audioEngine.stop(),
    seekTo: (seconds) => audioEngine.seek(seconds),
  });
}

// ...and the other way round: a library preview pauses the mix (or cancels
// a play that's still loading) instead of playing over it.
previewPlayer.onStart(() => audioEngine.pause());

// A call or another app's audio paused the lock screen's player: pause the mix with it.
onNowPlayingAnchorLost(() => {
  if (useStudioStore.getState().isPlaying) audioEngine.pause();
});

if (typeof window !== "undefined") {
  const lastTransforms = new Map<string, { tempo: number; pitch: number }>();
  // Everything scheduleLane bakes into a source when it starts: changing
  // any of these while playing means that lane has to be re-scheduled.
  // Clips are compared by reference — the store replaces the array on edit.
  const lastPlacement = new Map<string, { key: string; clips: StudioLane["clips"] }>();
  const pendingReschedule = new Set<string>();
  let rescheduleFrame: number | null = null;

  // Automation and ducking curves cover the whole song, so re-planning them
  // on every tick of a drag would be wasted work: wait for a short pause.
  let modulationTimer: ReturnType<typeof setTimeout> | null = null;
  function queueModulation() {
    if (modulationTimer) clearTimeout(modulationTimer);
    modulationTimer = setTimeout(() => {
      modulationTimer = null;
      audioEngine.rescheduleModulation();
    }, 120);
  }

  // A drag fires far more pointer events than there are frames; coalesce
  // them so each lane is re-scheduled at most once per frame.
  function queueReschedule(laneId: string) {
    pendingReschedule.add(laneId);
    if (rescheduleFrame !== null) return;
    rescheduleFrame = requestAnimationFrame(() => {
      rescheduleFrame = null;
      for (const id of pendingReschedule) audioEngine.rescheduleLane(id);
      pendingReschedule.clear();
    });
  }

  // subscribeMix: an AI idea being built reaches here once, as where it
  // ended up — not as each of the steps on the way (see asOneChange).
  subscribeMix((state, prevState) => {
    if (state.isPlaying !== prevState.isPlaying) keepScreenOn("mix", state.isPlaying);
    reportMixNowPlaying(state);

    // The playhead moves every frame while playing; none of what follows
    // depends on it. Re-applying every lane's settings 60 times a second
    // piles automation events onto each AudioParam, which slowly bogs the
    // audio thread (and the page) down the longer the mix plays.
    if (
      state.lanes === prevState.lanes &&
      state.masterVolume === prevState.masterVolume &&
      state.master === prevState.master &&
      state.projectBpm === prevState.projectBpm &&
      state.isPlaying === prevState.isPlaying &&
      state.crossfader === prevState.crossfader
    ) {
      return;
    }

    if (state.lanes !== prevState.lanes) {
      const currentIds = new Set(state.lanes.map((l) => l.laneId));
      for (const laneId of audioEngine.getLoadedLaneIds()) {
        if (!currentIds.has(laneId)) audioEngine.removeLane(laneId);
      }
      // Forget lanes that are gone, so one that comes back (undo, or an AI
      // idea taken off again) loads and joins in like a new one.
      for (const laneId of [...lastPlacement.keys()]) {
        if (!currentIds.has(laneId)) {
          lastPlacement.delete(laneId);
          lastTransforms.delete(laneId);
        }
      }
    }
    audioEngine.applyMixState();

    // Drawn automation, a duck amount, or the vocals a ducking lane follows changed.
    if (
      state.isPlaying &&
      state.lanes !== prevState.lanes &&
      state.lanes.some(
        (l) =>
          l.fx.duck > 0 ||
          l.automation.volume?.length ||
          l.automation.filter?.length ||
          prevState.lanes.find((p) => p.laneId === l.laneId)?.automation !== l.automation
      )
    ) {
      queueModulation();
    }

    for (const lane of state.lanes) {
      const placement = { key: `${lane.offsetSeconds}|${lane.fx.fadeIn}|${lane.fx.fadeOut}`, clips: lane.clips };
      const lastPlaced = lastPlacement.get(lane.laneId);
      lastPlacement.set(lane.laneId, placement);
      // Clips are compared by what they play: an idea worked out again cuts
      // the same clips afresh, and re-scheduling those would leave a gap.
      const recut = !!lastPlaced && !sameClips(lastPlaced.clips, placement.clips);
      const moved = lastPlaced && (lastPlaced.key !== placement.key || recut);
      if (lastPlaced === undefined) {
        void audioEngine.prefetchLane(lane.laneId, lane.stemId);
      } else if (moved && audioEngine.isReady(lane.laneId)) {
        if (recut) void audioEngine.ensureClips(lane.laneId);
        if (state.isPlaying) queueReschedule(lane.laneId);
      }
    }

    for (const lane of state.lanes) {
      const last = lastTransforms.get(lane.laneId);
      if (
        !last ||
        last.tempo !== lane.tempoRatio ||
        last.pitch !== lane.pitchSemitones
      ) {
        lastTransforms.set(lane.laneId, {
          tempo: lane.tempoRatio,
          pitch: lane.pitchSemitones,
        });
        if (audioEngine.isReady(lane.laneId)) {
          const laneId = lane.laneId;
          void audioEngine.ensureTransform(laneId).then(() => audioEngine.ensureClips(laneId));
        }
      }
    }
    for (const laneId of Array.from(lastTransforms.keys())) {
      if (!state.lanes.some((l) => l.laneId === laneId)) {
        lastTransforms.delete(laneId);
      }
    }
    for (const laneId of Array.from(lastPlacement.keys())) {
      if (!state.lanes.some((l) => l.laneId === laneId)) {
        lastPlacement.delete(laneId);
      }
    }
  });
}
