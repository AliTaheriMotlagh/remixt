"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StudioTransport from "./StudioTransport";
import StudioLaneRow from "./StudioLaneRow";
import StudioLibraryPanel from "./StudioLibraryPanel";
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

export default function Studio({ user }: { user: User | null }) {
  const searchParams = useSearchParams();
  const remixId = searchParams.get("remix");
  const lanes = useStudioStore((s) => s.lanes);
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const [loadingRemix, setLoadingRemix] = useState(!!remixId);
  const [remixTitle, setRemixTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!remixId) return;
    let cancelled = false;
    async function load() {
      setLoadingRemix(true);
      try {
        const res = await fetch(`/api/remixes/${remixId}`);
        const data = await res.json();
        if (cancelled) return;
        setRemixTitle(data.remix?.title ?? null);
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
      } finally {
        if (!cancelled) setLoadingRemix(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixId]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Studio</h1>
          <p className="mt-1 text-sm text-muted">
            {remixTitle
              ? `Remixing “${remixTitle}” — changes save as a new remix`
              : "Mix vocals from one song with the beat from another."}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <StudioTransport user={user} remixId={remixId} />
          <BpmSyncPanel />

          {loadingRemix ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              Loading remix…
            </div>
          ) : lanes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              No stems yet. Add a vocal and a beat from the panel
              {" "}
              <span className="hidden lg:inline">on the right</span>
              <span className="lg:hidden">below</span> to start mixing.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lanes.map((lane) => (
                <StudioLaneRow key={lane.laneId} lane={lane} />
              ))}
            </div>
          )}
        </div>

        <div className="h-[420px] lg:h-[calc(100vh-220px)] lg:sticky lg:top-40">
          <StudioLibraryPanel />
        </div>
      </div>
    </div>
  );
}
