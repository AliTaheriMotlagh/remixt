"use client";

import { memo, useMemo } from "react";
import { Shuffle } from "lucide-react";
import { whoPlaysWhen } from "@/lib/client/mashup";
import { useStudioStore, viewDuration, type StudioLane } from "@/lib/client/studioStore";
import { clock } from "./ui";

// Who plays when, with two or more songs in the mix: a row for each song's
// vocal and each song's music, a block wherever it's heard, and where two
// songs' music overlaps (a DJ blend) the stretch shaded. One look says
// whether a mashup is one song's voice over the other's music, two
// singers taking turns, or one song mixing into the next.

const SONG_COLOURS = ["var(--vocals)", "var(--beat)", "var(--brand)"];

function Playhead({ span }: { span: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/80" style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} aria-hidden />;
}

export default memo(function MashupMap({ lanes, duration, projectBpm }: { lanes: StudioLane[]; duration: number; projectBpm: number }) {
  const span = viewDuration(duration, projectBpm);
  const { rows, blends, songs } = useMemo(() => {
    const rows = whoPlaysWhen(lanes);
    const songs = [...new Set(rows.map((r) => r.songId))];
    // Where two songs' music plays at once: the blend.
    const music = rows.filter((r) => r.part === "Music");
    const blends: { start: number; end: number }[] = [];
    for (let i = 0; i < music.length; i++) {
      for (let j = i + 1; j < music.length; j++) {
        for (const a of music[i].spans) {
          for (const b of music[j].spans) {
            const start = Math.max(a.start, b.start);
            const end = Math.min(a.end, b.end);
            if (end - start > 1) blends.push({ start, end });
          }
        }
      }
    }
    return { rows, blends, songs };
  }, [lanes]);
  if (songs.length < 2) return null;
  const both = rows.filter((r) => r.part === "Vocal" && r.spans.length).length > 1;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <Shuffle className="text-brand-strong" /> Who plays when
      </h3>
      <p className="text-[11px] text-muted">
        {blends.length ? "Shaded: both songs' music at once — a blend, or a clash" : both ? "Both vocals are in — they should take turns, not sing over each other" : "Each song's voice and music along the song"}
      </p>
      <div className="relative mt-2.5 flex select-none flex-col gap-1" role="img" aria-label="Who plays when: each song's vocal and music along the song">
        {blends.map((b, n) => (
          <span key={`b${n}`} className="pointer-events-none absolute inset-y-0 z-10 border-x border-dashed border-foreground/40 bg-foreground/10" style={{ left: `calc(5.5rem + (100% - 5.5rem) * ${b.start / span})`, width: `calc((100% - 5.5rem) * ${(b.end - b.start) / span})` }} />
        ))}
        {rows.map((row) => {
          const colour = SONG_COLOURS[songs.indexOf(row.songId) % SONG_COLOURS.length];
          return (
            <div key={`${row.songId}-${row.part}`} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[10px]" title={row.title}>
                <span className="font-semibold">{row.part}</span> <span className="text-muted">{row.title}</span>
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-background/60">
                {row.spans.map((s, n) => (
                  <span
                    key={n}
                    className="absolute inset-y-0.5 rounded-[3px]"
                    style={{ left: `${(s.start / span) * 100}%`, width: `max(2px, ${((s.end - s.start) / span) * 100}%)`, background: colour, opacity: row.part === "Vocal" ? 0.95 : 0.55 }}
                    title={`${clock(s.start)}–${clock(s.end)}`}
                  />
                ))}
                <Playhead span={span} />
              </div>
            </div>
          );
        })}
        <div className="flex justify-between pl-[5.5rem] text-[9.5px] text-muted tabular-nums" aria-hidden>
          <span>0:00</span>
          <span>{clock(span)}</span>
        </div>
      </div>
    </div>
  );
});
