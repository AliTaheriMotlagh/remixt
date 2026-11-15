"use client";

import { isTakeLane } from "./lyricsSources";
import { startNewStep } from "./studioHistory";
import { laneName, useStudioStore, type StudioLane } from "./studioStore";
import { useStudioView } from "./studioView";

// What the Vocalist studio does with lanes: sorts them into the beat, the
// guide vocal (the original singer) and the singer's own voice, and doubles
// a take for a fuller sound.

export type Group = "beat" | "guide" | "voice";

export function groupOf(lane: StudioLane): Group {
  if (isTakeLane(lane)) return "voice";
  return lane.kind === "vocals" ? "guide" : "beat";
}

/** A take doubled: a copy a touch late and quieter, the two spread left and right — a fuller voice. */
export function doubleTake(lane: StudioLane) {
  const store = useStudioStore.getState();
  startNewStep();
  store.duplicateLane(lane.laneId);
  const lanes = useStudioStore.getState().lanes;
  const copy = lanes[lanes.findIndex((l) => l.laneId === lane.laneId) + 1];
  if (!copy) return;
  store.renameLane(copy.laneId, `${laneName(lane)} · double`.slice(0, 120));
  store.setFx(lane.laneId, { pan: -0.3 });
  store.setFx(copy.laneId, { pan: 0.3 });
  store.nudgeOffset(copy.laneId, 0.018);
  store.setVolume(copy.laneId, lane.volume * 0.7);
  useStudioView.getState().notify("Doubled — the copy sits a touch late on the right; Undo takes it away");
}
