import { create } from "zustand";

export type LaneKind = "vocals" | "beat";

export type DelayDivision = "free" | "1/2" | "1/4" | "1/4." | "1/8" | "1/8." | "1/16";

// Per-lane effect rack. Every value maps to one AudioParam in the lane's
// chain (see audioEngine.createLaneChain), so changing any of these is a
// live parameter update — no re-render of the buffer required.
export type LaneFx = {
  pan: number; // -1 (left) .. 1 (right)
  highpass: number; // Hz, 20 = off
  lowpass: number; // Hz, 20000 = off
  eqLow: number; // dB, low shelf
  eqMid: number; // dB, mid peak
  eqHigh: number; // dB, high shelf
  drive: number; // 0..1 saturation
  compress: boolean; // vocal-style levelling compressor
  width: number; // 0..1 Haas stereo doubler
  reverb: number; // 0..1 send
  reverbSize: number; // seconds of decay
  delay: number; // 0..1 send
  delayDivision: DelayDivision;
  delayTime: number; // seconds, used when delayDivision === "free"
  delayFeedback: number; // 0..0.85
  fadeIn: number; // seconds
  fadeOut: number; // seconds
};

export const DEFAULT_FX: LaneFx = {
  pan: 0,
  highpass: 20,
  lowpass: 20000,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  drive: 0,
  compress: false,
  width: 0,
  reverb: 0,
  reverbSize: 2,
  delay: 0,
  delayDivision: "1/8",
  delayTime: 0.25,
  delayFeedback: 0.35,
  fadeIn: 0,
  fadeOut: 0,
};

export type StudioLane = {
  laneId: string;
  stemId: string;
  kind: LaneKind;
  trackTitle: string;
  artistName: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  peaks: number[];
  originalDuration: number;
  duration: number;
  /** Where this lane starts on the project timeline, in seconds. */
  offsetSeconds: number;
  bpm: number | null;
  pitchSemitones: number;
  tempoRatio: number;
  fx: LaneFx;
};

export type LoadableStem = {
  id: string;
  kind: LaneKind;
  track_title: string;
  artist_name: string;
  peaks_json: string;
  track_duration: number | null;
  track_bpm?: number | null;
};

export type FxPreset = {
  id: string;
  label: string;
  hint: string;
  kind: LaneKind | "any";
  fx: Partial<LaneFx>;
};

// Vocal presets are the ones that matter most in practice: a bare stem
// pulled out of a mix is dry and thin, so every preset below cleans the
// low end first, then shapes the character.
export const FX_PRESETS: FxPreset[] = [
  {
    id: "clean",
    label: "Clean",
    hint: "Flat — just a gentle high-pass to lose stem rumble",
    kind: "any",
    fx: { ...DEFAULT_FX },
  },
  {
    id: "vocal-air",
    label: "Air",
    hint: "Bright, present lead vocal with a touch of room",
    kind: "vocals",
    fx: { highpass: 110, eqMid: 1.5, eqHigh: 4, compress: true, reverb: 0.16, reverbSize: 1.6 },
  },
  {
    id: "vocal-hall",
    label: "Hall",
    hint: "Big wash of reverb — ballads and outros",
    kind: "vocals",
    fx: { highpass: 110, eqHigh: 2, compress: true, reverb: 0.42, reverbSize: 4, width: 0.3 },
  },
  {
    id: "vocal-slap",
    label: "Slapback",
    hint: "Short tempo-synced echo, classic rap double",
    kind: "vocals",
    fx: { highpass: 120, compress: true, delay: 0.3, delayDivision: "1/8", delayFeedback: 0.18, reverb: 0.1 },
  },
  {
    id: "vocal-throw",
    label: "Dub throw",
    hint: "Long feedback delay for ad-libs",
    kind: "vocals",
    fx: { highpass: 120, compress: true, delay: 0.38, delayDivision: "1/4.", delayFeedback: 0.62, reverb: 0.2 },
  },
  {
    id: "vocal-radio",
    label: "Radio",
    hint: "Telephone/lo-fi band-passed vocal for intros",
    kind: "vocals",
    fx: { highpass: 700, lowpass: 3200, drive: 0.35, compress: true, eqMid: 3 },
  },
  {
    id: "vocal-double",
    label: "Wide double",
    hint: "Haas widening — sits the vocal around the beat",
    kind: "vocals",
    fx: { highpass: 110, compress: true, width: 0.75, eqHigh: 2, reverb: 0.12 },
  },
  {
    id: "beat-punch",
    label: "Punch",
    hint: "Tighter low end, more snap",
    kind: "beat",
    fx: { highpass: 28, eqLow: 3, eqMid: -1.5, eqHigh: 1.5, drive: 0.15 },
  },
  {
    id: "beat-lofi",
    label: "Lo-fi",
    hint: "Dusty, filtered and saturated",
    kind: "beat",
    fx: { highpass: 90, lowpass: 5200, drive: 0.45, eqLow: 2 },
  },
  {
    id: "beat-duck",
    label: "Underbed",
    hint: "Scooped mids so the vocal cuts through",
    kind: "beat",
    fx: { eqMid: -4, eqHigh: -1, lowpass: 16000 },
  },
];

