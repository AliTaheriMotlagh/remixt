"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StudioTransport from "./StudioTransport";
import MixWaveform from "./MixWaveform";
import StudioShortcuts from "./studio/StudioShortcuts";
import Arrangement from "./studio/Arrangement";
import LaneInspector from "./studio/LaneInspector";
import ContextMenuHost from "./studio/ContextMenu";
import StudioNotice from "./studio/StudioNotice";
import { audioEngine } from "@/lib/client/audioEngine";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import { resetHistory } from "@/lib/client/studioHistory";
import type { User } from "@/lib/auth";
import { setMixCredit } from "@/lib/client/mediaSession";

export default function RemixDetailPlayer({
  remixId,
  title,
  artistName,
  user,
}: {
  remixId: string;
  title: string;
  artistName: string;
  user: User | null;
}) {
  const lanes = useStudioStore((s) => s.lanes);
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const [loading, setLoading] = useState(true);
  const [showMixer, setShowMixer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/remixes/${remixId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        loadRemix(
          (data.lanes as RemixLaneApi[]).map(laneFromApi),
          projectFromApi(data.remix),
          { id: remixId, title }
        );
        resetHistory();
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

  // On the lock screen, this remix is by its artist (not the stems' artists).
  useEffect(() => {
    setMixCredit(artistName);
    return () => setMixCredit(null);
  }, [artistName]);

  // The placeholder takes the same space as the player, so nothing below it
  // (the comments) jumps when the audio arrives.
  if (loading) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy="true" aria-label="Loading remix">
        <div className="h-[118px] animate-pulse rounded-xl border border-border bg-surface sm:h-[134px]" />
        <div className="h-[90px] animate-pulse rounded-xl border border-border bg-surface" />
        <div className="h-12 rounded-xl border border-border bg-surface" />
        <div className="h-10" />
      </div>
    );
  }

  return (
    <div className="touch-targets mt-6 flex flex-col gap-4">
      <StudioTransport user={user} remixId={remixId} defaultTitle={title} viewing artistName={artistName} />
      <StudioShortcuts mode="remix" className="-my-2 self-end" />
      <div className="rounded-xl border border-border bg-surface p-3">
        <MixWaveform />
      </div>

      {/* Listeners get the player; the mixer behind it is one tap away. */}
      <div className="rounded-xl border border-border bg-surface">
        <button
          onClick={() => setShowMixer((v) => !v)}
          aria-expanded={showMixer}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium"
        >
          <span>
            Stems &amp; mixer{" "}
            <span className="text-muted">
              · {lanes.length} stem{lanes.length === 1 ? "" : "s"} — solo, mute, tempo, key, FX
            </span>
          </span>
          <span className="text-muted">{showMixer ? "▾" : "▸"}</span>
        </button>
        {showMixer && (
          <div className="flex flex-col gap-3 border-t border-border p-3">
            <Arrangement />
            <LaneInspector />
          </div>
        )}
      </div>

      <Link
        href={`/studio?remix=${remixId}`}
        className="flex h-10 items-center self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        Remix it in the Studio →
      </Link>
      <ContextMenuHost />
      <StudioNotice />
    </div>
  );
}
