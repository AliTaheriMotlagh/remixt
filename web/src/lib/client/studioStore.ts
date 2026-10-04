import { create } from "zustand";
import { semitonesToMatch, transposeKey, type MusicalKey } from "./musicKey";
import { isBacking, type StemKind } from "@/lib/stemKinds";
import {
  MIN_CLIP,
  WHOLE,
  clipSpan,
  clipStart,
  clipsOf,
  liveRefs,
  normaliseLane,
  splitClips,
  stutterLane,
  withEffectiveDuration,
  type ClipRef,
  type EditResult,
} from "./clipEdit";

export { clipSpan, clipStart, clipsOf, WHOLE, type ClipRef };

export type LaneKind = StemKind;

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
  /**
   * Sidechain ducking, 0..1: how far this lane dips while the vocals are
   * loud, so a beat makes room for the voice. 0 = off.
   */
  duck: number;
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
  duck: 0,
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
  /** Key of the source material (before pitch shift); detected or set by hand. */
  musicalKey: MusicalKey | null;
  pitchSemitones: number;
  tempoRatio: number;
  fx: LaneFx;
  /**
   * When set, the lane plays only these pieces of its stem, each at its own
   * place — AI Match cuts a vocal into phrases and lays them on the beat.
   * Null plays the whole stem from `offsetSeconds`.
   */
  clips: LaneClip[] | null;
  /** Which side of the crossfader this lane is on, if any (see ProjectSettings.crossfader). */
  xfade: "a" | "b" | null;
  /** Drawn changes over time — see LaneAutomation. */
  automation: LaneAutomation;
};

/** One point of an automation line: a timeline position and a 0..1 value. */
export type AutoPoint = { t: number; v: number };

/**
 * Parameters drawn over time, on the project timeline (so they stay put
 * when the lane moves): `volume` scales the lane's level (1 = its fader),
 * `filter` sweeps a low-pass from closed (0) to wide open (1).
 */
export type LaneAutomation = { volume?: AutoPoint[]; filter?: AutoPoint[] };
export type AutomationParam = keyof LaneAutomation;

/** A named stretch of the song ("chorus 0:42–1:05") to jump to, loop and export. */
export type Marker = { id: string; label: string; start: number; end: number };

/**
 * A slice of a stem on a pad, to trigger by hand. Stored by stem (not lane)
 * with the speed and pitch it was taken at, so it survives saving and
 * lanes being removed.
 */
export type Pad = {
  id: string;
  stemId: string;
  kind: LaneKind;
  label: string;
  /** Stem seconds. */
  from: number;
  to: number;
  tempoRatio: number;
  pitchSemitones: number;
  reverse?: boolean;
};

/**
 * One piece of a stem placed on the timeline. All three are in the stem's
 * own (unstretched) seconds, and `at` counts from the lane's start, so an
 * arrangement stretches along with the lane when its tempo changes.
 */
export type LaneClip = {
  /** Stable while the clip exists, so a selection survives edits (not saved). */
  id?: string;
  from: number;
  to: number;
  at: number;
  /**
   * Extra speed for this clip on top of the lane's tempo (1 or missing =
   * none). AI Match sets it so a phrase follows a beat whose tempo drifts.
   */
  stretch?: number;
  /** Plays the clip backwards. */
  reverse?: boolean;
  /** What it is, shown on the clip ("Chorus", "Verse 2") — set by the AI's arrangements. */
  label?: string;
};

/** The fields a bulk edit (auto-match, or undoing one) may change. */
export type LanePatch = Partial<
  Pick<
    StudioLane,
    | "bpm"
    | "musicalKey"
    | "pitchSemitones"
    | "tempoRatio"
    | "offsetSeconds"
    | "volume"
    | "fx"
    | "clips"
    | "automation"
  >
