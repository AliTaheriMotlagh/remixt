"use client";

import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, Clapperboard, Maximize2, Repeat, Repeat2, ScrollText } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { projectKey } from "@/lib/client/lineStatus";
import { keyLabel } from "@/lib/client/musicKey";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import {
  beatSeconds,
  countSyllables,
  formatClock,
  isSection,
  isSung,
  isSynced,
  lineAt,
  sectionAt,
  sectionName,
  sectionsOf,
  type LyricLine,
  type LyricSection,
} from "@/lib/lyrics";
import LyricsTimeline from "../LyricsTimeline";
import { useCanMakeClips } from "../SocialClipButton";
import { BigPrompter, GetTimes, LineTimingEditor, LoopLineButton, PlayButton, RippleToggle } from "../LyricsPanel";

// The Vocalist studio's stage: the words to sing, big and in time with the
// beat — the line being sung fills in as it goes (karaoke-style, right to
// left for Persian), the next ones wait under it, and a count of beats says
// when the next line comes in. Under it the song's waveform with every line
// on it (drag one to move it; the lines after it follow with ripple on) and
// the take drawn in as it's sung; the song's parts to jump to or loop; and
// the line being fixed, with its timing controls.

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Roughly how long a line takes to sing — it fills in over that, not over the pause after it. */
function sungLength(text: string, style: "rap" | "sing") {
  return Math.max(1.2, countSyllables(text) * (style === "rap" ? 0.17 : 0.3));
}

function nextTimed(lines: LyricLine[], index: number): { index: number; time: number } | null {
  for (let i = index + 1; i < lines.length; i++) {
    const time = lines[i].time;
    if (time !== null && isSung(lines[i])) return { index: i, time };
  }
  return null;
}

function prevTimed(lines: LyricLine[], index: number): { index: number; time: number } | null {
  for (let i = index - 1; i >= 0; i--) {
    const time = lines[i].time;
    if (time !== null && isSung(lines[i])) return { index: i, time };
  }
  return null;
}

/** The line being sung, filling in with colour as the playhead goes through it. */
function WipeLine({ text, start, end, size, onClick }: { text: string; start: number; end: number; size: number; onClick: () => void }) {
  // Rounded, so it re-renders a couple of hundred times a line rather than every frame.
  const fraction = useStudioStore((s) => Math.round(Math.min(1, Math.max(0, (s.playhead - start) / Math.max(0.1, end - start))) * 200) / 200);
  const pct = fraction * 100;
  return (
    <button onClick={onClick} className="block w-full text-center" title="Fix this line's timing">
      <span
        dir="auto"
        className="inline font-bold leading-tight [-webkit-background-clip:text] [background-clip:text]"
        style={{
          fontSize: size,
          color: "transparent",
          backgroundImage: `linear-gradient(${RTL.test(text) ? "270deg" : "90deg"}, var(--vocals) ${pct}%, var(--foreground) ${pct}%)`,
        }}
      >
        {text}
      </span>
    </button>
  );
}

