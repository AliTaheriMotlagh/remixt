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
import { renderPitchTempo } from "./pitchTempo";
import { previewPlayer } from "./previewPlayer";
import { keepScreenOn } from "./wakeLock";
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
  useStudioStore,
  type LaneClip,
  type Pad,
  type StudioLane,
} from "./studioStore";

type LoadedLane = {
  rawBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  appliedTempo: number;
  appliedPitch: number;
  chain: LaneChain;
  /** One per clip while playing (just one for a lane that isn't arranged). */
  sources: AudioBufferSourceNode[];
  /** Clips with a speed of their own, each rendered separately (see clipKey). */
  clipBuffers: Map<string, AudioBuffer>;
};

/** Identifies one clip render: its slice of the stem, the speed and pitch it was rendered at, and direction. */
function clipKey(lane: StudioLane, clip: LaneClip) {
  return `${clip.from}|${clip.to}|${(lane.tempoRatio * (clip.stretch ?? 1)).toFixed(5)}|${lane.pitchSemitones}|${clip.reverse ? "r" : "f"}`;
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
  private transforming = new Map<string, Promise<void>>();
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

    const promise = fetchStem(stemId)
      .then((arrayBuffer) => this.getContext().decodeAudioData(arrayBuffer))
      .then((buffer) => {
        const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
        if (!lane) return;
        // The context may have been replaced while this downloaded.
        const chain = createLaneChain(this.getContext(), lane, projectBpm, this.master!.input);
        this.lanes.set(laneId, {
          rawBuffer: buffer,
          processedBuffer: buffer,
          appliedTempo: 1,
          appliedPitch: 0,
          chain,
          sources: [],
          clipBuffers: new Map(),
        });
      })
      .finally(() => {
        this.loading.delete(laneId);
      });

    this.loading.set(laneId, promise);
    await promise;
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
      return lane ? this.lanes.get(laneId)?.clipBuffers.get(clipKey(lane, clip)) : undefined;
    };
  }

  private clipRendering = new Map<string, Promise<void>>();

  /**
   * Renders every clip of the lane that plays at a speed of its own, and
   * drops renders no clip uses any more. Until a clip's render is ready it
   * plays from the lane's buffer at the lane's speed, so nothing waits on
   * this; once done, a running transport picks the new renders up.
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

    const wanted = new Map<string, LaneClip>();
    for (const clip of lane.clips ?? []) if (needsOwnRender(clip)) wanted.set(clipKey(lane, clip), clip);
    for (const key of entry.clipBuffers.keys()) if (!wanted.has(key)) entry.clipBuffers.delete(key);
    const missing = [...wanted].filter(([key]) => !entry.clipBuffers.has(key));
    if (missing.length === 0) return;

    const ctx = this.getContext();
    const promise = (async () => {
      useStudioStore.getState()._setLaneRendering(laneId, true);
      try {
        const raw = entry.rawBuffer;
        // A few at a time: each render is a worker of its own.
        for (let i = 0; i < missing.length; i += 4) {
          await Promise.all(
            missing.slice(i, i + 4).map(async ([key, clip]) => {
              const slice = sliceBuffer(ctx, raw, clip.from, clip.to, clip.reverse);
              if (!slice) return;
              const rendered = await renderPitchTempo(ctx, slice, {
                tempo: lane.tempoRatio * (clip.stretch ?? 1),
                pitchSemitones: lane.pitchSemitones,
              });
              this.lanes.get(laneId)?.clipBuffers.set(key, rendered);
            })
          );
        }
        if (useStudioStore.getState().isPlaying) this.rescheduleLane(laneId);
      } finally {
        useStudioStore.getState()._setLaneRendering(laneId, false);
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

  // Renders a fresh pitch/tempo-shifted buffer for a lane if its settings
  // have changed since the last render. If the transport is currently
  // playing, restarts playback from the current position once done so the
  // change is heard without requiring a manual play/pause.
  async ensureTransform(laneId: string): Promise<void> {
    const existing = this.transforming.get(laneId);
    if (existing) {
      // A render is already running. Wait for it, then re-check: if the
      // target tempo/pitch changed again while we waited, this recurses
      // once more to pick up the latest values instead of silently
      // dropping them.
      await existing;
      return this.ensureTransform(laneId);
    }

    const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
    const entry = this.lanes.get(laneId);
    if (!lane || !entry) return;

    if (
      Math.abs(entry.appliedTempo - lane.tempoRatio) < 0.001 &&
      Math.abs(entry.appliedPitch - lane.pitchSemitones) < 0.001
    ) {
      return;
    }

    const ctx = this.getContext();
    const promise = (async () => {
      useStudioStore.getState()._setLaneRendering(laneId, true);
      try {
        const processed = await renderPitchTempo(ctx, entry.rawBuffer, {
          tempo: lane.tempoRatio,
          pitchSemitones: lane.pitchSemitones,
        });
        const current = this.lanes.get(laneId);
        if (!current) return;
        current.processedBuffer = processed;
        current.appliedTempo = lane.tempoRatio;
        current.appliedPitch = lane.pitchSemitones;

        if (useStudioStore.getState().isPlaying) {
          const playhead = useStudioStore.getState().playhead;
          this.seek(playhead);
        }
      } finally {
        useStudioStore.getState()._setLaneRendering(laneId, false);
        this.transforming.delete(laneId);
      }
    })();

    this.transforming.set(laneId, promise);
    return promise;
  }

  removeLane(laneId: string) {
    const entry = this.lanes.get(laneId);
    if (entry) stopSources(entry.sources);
    entry?.chain.disconnect();
    this.lanes.delete(laneId);
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

  async play() {
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

    await Promise.all(lanes.map((l) => this.ensureLane(l.laneId, l.stemId)));
    await Promise.all(lanes.map((l) => this.ensureTransform(l.laneId)));
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
    for (const [laneId, entry] of this.lanes) {
      const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
      if (lane?.stemId === stemId) return Promise.resolve(entry.rawBuffer);
    }
    let pending = this.stemBuffers.get(stemId);
    if (!pending) {
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
        return renderPitchTempo(ctx, slice, { tempo: pad.tempoRatio, pitchSemitones: pad.pitchSemitones });
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
    if (useStudioStore.getState().isPlaying && !this.lanes.get(laneId)?.sources.length) {
      this.rescheduleLane(laneId);
    }
  }

  seek(seconds: number) {
    const wasPlaying = useStudioStore.getState().isPlaying;
    if (wasPlaying) this.pause();
    const clamped = Math.max(0, seconds);
    useStudioStore.getState()._setPlaybackState(false, clamped);
    if (wasPlaying) void this.play().catch(() => {});
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

  useStudioStore.subscribe((state, prevState) => {
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
      const moved = lastPlaced && (lastPlaced.key !== placement.key || lastPlaced.clips !== placement.clips);
      if (lastPlaced === undefined) {
        void audioEngine.prefetchLane(lane.laneId, lane.stemId);
      } else if (moved && audioEngine.isReady(lane.laneId)) {
        if (lastPlaced.clips !== placement.clips) void audioEngine.ensureClips(lane.laneId);
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