type StudioState = {
  lanes: StudioLane[];
  isPlaying: boolean;
  playhead: number;
  duration: number;
  renderingLaneIds: Set<string>;

  // Project-level mix settings
  projectBpm: number;
  masterVolume: number;
  metronome: boolean;
  snapToGrid: boolean;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;

  addStem: (stem: LoadableStem) => string;
  removeLane: (laneId: string) => void;
  duplicateLane: (laneId: string) => void;
  setVolume: (laneId: string, volume: number) => void;
  toggleMute: (laneId: string) => void;
  toggleSolo: (laneId: string) => void;
  setPitchSemitones: (laneId: string, semitones: number) => void;
  setTempoRatio: (laneId: string, ratio: number) => void;
  setLaneBpm: (laneId: string, bpm: number | null) => void;
  setOffset: (laneId: string, offsetSeconds: number) => void;
  nudgeOffset: (laneId: string, deltaSeconds: number) => void;
  setFx: (laneId: string, patch: Partial<LaneFx>) => void;
  applyPreset: (laneId: string, presetId: string) => void;
  matchLaneToProject: (laneId: string) => void;
  matchAllToBpm: (targetBpm: number) => void;
  resetAllTempo: () => void;
  setProjectBpm: (bpm: number) => void;
  setMasterVolume: (volume: number) => void;
  toggleMetronome: () => void;
  toggleSnap: () => void;
  setLoop: (patch: { enabled?: boolean; start?: number; end?: number }) => void;
  clearLanes: () => void;
  loadRemix: (lanes: StudioLane[], project?: Partial<ProjectSettings>) => void;
  _setPlaybackState: (isPlaying: boolean, playhead: number) => void;
  _setLaneRendering: (laneId: string, rendering: boolean) => void;
};

export type ProjectSettings = {
  projectBpm: number;
  masterVolume: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
};

function recomputeDuration(lanes: StudioLane[]) {
  return lanes.reduce((max, lane) => Math.max(max, lane.offsetSeconds + lane.duration), 0);
}

function withEffectiveDuration(lane: StudioLane): StudioLane {
  return {
    ...lane,
    duration: lane.originalDuration / lane.tempoRatio,
  };
}

/**
 * Length of the visible timeline. Rounded up to a whole bar (and never
 * shorter than 8 bars) so that dragging a clip around doesn't make every
 * other clip on screen rescale under the cursor.
 */
export function viewDuration(duration: number, projectBpm: number) {
  const bar = beatLength(projectBpm) * 4;
  const minimum = bar * 8;
  return Math.max(minimum, Math.ceil((duration + bar) / bar) * bar);
}

/** Seconds per beat at the project tempo. */
export function beatLength(bpm: number) {
  return 60 / (bpm > 0 ? bpm : 120);
}

