"use client";

import { beatLength, useStudioStore } from "@/lib/client/studioStore";

/**
 * Moving several lanes as one: tick the ✓ on each lane, then drag any of
 * them (or use the nudges here) and they all shift together, keeping
 * their spacing — e.g. a vocal and its harmony, or a beat and its drums.
 */
export default function LaneGroupBar() {
  const lanes = useStudioStore((s) => s.lanes);
  const selected = useStudioStore((s) => s.selectedLaneIds);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const moveLanes = useStudioStore((s) => s.moveLanes);
  const setLaneSelection = useStudioStore((s) => s.setLaneSelection);

  if (lanes.length < 2) return null;

  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const count = selected.length;

  if (count === 0) {
    return (
      <p className="-mb-1 px-1 text-xs text-muted">
        Tip: tick <span className="rounded border border-border px-1">✓</span> on two or more lanes to move them
        together.
      </p>
    );
  }

  function toPlayhead() {
    const group = useStudioStore.getState().lanes.filter((l) => selected.includes(l.laneId));
    const earliest = Math.min(...group.map((l) => l.offsetSeconds));
    const playhead = useStudioStore.getState().playhead;
    const snapped = useStudioStore.getState().snapToGrid ? Math.round(playhead / beat) * beat : playhead;
    moveLanes(selected, snapped - earliest);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-brand/60 bg-brand/10 px-3 py-2 text-xs"
      role="toolbar"
      aria-label="Move the selected lanes"
    >
      <span className="mr-1 font-semibold">
        {count} lane{count === 1 ? "" : "s"} selected
      </span>
      {count > 1 ? (
        <>
          <span className="mr-1 text-muted max-sm:hidden">— drag any of them to move all</span>
          <button onClick={() => moveLanes(selected, -bar)} className="nudge" title="All back one bar">
            −bar
          </button>
          <button onClick={() => moveLanes(selected, -beat)} className="nudge" title="All back one beat">
            −beat
          </button>
          <button onClick={() => moveLanes(selected, beat)} className="nudge" title="All forward one beat">
            +beat
          </button>
          <button onClick={() => moveLanes(selected, bar)} className="nudge" title="All forward one bar">
            +bar
          </button>
          <button onClick={toPlayhead} className="nudge" title="Start the group at the playhead, keeping its spacing">
            to playhead
          </button>
        </>
      ) : (
        <span className="text-muted">— select one more to move them together</span>
      )}
      <span className="ml-auto flex gap-1.5">
        {count < lanes.length && (
          <button
            onClick={() => setLaneSelection(lanes.map((l) => l.laneId))}
            className="nudge"
            title="Select every lane"
          >
            all
          </button>
        )}
        <button onClick={() => setLaneSelection([])} className="nudge" title="Deselect all lanes">
          clear
        </button>
      </span>
    </div>
  );
}
