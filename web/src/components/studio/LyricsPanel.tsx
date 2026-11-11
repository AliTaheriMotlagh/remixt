"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  FileText,
  Maximize2,
  Pause,
  Play,
  Plus,
  ScrollText,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { browserKey, savedModelChoice, savedProvider } from "@/lib/client/coproducerChat";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import {
  barAt,
  beatSeconds,
  clearTimes,
  fitOf,
  formatClock,
  isSynced,
  keepTimes,
  lineAt,
  plainText,
  shiftLines,
  snapLines,
  spreadOverBars,
  startAt,
  syllableTarget,
  type LineFit,
  type LyricLine,
  type LyricsResult,
} from "@/lib/lyrics";

// Lyrics in the Studio: find a song's words (or paste, or write them with
// the AI), have them follow the playhead while the beat plays, and fit them
// to it — time each line by tapping along, move or snap them onto the
// beat, and see which lines are too crammed or too empty for their bars.
// The recorder shows the same lines while a take is sung (LyricsCue).

type Tab = "sing" | "edit" | "find" | "ai";

/** A moment it takes to react to a line: taken off a tap so it lands where the line was sung. */
const TAP_REACTION = 0.08;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

async function togglePlay() {
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

function PlayButton({ big = false }: { big?: boolean }) {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  return (
    <button
      onClick={() => void togglePlay()}
      className={`flex items-center justify-center gap-1.5 rounded-lg bg-brand font-semibold text-white hover:bg-brand-strong ${
        big ? "h-12 px-6 text-base" : "h-8 px-3 text-xs"
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
  const playhead = useStudioStore((s) => s.playhead);
  if (end === null || end <= start) return null;
  const fraction = Math.min(1, Math.max(0, (playhead - start) / (end - start)));
  return (
    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-vocals/20">
      <div className="h-full bg-vocals" style={{ width: `${fraction * 100}%` }} />
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
    fit.verdict === "tight" ? "border-danger/50 text-danger" : fit.verdict === "roomy" ? "border-beat/50 text-beat" : fit.verdict === "ok" ? "border-success/50 text-success" : "border-border text-muted";
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

/** The sheet as a list that follows the playhead: tap a line to jump there. */
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
  const setLines = useLyrics((s) => s.setLines);
  const box = useRef<HTMLDivElement>(null);
  const fits = useMemo(() => lines.map((_, i) => fitOf(lines, i, bpm, style, duration || undefined)), [lines, bpm, style, duration]);

  // The line being sung stays in the middle of the box (the page itself doesn't scroll).
  useEffect(() => {
    const container = box.current;
    const index = tapIndex ?? current;
    const row = container?.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!container || !row) return;
    container.scrollTo({ top: row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2, behavior: "smooth" });
  }, [current, tapIndex]);

  return (
    <div ref={box} className="relative max-h-[22rem] overflow-y-auto overscroll-contain rounded-lg bg-background/60 px-2 py-3">
      {lines.map((line, i) => {
        if (!line.text) return <div key={i} data-line={i} className="h-4" />;
        const active = i === current;
        const tapping = i === tapIndex;
        return (
          <div
            key={i}
            data-line={i}
            className={`group flex items-start gap-2 rounded-md px-2 py-1 transition-colors ${
              tapping ? "bg-brand/15 ring-1 ring-brand" : active ? "bg-vocals/10" : "hover:bg-surface-raised"
            }`}
          >
            <button
              onClick={() => (line.time !== null ? audioEngine.seek(line.time) : onPickTap(i))}
              className="mt-1 w-10 shrink-0 text-left text-[10px] tabular-nums text-muted hover:text-foreground"
              title={line.time !== null ? "Jump here" : "Not timed yet — tap it in"}
            >
              {line.time !== null ? formatClock(line.time) : "–:––"}
            </button>
            <div className="min-w-0 flex-1">
              <p
                dir="auto"
                onClick={() => {
                  if (tapIndex !== null) onPickTap(i);
                  else if (line.time !== null) audioEngine.seek(line.time);
                }}
                className={`cursor-pointer leading-snug transition-[color,opacity] ${active ? "font-semibold text-foreground" : i < current ? "text-muted/70" : "text-muted"}`}
                style={{ fontSize: active ? fontSize * 1.2 : fontSize }}
              >
                {line.text}
              </p>
              {active && <LineProgress start={line.time ?? 0} end={nextTime(lines, i)} />}
            </div>
            {showFit && <FitBadge fit={fits[i]} />}
            <button
              onClick={() => setLines(lines.map((l, j) => (j === i ? { ...l, time: Math.round(useStudioStore.getState().playhead * 100) / 100 } : l)))}
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100 max-lg:opacity-60"
              title="Set this line to the playhead"
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
  const small = "rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:border-brand hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">Move</span>
        {(
          [
            ["−1 bar", -beat * 4],
            ["−1 beat", -beat],
            ["−0.1s", -0.1],
            ["+0.1s", 0.1],
            ["+1 beat", beat],
            ["+1 bar", beat * 4],
          ] as const
        ).map(([label, delta]) => (
          <button key={label} disabled={!synced} onClick={() => move(delta)} className={small}>
            {label}
          </button>
        ))}
        <button
          disabled={!synced}
          onClick={() => setLines(startAt(lines, useStudioStore.getState().playhead))}
          className={small}
          title="Move the whole sheet so its first line starts at the playhead"
        >
          Start at playhead
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">Snap</span>
        <button disabled={!synced} onClick={() => setLines(snapLines(lines, bpm, 1))} className={small}>
          To beats
        </button>
        <button disabled={!synced} onClick={() => setLines(snapLines(lines, bpm, 4))} className={small}>
          To bars
        </button>
        <button disabled={!synced} onClick={() => setLines(clearTimes(lines))} className={small} title="Take every time off, to start again">
          Clear times
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted">On bars</span>
        <label className="flex items-center gap-1 text-muted">
          from bar
          <input
            type="number"
            min={1}
            max={999}
            value={startBar}
            onChange={(e) => setStartBar(Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))))}
            className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-foreground"
          />
        </label>
        <button onClick={() => setStartBar(barAt(useStudioStore.getState().playhead, bpm))} className={small} title="The bar the playhead is in">
          ← playhead
        </button>
        <label className="flex items-center gap-1 text-muted">
          a line every
          <select
            value={barsPerLine}
            onChange={(e) => setPrefs({ barsPerLine: Number(e.target.value) })}
            className="rounded border border-border bg-background px-1 py-0.5 text-foreground"
          >
            <option value={0.5}>½ bar</option>
            <option value={1}>bar</option>
            <option value={2}>2 bars</option>
            <option value={4}>4 bars</option>
          </select>
        </label>
        <button
          onClick={() => setLines(spreadOverBars(lines, bpm, { startBar, barsPerLine }))}
          className="rounded-md bg-brand/15 px-2 py-1 text-[11px] font-semibold text-brand-strong hover:bg-brand/25"
          title="Put every line on the beat, one after another — a bar's rest between verses"
        >
          Lay out
        </button>
      </div>
    </div>
  );
}

function SingTab({ lines, onEdit }: { lines: LyricLine[]; onEdit: () => void }) {
  const setLines = useLyrics((s) => s.setLines);
  const past = useLyrics((s) => s.past);
  const undo = useLyrics((s) => s.undo);
  const prefs = useLyrics((s) => s.prefs);
  const setPrefs = useLyrics((s) => s.setPrefs);
  const bpm = useStudioStore((s) => s.projectBpm);
  const [tapIndex, setTapIndex] = useState<number | null>(null);
  const [tools, setTools] = useState(false);
  const [big, setBig] = useState(false);
  /** The next line with words from `from` on (read from the store, so a key press sees the latest). */
  const nextSung = (from: number) => {
    const all = useLyrics.getState().lines;
    for (let i = from; i < all.length; i++) if (all[i].text) return i;
    return null;
  };

  // Times line `index` at the playhead (less a moment to react) and moves on to the next.
  function tap(index: number | null) {
    if (index === null) return;
    const time = Math.max(0, Math.round((useStudioStore.getState().playhead - TAP_REACTION) * 100) / 100);
    setLines(useLyrics.getState().lines.map((l, i) => (i === index ? { ...l, time } : l)));
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
      <p className="py-6 text-center text-xs text-muted">
        This sheet is empty —{" "}
        <button onClick={onEdit} className="text-brand-strong hover:underline">
          write or paste the words
        </button>
        .
      </p>
    );
  }
  const synced = isSynced(lines);
  const target = syllableTarget(bpm, prefs.style, prefs.barsPerLine);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <PlayButton />
        {tapIndex === null ? (
          <button
            onClick={() => setTapIndex(nextSung(0))}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted hover:border-brand hover:text-foreground"
            title="Play the beat and tap as each line starts — the lines learn their times"
          >
            <Timer /> Tap to time
          </button>
        ) : (
          <>
            <button
              onClick={() => tap(tapIndex)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-vocals px-3 text-xs font-semibold text-white hover:opacity-90"
            >
              <Timer /> Tap — line {tapIndex + 1}
            </button>
            <button onClick={() => setTapIndex(null)} className="h-8 rounded-lg border border-border px-2.5 text-xs text-muted hover:text-foreground">
              Done
            </button>
          </>
        )}
        <button
          onClick={() => setTools((v) => !v)}
          aria-pressed={tools}
          className={`h-8 rounded-lg border px-2.5 text-xs ${tools ? "border-brand text-foreground" : "border-border text-muted hover:text-foreground"}`}
        >
          Fit to beat
        </button>
        <button
          onClick={undo}
          disabled={past.length === 0}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted hover:text-foreground disabled:opacity-40"
          title="Take back the last change to the lyrics"
        >
          <Undo2 /> Undo
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPrefs({ fontSize: Math.max(12, prefs.fontSize - 2) })}
            className="h-8 w-8 rounded-lg border border-border text-xs text-muted hover:text-foreground"
            aria-label="Smaller text"
          >
            A−
          </button>
          <button
            onClick={() => setPrefs({ fontSize: Math.min(36, prefs.fontSize + 2) })}
            className="h-8 w-8 rounded-lg border border-border text-sm text-muted hover:text-foreground"
            aria-label="Bigger text"
          >
            A+
          </button>
          <button
            onClick={() => setBig(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
            title="Full screen, to sing from across the room"
            aria-label="Full screen lyrics"
          >
            <Maximize2 />
          </button>
        </div>
      </div>

      {tapIndex !== null && (
        <p className="text-[11px] text-muted">
          Play the beat, and tap (or press Enter) right as each line starts. Click a line to tap from there; Esc to stop.
        </p>
      )}
      {!synced && tapIndex === null && (
        <p className="text-[11px] text-muted">
          These lines aren&apos;t timed yet. <b>Tap to time</b> them as the beat plays, or <b>Fit to beat → Lay out</b> to put one on every bar.
        </p>
      )}

      {tools && (
        <>
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

      <Prompter lines={lines} tapIndex={tapIndex} onPickTap={setTapIndex} showFit={tools} />
      {big && <BigPrompter lines={lines} onClose={() => setBig(false)} />}
    </div>
  );
}

/** Full screen: the line being sung, big, with the next ones under it. */
function BigPrompter({ lines, onClose }: { lines: LyricLine[]; onClose: () => void }) {
  const current = useCurrentLine(lines);
  const synced = isSynced(lines);
  const [manual, setManual] = useState(0);
  const at = synced ? Math.max(0, current) : manual;
  const sung = (from: number, count: number) => {
    const out: { line: LyricLine; index: number }[] = [];
    for (let i = from; i < lines.length && out.length < count; i++) if (lines[i].text) out.push({ line: lines[i], index: i });
    return out;
  };
  const ahead = sung(at, 4);
  const before = [...lines.slice(0, at)].reverse().find((l) => l.text);

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
    <div className="fixed inset-0 z-[70] flex flex-col bg-background/97 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur" role="dialog" aria-label="Lyrics, full screen">
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
  const setText = useLyrics((s) => s.setText);
  const rename = useLyrics((s) => s.rename);
  const checkpoint = useLyrics((s) => s.checkpoint);
  if (!sheet) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={sheet.title}
          onChange={(e) => rename({ title: e.target.value.slice(0, 200) })}
          placeholder="Song title"
          dir="auto"
          aria-label="Song title"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
        />
        <input
          value={sheet.artist}
          onChange={(e) => rename({ artist: e.target.value.slice(0, 200) })}
          placeholder="Artist (optional)"
          dir="auto"
          aria-label="Artist"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      </div>
      <textarea
        value={sheet.text}
        onFocus={checkpoint}
        onChange={(e) => setText(e.target.value.slice(0, 20_000))}
        dir="auto"
        rows={12}
        spellCheck={false}
        placeholder={"One line of lyrics per line.\nLeave an empty line between verses.\n\nTimes (optional) go first, like this:\n[00:12.50] First line"}
        aria-label="Lyrics"
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">Saved in this browser as you type. Times look like [01:23.45] — you can set them on the Sing tab instead.</p>
        <button onClick={onDone} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong">
          Sing it
        </button>
      </div>
    </div>
  );
}

function FindTab({ onUse }: { onUse: () => void }) {
  const lanes = useStudioStore((s) => s.lanes);
  const create = useLyrics((s) => s.create);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LyricsResult[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // The songs in the mix, to look up in a click.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { title: string; artist: string }[] = [];
    for (const lane of lanes) {
      const title = lane.trackTitle.replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\.(mp3|wav|m4a|flac|ogg)$/i, "").trim();
      if (!title || lane.artistName === "You" || /^studio vocal/i.test(title)) continue;
      const key = `${title}|${lane.artistName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, artist: lane.artistName });
    }
    return out.slice(0, 4);
  }, [lanes]);

  async function search(q: string) {
    const text = q.trim();
    if (!text) return;
    setQuery(text);
    setSearching(true);
    setError(null);
    setOpen(null);
    try {
      const res = await fetch(`/api/lyrics/search?q=${encodeURIComponent(text)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't search");
      setResults(data.results as LyricsResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't search");
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function use(result: LyricsResult) {
    create({ title: result.title, artist: result.artist, text: result.synced ?? result.plain ?? "", source: "library" });
    onUse();
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Song name, and artist"
          dir="auto"
          aria-label="Search lyrics"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
        />
        <button type="submit" disabled={searching || !query.trim()} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          <Search /> {searching ? "Looking…" : "Find"}
        </button>
      </form>
      {suggestions.length > 0 && !results && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          In your mix:
          {suggestions.map((s) => (
            <button
              key={`${s.title}|${s.artist}`}
              onClick={() => void search(`${s.title} ${s.artist}`.trim())}
              className="max-w-[14rem] truncate rounded-full border border-border px-2 py-0.5 hover:border-brand hover:text-foreground"
              dir="auto"
            >
              {s.title}
              {s.artist ? ` — ${s.artist}` : ""}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {results && results.length === 0 && <p className="py-3 text-center text-xs text-muted">No lyrics found — try fewer words, or paste them in yourself.</p>}
      {results && results.length > 0 && (
        <ul className="flex max-h-[22rem] flex-col gap-1 overflow-y-auto overscroll-contain">
          {results.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="min-w-0 flex-1 text-left">
                  <p dir="auto" className="truncate text-sm font-medium">
                    {r.title}
                  </p>
                  <p dir="auto" className="truncate text-[11px] text-muted">
                    {[r.artist, r.album, r.duration ? formatClock(r.duration) : ""].filter(Boolean).join(" · ")}
                  </p>
                </button>
                {r.synced ? (
                  <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success" title="Every line has its time — they'll follow the song">
                    Timed
                  </span>
                ) : r.instrumental ? (
                  <span className="shrink-0 text-[10px] text-muted">Instrumental</span>
                ) : null}
                <button
                  onClick={() => use(r)}
                  disabled={r.instrumental && !r.plain && !r.synced}
                  className="shrink-0 rounded-lg bg-vocals px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  Use
                </button>
              </div>
              {open === r.id && (
                <pre dir="auto" className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-muted">
                  {(r.plain ?? r.synced ?? "").slice(0, 1500)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">
        Lyrics from LRCLIB, an open lyrics library. Timed lyrics follow the original song — on another beat, move them with <b>Start at playhead</b> or tap them in again on the Sing tab.
      </p>
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
          lyrics: plainText(lines),
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
    if (draft.mode === "fit") setLines(keepTimes(lines, draft.lines));
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
          className="rounded-lg bg-brand px-2.5 py-1.5 font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
          title="Carry on from your last line, in your style and rhyme"
        >
          {busy === "complete" ? "Writing…" : "Finish it"}
        </button>
        <button
          onClick={() => void ask("write")}
          disabled={!!busy}
          className="rounded-lg border border-brand px-2.5 py-1.5 font-semibold text-brand-strong hover:bg-brand/10 disabled:opacity-40"
          title="New lines from your idea"
        >
          {busy === "write" ? "Writing…" : "Write new lines"}
        </button>
        <button
          onClick={() => void ask("fit")}
          disabled={!!busy || !hasWords}
          className="rounded-lg border border-vocals px-2.5 py-1.5 font-semibold text-foreground hover:bg-vocals/10 disabled:opacity-40"
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
        <div className="rounded-lg border border-brand/50 bg-brand/5 p-2">
          <p className="mb-1 text-[11px] font-semibold text-muted">
            {draft.mode === "fit" ? "Rewritten to fit — each line keeps its time:" : "New lines:"}
          </p>
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
            <button onClick={accept} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-strong">
              {draft.mode === "fit" ? "Use these" : sheet ? "Add to the lyrics" : "Make a sheet"}
            </button>
            <button onClick={() => void ask(draft.mode)} disabled={!!busy} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40">
              Try again
            </button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground">
              Discard
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted">Uses the AI producer&apos;s key and model. Changes can be taken back with Undo on the Sing tab.</p>
    </div>
  );
}

/**
 * Lyrics to sing from while the beat plays — and to record a vocal with
 * (the recorder shows them too).
 */
export default function LyricsPanel() {
  const open = useLyrics((s) => s.panelOpen);
  const setOpen = useLyrics((s) => s.setPanelOpen);
  const load = useLyrics((s) => s.load);
  const sheets = useLyrics((s) => s.sheets);
  const activeId = useLyrics((s) => s.activeId);
  const lines = useLyrics((s) => s.lines);
  const select = useLyrics((s) => s.select);
  const create = useLyrics((s) => s.create);
  const remove = useLyrics((s) => s.remove);
  const sheet = useLyrics(activeSheet);
  const [tab, setTab] = useState<Tab>("sing");

  useEffect(() => load(), [load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-vocals hover:text-foreground"
      >
        <ScrollText /> Lyrics{sheet ? ` — ${sheet.title}` : ""}
      </button>
    );
  }

  const shownTab: Tab = !sheet && (tab === "sing" || tab === "edit") ? "find" : tab;
  const tabs: [Tab, string][] = [
    ["sing", "Sing"],
    ["edit", "Edit"],
    ["find", "Find a song"],
    ["ai", "Write with AI"],
  ];

  return (
    <section aria-label="Lyrics" className="rounded-xl border border-vocals/40 bg-vocals/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">
          <ScrollText className="text-vocals" /> Lyrics
        </p>
        <select
          value={activeId ?? ""}
          onChange={(e) => {
            select(e.target.value || null);
            setTab("sing");
          }}
          aria-label="Lyric sheet"
          className="min-w-0 max-w-[16rem] flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs"
        >
          {!sheet && <option value="">No sheet open</option>}
          {sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.artist ? ` — ${s.artist}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            create({ title: "My lyrics", artist: "", text: "", source: "own" });
            setTab("edit");
          }}
          className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted hover:text-foreground"
          title="A new, empty sheet to write or paste into"
        >
          <Plus /> New
        </button>
        {sheet && (
          <button
            onClick={() => window.confirm(`Delete the lyrics “${sheet.title}”?`) && remove(sheet.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:text-danger"
            aria-label="Delete this lyric sheet"
            title="Delete this lyric sheet"
          >
            <Trash2 />
          </button>
        )}
        <button onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-foreground" aria-label="Close lyrics">
          <X />
        </button>
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto border-b border-border text-xs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={shownTab === id}
            disabled={!sheet && (id === "sing" || id === "edit")}
            onClick={() => setTab(id)}
            className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-1.5 disabled:opacity-40 ${
              shownTab === id ? "border-vocals font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {id === "find" ? <Search /> : id === "ai" ? <Sparkles /> : id === "edit" ? <FileText /> : null}
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {shownTab === "sing" && <SingTab lines={lines} onEdit={() => setTab("edit")} />}
        {shownTab === "edit" && <EditTab onDone={() => setTab("sing")} />}
        {shownTab === "find" && <FindTab onUse={() => setTab("sing")} />}
        {shownTab === "ai" && <AiTabView lines={lines} onDone={() => setTab("sing")} />}
      </div>
    </section>
  );
}

/**
 * The lyrics for the recorder: the line being sung and the next ones,
 * following the playhead — or the whole sheet, when it isn't timed.
 */
export function LyricsCue() {
  const load = useLyrics((s) => s.load);
  const lines = useLyrics((s) => s.lines);
  const sheet = useLyrics(activeSheet);
  const fontSize = useLyrics((s) => s.prefs.fontSize);
  const setPanelOpen = useLyrics((s) => s.setPanelOpen);
  const current = useCurrentLine(lines);
  useEffect(() => load(), [load]);

  if (!sheet || !lines.some((l) => l.text)) {
    return (
      <button onClick={() => setPanelOpen(true)} className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
        <ScrollText /> Add lyrics to sing from
      </button>
    );
  }

  if (!isSynced(lines)) {
    return (
      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-background/60 px-3 py-2" aria-label="Lyrics">
        {lines.map((line, i) =>
          line.text ? (
            <p key={i} dir="auto" className="leading-snug" style={{ fontSize }}>
              {line.text}
            </p>
          ) : (
            <div key={i} className="h-3" />
          )
        )}
      </div>
    );
  }

  const shown: number[] = [];
  for (let i = Math.max(0, current); i < lines.length && shown.length < 3; i++) if (lines[i].text) shown.push(i);
  const previous = current > 0 ? [...lines.slice(0, current)].reverse().find((l) => l.text) : undefined;
  return (
    <div className="mt-2 rounded-lg bg-background/60 px-3 py-2" aria-label="Lyrics" aria-live="polite">
      {previous && (
        <p dir="auto" className="truncate text-xs text-muted/60">
          {previous.text}
        </p>
      )}
      {shown.map((i, k) => (
        <div key={i}>
          <p
            dir="auto"
            className={k === 0 && current >= 0 ? "font-semibold leading-snug text-foreground" : "leading-snug text-muted"}
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
