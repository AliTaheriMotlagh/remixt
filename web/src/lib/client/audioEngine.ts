"use client";

import { createLaneChain, createMasterChain, scheduleLane, type LaneChain } from "./audioGraph";
import { renderPitchTempo } from "./pitchTempo";
import { previewPlayer } from "./previewPlayer";
import { beatLength, getAudibleLaneIds, useStudioStore } from "./studioStore";

type LoadedLane = {
  rawBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  appliedTempo: number;
  appliedPitch: number;
  chain: LaneChain;
  source: AudioBufferSourceNode | null;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: { input: AudioNode; gain: GainNode } | null = null;
  private lanes = new Map<string, LoadedLane>();
  private loading = new Map<string, Promise<void>>();
  private transforming = new Map<string, Promise<void>>();
  private startedAtContextTime = 0;
  private startedAtPlayhead = 0;
  private rafId: number | null = null;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private nextClickBeat = 0;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = createMasterChain(this.ctx, this.ctx.destination);
      this.master.gain.gain.value = useStudioStore.getState().masterVolume;
    }
    return this.ctx;
  }

  async ensureLane(laneId: string, stemId: string) {
    if (this.lanes.has(laneId) || this.loading.has(laneId)) {
      await this.loading.get(laneId);
      return;
    }
    const ctx = this.getContext();
    const { projectBpm } = useStudioStore.getState();

    const promise = fetch(`/api/audio/stem/${stemId}`)
      .then((res) => res.arrayBuffer())
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((buffer) => {
        const lane = useStudioStore.getState().lanes.find((l) => l.laneId === laneId);
        if (!lane) return;
        const chain = createLaneChain(ctx, lane, projectBpm, this.master!.input);
        this.lanes.set(laneId, {
          rawBuffer: buffer,
          processedBuffer: buffer,
          appliedTempo: 1,
          appliedPitch: 0,
          chain,
          source: null,
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
  }

  getProcessedBuffer(laneId: string): AudioBuffer | null {
    return this.lanes.get(laneId)?.processedBuffer ?? null;
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
    if (entry?.source) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
    }
    entry?.chain.disconnect();
    this.lanes.delete(laneId);
  }

  /** Pushes volume/mute/solo, per-lane FX and master volume into the graph. */
  applyMixState() {
    const { lanes, projectBpm, masterVolume } = useStudioStore.getState();
    const audible = getAudibleLaneIds(lanes);
    if (this.master) {
      this.master.gain.gain.setTargetAtTime(
        masterVolume,
        this.ctx!.currentTime,
        0.015
      );
    }
    for (const lane of lanes) {
      const entry = this.lanes.get(lane.laneId);
      if (!entry) continue;
      const isAudible = audible.has(lane.laneId);
      entry.chain.volumeGain.gain.setTargetAtTime(
        isAudible ? lane.volume : 0,
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
    const ctx = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();

    // Only one thing plays at a time: starting the transport stops any
    // library preview that's still running.
    previewPlayer.stop();

    const state = useStudioStore.getState();
    const { lanes } = state;
    let playhead = state.playhead;
    if (state.loopEnabled && (playhead < state.loopStart || playhead >= state.loopEnd)) {
      playhead = state.loopStart;
    }

    await Promise.all(lanes.map((l) => this.ensureLane(l.laneId, l.stemId)));
    await Promise.all(lanes.map((l) => this.ensureTransform(l.laneId)));

    const audible = getAudibleLaneIds(lanes);
    const startTime = ctx.currentTime + 0.08;

    for (const lane of lanes) {
      const entry = this.lanes.get(lane.laneId);
      if (!entry) continue;
      if (entry.source) {
        try {
          entry.source.stop();
        } catch {
          // ignore
        }
        entry.source = null;
      }
      entry.chain.update(lane, useStudioStore.getState().projectBpm);
      entry.chain.volumeGain.gain.value = audible.has(lane.laneId) ? lane.volume : 0;

      entry.source = scheduleLane({
        ctx,
        lane,
        buffer: entry.processedBuffer,
        chain: entry.chain,
        startTime,
        playhead,
      });
    }

    this.startedAtContextTime = startTime;
    this.startedAtPlayhead = playhead;
    useStudioStore.getState()._setPlaybackState(true, playhead);
    this.startMetronome(playhead);
    this.tick();
  }

  pause() {
    const ctx = this.ctx;
    const elapsed = ctx
      ? Math.max(0, ctx.currentTime - this.startedAtContextTime)
      : 0;
    const wasPlaying = useStudioStore.getState().isPlaying;
    const newPlayhead = wasPlaying ? this.startedAtPlayhead + elapsed : useStudioStore.getState().playhead;

    this.stopAllSources();
    this.stopMetronome();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    useStudioStore.getState()._setPlaybackState(false, newPlayhead);
  }

  /** Stop: silence everything and return the playhead to the start. */
  stop() {
    this.stopAllSources();
    this.stopMetronome();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const { loopEnabled, loopStart } = useStudioStore.getState();
    useStudioStore.getState()._setPlaybackState(false, loopEnabled ? loopStart : 0);
  }

  private stopAllSources() {
    for (const entry of this.lanes.values()) {
      if (entry.source) {
        try {
          entry.source.stop();
        } catch {
          // ignore
        }
        entry.source = null;
      }
    }
  }

  seek(seconds: number) {
    const wasPlaying = useStudioStore.getState().isPlaying;
    if (wasPlaying) this.pause();
    const clamped = Math.max(0, seconds);
    useStudioStore.getState()._setPlaybackState(false, clamped);
    if (wasPlaying) void this.play();
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
      void this.play();
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

if (typeof window !== "undefined") {
  const lastTransforms = new Map<string, { tempo: number; pitch: number }>();

  useStudioStore.subscribe((state, prevState) => {
    if (state.lanes !== prevState.lanes) {
      const currentIds = new Set(state.lanes.map((l) => l.laneId));
      for (const laneId of audioEngine.getLoadedLaneIds()) {
        if (!currentIds.has(laneId)) audioEngine.removeLane(laneId);
      }
    }
    audioEngine.applyMixState();

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
          void audioEngine.ensureTransform(lane.laneId);
        }
      }
    }
    for (const laneId of Array.from(lastTransforms.keys())) {
      if (!state.lanes.some((l) => l.laneId === laneId)) {
        lastTransforms.delete(laneId);
      }
    }
  });
}
