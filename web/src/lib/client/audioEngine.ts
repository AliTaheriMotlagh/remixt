"use client";

import { renderPitchTempo } from "./pitchTempo";
import { getAudibleLaneIds, useStudioStore } from "./studioStore";

type LoadedBuffer = {
  rawBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  appliedTempo: number;
  appliedPitch: number;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, LoadedBuffer>();
  private loading = new Map<string, Promise<void>>();
  private transforming = new Map<string, Promise<void>>();
  private startedAtContextTime = 0;
  private startedAtPlayhead = 0;
  private rafId: number | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async ensureLane(laneId: string, stemId: string) {
    if (this.buffers.has(laneId) || this.loading.has(laneId)) return;
    const ctx = this.getContext();

    const promise = fetch(`/api/audio/stem/${stemId}`)
      .then((res) => res.arrayBuffer())
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((buffer) => {
        const gain = ctx.createGain();
        gain.connect(this.master!);
        this.buffers.set(laneId, {
          rawBuffer: buffer,
          processedBuffer: buffer,
          appliedTempo: 1,
          appliedPitch: 0,
          gain,
          source: null,
        });
      })
      .finally(() => {
        this.loading.delete(laneId);
      });

    this.loading.set(laneId, promise);
    await promise;
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
    const entry = this.buffers.get(laneId);
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
        const current = this.buffers.get(laneId);
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
    const entry = this.buffers.get(laneId);
    if (entry?.source) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
    }
    entry?.gain.disconnect();
    this.buffers.delete(laneId);
  }

  applyMixState() {
    const { lanes } = useStudioStore.getState();
    const audible = getAudibleLaneIds(lanes);
    for (const lane of lanes) {
      const entry = this.buffers.get(lane.laneId);
      if (!entry) continue;
      const isAudible = audible.has(lane.laneId);
      entry.gain.gain.value = isAudible ? lane.volume : 0;
    }
  }

  isReady(laneId: string) {
    return this.buffers.has(laneId);
  }

  getLoadedLaneIds(): string[] {
    return Array.from(this.buffers.keys());
  }

  async play() {
    const ctx = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();

    const { lanes, playhead } = useStudioStore.getState();
    await Promise.all(lanes.map((l) => this.ensureLane(l.laneId, l.stemId)));
    await Promise.all(lanes.map((l) => this.ensureTransform(l.laneId)));

    const audible = getAudibleLaneIds(lanes);
    const startTime = ctx.currentTime + 0.05;

    for (const lane of lanes) {
      const entry = this.buffers.get(lane.laneId);
      if (!entry) continue;
      if (entry.source) {
        try {
          entry.source.stop();
        } catch {
          // ignore
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = entry.processedBuffer;
      source.connect(entry.gain);
      entry.gain.gain.value = audible.has(lane.laneId) ? lane.volume : 0;

      const offset = Math.min(playhead, entry.processedBuffer.duration);
      source.start(startTime, offset);
      entry.source = source;
    }

    this.startedAtContextTime = startTime;
    this.startedAtPlayhead = playhead;
    useStudioStore.getState()._setPlaybackState(true, playhead);
    this.tick();
  }

  pause() {
    const ctx = this.ctx;
    const elapsed = ctx
      ? Math.max(0, ctx.currentTime - this.startedAtContextTime)
      : 0;
    const newPlayhead = this.startedAtPlayhead + elapsed;

    for (const entry of this.buffers.values()) {
      if (entry.source) {
        try {
          entry.source.stop();
        } catch {
          // ignore
        }
        entry.source = null;
      }
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    useStudioStore.getState()._setPlaybackState(false, newPlayhead);
  }

  seek(seconds: number) {
    const wasPlaying = useStudioStore.getState().isPlaying;
    if (wasPlaying) this.pause();
    const clamped = Math.max(0, seconds);
    useStudioStore.getState()._setPlaybackState(false, clamped);
    if (wasPlaying) this.play();
  }

  private tick = () => {
    if (!this.ctx) return;
    const elapsed = this.ctx.currentTime - this.startedAtContextTime;
    const playhead = this.startedAtPlayhead + Math.max(0, elapsed);
    const { duration } = useStudioStore.getState();

    if (duration > 0 && playhead >= duration) {
      this.pause();
      useStudioStore.getState()._setPlaybackState(false, 0);
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
      audioEngine.applyMixState();
    } else {
      audioEngine.applyMixState();
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
