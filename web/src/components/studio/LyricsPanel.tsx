"use client";

import { memo, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  AudioLines,
  ChevronsRight,
  Check,
  ChevronDown,
  ClipboardPaste,
  Clock,
  Copy,
  Crosshair,
  Eraser,
  Magnet,
  Maximize2,
  Merge,
  Mic,
  Minus,
  MoveHorizontal,
  Pause,
  Play,
  Plus,
  PenLine,
  Library,
  Repeat,
  Repeat2,
  Rows3,
  ScrollText,
  Scissors,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  Redo2,
  WandSparkles,
  X,
} from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { browserKey, savedModelChoice, savedProvider } from "@/lib/client/coproducerChat";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { firstLineAt } from "@/lib/client/lyricsFollow";
import { autoTimeSheet, timeFromLibrary, timeFromVoice, untimed, vocalLanes } from "@/lib/client/lyricsSources";
import { laneName, useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import LyricsPicker from "./LyricsPicker";
import { useMixSongs } from "@/lib/client/mixSongs";
import LyricsTimeline from "./LyricsTimeline";
import { rewordSheet, wordsOf } from "@/lib/lyricsEdit";
import {
  barAt,
  beatSeconds,
  clearTimes,
  fitOf,
  formatClock,
  isSection,
  isSung,
  isSynced,
  lineAt,
  parseLyrics,
  plainText,
  replaceSung,
  sectionAt,
  sectionName,
  shiftLines,
  snapLines,
  spreadOverBars,
  syllableTarget,
  type LineFit,
  type LyricLine,
} from "@/lib/lyrics";

// The words half of the vocal booth: the open sheet following the playhead
// while the beat plays, and the tools to fit it to the beat — time each
// line by tapping along, move or snap them onto the beat, and see which
// lines are too crammed or too roomy. Choosing a sheet (find, paste,
// write, AI, or one used before) is LyricsPicker. The recorder sings from
// the same sheet (LyricsCue).

/** A moment it takes to react to a line: taken off a tap so it lands where the line was sung. */
const TAP_REACTION = 0.08;

const GHOST =
  "flex items-center justify-center gap-1.5 rounded-lg border border-border text-muted transition-colors hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10 max-lg:w-10";

/**
 * Undo and Redo for the lyrics — every change to the words or their
 * timing is a step (typing is one step per visit to the box). ⌘/Ctrl+Z
 * and ⇧⌘Z / Ctrl+Y do the same while the lyrics have the focus (see
 * StudioShortcuts).
 */
export function LyricsUndoRedo({ className = "h-9 w-9" }: { className?: string }) {
  const canUndo = useLyrics((s) => s.past.length > 0);
  const canRedo = useLyrics((s) => s.future.length > 0);
  const undo = useLyrics((s) => s.undo);
  const redo = useLyrics((s) => s.redo);
  return (
    <>
      <button onClick={undo} disabled={!canUndo} className={`${className} ${GHOST}`} title="Undo the last change to the lyrics (⌘Z)" aria-label="Undo lyrics change">
        <Undo2 />
      </button>
      <button onClick={redo} disabled={!canRedo} className={`${className} ${GHOST}`} title="Redo (⇧⌘Z)" aria-label="Redo lyrics change">
        <Redo2 />
      </button>
    </>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Play or pause the mix (a notice when there is nothing to play). */
export async function togglePlay() {
  const store = useStudioStore.getState();
  if (store.lanes.length === 0) {
    useStudioView.getState().notify("Add a beat to play first — the lyrics follow the mix", "error");
    return;
  }
  if (store.isPlaying) {
    audioEngine.pause();
    return;
  }
  try {
    await audioEngine.play();
  } catch (error) {
    useStudioView.getState().notify(error instanceof Error ? error.message : "Couldn't play the mix", "error");
  }
}

export function PlayButton({ big = false }: { big?: boolean }) {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  return (
    <button
      onClick={() => void togglePlay()}
      className={`flex items-center justify-center gap-1.5 rounded-lg bg-brand font-semibold text-white hover:bg-brand-strong ${
        big ? "h-12 px-6 text-base" : "h-9 max-lg:h-10 px-3 text-xs"
      }`}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {isPlaying ? "Pause" : "Play"}
    </button>
  );
}

/** How far through the line being sung the playhead is, redrawn as it moves. */
function LineProgress({ start, end }: { start: number; end: number | null }) {
  // In hundredths: a redraw when the bar visibly moves, not on every playhead tick.
  const fraction = useStudioStore((s) => (end === null || end <= start ? 0 : Math.round(Math.min(1, Math.max(0, (s.playhead - start) / (end - start))) * 100) / 100));
  if (end === null || end <= start) return null;
  return (
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-vocals/15">
      <div className="h-full rounded-full bg-vocals transition-[width] duration-100" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

function nextTime(lines: LyricLine[], index: number): number | null {
  const at = lines[index]?.time;
  if (at === null || at === undefined) return null;
  for (let i = index + 1; i < lines.length; i++) {
    const time = lines[i].time;
    if (time !== null && time > at) return time;
  }
  return null;
}

/** The line under the playhead (-1 before the first, or when nothing is timed). */
function useCurrentLine(lines: LyricLine[]) {
  return useStudioStore((s) => lineAt(lines, s.playhead));
}

function FitBadge({ fit }: { fit: LineFit }) {
  if (!fit.syllables) return null;
  const tone =
    fit.verdict === "tight"
      ? "border-danger/50 text-danger"
      : fit.verdict === "roomy"
        ? "border-beat/50 text-beat"
        : fit.verdict === "ok"
          ? "border-success/50 text-success"
          : "border-border text-muted";
  const title =
    fit.verdict === null
      ? `About ${fit.syllables} syllables`
      : `About ${fit.syllables} syllables over ${fit.beats} beats — ${
          fit.verdict === "tight" ? "crammed: cut words or give it more room" : fit.verdict === "roomy" ? "lots of room: hold the notes, or add words" : "fits"
        }`;
  return (
    <span className={`shrink-0 rounded border px-1 text-[10px] tabular-nums ${tone}`} title={title}>
      {fit.syllables}
      {fit.beats !== null && <span className="opacity-70">/{fit.beats}b</span>}
    </span>
  );
}

/** "1:23.45" — a line's time to the hundredth, for fine timing. */
export function formatPrecise(seconds: number) {
  const centis = Math.round(Math.max(0, seconds) * 100);
  return `${Math.floor(centis / 6000)}:${String(Math.floor((centis % 6000) / 100)).padStart(2, "0")}.${String(centis % 100).padStart(2, "0")}`;
}

/** Plays the mix from a moment before `seconds`, to hear a line come in. */
export function playFrom(seconds: number, preRoll = 1) {
  audioEngine.seek(Math.max(0, seconds - preRoll));
  if (!useStudioStore.getState().isPlaying) void togglePlay();
}

/** Whether moving a line's time moves the lines after it too — the setting, as a pill. */
export function RippleToggle({ className = "" }: { className?: string }) {
  const ripple = useLyrics((s) => s.prefs.ripple);
  const setPrefs = useLyrics((s) => s.setPrefs);
  return (
    <button
      onClick={() => setPrefs({ ripple: !ripple })}
      aria-pressed={ripple}
      title={ripple ? "Moving a line moves every line after it too — the rest stays in sync. Tap to move lines on their own." : "Lines move on their own. Tap to have the lines after a line follow it."}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
        ripple ? "border-brand bg-brand/10 text-brand-strong" : "border-border text-muted hover:text-foreground"
      } ${className}`}
    >
      <ChevronsRight /> Ripple {ripple ? "on" : "off"}
    </button>
  );
}

/** The next (or previous) line with words from `index`, or null. */
function sungFrom(lines: LyricLine[], index: number, step: 1 | -1) {
  for (let i = index + step; i >= 0 && i < lines.length; i += step) if (isSung(lines[i])) return i;
  return null;
}

/**
 * One line's words, fixed in place — and the line itself: cut in two where
 * the cursor is, joined with the next, sung again (a repeated hook), a new
 * line after it, or taken out. Each is one step Undo takes back.
 */
function LineWordsEditor({ index }: { index: number }) {
  const line = useLyrics((s) => s.lines[index]);
  const count = useLyrics((s) => s.lines.length);
  const { editLine, splitLine, mergeNext, insertLine, duplicateLine, deleteLine, selectLine } = useLyrics.getState();
  const [draft, setDraft] = useState(line?.text ?? "");
  const input = useRef<HTMLInputElement>(null);
  if (!line) return null;
  const save = () => {
    const text = draft.trim();
    if (text && text !== line.text) editLine(index, text);
    else setDraft(line.text);
  };
  const tool = "flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-40 max-lg:h-10";
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-background/60 p-1.5">
      <input
        ref={input}
        dir="auto"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
            input.current?.blur();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(line.text);
            input.current?.blur();
          }
        }}
        className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors focus:border-vocals"
        aria-label={`Words of line ${index + 1}`}
        placeholder="The words of this line"
      />
      <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Line">
        <button
          className={tool}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const at = input.current?.selectionStart ?? Math.floor(line.text.length / 2);
            splitLine(index, at, null);
          }}
          title="Cut the line in two where the cursor is"
        >
          <Scissors /> Split
        </button>
        <button className={tool} disabled={index >= count - 1} onClick={() => mergeNext(index)} title="Join with the next line">
          <Merge /> Join next
        </button>
        <button className={tool} onClick={() => duplicateLine(index)} title="Sing this line again, right after it">
          <Copy /> Repeat
        </button>
        <button className={tool} onClick={() => insertLine(index, null)} title="A new line after this one">
          <Plus /> Line after
        </button>
        <button
          className={`${tool} ms-auto hover:!text-danger`}
          onClick={() => {
            deleteLine(index);
            selectLine(null);
          }}
          title="Take this line out (Undo brings it back)"
        >
          <Trash2 /> Delete
        </button>
      </div>
    </div>
  );
}

/**
 * The timing of one line, to fix it: nudge it earlier or later, set it to
 * the playhead, hear it come in, take its time off — and, with ripple on,
 * every line after it follows. Keys while it's open: ←/→ nudge (Shift: a
 * beat, Alt: a hair), ↑/↓ the line before/after, S sets it to the
 * playhead, P plays it, Esc closes.
 */
export function LineTimingEditor({ index, className = "" }: { index: number; className?: string }) {
  const lines = useLyrics((s) => s.lines);
  const ripple = useLyrics((s) => s.prefs.ripple);
  const nudge = useLyrics((s) => s.nudge);
  const retime = useLyrics((s) => s.retime);
  const untime = useLyrics((s) => s.untime);
  const selectLine = useLyrics((s) => s.selectLine);
  const markAligned = useLyrics((s) => s.markAligned);
  const bpm = useStudioStore((s) => s.projectBpm);
  const box = useRef<HTMLDivElement>(null);
  const line = lines[index];
  const beat = beatSeconds(bpm);
  const after = lines.slice(index + 1).filter((l) => l.time !== null && isSung(l)).length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Only while it's on screen (the booth keeps hidden tabs mounted), and not while typing.
      if (!box.current || box.current.offsetParent === null || isTyping(event.target) || event.metaKey || event.ctrlKey) return;
      const state = useLyrics.getState();
      const time = state.lines[index]?.time ?? null;
      const step = event.shiftKey ? beatSeconds(useStudioStore.getState().projectBpm) : event.altKey ? 0.01 : 0.05;
      if (event.key === "ArrowLeft" && time !== null) state.nudge(index, -step);
      else if (event.key === "ArrowRight" && time !== null) state.nudge(index, step);
      else if (event.key === "ArrowUp") state.selectLine(sungFrom(state.lines, index, -1) ?? index);
      else if (event.key === "ArrowDown") state.selectLine(sungFrom(state.lines, index, 1) ?? index);
      else if (event.key === "s" || event.key === "S") state.retime(index, useStudioStore.getState().playhead);
      else if ((event.key === "p" || event.key === "P") && time !== null) playFrom(time);
      else if (event.key === "Escape") state.selectLine(null);
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
      state.markAligned();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index]);

  if (!line || !isSung(line)) return null;
  const step = "h-8 min-w-9 rounded-md px-1.5 text-[11px] font-semibold tabular-nums text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-40 max-lg:h-10";
  const timed = line.time !== null;
  const move = (delta: number) => {
    nudge(index, delta);
    markAligned();
  };
  return (
    <div
      ref={box}
      data-lyrics
      onClick={(e) => e.stopPropagation()}
      className={`flex flex-col gap-2 rounded-xl border border-vocals/40 bg-surface p-2 text-xs shadow-sm ${className}`}
      role="group"
      aria-label={`Timing of line ${index + 1}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-vocals/10 px-2 py-1 font-mono text-sm font-semibold tabular-nums text-vocals" aria-live="polite">
          {timed ? formatPrecise(line.time!) : "not timed"}
        </span>
        <div className="flex items-center rounded-lg border border-border" role="group" aria-label="Nudge">
          <button disabled={!timed} onClick={() => move(-beat)} className={step} title="A beat earlier (Shift+←)">
            −beat
          </button>
          <button disabled={!timed} onClick={() => move(-0.1)} className={step} title="A touch earlier (←)">
            −0.1
          </button>
          <button disabled={!timed} onClick={() => move(-0.02)} className={step} title="A hair earlier (Alt+←)">
            −.02
          </button>
          <span className="h-5 w-px bg-border" aria-hidden />
          <button disabled={!timed} onClick={() => move(0.02)} className={step} title="A hair later (Alt+→)">
            +.02
          </button>
          <button disabled={!timed} onClick={() => move(0.1)} className={step} title="A touch later (→)">
            +0.1
          </button>
          <button disabled={!timed} onClick={() => move(beat)} className={step} title="A beat later (Shift+→)">
            +beat
          </button>
        </div>
        <button
          onClick={() => {
            retime(index, useStudioStore.getState().playhead);
            markAligned();
          }}
          className="flex h-8 items-center gap-1 rounded-lg bg-vocals px-2.5 text-[11px] font-semibold text-white hover:opacity-90 max-lg:h-10"
          title="This line starts at the playhead (S)"
        >
          <Crosshair /> To playhead
        </button>
        <button
          disabled={!timed}
          onClick={() => playFrom(line.time!)}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10"
          title="Hear it come in, from a second before (P)"
        >
          <Play /> Hear it
        </button>
        <button
          disabled={!timed}
          onClick={() => untime(index)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-danger disabled:opacity-40 max-lg:h-10 max-lg:w-10"
          title="Take this line's time off"
          aria-label="Take this line's time off"
        >
          <Eraser />
        </button>
        <button
          onClick={() => selectLine(null)}
          className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-foreground max-lg:h-10 max-lg:w-10"
          aria-label="Done with this line (Esc)"
          title="Done (Esc)"
        >
          <X />
        </button>
      </div>
      {/* Keyed by the words: a change from elsewhere (Undo, the editor) starts the field afresh. */}
      <LineWordsEditor key={`${index}:${line.text}`} index={index} />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <RippleToggle className="!h-7 !px-2.5 !text-[11px]" />
        <span>{ripple ? (after ? `Moves the ${after} line${after === 1 ? "" : "s"} after it too` : "Last timed line") : "Moves this line only"}</span>
        <span className="flex items-center gap-1 max-sm:hidden">
          <ArrowUpDown className="h-3 w-3" /> line before / after · ←/→ nudge
        </span>
      </div>
    </div>
  );
}

/** The sheet as a list that follows the playhead: tap a line to jump there, tap its time to fix it. */
const Prompter = memo(function Prompter({
  lines,
  tapIndex,
  onPickTap,
  showFit,
}: {
  lines: LyricLine[];
  tapIndex: number | null;
  onPickTap: (index: number) => void;
  showFit: boolean;
}) {
  const current = useCurrentLine(lines);
  const bpm = useStudioStore((s) => s.projectBpm);
  const duration = useStudioStore((s) => s.duration);
  const { style, fontSize } = useLyrics((s) => s.prefs);
  const retime = useLyrics((s) => s.retime);
  const selected = useLyrics((s) => s.selectedLine);
  const pickedHere = useLyrics((s) => s.selectedWhere === "list");
  const selectLine = useLyrics((s) => s.selectLine);
  const box = useRef<HTMLDivElement>(null);
  const fits = useMemo(() => lines.map((_, i) => fitOf(lines, i, bpm, style, duration || undefined)), [lines, bpm, style, duration]);

  // The line being sung stays in the middle of the box (the page itself doesn't scroll) — or the one being fixed.
  useEffect(() => {
    const container = box.current;
    const index = tapIndex ?? selected ?? current;
    const row = container?.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!container || !row) return;
    container.scrollTo({ top: row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2, behavior: "smooth" });
    // Not on every playhead move while a line is being fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected === null ? current : -1, tapIndex, selected]);

  return (
    <div ref={box} className="relative max-h-[min(28rem,55dvh)] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-background/60 p-1.5">
      {lines.map((line, i) => {
        if (!line.text) return <div key={i} data-line={i} className="h-4" />;
        if (isSection(line.text)) {
          return (
            <p key={i} data-line={i} dir="auto" className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-vocals/80">
              {sectionName(line.text)}
            </p>
          );
        }
        const active = i === current;
        const tapping = i === tapIndex;
        const picked = i === selected;
        return (
          <div
            key={i}
            data-line={i}
            className={`group relative flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
              tapping || picked ? "bg-vocals/15 ring-1 ring-vocals" : active ? "bg-vocals/10" : "hover:bg-surface-raised"
            }`}
          >
            {/* The line being sung gets a bar on its left, so it reads at a glance mid-take. */}
            <span className={`absolute inset-y-1 left-0 w-1 rounded-full bg-vocals transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
            <button
              onClick={() => selectLine(picked ? null : i, "list")}
              aria-expanded={picked}
              className={`mt-0.5 w-14 shrink-0 rounded px-1 py-0.5 text-left font-mono text-[10px] tabular-nums transition-colors ${
                picked ? "bg-vocals text-white" : "text-muted/70 hover:bg-vocals/10 hover:text-foreground"
              }`}
              title="Fix this line's timing"
            >
              {line.time !== null ? formatPrecise(line.time) : "–:––.––"}
            </button>
            <div className="min-w-0 flex-1">
              <p
                dir="auto"
                onClick={() => {
                  if (tapIndex !== null) onPickTap(i);
                  else if (line.time !== null) audioEngine.seek(line.time);
                }}
                className={`cursor-pointer leading-snug transition-[color,opacity] ${active ? "font-semibold text-foreground" : i < current ? "text-muted/60" : "text-muted"}`}
                style={{ fontSize: active ? fontSize * 1.15 : fontSize }}
              >
                {line.text}
              </p>
              {active && <LineProgress start={line.time ?? 0} end={nextTime(lines, i)} />}
              {picked && pickedHere && <LineTimingEditor index={i} className="mt-2" />}
            </div>
            {showFit && <FitBadge fit={fits[i]} />}
            <button
              onClick={() => {
                retime(i, useStudioStore.getState().playhead);
                useLyrics.getState().markAligned();
              }}
              className="mt-0.5 shrink-0 rounded p-1 text-muted opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100 max-lg:opacity-60"
              title="This line starts at the playhead (the lines after it follow when ripple is on)"
              aria-label="Set this line to the playhead"
            >
              <Clock />
            </button>
          </div>
        );
      })}
    </div>
  );
});

/** One row of the fit tools: an icon and name, then its buttons. */
function ToolRow({ icon: Icon, label, children }: { icon: ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <span className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-beat">
        <Icon /> {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Moving, snapping and laying the lines out on the beat. */
function FitTools({ lines }: { lines: LyricLine[] }) {
  const bpm = useStudioStore((s) => s.projectBpm);
  const setLines = useLyrics((s) => s.setLines);
  const barsPerLine = useLyrics((s) => s.prefs.barsPerLine);
  const setPrefs = useLyrics((s) => s.setPrefs);
  const [startBar, setStartBar] = useState(1);
  const beat = beatSeconds(bpm);
  const synced = isSynced(lines);
  const move = (delta: number) => setLines(shiftLines(lines, delta));
  const small =
    "h-8 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-beat hover:text-foreground disabled:opacity-40 max-lg:h-9";

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-beat/30 bg-beat/5 p-2.5 text-xs">
      <ToolRow icon={Rows3} label="Lay out">
        <label className="flex items-center gap-1 text-muted">
          from bar
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={startBar}
            onChange={(e) => setStartBar(Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))))}
            className="h-8 w-14 rounded-lg border border-border bg-background px-1.5 text-foreground max-lg:h-9"
          />
        </label>
        <button onClick={() => setStartBar(barAt(useStudioStore.getState().playhead, bpm))} className={small} title="The bar the playhead is in">
          <Crosshair className="inline" /> here
        </button>
        <select
          value={barsPerLine}
          onChange={(e) => setPrefs({ barsPerLine: Number(e.target.value) })}
          aria-label="A line every"
          className="h-8 rounded-lg border border-border bg-background px-1.5 text-foreground max-lg:h-9"
        >
          <option value={0.5}>a line every ½ bar</option>
          <option value={1}>a line every bar</option>
          <option value={2}>a line every 2 bars</option>
          <option value={4}>a line every 4 bars</option>
        </select>
        <button
          onClick={() => setLines(spreadOverBars(lines, bpm, { startBar, barsPerLine }))}
          className="h-8 rounded-lg bg-beat px-3 text-[11px] font-semibold text-white hover:opacity-90 max-lg:h-9"
          title="Put every line on the beat, one after another — a bar's rest between verses"
        >
          Lay out
        </button>
      </ToolRow>
      <ToolRow icon={MoveHorizontal} label="Move all">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(
            [
              ["−bar", -beat * 4, "Earlier by a bar"],
              ["−beat", -beat, "Earlier by a beat"],
              ["−0.1s", -0.1, "A touch earlier"],
              ["+0.1s", 0.1, "A touch later"],
              ["+beat", beat, "Later by a beat"],
              ["+bar", beat * 4, "Later by a bar"],
            ] as const
          ).map(([label, delta, title], i) => (
            <button
              key={label}
              disabled={!synced}
              onClick={() => move(delta)}
              title={title}
              className={`h-8 bg-background px-2 text-[11px] font-medium tabular-nums text-muted transition-colors hover:bg-beat/10 hover:text-foreground disabled:opacity-40 max-lg:h-9 ${
                i === 3 ? "border-l-2 border-l-beat/40" : i > 0 ? "border-l border-border" : ""
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={!synced}
          onClick={() => setLines(firstLineAt(lines, activeSheet(useLyrics.getState()), useStudioStore.getState().playhead))}
          className={small}
          title="Move the whole sheet so its first line starts at the playhead"
        >
          First line → playhead
        </button>
      </ToolRow>
      <ToolRow icon={Magnet} label="Snap">
        <button disabled={!synced} onClick={() => setLines(snapLines(lines, bpm, 1))} className={small}>
          To beats
        </button>
        <button disabled={!synced} onClick={() => setLines(snapLines(lines, bpm, 4))} className={small}>
          To bars
        </button>
        <button disabled={!synced} onClick={() => setLines(clearTimes(lines))} className={small} title="Take every time off, to start again">
          <Eraser className="inline" /> Clear times
        </button>
      </ToolRow>
    </div>
  );
}

/** Loops the line under the playhead, to practise it over and over; tap again to stop. */
export function LoopLineButton({ lines, className }: { lines: LyricLine[]; className: string }) {
  const looping = useStudioStore((s) => s.loopEnabled);
  const setLoop = useStudioStore((s) => s.setLoop);
  const bpm = useStudioStore((s) => s.projectBpm);
  function toggle() {
    if (looping) {
      setLoop({ enabled: false });
      return;
    }
    let index = lineAt(lines, useStudioStore.getState().playhead);
    if (index < 0 || !isSung(lines[index])) index = lines.findIndex((l) => isSung(l) && l.time !== null);
    const start = lines[index]?.time;
    if (start === null || start === undefined) return;
    const end = nextTime(lines, index) ?? start + beatSeconds(bpm) * 8;
    // A breath before the line, so it's sung from its start each time round.
    const from = Math.max(0, start - 0.4);
    setLoop({ start: from, end, enabled: true });
    audioEngine.seek(from);
    useStudioView.getState().notify("Looping this line — sing it until it sits, then tap the loop again");
  }
  return (
    <button
      onClick={toggle}
      aria-pressed={looping}
      className={`${className} ${looping ? "!border-vocals !bg-vocals/10 !text-vocals" : ""}`}
      title={looping ? "Stop looping" : "Loop the line under the playhead, to practise it"}
      aria-label={looping ? "Stop looping" : "Loop this line"}
    >
      <Repeat />
    </button>
  );
}

/**
 * Ways to give lines their times without tapping each one: from the
 * library's timed copy of the same song, from the singing in a vocal lane
 * of the mix (the song's own vocal, or a take), or one line a bar — or tap
 * along. `again` shows the first two as a row in the fit tools, to redo.
 */
export function GetTimes({ lines, onTap, again = false }: { lines: LyricLine[]; onTap?: () => void; again?: boolean }) {
  const sheet = useLyrics(activeSheet);
  const setLines = useLyrics((s) => s.setLines);
  const rename = useLyrics((s) => s.rename);
  const barsPerLine = useLyrics((s) => s.prefs.barsPerLine);
  const lanes = useStudioStore((s) => s.lanes);
  const bpm = useStudioStore((s) => s.projectBpm);
  const voices = useMemo(() => vocalLanes(lanes), [lanes]);
  const [laneId, setLaneId] = useState("");
  const [busy, setBusy] = useState<"auto" | "library" | "vocals" | null>(null);
  // The song's own vocal first; else the latest take.
  const chosen = voices.find((l) => l.laneId === laneId) ?? voices.find((l) => l.artistName !== "You") ?? voices[voices.length - 1];
  const notify = useStudioView.getState().notify;

  async function fromLibrary() {
    if (!sheet) return;
    setBusy("library");
    try {
      const timed = await timeFromLibrary(useLyrics.getState().sheets.find((s) => s.id === sheet.id)?.text ?? "", sheet.title, sheet.artist);
      if (!timed) {
        notify("No timed copy of these lyrics in the library — try the vocals, or tap along", "error");
        return;
      }
      setLines(parseLyrics(timed.text));
      rename({ aligned: timed.aligned });
      notify(`${timed.matched} of ${timed.total} lines timed from the library${timed.aligned ? ", lined up with your song" : " — timed to the original song"}`);
    } finally {
      setBusy(null);
    }
  }

  /** The best timing there is, worked out on its own: the library's timed copy lined up with the mix, else the song's vocals. */
  async function automatic() {
    if (!sheet) return;
    setBusy("auto");
    try {
      const text = useLyrics.getState().sheets.find((s) => s.id === sheet.id)?.text ?? "";
      const timed = await autoTimeSheet(untimed(text), { title: sheet.title, artist: sheet.artist });
      if (timed.how === "none") {
        notify(voices.length ? "Couldn't work the timing out — tap along instead" : "No timing found — add the song's vocal to the mix, or tap along", "error");
        return;
      }
      setLines(parseLyrics(timed.text));
      rename({ aligned: timed.aligned });
      notify(timed.note || "Timed");
    } finally {
      setBusy(null);
    }
  }

  async function fromVocals() {
    if (!chosen) return;
    setBusy("vocals");
    try {
      const timed = await timeFromVoice(useLyrics.getState().lines, chosen);
      if (!timed) {
        notify("Couldn't hear any singing in that lane", "error");
        return;
      }
      setLines(timed);
      rename({ aligned: true });
      notify("A first guess from the singing — play it through, and drag a line's mark on the waveform to fix it");
    } catch {
      notify("Couldn't read that lane's audio", "error");
    } finally {
      setBusy(null);
    }
  }

  const laneChoice = voices.length > 1 && (
    <select
      value={chosen?.laneId ?? ""}
      onChange={(e) => setLaneId(e.target.value)}
      aria-label="Which vocal to time from"
      className="h-8 min-w-0 max-w-[11rem] truncate rounded-lg border border-border bg-background px-1.5 text-[11px] text-foreground max-lg:h-9"
    >
      {voices.map((l) => (
        <option key={l.laneId} value={l.laneId}>
          {laneName(l)}
        </option>
      ))}
    </select>
  );

  if (again) {
    const small =
      "h-8 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-beat hover:text-foreground disabled:opacity-40 max-lg:h-9";
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border border-beat/30 bg-beat/5 p-2.5 text-xs sm:flex-row sm:items-center">
        <span className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-beat">
          <WandSparkles /> Re-time
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => void automatic()} disabled={!!busy} className={`${small} !border-beat/60 !text-foreground`} title="Worked out for you: the library's timed copy lined up with your mix, else the song's vocals">
            <WandSparkles className="inline" /> {busy === "auto" ? "Timing…" : "Automatic"}
          </button>
          <button onClick={() => void fromLibrary()} disabled={!!busy || !sheet?.title} className={small} title="Times from the library's timed copy of this song">
            <Library className="inline" /> {busy === "library" ? "Looking…" : "From the library"}
          </button>
          <button onClick={() => void fromVocals()} disabled={!!busy || !chosen} className={small} title={chosen ? "Times from where the singing starts in a vocal lane" : "Add a vocal (the song's, or a take) to time from it"}>
            <AudioLines className="inline" /> {busy === "vocals" ? "Listening…" : "From the vocals"}
          </button>
          {laneChoice}
        </div>
      </div>
    );
  }

  const option =
    "flex min-h-14 items-start gap-2 rounded-xl border border-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:border-vocals disabled:opacity-40 disabled:hover:border-border";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-vocals/30 bg-vocals/5 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Timer className="text-vocals" /> Not timed yet — give the lines their times, so they follow the song
      </p>
      <button
        onClick={() => void automatic()}
        disabled={!!busy}
        className="flex min-h-12 items-center gap-2.5 rounded-xl bg-vocals px-3 py-2 text-left text-white shadow-lg shadow-vocals/20 transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <WandSparkles className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{busy === "auto" ? "Working out the timing…" : "Time them for me"}</span>
          <span className="block text-[11px] leading-tight text-white/80">From the original song&apos;s timing, lined up with your mix — or from the vocals</span>
        </span>
      </button>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => void fromLibrary()} disabled={!!busy || !sheet?.title} className={option}>
          <Library className="mt-0.5 shrink-0 text-beat" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{busy === "library" ? "Looking…" : "From the original"}</span>
            <span className="block text-[10px] leading-tight text-muted">The library&apos;s timed copy of this song</span>
          </span>
        </button>
        <button onClick={() => void fromVocals()} disabled={!!busy || !chosen} className={option}>
          <AudioLines className="mt-0.5 shrink-0 text-vocals" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{busy === "vocals" ? "Listening…" : "From the vocals"}</span>
            <span dir="auto" className="block truncate text-[10px] leading-tight text-muted">
              {chosen ? `Where the singing starts in ${laneName(chosen)}` : "Add the song's vocal or a take first"}
            </span>
          </span>
        </button>
        <button onClick={onTap} className={option}>
          <Timer className="mt-0.5 shrink-0 text-brand-strong" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Tap along</span>
            <span className="block text-[10px] leading-tight text-muted">Play, and tap as each line starts</span>
          </span>
        </button>
        <button
          onClick={() => {
            setLines(spreadOverBars(lines, bpm, { startBar: barAt(useStudioStore.getState().playhead, bpm), barsPerLine }));
            rename({ aligned: true });
          }}
          className={option}
        >
          <Rows3 className="mt-0.5 shrink-0 text-success" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{barsPerLine === 1 ? "A line a bar" : `A line every ${barsPerLine} bars`}</span>
            <span className="block text-[10px] leading-tight text-muted">On the beat, from the playhead&apos;s bar</span>
          </span>
        </button>
      </div>
      {laneChoice && <div className="flex items-center gap-1.5 text-[11px] text-muted">Vocal to time from: {laneChoice}</div>}
    </div>
  );
}

function SingTab({ lines, onEdit, onRecord, stage = false }: { lines: LyricLine[]; onEdit: () => void; onRecord?: () => void; stage?: boolean }) {
  const setLines = useLyrics((s) => s.setLines);
  const retime = useLyrics((s) => s.retime);
  const selectLine = useLyrics((s) => s.selectLine);
  const selected = useLyrics((s) => s.selectedLine);
  const sheet = useLyrics(activeSheet);
  const markAligned = useLyrics((s) => s.markAligned);
  const prefs = useLyrics((s) => s.prefs);
  const setPrefs = useLyrics((s) => s.setPrefs);
  const bpm = useStudioStore((s) => s.projectBpm);
  const [tapIndex, setTapIndex] = useState<number | null>(null);
  const [tools, setTools] = useState(false);
  const [big, setBig] = useState(false);
  /** The next line with words from `from` on (read from the store, so a key press sees the latest). */
  const nextSung = (from: number) => {
    const all = useLyrics.getState().lines;
    for (let i = from; i < all.length; i++) if (isSung(all[i])) return i;
    return null;
  };

  // Times line `index` at the playhead (less a moment to react) and moves on to the next —
  // with ripple on, lines already timed after it move along, so re-tapping one line fixes the rest.
  function tap(index: number | null) {
    if (index === null) return;
    retime(index, Math.max(0, useStudioStore.getState().playhead - TAP_REACTION));
    setTapIndex(nextSung(index + 1));
  }

  // While tapping lines in: Enter (or T) times the next line, wherever the focus is (bar a text box).
  useEffect(() => {
    if (tapIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "Enter" || event.key === "t" || event.key === "T") {
        event.preventDefault();
        event.stopPropagation();
        tap(tapIndex);
      } else if (event.key === "Escape") setTapIndex(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // tap() only uses setters and the stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapIndex]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <ScrollText className="text-muted/50" />
        <p className="text-xs text-muted">
          This sheet is empty —{" "}
          <button onClick={onEdit} className="text-vocals hover:underline">
            write or paste the words
          </button>
          .
        </p>
      </div>
    );
  }
  const synced = isSynced(lines);
  const target = syllableTarget(bpm, prefs.style, prefs.barsPerLine);
  // Found lyrics are timed to the original recording; on another beat they need lining up once.
  const fromOriginal = synced && (sheet?.source === "library" || sheet?.source === "web") && !sheet.aligned;

  return (
    <div className="flex flex-col gap-2.5">
      {fromOriginal && tapIndex === null && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-beat/40 bg-beat/10 px-3 py-2 text-xs">
          <Clock className="shrink-0 text-beat" />
          <span className="min-w-0 flex-1">
            <b>Timed to the original song.</b> On another beat, put the playhead where the first line should come in, then:
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setLines(firstLineAt(lines, sheet, useStudioStore.getState().playhead));
                markAligned();
              }}
              className="h-8 rounded-lg bg-beat px-2.5 font-semibold text-white hover:opacity-90 max-lg:h-9"
            >
              Start here
            </button>
            <button
              onClick={markAligned}
              className="h-8 rounded-lg px-2 text-muted hover:text-foreground max-lg:h-9"
              aria-label="Keep the original timing"
              title="Keep the original timing"
            >
              <X />
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PlayButton />
        {tapIndex === null ? (
          <button
            onClick={() => {
              markAligned();
              setTapIndex(nextSung(0));
            }}
            className="flex h-9 max-lg:h-10 flex-1 min-w-32 items-center justify-center gap-1.5 rounded-lg border border-vocals/50 px-3 text-xs font-semibold text-vocals transition-colors hover:bg-vocals/10"
            title="Play the beat and tap as each line starts — the lines learn their times"
          >
            <Timer /> Tap to time
          </button>
        ) : (
          <>
            <button
              onClick={() => tap(tapIndex)}
              className="flex h-9 max-lg:h-10 flex-1 min-w-32 items-center justify-center gap-1.5 rounded-lg bg-vocals px-3 text-xs font-bold text-white shadow-lg shadow-vocals/25"
            >
              <Timer /> Tap — line {tapIndex + 1}
            </button>
            <button onClick={() => setTapIndex(null)} className="h-9 max-lg:h-10 rounded-lg border border-border px-3 text-xs text-muted hover:text-foreground">
              Done
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {synced && <RippleToggle className="max-sm:hidden" />}
          {synced && <LoopLineButton lines={lines} className={`h-9 w-9 ${GHOST}`} />}
          {onRecord && (
            <button onClick={onRecord} className={`h-9 w-9 ${GHOST} hover:!border-vocals hover:!text-vocals`} title="Record over the beat, singing from these" aria-label="Record with these lyrics">
              <Mic />
            </button>
          )}
          <LyricsUndoRedo />
          <button
            onClick={() => setPrefs({ fontSize: Math.max(12, prefs.fontSize - 2) })}
            className={`h-9 w-9 ${GHOST}`}
            aria-label="Smaller text"
          >
            <Minus />
          </button>
          <button
            onClick={() => setPrefs({ fontSize: Math.min(36, prefs.fontSize + 2) })}
            className={`h-9 w-9 ${GHOST}`}
            aria-label="Bigger text"
          >
            <Plus />
          </button>
          <button onClick={() => setBig(true)} className={`h-9 w-9 ${GHOST}`} title="Full screen, to sing from across the room" aria-label="Full screen lyrics">
            <Maximize2 />
          </button>
        </div>
      </div>

      {tapIndex !== null && (
        <p className="rounded-lg bg-vocals/10 px-2.5 py-1.5 text-[11px] text-foreground">
          Play the beat, and tap (or press Enter) right as each line starts. Click a line to tap from there; Esc to stop.
          {prefs.ripple && synced ? " Ripple is on: lines already timed after the one you tap move along with it." : ""}
        </p>
      )}
      {!synced && tapIndex === null && (
        <GetTimes
          lines={lines}
          onTap={() => {
            markAligned();
            setTapIndex(nextSung(0));
          }}
        />
      )}

      <button
        onClick={() => setTools((v) => !v)}
        aria-pressed={tools}
        aria-expanded={tools}
        className={`flex h-9 items-center gap-1.5 self-start rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
          tools ? "border-beat bg-beat/10 text-beat" : "border-border text-muted hover:border-beat hover:text-foreground"
        }`}
      >
        <Magnet /> Fit to the beat
        <ChevronDown className={`transition-transform ${tools ? "rotate-180" : ""}`} />
      </button>
      {tools && (
        <>
          {synced && <GetTimes lines={lines} again />}
          <FitTools lines={lines} />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>Delivery</span>
            {(["rap", "sing"] as const).map((style) => (
              <button
                key={style}
                onClick={() => setPrefs({ style })}
                aria-pressed={prefs.style === style}
                className={`rounded-md border px-2 py-0.5 ${prefs.style === style ? "border-vocals text-foreground" : "border-border hover:text-foreground"}`}
              >
                {style === "rap" ? "Rap" : "Sing"}
              </button>
            ))}
            <span>
              · at {Math.round(bpm)} BPM aim for ~{target} syllables a {prefs.barsPerLine === 1 ? "bar" : `${prefs.barsPerLine} bars`}. Badges: syllables / beats the line has —{" "}
              <span className="text-danger">crammed</span>, <span className="text-success">fits</span>, <span className="text-beat">roomy</span>.
            </span>
          </div>
        </>
      )}

      {!stage && (
        <LyricsTimeline
          lines={lines}
          onMoveLine={(index, time) => {
            retime(index, time);
            markAligned();
          }}
          ripple={prefs.ripple}
          onSelectLine={(i) => selectLine(i, "list")}
          selected={selected}
          height={76}
        />
      )}
      <Prompter lines={lines} tapIndex={tapIndex} onPickTap={setTapIndex} showFit={tools} />
      {big && <BigPrompter lines={lines} onClose={() => setBig(false)} />}
    </div>
  );
}

/** Full screen: the line being sung, big, with the next ones under it. */
export function BigPrompter({ lines, onClose }: { lines: LyricLine[]; onClose: () => void }) {
  const current = useCurrentLine(lines);
  const synced = isSynced(lines);
  const [manual, setManual] = useState(0);
  const at = synced ? Math.max(0, current) : manual;
  const sung = (from: number, count: number) => {
    const out: { line: LyricLine; index: number }[] = [];
    for (let i = from; i < lines.length && out.length < count; i++) if (isSung(lines[i])) out.push({ line: lines[i], index: i });
    return out;
  };
  const ahead = sung(at, 4);
  const before = [...lines.slice(0, at)].reverse().find(isSung);
  const section = ahead[0] ? sectionAt(lines, ahead[0].index) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (!synced && (event.key === "ArrowDown" || event.key === "ArrowRight")) setManual((n) => Math.min(lines.length - 1, n + 1));
      if (!synced && (event.key === "ArrowUp" || event.key === "ArrowLeft")) setManual((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previous;
    };
  }, [onClose, synced, lines.length]);

  return (
    <div data-lyrics-fullscreen className="fixed inset-0 z-[70] flex flex-col bg-background/97 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur" role="dialog" aria-label="Lyrics, full screen">
      <div className="flex items-center justify-between gap-3">
        <PlayButton big />
        <button onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-muted hover:text-foreground" aria-label="Close full screen">
          <X />
        </button>
      </div>
      <div
        className="flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden text-center"
        onClick={() => !synced && setManual((n) => Math.min(lines.length - 1, n + 1))}
      >
        {section && <p className="text-xs font-bold uppercase tracking-[0.2em] text-vocals sm:text-sm">{section}</p>}
        {before && (
          <p dir="auto" className="max-w-4xl text-xl text-muted/60 sm:text-2xl">
            {before.text}
          </p>
        )}
        {ahead.map(({ line, index }, k) => (
          <p
            key={index}
            dir="auto"
            className={`max-w-4xl leading-tight ${k === 0 ? "text-3xl font-bold text-foreground sm:text-5xl" : "text-xl text-muted sm:text-3xl"}`}
          >
            {line.text}
          </p>
        ))}
        {ahead.length === 0 && <p className="text-muted">That&apos;s the end of the lyrics.</p>}
      </div>
      {!synced && <p className="text-center text-xs text-muted">Not timed — tap the screen (or press ↓) for the next line.</p>}
    </div>
  );
}

function EditTab({ onDone }: { onDone: () => void }) {
  const sheet = useLyrics(activeSheet);
  const lines = useLyrics((s) => s.lines);
  const setText = useLyrics((s) => s.setText);
  const rename = useLyrics((s) => s.rename);
  const checkpoint = useLyrics((s) => s.checkpoint);
  const clear = useLyrics((s) => s.clear);
  const [pasteError, setPasteError] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // A timed sheet is edited as its words alone — each line keeps its time (lyricsEdit.ts); "Show times" edits the stamps too.
  const timed = isSynced(lines);
  const [showTimes, setShowTimes] = useState(false);
  const wordsOnly = timed && !showTimes;
  // What's in the box while the words are edited: kept as typed (a new empty row, a space at the end), and taken
  // again from the sheet when it changes some other way (Undo, the AI, timing).
  const [draft, setDraft] = useState<{ text: string; sheet: string } | null>(null);
  if (!sheet) return null;
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
  const boxText = wordsOnly ? (draft && draft.sheet === sheet.text ? draft.text : wordsOf(lines)) : sheet.text;

  /** The box's text changed to `text`: the sheet follows (in words mode, with every line's time kept). */
  function write(text: string) {
    if (!sheet) return;
    const next = text.slice(0, 20_000);
    if (!wordsOnly) {
      setText(next);
      return;
    }
    const sheetText = rewordSheet(sheet.text, next);
    setDraft({ text: next, sheet: sheetText });
    setText(sheetText);
  }

  /** A section heading ("[Chorus]") on its own line where the cursor is, a blank line before it. */
  function insertSection(name: string) {
    if (!sheet) return;
    const text = boxText;
    const el = box.current;
    const at = el && document.activeElement === el ? el.selectionStart : text.length;
    const lineStart = text.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
    const start = at === text.length && text && !text.endsWith("\n") ? text.length : lineStart;
    const before = text.slice(0, start);
    const gap = !before.trim() ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const block = `${gap}[${name}]\n`;
    checkpoint();
    write(before + block + text.slice(start));
    requestAnimationFrame(() => {
      const pos = (before + block).length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  async function paste() {
    if (!sheet) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      checkpoint();
      write(boxText.trim() ? `${boxText.trimEnd()}\n\n${text}` : text);
      setPasteError(false);
    } catch {
      setPasteError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={sheet.title}
          onChange={(e) => rename({ title: e.target.value.slice(0, 200) })}
          placeholder="Song title"
          dir="auto"
          aria-label="Song title"
          className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-semibold"
        />
        <input
          value={sheet.artist}
          onChange={(e) => rename({ artist: e.target.value.slice(0, 200) })}
          placeholder="Artist (optional)"
          dir="auto"
          aria-label="Artist"
          className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="Add a section heading">
        {["Intro", "Verse", "Pre-Chorus", "Chorus", "Hook", "Bridge", "Outro"].map((name) => (
          <button
            key={name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSection(name)}
            className="h-8 rounded-full border border-border px-2.5 text-[11px] font-semibold text-muted transition-colors hover:border-vocals hover:text-foreground max-lg:h-9"
            title={`Start a ${name.toLowerCase()} here`}
          >
            + {name}
          </button>
        ))}
      </div>
      {timed && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2">
          <p className="min-w-0 text-[11px] leading-snug text-muted">
            {wordsOnly ? "Just the words — every line keeps its time. A new line goes between the lines around it." : "Each line's time is in front of it, like [01:02.50]."}
          </p>
          <button
            onClick={() => setShowTimes((v) => !v)}
            aria-pressed={showTimes}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${showTimes ? "border-vocals text-vocals" : "border-border text-muted hover:text-foreground"}`}
          >
            <Clock /> {showTimes ? "Hide times" : "Show times"}
          </button>
        </div>
      )}
      <textarea
        ref={box}
        value={boxText}
        onFocus={checkpoint}
        onChange={(e) => write(e.target.value)}
        dir="auto"
        rows={12}
        spellCheck={false}
        placeholder={"One line of lyrics per line.\nLeave an empty line between verses.\n[Chorus] on its own line marks a section.\n\nTimes (optional) go first, like this:\n[00:12.50] First line"}
        aria-label="Lyrics"
        className={`min-h-48 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 leading-relaxed max-lg:text-base ${wordsOnly ? "text-sm" : "font-mono text-[13px]"}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        {canPaste && (
          <button
            onClick={() => void paste()}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted hover:border-vocals hover:text-foreground"
          >
            <ClipboardPaste /> Paste
          </button>
        )}
        <button
          onClick={() => {
            clear();
            box.current?.focus();
          }}
          disabled={!sheet.text.trim()}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted hover:border-danger/60 hover:text-danger disabled:opacity-40"
          title="Take every line out, to start the words again (Undo brings them back)"
        >
          <Eraser /> Clear
        </button>
        <LyricsUndoRedo className="h-10 w-10" />
        <p className="min-w-0 flex-1 text-[11px] text-muted">
          {pasteError ? "The browser didn't allow pasting from here — long-press (or Ctrl/⌘+V) in the box instead." : "Saved in this browser as you type."}
        </p>
        <button onClick={onDone} className="flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90">
          <Check /> Done
        </button>
      </div>
    </div>
  );
}

type AiMode = "complete" | "fit" | "write";

function AiTabView({ lines, onDone }: { lines: LyricLine[]; onDone: () => void }) {
  const bpm = useStudioStore((s) => s.projectBpm);
  const prefs = useLyrics((s) => s.prefs);
  const setPrefs = useLyrics((s) => s.setPrefs);
  const setLines = useLyrics((s) => s.setLines);
  const create = useLyrics((s) => s.create);
  const sheet = useLyrics(activeSheet);
  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState<AiMode | null>(null);
  const [error, setError] = useState<{ text: string; needsKey?: boolean } | null>(null);
  const [draft, setDraft] = useState<{ mode: AiMode; lines: string[] } | null>(null);
  const hasWords = lines.some((l) => l.text);
  const target = syllableTarget(bpm, prefs.style, prefs.barsPerLine);

  async function ask(mode: AiMode) {
    setBusy(mode);
    setError(null);
    setDraft(null);
    const provider = savedProvider();
    const key = browserKey(provider);
    try {
      const res = await fetch("/api/lyrics/write", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "x-ai-key": key } : {}) },
        body: JSON.stringify({
          mode,
          // Fitting rewrites the sung lines one for one; headings and breaks stay put.
          lyrics: mode === "fit" ? plainText(lines.filter(isSung)) : plainText(lines),
          idea,
          bpm,
          style: prefs.style,
          lines: count,
          barsPerLine: prefs.barsPerLine >= 1 ? prefs.barsPerLine : 1,
          provider,
          model: savedModelChoice(provider) ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error ?? "The AI couldn't write that — try again", needsKey: !!data.needsKey });
        return;
      }
      setDraft({ mode, lines: data.lines as string[] });
    } catch {
      setError({ text: "Couldn't reach the AI — check your connection" });
    } finally {
      setBusy(null);
    }
  }

  function accept() {
    if (!draft) return;
    const added = draft.lines.map((text) => ({ time: null, text }));
    if (draft.mode === "fit") setLines(replaceSung(lines, draft.lines.filter(Boolean)));
    else if (!sheet) create({ title: idea.slice(0, 60) || "New lyrics", artist: "", text: draft.lines.join("\n"), source: "ai" });
    // Carried on after what's there, with a break before a new verse.
    else setLines([...lines, ...(draft.mode === "write" && hasWords ? [{ time: null, text: "" }] : []), ...added]);
    setDraft(null);
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-muted">
        <span>Delivery</span>
        {(["rap", "sing"] as const).map((style) => (
          <button
            key={style}
            onClick={() => setPrefs({ style })}
            aria-pressed={prefs.style === style}
            className={`rounded-md border px-2 py-0.5 ${prefs.style === style ? "border-vocals text-foreground" : "border-border hover:text-foreground"}`}
          >
            {style === "rap" ? "Rap" : "Sing"}
          </button>
        ))}
        <label className="flex items-center gap-1">
          a line every
          <select
            value={prefs.barsPerLine >= 1 ? prefs.barsPerLine : 1}
            onChange={(e) => setPrefs({ barsPerLine: Number(e.target.value) })}
            className="rounded border border-border bg-background px-1 py-0.5 text-foreground"
          >
            <option value={1}>bar</option>
            <option value={2}>2 bars</option>
            <option value={4}>4 bars</option>
          </select>
        </label>
        <span>· {Math.round(bpm)} BPM → ~{target} syllables a line</span>
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, 800))}
        rows={2}
        dir="auto"
        placeholder="What's it about? A mood, a story, a few words to rhyme with… (optional)"
        aria-label="Idea for the lyrics"
        className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-muted">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded border border-border bg-background px-1 py-1 text-foreground" aria-label="How many lines">
            {[2, 4, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n} lines
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void ask("complete")}
          disabled={!!busy || (!hasWords && !idea.trim())}
          className="rounded-lg bg-brand px-2.5 py-2 font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
          title="Carry on from your last line, in your style and rhyme"
        >
          {busy === "complete" ? "Writing…" : "Finish it"}
        </button>
        <button
          onClick={() => void ask("write")}
          disabled={!!busy}
          className="rounded-lg border border-brand px-2.5 py-2 font-semibold text-brand-strong hover:bg-brand/10 disabled:opacity-40"
          title="New lines from your idea"
        >
          {busy === "write" ? "Writing…" : "Write new lines"}
        </button>
        <button
          onClick={() => void ask("fit")}
          disabled={!!busy || !hasWords}
          className="rounded-lg border border-vocals px-2.5 py-2 font-semibold text-foreground hover:bg-vocals/10 disabled:opacity-40"
          title="Rewrite each line to fit the beat, keeping its meaning and its time"
        >
          {busy === "fit" ? "Fitting…" : "Fit lines to the beat"}
        </button>
      </div>
      {error && (
        <p className="text-danger">
          {error.text}{" "}
          {error.needsKey && (
            <button onClick={() => useStudioView.getState().openAi("ask")} className="font-semibold text-brand-strong hover:underline">
              Set up AI
            </button>
          )}
        </p>
      )}
      {draft && (
        <div className="rounded-xl border border-brand/50 bg-brand/5 p-2">
          <p className="mb-1 text-[11px] font-semibold text-muted">{draft.mode === "fit" ? "Rewritten to fit — each line keeps its time:" : "New lines:"}</p>
          <div className="max-h-56 overflow-y-auto">
            {draft.lines.map((line, i) =>
              line ? (
                <p key={i} dir="auto" className="text-sm leading-snug">
                  {line}
                </p>
              ) : (
                <div key={i} className="h-3" />
              )
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={accept} className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-strong">
              {draft.mode === "fit" ? "Use these" : sheet ? "Add to the lyrics" : "Make a sheet"}
            </button>
            <button onClick={() => void ask(draft.mode)} disabled={!!busy} className="rounded-lg border border-border px-3 py-2 text-muted hover:text-foreground disabled:opacity-40">
              Try again
            </button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-2 text-muted hover:text-foreground">
              Discard
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted">Uses the AI producer&apos;s key and model. Changes can be taken back with Undo on the Sing tab.</p>
    </div>
  );
}

/** A small back row over a tool that has its own screen. */
/** A song's lyrics being looked up on their own (see mixSongs.findForMix): which song, and the step it's on. */
export function FindingBanner({ className = "" }: { className?: string }) {
  const finding = useLyrics((s) => s.finding);
  if (!finding) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative flex items-center gap-3 overflow-hidden rounded-xl border border-vocals/40 bg-gradient-to-r from-vocals/15 via-brand/10 to-transparent p-3 ${className}`}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vocals/20 text-vocals">
        <span className="absolute inset-0 animate-ping rounded-full bg-vocals/20" aria-hidden />
        <ScrollText />
      </span>
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-sm font-semibold leading-tight">
          Finding the lyrics for “{finding.song}”
        </p>
        <p className="truncate text-[11px] text-muted">{finding.step}</p>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
        <span className="block h-full w-1/3 lyrics-sweep rounded-full bg-vocals" />
      </span>
    </div>
  );
}

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button onClick={onBack} className="flex h-10 items-center gap-1.5 self-start rounded-full pe-3 text-xs font-semibold text-muted hover:text-foreground">
      <ArrowLeft className="rtl:rotate-180" /> {label}
    </button>
  );
}

/**
 * The words half of the vocal booth: the open sheet, as a card with what
 * can be done to it (change it, edit it, the AI, put it away), over the
 * words following the beat. With no sheet open, the picker.
 */
/** `stage`: shown under a stage that already has the song's waveform (the Vocalist studio) — the sheet doesn't draw its own. */
export function LyricsTools({ onSing, stage = false }: { onSing?: () => void; stage?: boolean }) {
  const load = useLyrics((s) => s.load);
  const lines = useLyrics((s) => s.lines);
  const select = useLyrics((s) => s.select);
  const create = useLyrics((s) => s.create);
  const sheet = useLyrics(activeSheet);
  const view = useLyrics((s) => s.view);
  const setView = useLyrics((s) => s.setView);
  const mixSong = useMixSongs()[0]?.key;

  useEffect(() => load(), [load]);

  const newSheet = () => {
    create({ title: "My lyrics", artist: "", text: "", source: "own" });
    setView("edit");
  };

  // Nothing open: choosing one is all there is to do (or the AI, which makes one).
  const shown = !sheet && (view === "sheet" || view === "edit") ? "pick" : view;

  if (shown === "pick") {
    // A new song in the mix starts the picker afresh, on that song.
    return (
      <div className="flex flex-col gap-3">
      <FindingBanner />
      <LyricsPicker
        key={mixSong ?? "none"}
        onPicked={() => setView("sheet")}
        onWrite={newSheet}
        onAi={() => setView("ai")}
        onBack={sheet ? () => setView("sheet") : undefined}
      />
      </div>
    );
  }
  if (shown === "ai") {
    return (
      <div className="flex flex-col gap-2">
        <BackRow label={sheet ? "Back to the lyrics" : "Back"} onBack={() => setView(sheet ? "sheet" : "pick")} />
        <AiTabView lines={lines} onDone={() => setView("sheet")} />
      </div>
    );
  }
  if (!sheet) return null;

  const timed = isSynced(lines);
  const lineCount = lines.filter(isSung).length;
  const editing = shown === "edit";
  const icon = `h-10 w-10 ${GHOST}`;

  return (
    <div data-lyrics className="flex flex-col gap-3">
      <FindingBanner />
      {/* The open sheet: what it is, and everything that changes which one it is. */}
      <div className="relative flex items-center gap-2 overflow-hidden rounded-2xl border border-vocals/25 bg-gradient-to-br from-vocals/12 via-surface to-brand/10 p-2 shadow-sm">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vocals to-brand text-white shadow-[0_6px_18px_-8px_var(--vocals)] max-sm:hidden">
          <ScrollText />
          {timed && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" title="Timed" />}
        </span>
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-sm font-semibold leading-tight">
            {sheet.title || "Untitled"}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-muted">
            {sheet.artist && (
              <span dir="auto" className="truncate">
                {sheet.artist} ·
              </span>
            )}
            <span className="shrink-0">{lineCount} lines</span>
            {lineCount > 0 && (
              <span className={`shrink-0 rounded-full px-1.5 font-semibold ${timed ? (sheet.aligned ? "bg-success/15 text-success" : "bg-beat/15 text-beat") : "bg-foreground/10"}`}
                title={timed && !sheet.aligned ? "Timed to the original recording — check it against your beat" : undefined}>
                {timed ? (sheet.aligned ? "Synced to your mix" : "Timed") : "Not timed"}
              </span>
            )}
            {sheet.source === "library" && <span className="shrink-0 max-sm:hidden">· found for you</span>}
          </p>
        </div>
        <button
          onClick={() => setView("pick")}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:border-vocals"
          title="Find other lyrics, or switch to ones you've used"
        >
          <Repeat2 /> Change
        </button>
        <button
          onClick={() => setView(editing ? "sheet" : "edit")}
          aria-pressed={editing}
          className={`${icon} ${editing ? "!border-vocals !text-vocals" : ""}`}
          title={editing ? "Done editing" : "Edit the words"}
          aria-label={editing ? "Done editing" : "Edit the words"}
        >
          {editing ? <Check /> : <PenLine />}
        </button>
        <button onClick={() => setView("ai")} className={`${icon} max-sm:hidden`} title="Write or rework lines with AI" aria-label="Write with AI">
          <Sparkles />
        </button>
        <button
          onClick={() => select(null)}
          className={icon}
          title="Put these lyrics away (they stay saved)"
          aria-label="Close these lyrics"
        >
          <X />
        </button>
      </div>

      {editing ? <EditTab onDone={() => setView("sheet")} /> : <SingTab lines={lines} onEdit={() => setView("edit")} onRecord={onSing} stage={stage} />}
    </div>
  );
}

/**
 * The lyrics for the recorder: the line being sung and the next ones,
 * following the playhead — or the whole sheet, when it isn't timed.
 */
export function LyricsCue({ big = false }: { big?: boolean }) {
  const load = useLyrics((s) => s.load);
  const lines = useLyrics((s) => s.lines);
  const sheet = useLyrics(activeSheet);
  const baseSize = useLyrics((s) => s.prefs.fontSize);
  // Mid-take the words are read at a glance from a step back.
  const fontSize = big ? Math.max(baseSize, 20) * 1.15 : baseSize;
  const openLyrics = useLyrics((s) => s.openLyrics);
  const finding = useLyrics((s) => s.finding);
  const current = useCurrentLine(lines);
  useEffect(() => load(), [load]);

  if (!sheet && finding) return <FindingBanner />;
  if (!sheet || !lines.some(isSung)) {
    return (
      <button
        onClick={() => openLyrics(sheet ? "edit" : "pick")}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-xs text-muted transition-colors hover:border-vocals hover:text-foreground"
      >
        <ScrollText className="shrink-0 text-vocals" />
        <span>
          <b className="text-foreground">{sheet ? "This sheet has no words yet" : "Add lyrics to sing from"}</b> —{" "}
          {sheet ? "write or paste them in." : "find a song (Persian or English), paste your own, or write with AI."}
        </span>
      </button>
    );
  }

  // Which lyrics these are, with one tap to swap them — not while singing, when only the words matter.
  const heading = !big && (
    <div className="mb-1.5 flex items-center gap-2 border-b border-border/60 pb-1.5">
      <ScrollText className="shrink-0 text-vocals" />
      <span dir="auto" className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted">
        {sheet.title}
      </span>
      <button onClick={() => openLyrics("pick")} className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-vocals hover:bg-vocals/10">
        <Repeat2 /> Change
      </button>
    </div>
  );

  if (!isSynced(lines)) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2" aria-label="Lyrics">
        {heading}
        <div className={`${big ? "max-h-64" : "max-h-36"} overflow-y-auto overscroll-contain`} dir="auto">
          {lines.map((line, i) =>
            line.text && isSection(line.text) ? (
              <p key={i} className="pt-1 text-[10px] font-bold uppercase tracking-wider text-vocals/80">
                {sectionName(line.text)}
              </p>
            ) : line.text ? (
              <p key={i} dir="auto" className="leading-snug" style={{ fontSize }}>
                {line.text}
              </p>
            ) : (
              <div key={i} className="h-3" />
            )
          )}
        </div>
        <button onClick={() => openLyrics("sheet")} className="mt-1 text-[11px] text-vocals hover:underline">
          Not timed yet — tap to time them, and they&apos;ll follow the beat
        </button>
      </div>
    );
  }

  const shown: number[] = [];
  for (let i = Math.max(0, current); i < lines.length && shown.length < 3; i++) if (isSung(lines[i])) shown.push(i);
  const previous = current > 0 ? [...lines.slice(0, current)].reverse().find(isSung) : undefined;
  const section = shown.length ? sectionAt(lines, shown[0]) : null;
  return (
    <div className={`rounded-xl border border-border/60 bg-background/60 px-3 ${big ? "py-4" : "py-2.5"}`} aria-label="Lyrics" aria-live="polite">
      {heading}
      {section && <p className="text-[10px] font-bold uppercase tracking-wider text-vocals/80">{section}</p>}
      {previous && (
        <p dir="auto" className="truncate text-xs text-muted/50">
          {previous.text}
        </p>
      )}
      {shown.map((i, k) => (
        <div key={i}>
          <p
            dir="auto"
            className={k === 0 && current >= 0 ? "font-semibold leading-snug text-foreground" : "leading-snug text-muted/80"}
            style={{ fontSize: k === 0 && current >= 0 ? fontSize * 1.2 : fontSize * 0.9 }}
          >
            {lines[i].text}
          </p>
          {k === 0 && current >= 0 && <LineProgress start={lines[i].time ?? 0} end={nextTime(lines, i)} />}
        </div>
      ))}
      {current < 0 && <p className="text-[11px] text-muted">First line at {formatClock(lines.find((l) => l.time !== null)?.time ?? 0)}</p>}
    </div>
  );
}