>;

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
  markers: Marker[];
  crossfader: number;
  pads: Pad[];
  /** The saved remix this mix was opened from, if any — a save becomes a remix of it. */
  sourceRemix: SourceRemix | null;
  /** The challenge this mix is an entry for, if it was started from one. */
  challenge: SourceRemix | null;
  setChallenge: (challenge: SourceRemix | null) => void;
  /** Lanes picked to move together (not saved, not shared). */
  selectedLaneIds: string[];
  toggleLaneSelected: (laneId: string) => void;
  setLaneSelection: (laneIds: string[]) => void;
  /** Shifts every given lane by the same amount, keeping their spacing (none goes before 0). */
  moveLanes: (laneIds: string[], deltaSeconds: number) => void;
  /** Sets several lanes' starts at once — a group drag. */
  setLaneOffsets: (offsets: Record<string, number>) => void;

  addStem: (stem: LoadableStem) => string;
  removeLane: (laneId: string) => void;
  duplicateLane: (laneId: string) => void;
  setVolume: (laneId: string, volume: number) => void;
  toggleMute: (laneId: string) => void;
  toggleSolo: (laneId: string) => void;
  setPitchSemitones: (laneId: string, semitones: number) => void;
  setTempoRatio: (laneId: string, ratio: number) => void;
  setLaneBpm: (laneId: string, bpm: number | null) => void;
  setLaneKey: (laneId: string, key: MusicalKey | null) => void;
  matchLaneKey: (laneId: string) => void;
  matchAllKeys: () => void;
  applyLanePatches: (patches: Record<string, LanePatch>, projectBpm?: number) => void;
  setOffset: (laneId: string, offsetSeconds: number) => void;
  /** Moves one clip so it starts at `timelineSeconds`. */
  moveClip: (laneId: string, index: number, timelineSeconds: number) => void;
  /** Drops the arrangement: the lane plays its whole stem again. */
  clearClips: (laneId: string) => void;
  /** Replaces the lane's clips (`at` may be anything; the lane start follows). */
  setClips: (laneId: string, clips: LaneClip[]) => void;
  /** Cuts whichever clip is under `timelineSeconds` in two. Returns whether it did. */
  splitAt: (laneId: string, timelineSeconds: number) => boolean;
  /** Drags one edge of a clip to `timelineSeconds`, uncovering or hiding audio. */
  trimClip: (laneId: string, index: number, edge: "start" | "end", timelineSeconds: number) => void;
  deleteClip: (laneId: string, index: number) => void;
  /** Copies a clip and places the copy straight after it. */
  duplicateClip: (laneId: string, index: number) => void;
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
  addMarker: (marker: Omit<Marker, "id">) => void;
  updateMarker: (id: string, patch: Partial<Omit<Marker, "id">>) => void;
  removeMarker: (id: string) => void;
  setCrossfader: (position: number) => void;
  setLaneXfade: (laneId: string, side: "a" | "b" | null) => void;
  /** Flips a clip backwards/forwards, or sets its own speed (1 = the lane's). */
  setClipOptions: (laneId: string, index: number, patch: Pick<LaneClip, "reverse" | "stretch">) => void;
  /**
   * Beat repeat: from `timelineSeconds`, plays the `beats`-long slice that
   * starts there `repeats` times in a row, over whatever was there.
   * Returns whether there was audio there to repeat.
   */
  stutterAt: (laneId: string, timelineSeconds: number, beats: number, repeats: number) => boolean;
  setAutomation: (laneId: string, param: AutomationParam, points: AutoPoint[] | null) => void;
  addPad: (pad: Omit<Pad, "id">) => void;
  updatePad: (id: string, patch: Partial<Omit<Pad, "id">>) => void;
  removePad: (id: string) => void;
  clearLanes: () => void;
  loadRemix: (lanes: StudioLane[], project?: Partial<ProjectSettings>, source?: SourceRemix | null) => void;
  /**
   * Takes on a collaborator's version of the mix (see collab.ts) without
   * touching playback, and keeping this person's own solo buttons.
   */
  applySharedState: (lanes: StudioLane[], project: ProjectSettings) => void;
  /** Clips picked for editing together (not saved, not shared). */
  selectedClips: ClipRef[];
  setClipSelection: (refs: ClipRef[]) => void;
  /**
   * Runs a clip edit from clipEdit.ts on the lanes and the live selection;
   * the edit returns the new lanes and what to select next (null: no change).
   */
  editClips: (edit: (lanes: StudioLane[], selection: ClipRef[]) => EditResult | null) => boolean;
  _setPlaybackState: (isPlaying: boolean, playhead: number) => void;
  _setLaneRendering: (laneId: string, rendering: boolean) => void;
};

export type SourceRemix = { id: string; title: string };

export type ProjectSettings = {
  projectBpm: number;
  masterVolume: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  markers: Marker[];
  /** 0 = all side A, 1 = all side B, 0.5 = both at full level. */
  crossfader: number;
  pads: Pad[];
};

export const PROJECT_DEFAULTS: ProjectSettings = {
  projectBpm: 120,
  masterVolume: 1,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  markers: [],
  crossfader: 0.5,
  pads: [],
};

