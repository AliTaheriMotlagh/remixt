"use client";

import { useMemo, useState } from "react";
import { Check, Headphones, Mic, Pencil, Play, Trash2, Undo2, Volume2, VolumeX } from "lucide-react";
import Waveform from "../../Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { isTakeLane } from "@/lib/client/lyricsSources";
import { laneName, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { undo } from "@/lib/client/studioHistory";
import { useStudioView } from "@/lib/client/studioView";
import { formatClock } from "@/lib/lyrics";
import { playFrom } from "../LyricsPanel";

// Every take recorded over this beat, newest first: hear one against the
// beat or on its own, keep only the one you like where takes overlap (the
// others are muted, not lost), rename or delete it — and Undo brings a
// deleted take back.

/** Where a lane plays on the timeline: [start, end] in seconds. */
function spanOf(lane: StudioLane): [number, number] {
  const length = lane.duration || lane.originalDuration / (lane.tempoRatio > 0 ? lane.tempoRatio : 1);
  return [lane.offsetSeconds, lane.offsetSeconds + length];
}

function overlaps(a: StudioLane, b: StudioLane) {
  const [s1, e1] = spanOf(a);
  const [s2, e2] = spanOf(b);
  return s1 < e2 && s2 < e1;
}

/** This take on, the ones sung over the same part muted — the take that goes in the song. */
function keepOnly(take: StudioLane) {
  const store = useStudioStore.getState();
  for (const lane of store.lanes) {
    if (!isTakeLane(lane)) continue;
    const wanted = lane.laneId === take.laneId ? false : overlaps(lane, take) ? true : lane.muted;
    if (lane.muted !== wanted) store.toggleMute(lane.laneId);
  }
  useStudioView.getState().notify(`Using “${laneName(take)}” for that part — the other takes there are muted`);
}

function TakeRow({ lane, number, solo }: { lane: StudioLane; number: number; solo: boolean }) {
  const toggleMute = useStudioStore((s) => s.toggleMute);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const renameLane = useStudioStore((s) => s.renameLane);
  const removeLane = useStudioStore((s) => s.removeLane);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [start, end] = spanOf(lane);
  const icon = "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground max-lg:h-10 max-lg:w-10";
  const dim = lane.muted || (solo && !lane.solo);

  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-2.5 transition-colors ${lane.solo ? "border-vocals bg-vocals/5" : "border-border bg-background/50"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${dim ? "bg-foreground/10 text-muted" : "bg-vocals text-white"}`}>
          {number}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                renameLane(lane.laneId, name.trim().slice(0, 120));
                setEditing(false);
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                dir="auto"
                aria-label="Take name"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm max-lg:text-base"
              />
              <button type="submit" onMouseDown={(e) => e.preventDefault()} className={icon} aria-label="Save the name">
                <Check />
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setName(laneName(lane));
                setEditing(true);
              }}
              className="group flex max-w-full items-center gap-1.5 text-left"
              title="Rename"
            >
              <span dir="auto" className={`truncate text-sm font-semibold ${dim ? "text-muted" : ""}`}>
                {laneName(lane)}
              </span>
              <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 group-hover:opacity-100" />
            </button>
          )}
          <p className="text-[11px] tabular-nums text-muted">
            {formatClock(start)}–{formatClock(end)} · {Math.round(end - start)} s{lane.muted ? " · muted" : ""}
          </p>
        </div>
      </div>
      <button onClick={() => audioEngine.seek(start)} className={`rounded-lg bg-background/60 px-1 ${dim ? "opacity-40" : ""}`} title="Go to this take" aria-label={`Go to ${laneName(lane)}`}>
        <Waveform peaks={lane.peaks} color="var(--vocals)" height={30} />
      </button>
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => playFrom(start, 1)} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-vocals max-lg:h-10" title="Hear it with the beat, from a second before">
          <Play /> Hear
        </button>
        <button
          onClick={() => toggleSolo(lane.laneId)}
          aria-pressed={lane.solo}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold max-lg:h-10 ${lane.solo ? "border-vocals bg-vocals text-white" : "border-border text-muted hover:text-foreground"}`}
          title="Hear only this take (and other soloed lanes)"
        >
          <Headphones /> Solo
        </button>
        <button
          onClick={() => keepOnly(lane)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted hover:border-success hover:text-success max-lg:h-10"
          title="Use this take for its part: the other takes sung over the same part are muted"
        >
          <Check /> Use this
        </button>
        <span className="flex-1" />
        <button onClick={() => toggleMute(lane.laneId)} aria-pressed={lane.muted} className={icon} title={lane.muted ? "Unmute" : "Mute"} aria-label={lane.muted ? "Unmute" : "Mute"}>
          {lane.muted ? <VolumeX className="text-danger" /> : <Volume2 />}
        </button>
        <button onClick={() => removeLane(lane.laneId)} className={`${icon} hover:!text-danger`} title="Delete this take — Undo brings it back" aria-label={`Delete ${laneName(lane)}`}>
          <Trash2 />
        </button>
      </div>
    </li>
  );
}

export default function TakesPanel({ onRecord }: { onRecord: () => void }) {
  const lanes = useStudioStore((s) => s.lanes);
  const takes = useMemo(() => lanes.filter(isTakeLane), [lanes]);
  const solo = lanes.some((l) => l.solo);
  const [count, setCount] = useState(takes.length);
  const [deleted, setDeleted] = useState(false);
  // A take gone from the list since the last render: offer Undo (render-time check, no effect needed).
  if (takes.length !== count) {
    setDeleted(takes.length < count);
    setCount(takes.length);
  }
  const on = takes.filter((t) => !t.muted).length;

  if (takes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vocals/15 text-vocals">
          <Mic />
        </span>
        <p className="text-sm font-semibold">No takes yet</p>
        <p className="max-w-xs text-xs text-muted">Each take you keep lands here — hear them against the beat, keep the best one for each part.</p>
        <button onClick={onRecord} className="mt-1 flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90">
          <Mic /> Record a take
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>
          {takes.length} take{takes.length === 1 ? "" : "s"} · {on} playing
        </span>
        {solo && (
          <button
            onClick={() => {
              const store = useStudioStore.getState();
              for (const l of store.lanes) if (l.solo) store.toggleSolo(l.laneId);
            }}
            className="rounded-full border border-border px-2 py-0.5 font-semibold hover:text-foreground"
          >
            Clear solo
          </button>
        )}
        <button onClick={onRecord} className="ms-auto flex h-8 items-center gap-1.5 rounded-lg border border-vocals/50 px-3 font-semibold text-vocals hover:bg-vocals/10 max-lg:h-10">
          <Mic /> New take
        </button>
      </div>
      {deleted && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-raised px-3 py-2 text-xs" role="status">
          <span className="flex-1">Take deleted</span>
          <button
            onClick={() => {
              undo();
              setDeleted(false);
            }}
            className="flex h-8 items-center gap-1 rounded-lg px-2 font-semibold text-vocals hover:bg-vocals/10"
          >
            <Undo2 /> Undo
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {[...takes].reverse().map((lane) => (
          <TakeRow key={lane.laneId} lane={lane} number={takes.indexOf(lane) + 1} solo={solo} />
        ))}
      </ul>
    </div>
  );
}
