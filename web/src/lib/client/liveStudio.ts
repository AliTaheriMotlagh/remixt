"use client";

import { projectToPayload } from "./remixLanes";
import { withoutRecording } from "./studioHistory";
import { DEFAULT_FX, PROJECT_DEFAULTS, useStudioStore, type ProjectSettings, type StudioLane } from "./studioStore";

// Making a remix live: the host's Studio is broadcast as it changes, and
// each listener's Studio (read-only) is kept the same.
//
// Two things travel. The mix — every lane with its clips, effects,
// automation, plus the project's tempo, loop, master — is sent a moment
// after each edit (PUT /api/live/[id]/mix) and only reaches listeners when
// it changed. The transport — playing or not, where, which lanes are
// selected — goes through the same stage state as a performance, so
// listeners play in step (see liveSync.ts).

export type LiveMix = { lanes: StudioLane[]; project: ProjectSettings };

const MIX_DELAY_MS = 350;
const KEYFRAME_PLAYING_MS = 3000;
const KEYFRAME_IDLE_MS = 8000;
/** Waveform overviews are only for drawing: a few hundred points is plenty. */
const PEAKS_SENT = 300;

function thinPeaks(peaks: number[]): number[] {
  if (peaks.length <= PEAKS_SENT) return peaks;
  const step = peaks.length / PEAKS_SENT;
  const out: number[] = [];
  for (let i = 0; i < PEAKS_SENT; i++) {
    let max = 0;
    for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j++) max = Math.max(max, peaks[j]);
    out.push(Math.round(max * 1000) / 1000);
  }
  return out;
}

type Store = ReturnType<typeof useStudioStore.getState>;

export function mixOf(state: Store): LiveMix {
  return {
    lanes: state.lanes.map((lane) => ({ ...lane, peaks: thinPeaks(lane.peaks) })),
    project: projectToPayload(state),
  };
}

const mixFields = (s: Store) =>
  [s.lanes, s.projectBpm, s.loopEnabled, s.loopStart, s.loopEnd, s.markers, s.crossfader, s.pads, s.master] as const;

/**
 * Broadcasts the Studio to live session `streamId` until the returned
 * function is called.
 */
export function startStudioBroadcast(streamId: string): () => void {
  let stopped = false;
  let lastMix = "";
  let mixTimer: ReturnType<typeof setTimeout> | null = null;
  let stateTimer: ReturnType<typeof setTimeout> | null = null;
  let keyframe: ReturnType<typeof setTimeout> | null = null;
  let sendingMix = false;
  let sendingState = false;
  let stateAgain = false;

  async function sendMix() {
    mixTimer = null;
    if (stopped) return;
    if (sendingMix) return scheduleMix();
    const body = JSON.stringify(mixOf(useStudioStore.getState()));
    if (body === lastMix) return;
    sendingMix = true;
    try {
      const res = await fetch(`/api/live/${streamId}/mix`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
      if (res.ok) lastMix = body;
      else if (res.status >= 500) scheduleMix(2000);
    } catch {
      scheduleMix(2000);
    } finally {
      sendingMix = false;
    }
  }

  function scheduleMix(delay = MIX_DELAY_MS) {
    if (mixTimer) clearTimeout(mixTimer);
    mixTimer = setTimeout(() => void sendMix(), delay);
  }

  async function sendState() {
    stateTimer = null;
    if (stopped) return;
    if (sendingState) {
      stateAgain = true;
      return;
    }
    sendingState = true;
    try {
      const s = useStudioStore.getState();
      await fetch(`/api/live/${streamId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playing: s.isPlaying,
          position: Math.round(s.playhead * 1000) / 1000,
          lanes: s.lanes.slice(0, 64).map((l) => ({ muted: l.muted, solo: l.solo, volume: Math.min(2, Math.round(l.volume * 100) / 100) })),
          selected: s.selectedLaneIds.slice(0, 32),
        }),
      });
    } catch {
      // The next keyframe catches up.
    } finally {
      sendingState = false;
      if (stateAgain) {
        stateAgain = false;
        void sendState();
      }
    }
  }

  function scheduleState() {
    if (!stateTimer) stateTimer = setTimeout(() => void sendState(), 100);
  }

  const unsubscribe = useStudioStore.subscribe((state, previous) => {
    const a = mixFields(state);
    const b = mixFields(previous);
    if (a.some((value, i) => value !== b[i])) scheduleMix();
    if (
      state.isPlaying !== previous.isPlaying ||
      state.selectedLaneIds !== previous.selectedLaneIds ||
      // A seek while paused (while playing, the playhead moves every frame).
      (!state.isPlaying && state.playhead !== previous.playhead)
    ) {
      scheduleState();
    }
  });

  const tick = () => {
    void sendState();
    keyframe = setTimeout(tick, useStudioStore.getState().isPlaying ? KEYFRAME_PLAYING_MS : KEYFRAME_IDLE_MS);
  };
  void sendMix();
  tick();

  return () => {
    stopped = true;
    unsubscribe();
    for (const timer of [mixTimer, stateTimer, keyframe]) if (timer) clearTimeout(timer);
  };
}

// --- Listening ------------------------------------------------------------------------------

function isMix(value: unknown): value is { lanes: Partial<StudioLane>[]; project: Partial<ProjectSettings> } {
  const v = value as { lanes?: unknown; project?: unknown } | null;
  return !!v && Array.isArray(v.lanes) && !!v.project && typeof v.project === "object";
}

/**
 * Puts the host's mix into this tab's Studio store, keeping the listener's
 * own volume. Returns the mix as applied (for describing what changed), or
 * null when it wasn't a mix.
 */
export function applyLiveMix(raw: unknown): LiveMix | null {
  if (!isMix(raw)) return null;
  const lanes = raw.lanes
    .filter((l): l is StudioLane => typeof l?.laneId === "string" && typeof l.stemId === "string")
    .map((lane) => ({
      ...lane,
      solo: !!lane.solo,
      peaks: Array.isArray(lane.peaks) ? lane.peaks : [],
      fx: { ...DEFAULT_FX, ...lane.fx },
      xfade: lane.xfade ?? null,
      automation: lane.automation ?? {},
      clips: lane.clips ?? null,
    }));
  const project: ProjectSettings = { ...PROJECT_DEFAULTS, ...raw.project };
  const store = useStudioStore.getState();
  const own = { masterVolume: store.masterVolume };
  withoutRecording(() => {
    store.applySharedState(lanes, { ...project, ...own });
    // Shared sessions keep solo and loop per person; here everyone hears the host's.
    const solo = new Set(lanes.filter((l) => l.solo).map((l) => l.laneId));
    useStudioStore.setState((s) => ({
      lanes: s.lanes.map((l) => ({ ...l, solo: solo.has(l.laneId) })),
      loopEnabled: project.loopEnabled,
      loopStart: project.loopStart,
      loopEnd: project.loopEnd,
    }));
  });
  return { lanes, project };
}
