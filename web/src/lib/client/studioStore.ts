import { create } from "zustand";

export type LaneKind = "vocals" | "beat";

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
  bpm: number | null;
  pitchSemitones: number;
  tempoRatio: number;
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

type StudioState = {
  lanes: StudioLane[];
  isPlaying: boolean;
  playhead: number;
  duration: number;
  renderingLaneIds: Set<string>;
  addStem: (stem: LoadableStem) => string;
  removeLane: (laneId: string) => void;
  setVolume: (laneId: string, volume: number) => void;
  toggleMute: (laneId: string) => void;
  toggleSolo: (laneId: string) => void;
  setPitchSemitones: (laneId: string, semitones: number) => void;
  setTempoRatio: (laneId: string, ratio: number) => void;
  matchAllToBpm: (targetBpm: number) => void;
  resetAllTempo: () => void;
  clearLanes: () => void;
  loadRemix: (lanes: StudioLane[]) => void;
  _setPlaybackState: (isPlaying: boolean, playhead: number) => void;
  _setLaneRendering: (laneId: string, rendering: boolean) => void;
};

function recomputeDuration(lanes: StudioLane[]) {
  return lanes.reduce((max, lane) => Math.max(max, lane.duration), 0);
}

function withEffectiveDuration(lane: StudioLane): StudioLane {
  return {
    ...lane,
    duration: lane.originalDuration / lane.tempoRatio,
  };
}

export const useStudioStore = create<StudioState>((set) => ({
  lanes: [],
  isPlaying: false,
  playhead: 0,
  duration: 0,
  renderingLaneIds: new Set(),

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
      bpm: stem.track_bpm ?? null,
      pitchSemitones: 0,
      tempoRatio: 1,
    };
    set((state) => {
      const lanes = [...state.lanes, lane];
      return { lanes, duration: recomputeDuration(lanes) };
    });
    return laneId;
  },

  removeLane: (laneId) => {
    set((state) => {
      const lanes = state.lanes.filter((l) => l.laneId !== laneId);
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

  matchAllToBpm: (targetBpm) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        if (!l.bpm || l.bpm <= 0) return l;
        const ratio = targetBpm / l.bpm;
        return withEffectiveDuration({ ...l, tempoRatio: ratio });
      });
      return { lanes, duration: recomputeDuration(lanes) };
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

  clearLanes: () => set({ lanes: [], duration: 0, playhead: 0, isPlaying: false }),

  loadRemix: (lanes) => {
    const withDurations = lanes.map(withEffectiveDuration);
    set({ lanes: withDurations, duration: recomputeDuration(withDurations), playhead: 0 });
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
