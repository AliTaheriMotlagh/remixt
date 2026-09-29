"use client";

import { useMemo } from "react";
import Waveform from "./Waveform";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { KIND_INFO } from "@/lib/stemKinds";
import type { ChallengeStem } from "@/lib/challenges";

/** One of a challenge's two stems, with a preview button. */
export default function ChallengeStemCard({ stem }: { stem: ChallengeStem }) {
  const preview = usePreviewState();
  const peaks = useMemo<number[]>(() => JSON.parse(stem.peaks_json || "[]"), [stem.peaks_json]);
  const current = preview.current?.stemId === stem.id;
  const color = KIND_INFO[stem.kind]?.color ?? "var(--beat)";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
        {KIND_INFO[stem.kind]?.label ?? stem.kind}
      </p>
      <p className="truncate text-sm font-medium">{stem.track_title}</p>
      <p className="truncate text-xs text-muted">
        {stem.artist_name}
        {stem.track_bpm ? ` · ${Math.round(stem.track_bpm)} BPM` : ""}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() =>
            previewPlayer.toggle({ stemId: stem.id, title: stem.track_title, artist: stem.artist_name, kind: stem.kind })
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: color }}
          aria-label={current && preview.playing ? "Pause preview" : "Play preview"}
        >
          {current && preview.playing ? "⏸" : "▶"}
        </button>
        <Waveform
          peaks={peaks}
          color={`${color}99`}
          progressColor={color}
          progress={current ? preview.progress : 0}
          height={32}
          className="flex-1"
        />
      </div>
    </div>
  );
}