function recomputeDuration(lanes: StudioLane[]) {
  return lanes.reduce((max, lane) => Math.max(max, lane.offsetSeconds + lane.duration), 0);
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

/**
 * The lane everything else is matched to: the first beat that has the
 * property in question, else the first lane of any kind that has it.
 * Beats win because a vocal is far easier to stretch and re-key cleanly.
 */
export function referenceLane(
  lanes: StudioLane[],
  has: (lane: StudioLane) => boolean
): StudioLane | undefined {
  return lanes.find((l) => isBacking(l.kind) && has(l)) ?? lanes.find(has);
}

/** The key a lane is sounding in right now, after its pitch shift. */
export function effectiveKey(lane: StudioLane): MusicalKey | null {
  return lane.musicalKey ? transposeKey(lane.musicalKey, lane.pitchSemitones) : null;
}

function withKeyMatched(lane: StudioLane, reference: StudioLane | undefined): StudioLane {
  const target = reference && effectiveKey(reference);
  if (!target || !lane.musicalKey || lane.laneId === reference.laneId) return lane;
  return { ...lane, pitchSemitones: semitonesToMatch(lane.musicalKey, target) };
}

function defaultProjectBpm(lanes: StudioLane[], fallback: number) {
  const beat = lanes.find((l) => isBacking(l.kind) && l.bpm);
  if (beat?.bpm) return Math.round(beat.bpm * 10) / 10;
  const any = lanes.find((l) => l.bpm);
  if (any?.bpm) return Math.round(any.bpm * 10) / 10;
  return fallback;
}

/** A fresh lane playing a library stem from the start, at its own speed and pitch. */
export function laneFromStem(stem: LoadableStem, laneId: string = crypto.randomUUID()): StudioLane {
  const originalDuration = stem.track_duration ?? 0;
  return {
    laneId,
    stemId: stem.id,
    kind: stem.kind,
    trackTitle: stem.track_title,
    artistName: stem.artist_name,
    volume: 1,
    muted: false,
    solo: false,
    peaks: JSON.parse(stem.peaks_json || "[]"),
    originalDuration,
    duration: originalDuration,
    offsetSeconds: 0,
    bpm: stem.track_bpm ?? null,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: { ...DEFAULT_FX },
    clips: null,
    xfade: null,
    automation: {},
  };
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
  markers: [],
  crossfader: 0.5,
  pads: [],
  sourceRemix: null,
  challenge: null,
  selectedLaneIds: [],
  selectedClips: [],
  setChallenge: (challenge) => set({ challenge }),

  addStem: (stem) => {
    const lane = laneFromStem(stem);
    const { laneId } = lane;
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
      return {
        lanes,
        duration: recomputeDuration(lanes),
        selectedLaneIds: state.selectedLaneIds.filter((id) => id !== laneId),
        selectedClips: state.selectedClips.filter((r) => r.laneId !== laneId),
      };
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

  setLaneKey: (laneId, musicalKey) => {
    set((state) => ({
      lanes: state.lanes.map((l) => (l.laneId === laneId ? { ...l, musicalKey } : l)),
    }));
  },

  // Shifts one lane's pitch so it plays in the same notes as the reference
  // lane (relative major/minor count as a match — they share every note).
  matchLaneKey: (laneId) => {
    set((state) => {
      const reference = referenceLane(state.lanes, (l) => !!l.musicalKey);
      return {
        lanes: state.lanes.map((l) => (l.laneId === laneId ? withKeyMatched(l, reference) : l)),
      };
    });
  },

  matchAllKeys: () => {
    set((state) => {
      const reference = referenceLane(state.lanes, (l) => !!l.musicalKey);
      return { lanes: state.lanes.map((l) => withKeyMatched(l, reference)) };
    });
  },

  applyLanePatches: (patches, projectBpm) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        const patch = patches[l.laneId];
        if (!patch) return l;
        return normaliseLane({
          ...l,
          ...patch,
          offsetSeconds: Math.max(0, patch.offsetSeconds ?? l.offsetSeconds),
        });
      });
      return {
        lanes,
        duration: recomputeDuration(lanes),
        projectBpm: projectBpm ?? state.projectBpm,
      };
    });
  },

  toggleLaneSelected: (laneId) =>
    set((state) => ({
      selectedLaneIds: state.selectedLaneIds.includes(laneId)
        ? state.selectedLaneIds.filter((id) => id !== laneId)
        : [...state.selectedLaneIds, laneId],
    })),

  setLaneSelection: (laneIds) => set({ selectedLaneIds: laneIds }),

  moveLanes: (laneIds, deltaSeconds) => {
    const moving = get().lanes.filter((l) => laneIds.includes(l.laneId));
    if (moving.length === 0) return;
    // Stop the whole group at zero rather than squashing the first lane into it.
    const earliest = Math.min(...moving.map((l) => l.offsetSeconds));
    const delta = Math.max(-earliest, deltaSeconds);
    get().setLaneOffsets(Object.fromEntries(moving.map((l) => [l.laneId, l.offsetSeconds + delta])));
  },

  setLaneOffsets: (offsets) => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        l.laneId in offsets ? { ...l, offsetSeconds: Math.max(0, offsets[l.laneId]) } : l
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  setOffset: (laneId, offsetSeconds) => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        l.laneId === laneId ? { ...l, offsetSeconds: Math.max(0, offsetSeconds) } : l
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  moveClip: (laneId, index, timelineSeconds) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        if (l.laneId !== laneId || !l.clips?.[index]) return l;
        const at = (Math.max(0, timelineSeconds) - l.offsetSeconds) * l.tempoRatio;
        const clips = l.clips.map((c, i) => (i === index ? { ...c, at } : c));
        return normaliseLane({ ...l, clips });
      });
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  clearClips: (laneId) => {
    set((state) => {
      const lanes = state.lanes.map((l) => {
        if (l.laneId !== laneId || !l.clips?.length) return l;
        // Keep the first phrase where it was, with the rest of the take
        // around it as originally sung.
        const first = l.clips.reduce((a, b) => (b.at < a.at ? b : a));
        const offsetSeconds = Math.max(0, l.offsetSeconds + (first.at - first.from) / l.tempoRatio);
        return withEffectiveDuration({ ...l, offsetSeconds, clips: null });
      });
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  setClips: (laneId, clips) => {
    set((state) => {
      const lanes = state.lanes.map((l) =>
        l.laneId === laneId && clips.length ? normaliseLane({ ...l, clips }) : l
      );
      return { lanes, duration: recomputeDuration(lanes) };
    });
  },

  splitAt: (laneId, timelineSeconds) => {
    const state = get();
    const result = splitClips(state.lanes, [laneId], [], timelineSeconds);
    if (!result.count) return false;
    set({ lanes: result.lanes, duration: recomputeDuration(result.lanes) });
    return true;
  },

  trimClip: (laneId, index, edge, timelineSeconds) => {
    const lane = get().lanes.find((l) => l.laneId === laneId);
    const clips = lane && clipsOf(lane);
    const clip = clips?.[index];
    if (!lane || !clips || !clip) return;
    const stretch = clip.stretch ?? 1;
    // How far the edge moved, in the stem's own seconds.
    const moved = (timelineSeconds - clipStart(lane, clip)) * lane.tempoRatio * stretch;
    let next: LaneClip;
    if (edge === "start") {
      const delta = Math.min(clip.to - clip.from - MIN_CLIP, Math.max(-clip.from, moved));
      next = { ...clip, from: clip.from + delta, at: clip.at + delta / stretch };
    } else {
      const to = Math.min(lane.originalDuration, Math.max(clip.from + MIN_CLIP, clip.from + moved));
      next = { ...clip, to };
    }
    get().setClips(laneId, clips.map((c, i) => (i === index ? next : c)));
  },

  deleteClip: (laneId, index) => {
    const lane = get().lanes.find((l) => l.laneId === laneId);
    if (!lane?.clips || lane.clips.length < 2) return;
    get().setClips(laneId, lane.clips.filter((_, i) => i !== index));
  },

  duplicateClip: (laneId, index) => {
    const lane = get().lanes.find((l) => l.laneId === laneId);
    const clips = lane && clipsOf(lane);
    const clip = clips?.[index];
    if (!clips || !clip) return;
    const copy = { ...clip, at: clip.at + clipSpan(clip) };
    get().setClips(laneId, [...clips.slice(0, index + 1), copy, ...clips.slice(index + 1)]);
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

  addMarker: (marker) =>
    set((state) => ({
      markers: [...state.markers, { ...marker, id: crypto.randomUUID() }].sort((a, b) => a.start - b.start),
    })),

  updateMarker: (id, patch) =>
    set((state) => ({ markers: state.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

  removeMarker: (id) => set((state) => ({ markers: state.markers.filter((m) => m.id !== id) })),

  setCrossfader: (position) => set({ crossfader: Math.min(1, Math.max(0, position)) }),

  setLaneXfade: (laneId, side) =>
    set((state) => ({ lanes: state.lanes.map((l) => (l.laneId === laneId ? { ...l, xfade: side } : l)) })),

  setClipOptions: (laneId, index, patch) => {
    const lane = get().lanes.find((l) => l.laneId === laneId);
    const clips = lane && clipsOf(lane);
    if (!clips?.[index]) return;
    get().setClips(
      laneId,
      clips.map((c, i) => {
        if (i !== index) return c;
        const next: LaneClip = { ...c, ...patch };
        if (!next.reverse) delete next.reverse;
        if (next.stretch === undefined || Math.abs(next.stretch - 1) < 0.0005) delete next.stretch;
        return next;
      })
    );
  },

  stutterAt: (laneId, timelineSeconds, beats, repeats) => {
    const state = get();
    const lane = state.lanes.find((l) => l.laneId === laneId);
    const clips = lane && stutterLane(lane, timelineSeconds, beatLength(state.projectBpm) * beats, repeats);
    if (!clips) return false;
    get().setClips(laneId, clips);
    return true;
  },

  setClipSelection: (refs) => set({ selectedClips: refs }),

  editClips: (edit) => {
    const state = get();
    const result = edit(state.lanes, liveRefs(state.lanes, state.selectedClips));
    if (!result) return false;
    set({
      lanes: result.lanes,
      duration: recomputeDuration(result.lanes),
      selectedClips: result.selection,
      selectedLaneIds: state.selectedLaneIds.filter((id) => result.lanes.some((l) => l.laneId === id)),
    });
    return true;
  },

  setAutomation: (laneId, param, points) =>
    set((state) => ({
      lanes: state.lanes.map((l) => {
        if (l.laneId !== laneId) return l;
        const automation = { ...l.automation };
        if (points && points.length) automation[param] = [...points].sort((a, b) => a.t - b.t);
        else delete automation[param];
        return { ...l, automation };
      }),
    })),

  addPad: (pad) => set((state) => ({ pads: [...state.pads, { ...pad, id: crypto.randomUUID() }].slice(0, 16) })),

  updatePad: (id, patch) => set((state) => ({ pads: state.pads.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  removePad: (id) => set((state) => ({ pads: state.pads.filter((p) => p.id !== id) })),

  clearLanes: () =>
    set({
      lanes: [],
      duration: 0,
      playhead: 0,
      isPlaying: false,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
      markers: [],
      crossfader: 0.5,
      pads: [],
      sourceRemix: null,
      challenge: null,
      selectedLaneIds: [],
      selectedClips: [],
    }),

  loadRemix: (lanes, project, source = null) => {
    const withDurations = lanes.map(normaliseLane);
    const duration = recomputeDuration(withDurations);
    set((state) => ({
      lanes: withDurations,
      duration,
      playhead: 0,
      isPlaying: false,
      projectBpm: project?.projectBpm ?? defaultProjectBpm(withDurations, state.projectBpm),
      masterVolume: project?.masterVolume ?? 1,
      // The region comes back, but switched off: a loop left on when the
      // mix was saved made it repeat for everyone who opened it, with no
      // idea why.
      loopEnabled: false,
      loopStart: project?.loopStart ?? 0,
      loopEnd: project?.loopEnd ?? 0,
      markers: project?.markers ?? [],
      crossfader: project?.crossfader ?? 0.5,
      pads: project?.pads ?? [],
      sourceRemix: source,
      challenge: null,
      selectedLaneIds: [],
      selectedClips: [],
    }));
  },

  applySharedState: (lanes, project) => {
    set((state) => {
      const solo = new Set(state.lanes.filter((l) => l.solo).map((l) => l.laneId));
      const next = lanes.map((lane) => normaliseLane({ ...lane, solo: solo.has(lane.laneId) }));
      // Looping is for whoever's listening: a collaborator's loop shouldn't
      // start (or stop) repeating this person's playback.
      const { loopEnabled, loopStart, loopEnd } = state;
      return { ...project, loopEnabled, loopStart, loopEnd, lanes: next, duration: recomputeDuration(next) };
    });
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

/** Equal-power crossfader gain for a lane on side A or B (1 for lanes on neither). */
export function crossfaderGain(lane: Pick<StudioLane, "xfade">, position: number) {
  if (!lane.xfade) return 1;
  // Both sides at full level in the middle, fading out towards the far end.
  const toward = lane.xfade === "a" ? position : 1 - position;
  return toward <= 0.5 ? 1 : Math.cos((toward - 0.5) * Math.PI);
}

/** The level a lane plays at: its fader, unless muted/soloed out, through the crossfader. */
export function laneGain(lane: StudioLane, audible: Set<string>, crossfader: number) {
  return audible.has(lane.laneId) ? lane.volume * crossfaderGain(lane, crossfader) : 0;
}

export function getAudibleLaneIds(lanes: StudioLane[]): Set<string> {
  const anySolo = lanes.some((l) => l.solo);
  const audible = lanes.filter((l) =>
    anySolo ? l.solo && !l.muted : !l.muted
  );
  return new Set(audible.map((l) => l.laneId));
}
