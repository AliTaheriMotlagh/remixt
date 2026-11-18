"use client";

import { useEffect, useRef, useState } from "react";
import { Mic2 } from "lucide-react";
import { lineAt, type LyricLine } from "@/lib/lyrics";
import type { QueueRow } from "@/lib/radio";
import { useRadioLyrics } from "@/lib/client/radioLyrics";
import { lineDirection } from "@/lib/rtlText";

// The words of the vocal on air, karaoke style: the line being sung fills
// in as it's sung (right to left for Persian), the next one waits under
// it, the one before fades above. Follows the station's clock, so it's
// right whether this tab is tuned in or not.

/** A line fills over its time, but never slower than this (a long gap after the last line of a verse). */
const MAX_FILL = 7;

function Line({ line, role, big }: { line: LyricLine | undefined; role: "before" | "now" | "next"; big: boolean }) {
  const text = line?.text ?? "";
  const dir = lineDirection(text);
  const size =
    role === "now" ? (big ? "text-[2.6em]" : "text-xl sm:text-2xl") : big ? "text-[1.5em]" : "text-sm sm:text-base";
  const tone = role === "now" ? "font-black" : role === "next" ? "font-semibold text-white/55" : "font-semibold text-white/30";
  const fill = {
    backgroundImage: `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #fff var(--fill, 0%), rgba(255,255,255,0.42) var(--fill, 0%))`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  } as const;
  return (
    <p dir={dir} className={`min-h-[1.3em] truncate leading-tight transition-colors duration-300 motion-reduce:transition-none ${size} ${tone}`}>
      {/* The fill runs across the words, not the whole box: the line sits in a box of its own width. */}
      {role === "now" ? (
        <span className="inline-block max-w-full truncate align-top" style={fill}>
          {text || "\u00a0"}
        </span>
      ) : (
        text || "\u00a0"
      )}
    </p>
  );
}

export default function RadioLyrics({ slug, row, position, big = false }: { slug: string; row: QueueRow | null; position: () => number; big?: boolean }) {
  const lyrics = useRadioLyrics(slug, row ? { kind: row.kind, id: row.id, duration: row.duration } : null);
  const lines = lyrics.status === "ready" ? lyrics.lines : null;
  const [index, setIndex] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lines) return;
    let raf = 0;
    let shown = -2;
    const draw = () => {
      const at = position();
      const i = lineAt(lines, at);
      if (i !== shown) {
        shown = i;
        setIndex(i);
      }
      const line = lines[i];
      if (line?.time !== null && line && box.current) {
        const next = lines[i + 1]?.time ?? line.time + MAX_FILL;
        const span = Math.max(0.5, Math.min(MAX_FILL, next - line.time));
        const fill = Math.max(0, Math.min(1, (at - line.time) / span));
        box.current.style.setProperty("--fill", `${Math.round(fill * 1000) / 10}%`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lines, position]);

  if (!row) return null;
  const label = lyrics.status === "ready" ? lyrics.song : null;
  const note =
    lyrics.status === "loading" ? "Finding the words…" : lyrics.status === "instrumental" ? "Instrumental: no vocal on this one" : lyrics.status === "none" ? "No timed words found for this song" : null;
  const before = lines && index > 0 ? lines[index - 1] : undefined;
  const now = lines && index >= 0 ? lines[index] : undefined;
  const next = lines ? lines[index + 1] : undefined;

  return (
    <div
      ref={box}
      className={`min-w-0 rounded-2xl bg-black/30 ring-1 ring-white/10 backdrop-blur ${big ? "p-[1em]" : "px-4 py-3"}`}
      aria-label="Lyrics"
      role="group"
    >
      <p className={`mb-1.5 flex items-center gap-1.5 font-black uppercase tracking-[0.18em] text-white/55 ${big ? "text-[0.8em]" : "text-[10px]"}`}>
        <Mic2 className={big ? "size-[1.2em]" : "size-3"} /> Lyrics{label ? <span className="truncate normal-case tracking-normal text-white/40">· {label}</span> : null}
      </p>
      {note ? (
        <p className={`text-white/60 ${big ? "text-[1.3em]" : "text-sm"} ${lyrics.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`}>{note}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <Line line={before} role="before" big={big} />
          {/* The line's own key: a new line comes in fresh, its fill from the start. */}
          <Line key={index} line={now ?? (index < 0 ? { time: null, text: "♪" } : undefined)} role="now" big={big} />
          <Line line={next} role="next" big={big} />
        </div>
      )}
    </div>
  );
}