/** Beats until the next line comes in, as dots — the last bar's four lit up. */
function CountIn({ at }: { at: number }) {
  const bpm = useStudioStore((s) => s.projectBpm);
  const beats = useStudioStore((s) => Math.ceil((at - s.playhead) / beatSeconds(s.projectBpm) - 1e-6));
  if (beats <= 0 || beats > 16) return <div className="h-5" aria-hidden />;
  const shown = Math.min(8, beats);
  return (
    <div className="flex h-5 items-center justify-center gap-1.5" role="status" aria-label={`Next line in ${beats} beats`} title={`${Math.round(bpm)} BPM`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full transition-colors ${shown - i <= 4 ? "bg-vocals" : "bg-vocals/30"}`} />
      ))}
      <span className="ms-1.5 text-[11px] font-semibold tabular-nums text-vocals">{beats}</span>
    </div>
  );
}

/** The words, karaoke-style: the previous line, the one being sung, the next two — all following the playhead. */
function Karaoke({ lines }: { lines: LyricLine[] }) {
  const current = useStudioStore((s) => lineAt(lines, s.playhead));
  const { fontSize, style } = useLyrics((s) => s.prefs);
  const selectLine = useLyrics((s) => s.selectLine);
  const at = current >= 0 ? current : -1;
  const line = at >= 0 ? lines[at] : null;
  const sung = !!line && isSung(line);
  const next = nextTimed(lines, at);
  const after = next ? nextTimed(lines, next.index) : null;
  const before = at >= 0 ? prevTimed(lines, at) : null;
  const section = sectionAt(lines, sung ? at : (next?.index ?? 0));
  const end = line?.time != null ? Math.min(next?.time ?? Infinity, line.time + sungLength(line.text, style)) : 0;
  // Between lines (or before the first) the count says when the next one comes in.
  const waiting = useStudioStore((s) => !sung || s.playhead > end + 0.3);
  const big = Math.max(26, fontSize * 1.7);

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-2 py-4 text-center sm:min-h-64" aria-live="polite">
      <p className="h-4 text-[11px] font-bold uppercase tracking-[0.2em] text-vocals/90">{section ?? ""}</p>
      <p dir="auto" className="min-h-6 max-w-3xl truncate text-base text-muted/50 sm:text-lg">
        {before ? lines[before.index].text : ""}
      </p>
      {sung && line?.time != null ? (
        <WipeLine text={line.text} start={line.time} end={end} size={big} onClick={() => selectLine(at, "stage")} />
      ) : (
        <p className="font-bold leading-tight text-muted/40" style={{ fontSize: big * 0.8 }}>
          {current < 0 ? "Get ready…" : "…"}
        </p>
      )}
      {waiting && next ? <CountIn at={next.time} /> : <div className="h-5" aria-hidden />}
      {[next, after].map((n, k) =>
        n ? (
          <button
            key={n.index}
            onClick={() => selectLine(n.index, "stage")}
            dir="auto"
            className={`max-w-3xl leading-snug transition-colors hover:text-foreground ${k === 0 ? "font-semibold text-foreground/80" : "text-muted/70"}`}
            style={{ fontSize: k === 0 ? Math.max(18, fontSize * 1.15) : Math.max(15, fontSize * 0.95) }}
          >
            {lines[n.index].text}
          </button>
        ) : null
      )}
      {!next && current >= 0 && <p className="text-xs text-muted">End of the lyrics</p>}
    </div>
  );
}

/** Not timed yet: the words to read through, and the ways to time them. */
function Untimed({ lines }: { lines: LyricLine[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-56 overflow-y-auto overscroll-contain rounded-xl bg-background/50 px-3 py-2 text-center" dir="auto">
        {lines.map((l, i) =>
          l.text && isSection(l.text) ? (
            <p key={i} className="pt-2 text-[10px] font-bold uppercase tracking-wider text-vocals/80">
              {sectionName(l.text)}
            </p>
          ) : l.text ? (
            <p key={i} dir="auto" className="text-base leading-snug sm:text-lg">
              {l.text}
            </p>
          ) : (
            <div key={i} className="h-3" />
          )
        )}
      </div>
      <GetTimes
        lines={lines}
        onTap={() => {
          useLyrics.getState().openLyrics("sheet");
          useStudioView.getState().setVocalTab("lyrics");
          useStudioView.getState().notify("Play, and tap “Tap to time” as each line starts");
        }}
      />
    </div>
  );
}

/** The song's parts as chips: tap one to go there, loop it to practise it. */
function SectionBar({ sections }: { sections: LyricSection[] }) {
  const bpm = useStudioStore((s) => s.projectBpm);
  const loopOn = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const setLoop = useStudioStore((s) => s.setLoop);
  const playhead = useStudioStore((s) => Math.floor(s.playhead * 4) / 4);
  const timed = sections.filter((s) => s.start !== null);
  if (timed.length < 1) return null;
  const preRoll = beatSeconds(bpm) * 2;
  const range = (s: LyricSection) => ({ start: Math.max(0, s.start! - preRoll), end: s.end ?? s.start! + beatSeconds(bpm) * 32 });
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="list" aria-label="Parts of the song">
      {timed.map((s) => {
        const { start, end } = range(s);
        const here = playhead >= s.start! - 0.01 && (s.end === null || playhead < s.end);
        const looping = loopOn && Math.abs(loopStart - start) < 0.05 && Math.abs(loopEnd - end) < 0.05;
        return (
          <div
            key={`${s.index}-${s.name}`}
            role="listitem"
            className={`flex shrink-0 items-center overflow-hidden rounded-full border text-xs font-semibold transition-colors ${
              here ? "border-vocals bg-vocals/15 text-foreground" : "border-border text-muted hover:border-vocals/60 hover:text-foreground"
            }`}
          >
            <button onClick={() => audioEngine.seek(start)} className="flex h-9 items-center gap-1.5 ps-3 pe-2 max-lg:h-10" title={`Go to the ${s.name}, two beats before it`}>
              <span dir="auto" className="max-w-[9rem] truncate">
                {s.name}
              </span>
              <span className="font-normal tabular-nums opacity-60">{formatClock(s.start!)}</span>
            </button>
            <button
              onClick={() => {
                if (looping) setLoop({ enabled: false });
                else {
                  setLoop({ start, end, enabled: true });
                  audioEngine.seek(start);
                }
              }}
              aria-pressed={looping}
              className={`flex h-9 w-9 items-center justify-center border-s border-border/60 max-lg:h-10 max-lg:w-10 ${looping ? "bg-vocals text-white" : "hover:bg-surface-raised"}`}
              title={looping ? "Stop looping" : `Loop the ${s.name} to practise it`}
              aria-label={looping ? `Stop looping the ${s.name}` : `Loop the ${s.name}`}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Back or on a line: to the start of the line before (or this one's start), or the next. */
function stepLine(lines: LyricLine[], direction: -1 | 1) {
  const playhead = useStudioStore.getState().playhead;
  const at = lineAt(lines, playhead);
  let target: { time: number } | null;
  if (direction > 0) target = nextTimed(lines, at);
  else {
    const here = at >= 0 ? lines[at].time : null;
    // More than a second into a line goes back to its start; otherwise to the line before.
    target = here !== null && playhead - here > 1 ? { time: here } : prevTimed(lines, at);
  }
  if (target) audioEngine.seek(Math.max(0, target.time - 0.5));
}

export default function VocalStage() {
  const sheet = useLyrics(activeSheet);
  const lines = useLyrics((s) => s.lines);
  const liveTake = useLyrics((s) => s.liveTake);
  const take = useLyrics((s) => s.take);
  const ripple = useLyrics((s) => s.prefs.ripple);
  const selected = useLyrics((s) => s.selectedLine);
  const onStage = useLyrics((s) => s.selectedWhere === "stage");
  const selectLine = useLyrics((s) => s.selectLine);
  const retime = useLyrics((s) => s.retime);
  const markAligned = useLyrics((s) => s.markAligned);
  const openLyrics = useLyrics((s) => s.openLyrics);
  const bpm = useStudioStore((s) => s.projectBpm);
  // The song's key, as the transport shows it.
  const lanes = useStudioStore((s) => s.lanes);
  const key = useMemo(() => projectKey(lanes).key, [lanes]);
  const hasMix = lanes.length > 0;
  const zoom = useLyrics((s) => s.prefs.zoom);
  const setPrefs = useLyrics((s) => s.setPrefs);
  const [focus, setFocus] = useState(false);
  const canClip = useCanMakeClips();
  const sections = useMemo(() => sectionsOf(lines), [lines]);
  const synced = isSynced(lines);
  const hasWords = lines.some(isSung);
  const recording = take === "recording";
  const icon =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10 max-lg:w-10";

  const pickLyrics = () => {
    openLyrics("pick");
    useStudioView.getState().setVocalTab("lyrics");
    document.getElementById("vocal-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      aria-label="Stage"
      className={`flex flex-col gap-3 rounded-2xl border p-3 sm:p-4 ${
        recording ? "border-danger/50 shadow-[0_0_48px_-20px_var(--danger)]" : "border-vocals/30"
      } bg-gradient-to-b from-vocals/10 via-surface to-surface`}
    >
      <header className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vocals/15 text-vocals max-sm:hidden">
          <ScrollText />
        </span>
        {/* The song's name gets the room: everything else is one icon or one word. */}
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-sm font-bold leading-tight sm:text-base" title={sheet?.title}>
            {sheet?.title || "No lyrics yet"}
          </p>
          <p className="flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] text-muted">
            {sheet?.artist && (
              <span dir="auto" className="min-w-0 truncate">
                {sheet.artist}
              </span>
            )}
            {hasMix && <span className="shrink-0 tabular-nums">{Math.round(bpm)} BPM</span>}
            {key && <span className="shrink-0">{keyLabel(key)}</span>}
            {hasWords && <span className={`shrink-0 ${synced ? "font-semibold text-success" : ""}`}>{synced ? "Timed" : "Not timed"}</span>}
          </p>
        </div>
        {canClip && hasMix && (
          <button
            onClick={() => useStudioView.getState().openClip()}
            disabled={recording}
            className={icon}
            aria-label="Make a video clip"
            title={synced ? "Make a video clip of a part of the song, with the lyrics on it" : "Make a video clip of a part of the song"}
          >
            <Clapperboard />
          </button>
        )}
        {hasWords && (
          <button onClick={() => setFocus(true)} className={icon} aria-label="Full screen lyrics" title="Full screen, to sing from across the room">
            <Maximize2 />
          </button>
        )}
        <button
          onClick={pickLyrics}
          disabled={recording}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:border-vocals disabled:opacity-40 max-lg:h-10"
          title={sheet ? "Find other lyrics, or switch to ones you've used" : "Find the lyrics to sing"}
        >
          <Repeat2 className="sm:hidden" />
          <span className="max-sm:hidden">{sheet ? "Change lyrics" : "Pick lyrics"}</span>
          <span className="sm:hidden">{sheet ? "Change" : "Pick"}</span>
        </button>
      </header>

      {!hasWords ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-vocals/15 text-vocals">
            <ScrollText />
          </span>
          <div>
            <p className="text-base font-semibold">{sheet ? "This sheet has no words yet" : "What are you singing?"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Find the song (Persian or English) — it&apos;s timed to the beat for you — paste a lyrics link, or write your own.
            </p>
          </div>
          <button onClick={pickLyrics} className="flex h-11 items-center gap-2 rounded-xl bg-vocals px-5 text-sm font-semibold text-white shadow-lg shadow-vocals/25 hover:opacity-90">
            <ScrollText /> {sheet ? "Add the words" : "Find lyrics"}
          </button>
        </div>
      ) : (
        <>
          {synced && <SectionBar sections={sections} />}
          {synced ? <Karaoke lines={lines} /> : <Untimed lines={lines} />}
        </>
      )}

      {hasMix && (
        <LyricsTimeline
          lines={lines}
          take={liveTake}
          seekable={!recording}
          onMoveLine={
            recording
              ? undefined
              : (index, time) => {
                  retime(index, time);
                  markAligned();
                }
          }
          ripple={ripple}
          onSelectLine={(i) => selectLine(i, "stage")}
          selected={selected}
          zoom={zoom}
          onZoom={(z) => setPrefs({ zoom: z })}
          height={112}
        />
      )}

      {selected !== null && onStage && !recording && <LineTimingEditor index={selected} />}

      {hasWords && synced && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => stepLine(lines, -1)} className={icon} aria-label="Line before" title="Back to this line's start, or the line before">
            <ChevronsLeft className="rtl:rotate-180" />
          </button>
          <PlayButton />
          <button onClick={() => stepLine(lines, 1)} className={icon} aria-label="Next line" title="To the next line">
            <ChevronsRight className="rtl:rotate-180" />
          </button>
          <LoopLineButton lines={lines} className={icon} />
          <RippleToggle />
          <p className="ms-auto text-[11px] text-muted max-md:hidden">Drag a line on the waveform to move it · tap one to fix it · pinch or Ctrl/⌘ + scroll to zoom</p>
        </div>
      )}

      {focus && <BigPrompter lines={lines} onClose={() => setFocus(false)} />}
    </section>
  );
}
