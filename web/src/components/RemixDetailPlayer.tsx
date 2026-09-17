"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StudioTransport from "./StudioTransport";
import StudioLaneRow from "./StudioLaneRow";
import BpmSyncPanel from "./BpmSyncPanel";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import type { User } from "@/lib/auth";

type RemixLaneApi = {
  stem_id: string;
  kind: "vocals" | "beat";
  peaks_json: string;
  volume: number;
  muted: boolean;
  pitch_semitones: number;
  tempo_ratio: number;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  stem_artist_name: string;
};

export default function RemixDetailPlayer({
  remixId,
  user,
}: {
  remixId: string;
  user: User | null;
}) {
  const lanes = useStudioStore((s) => s.lanes);
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/remixes/${remixId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const studioLanes: StudioLane[] = (data.lanes as RemixLaneApi[]).map(
          (lane) => {
            const originalDuration = lane.track_duration ?? 0;
            const tempoRatio = lane.tempo_ratio || 1;
            return {
              laneId: crypto.randomUUID(),
              stemId: lane.stem_id,
              kind: lane.kind,
              trackTitle: lane.track_title,
              artistName: lane.stem_artist_name,
              volume: lane.volume,
              muted: lane.muted,
              solo: false,
              peaks: JSON.parse(lane.peaks_json || "[]"),
              originalDuration,
              duration: originalDuration / tempoRatio,
              bpm: lane.track_bpm,
              pitchSemitones: lane.pitch_semitones || 0,
              tempoRatio,
            };
          }
        );
        loadRemix(studioLanes);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixId]);

  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
        Loading remix…
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <StudioTransport user={user} remixId={remixId} />
      <BpmSyncPanel />

      <div className="flex flex-col gap-3">
        {lanes.map((lane) => (
          <StudioLaneRow key={lane.laneId} lane={lane} />
        ))}
      </div>

      <Link
        href={`/studio?remix=${remixId}`}
        className="self-start rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
      >
        Open in Studio to remix further →
      </Link>
    </div>
  );
}
