"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StudioTransport from "./StudioTransport";
import StudioTimeline from "./StudioTimeline";
import StudioLaneRow from "./StudioLaneRow";
import StudioLibraryPanel from "./StudioLibraryPanel";
import BpmSyncPanel from "./BpmSyncPanel";
import { audioEngine } from "@/lib/client/audioEngine";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import type { User } from "@/lib/auth";

export default function Studio({ user }: { user: User | null }) {
  const searchParams = useSearchParams();
  const remixId = searchParams.get("remix");
  const lanes = useStudioStore((s) => s.lanes);
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const setLoop = useStudioStore((s) => s.setLoop);
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
        loadRemix(
          (data.lanes as RemixLaneApi[]).map(laneFromApi),
          projectFromApi(data.remix)
        );
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

  // Transport shortcuts. They're skipped while a form control has focus so
  // that typing a title or a BPM doesn't start playback.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const state = useStudioStore.getState();
      if (event.code === "Space") {
        event.preventDefault();
        if (state.lanes.length === 0) return;
        if (state.isPlaying) audioEngine.pause();
        else void audioEngine.play();
      } else if (event.code === "Escape") {
        audioEngine.stop();
      } else if (event.key === "l" || event.key === "L") {
        setLoop({ enabled: !state.loopEnabled });
      } else if (event.key === "Home") {
        audioEngine.seek(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setLoop]);

  // Leaving the Studio shouldn't leave the mix playing behind you.
  useEffect(() => () => audioEngine.stop(), []);

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
        <p className="hidden text-right text-[11px] leading-relaxed text-muted lg:block">
          Space play/pause · Esc stop · L loop<br />
          Drag a clip to move it in time
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <StudioTransport
            user={user}
            remixId={remixId}
            defaultTitle={remixTitle ? `${remixTitle} (remix)` : undefined}
          />
          <BpmSyncPanel />
          <StudioTimeline />

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
