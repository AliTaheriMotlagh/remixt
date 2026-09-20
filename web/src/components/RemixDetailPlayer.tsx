"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StudioTransport from "./StudioTransport";
import StudioTimeline from "./StudioTimeline";
import StudioLaneRow from "./StudioLaneRow";
import BpmSyncPanel from "./BpmSyncPanel";
import { audioEngine } from "@/lib/client/audioEngine";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import type { User } from "@/lib/auth";

export default function RemixDetailPlayer({
  remixId,
  title,
  user,
}: {
  remixId: string;
  title: string;
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
        loadRemix(
          (data.lanes as RemixLaneApi[]).map(laneFromApi),
          projectFromApi(data.remix)
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixId]);

  useEffect(() => () => audioEngine.stop(), []);

  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
        Loading remix…
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <StudioTransport user={user} remixId={remixId} defaultTitle={title} />
      <BpmSyncPanel />
      <StudioTimeline />

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
