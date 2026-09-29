"use client";

import { camelotCode, keyFit, keyLabel, transposeKey, type KeyFit } from "@/lib/client/musicKey";
import { effectiveKey, referenceLane, useStudioStore, type StudioLane } from "@/lib/client/studioStore";

const FIT: Record<KeyFit, { label: string; className: string }> = {
  same: { label: "same key", className: "bg-success/20 text-success" },
  relative: { label: "same notes", className: "bg-success/20 text-success" },
  neighbour: { label: "blends", className: "bg-beat/20 text-beat" },
  far: { label: "risky", className: "bg-drums/20 text-drums" },
  clash: { label: "clashes", className: "bg-danger/15 text-danger" },
};

/**
 * Every pitch shift from −6 to +6 with the key it lands in and how that
 * sits against the project key. Tapping one applies it (while playing,
 * you hear it a moment later); undo steps back.
 */
export default function KeyHelper({ lane }: { lane: StudioLane }) {
  const setPitchSemitones = useStudioStore((s) => s.setPitchSemitones);
  const reference = useStudioStore((s) => referenceLane(s.lanes, (l) => !!l.musicalKey));
  const target = reference && reference.laneId !== lane.laneId ? effectiveKey(reference) : null;

  if (!lane.musicalKey) {
    return <p className="mt-2 text-xs text-muted">Waiting for this lane&apos;s key — it&apos;s detected once the audio loads, or set it by hand.</p>;
  }

  const shifts = Array.from({ length: 13 }, (_, i) => i - 6);
  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] text-muted">
        {target ? (
          <>
            Project key: <span className="font-semibold text-foreground">{keyLabel(target)}</span> ({camelotCode(target)}) from “
            {reference!.trackTitle}”. Every shift costs a little sound quality — the smallest one that blends is usually best.
          </>
        ) : (
          <>This lane sets the project key — other lanes are matched to it.</>
        )}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-7">
        {shifts.map((shift) => {
          const key = transposeKey(lane.musicalKey!, shift);
          const fit = target ? keyFit(key, target) : null;
          const current = lane.pitchSemitones === shift;
          return (
            <button
              key={shift}
              onClick={() => setPitchSemitones(lane.laneId, shift)}
              className={`flex flex-col items-start rounded-md border px-2 py-1.5 text-left transition-colors ${
                current ? "border-brand bg-brand/15" : "border-border hover:border-brand/50"
              }`}
              title={`Pitch ${shift > 0 ? "+" : ""}${shift} → ${keyLabel(key)}`}
            >
              <span className="font-mono text-[11px] tabular-nums">
                {shift > 0 ? `+${shift}` : shift === 0 ? "±0" : shift}
              </span>
              <span className="text-xs font-medium">{keyLabel(key)}</span>
              {fit && <span className={`mt-0.5 rounded px-1 text-[9px] ${FIT[fit].className}`}>{FIT[fit].label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
