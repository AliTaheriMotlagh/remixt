"use client";

import { useMemo } from "react";
import Waveform from "./Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { mixPeaks } from "@/lib/client/mixPeaks";
import { useRemixComments } from "@/lib/client/remixCommentsStore";
import { useStudioStore } from "@/lib/client/studioStore";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The whole mix as one waveform, SoundCloud-style: tap or drag anywhere to
 * jump there, with a dot for every comment left at a moment in the song.
 */
export default function MixWaveform({ height = 64, showComments = true }: { height?: number; showComments?: boolean }) {
  const lanes = useStudioStore((s) => s.lanes);
  const duration = useStudioStore((s) => s.duration);
  const playhead = useStudioStore((s) => s.playhead);
  const comments = useRemixComments((s) => s.comments);
  const peaks = useMemo(() => mixPeaks(lanes, duration), [lanes, duration]);
  const timed = showComments ? comments.filter((c) => c.at_seconds !== null && c.at_seconds <= duration) : [];

  if (!(duration > 0)) return null;

  return (
    <div className="relative select-none">
      <Waveform
        peaks={peaks}
        color="var(--muted)55"
        progressColor="var(--brand-strong)"
        progress={Math.min(1, playhead / duration)}
        height={height}
        onSeek={(fraction) => audioEngine.seek(fraction * duration)}
        className="cursor-pointer"
      />
      {timed.length > 0 && (
        <div className="relative mt-1 h-5">
          {timed.map((c) => (
            <button
              key={c.id}
              onClick={() => audioEngine.seek(c.at_seconds!)}
              className="group absolute top-0 -translate-x-1/2"
              style={{ left: `${(c.at_seconds! / duration) * 100}%` }}
              title={`${c.artist_name} at ${formatTime(c.at_seconds!)}: ${c.body}`}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-background"
                style={{ background: c.avatar_color }}
              >
                {c.artist_name.slice(0, 1).toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