export const DELAY_DIVISIONS: { id: DelayDivision; label: string; beats: number }[] = [
  { id: "1/2", label: "1/2", beats: 2 },
  { id: "1/4.", label: "1/4.", beats: 1.5 },
  { id: "1/4", label: "1/4", beats: 1 },
  { id: "1/8.", label: "1/8.", beats: 0.75 },
  { id: "1/8", label: "1/8", beats: 0.5 },
  { id: "1/16", label: "1/16", beats: 0.25 },
  { id: "free", label: "Free", beats: 0 },
];

/** Resolves a lane's delay time in seconds, honouring tempo sync. */
export function resolveDelayTime(fx: LaneFx, projectBpm: number) {
  if (fx.delayDivision === "free") return Math.max(0.01, fx.delayTime);
  const division = DELAY_DIVISIONS.find((d) => d.id === fx.delayDivision);
  if (!division) return Math.max(0.01, fx.delayTime);
  return Math.max(0.01, division.beats * beatLength(projectBpm));
}

function defaultProjectBpm(lanes: StudioLane[], fallback: number) {
  const beat = lanes.find((l) => l.kind === "beat" && l.bpm);
  if (beat?.bpm) return Math.round(beat.bpm * 10) / 10;
  const any = lanes.find((l) => l.bpm);
  if (any?.bpm) return Math.round(any.bpm * 10) / 10;
  return fallback;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  lanes: [],
  isPlaying: false,
  playhead: 0,
  duration: 0,
  renderingLaneIds: new Set(),

  projectBpm: 120,
  masterVolume: 1,
  metronome: false,
  snapToGrid: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,

  addStem: (stem) => {
    const laneId = crypto.randomUUID();
    const peaks: number[] = JSON.parse(stem.peaks_json || "[]");
    const originalDuration = stem.track_duration ?? 0;
    const lane: StudioLane = {
      laneId,
      stemId: stem.id,
      kind: stem.kind,
      trackTitle: stem.track_title,
      artistName: stem.artist_name,
      volume: 1,
      muted: false,
      solo: false,
      peaks,
      originalDuration,
      duration: originalDuration,
      offsetSeconds: 0,
      bpm: stem.track_bpm ?? null,
      pitchSemitones: 0,
      tempoRatio: 1,
      fx: { ...DEFAULT_FX },
    };
    set((state) => {
      const lanes = [...state.lanes, lane];
      const wasEmpty = state.lanes.length === 0;
      return {
        lanes,
        duration: recomputeDuration(lanes),
        projectBpm: wasEmpty ? defaultProjectBpm(lanes, state.projectBpm) : state.projectBpm,
      };
    });
    return laneId;
  },

  removeLane: (laneId) => {
    set((state) => {
      const lanes = state.lanes.filter((l) => l.laneId !== laneId);
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  duplicateLane: (laneId) => {
    set((state) => {
      const source = state.lanes.find((l) => l.laneId === laneId);
      if (!source) return state;
      const copy: StudioLane = {
        ...source,
        laneId: crypto.randomUUID(),
        solo: false,
        fx: { ...source.fx },
      };
      const index = state.lanes.findIndex((l) => l.laneId === laneId);
      const lanes = [...state.lanes];
      lanes.splice(index + 1, 0, copy);
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  setVolume: (laneId, volume) => {
    set((state) => ({
      lanes: state.lanes.map((l) => (l.laneId === laneId ? { ...l, volume } : l)),
    }));
  },

  toggleMute: (laneId) => {
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, muted: !l.muted } : l
      ),
    }));
  },

  toggleSolo: (laneId) => {
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, solo: !l.solo } : l
      ),
    }));
  },

  setPitchSemitones: (laneId, semitones) => {
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, pitchSemitones: semitones } : l
      ),
    }));
  },

  setTempoRatio: (laneId, ratio) => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        l.laneId === laneId
          ? withEffectiveDuration({ ...l, tempoRatio: ratio })
          : l
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  // The BPM stored on a lane is the tempo of the *source* material, which
  // is whatever librosa detected at upload time. Detection halves or
  // doubles often enough that editing it by hand has to be possible: the
  // lane's playback speed is unchanged, but every tempo calculation that
  // follows (match to project, the beat grid) now uses the corrected value.
  setLaneBpm: (laneId, bpm) => {
    set((state) => ({
      lanes: state.lanes.map((l) => (l.laneId === laneId ? { ...l, bpm } : l)),
    }));
  },

  setOffset: (laneId, offsetSeconds) => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, offsetSeconds: Math.max(0, offsetSeconds) } : l
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  nudgeOffset: (laneId, deltaSeconds) => {
    const lane = get().lanes.find((l) => l.laneId === laneId);
    if (!lane) return;
    get().setOffset(laneId, lane.offsetSeconds + deltaSeconds);
  },

  setFx: (laneId, patch) => {
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, fx: { ...l.fx, ...patch } } : l
      ),
    }));
  },

  applyPreset: (laneId, presetId) => {
    const preset = FX_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.laneId === laneId
          ? { ...l, fx: { ...DEFAULT_FX, ...preset.fx } }
          : l
      ),
    }));
  },

  matchLaneToProject: (laneId) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        if (l.laneId !== laneId || !l.bpm || l.bpm <= 0) return l;
        return withEffectiveDuration({ ...l, tempoRatio: state.projectBpm / l.bpm });
      });
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  matchAllToBpm: (targetBpm) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        if (!l.bpm || l.bpm <= 0) return l;
        const ratio = targetBpm / l.bpm;
        return withEffectiveDuration({ ...l, tempoRatio: ratio });
      });
      return { lanes, duration: recomputeDuration(lanes), projectBpm: targetBpm };
    });
  },

  resetAllTempo: () => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        withEffectiveDuration({ ...l, tempoRatio: 1 })
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  setProjectBpm: (bpm) => set({ projectBpm: Math.min(300, Math.max(20, bpm)) }),

  setMasterVolume: (volume) => set({ masterVolume: Math.min(1.5, Math.max(0, volume)) }),

  toggleMetronome: () => set((state) => ({ metronome: !state.metronome })),

  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),

  setLoop: (patch) => {
    set((state) => {
      const start = Math.max(0, patch.start ?? state.loopStart);
      const end = Math.max(start, patch.end ?? state.loopEnd);
      // An empty region can't be looped, so clearing it (start === end)
      // also turns looping off rather than leaving a dead toggle on.
      const enabled = (patch.enabled ?? state.loopEnabled) && end > start;
      return { loopEnabled: enabled, loopStart: start, loopEnd: end };
    });
  },

  clearLanes: () =>
    set({
      lanes: [],
      duration: 0,
      playhead: 0,
      isPlaying: false,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
    }),

  loadRemix: (lanes, project) => {
    const withDurations = lanes.map(withEffectiveDuration);
    const duration = recomputeDuration(withDurations);
    set((state) => ({
      lanes: withDurations,
      duration,
      playhead: 0,
      isPlaying: false,
      projectBpm: project?.projectBpm ?? defaultProjectBpm(withDurations, state.projectBpm),
      masterVolume: project?.masterVolume ?? 1,
      loopEnabled: project?.loopEnabled ?? false,
      loopStart: project?.loopStart ?? 0,
      loopEnd: project?.loopEnd ?? 0,
    }));
  },

  _setPlaybackState: (isPlaying, playhead) => set({ isPlaying, playhead }),

  _setLaneRendering: (laneId, rendering) => {
    set((state) => {
      const next = new Set(state.renderingLaneIds);
      if (rendering) next.add(laneId);
      else next.delete(laneId);
      return { renderingLaneIds: next };
    });
  },
}));

export function getAudibleLaneIds(lanes: StudioLane[]): Set<string> {
  const anySolo = lanes.some((l) => l.solo);
  const audible = lanes.filter((l) =>
    anySolo ? l.solo && !l.muted : !l.muted
  );
  return new Set(audible.map((l) => l.laneId));
}
