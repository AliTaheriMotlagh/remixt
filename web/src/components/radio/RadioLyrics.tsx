"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsLeft, ChevronsRight, EyeOff, Loader2, Lock, Mic2, RotateCcw, Search, Users, X } from "lucide-react";
import { lineAt, type LyricLine, type LyricsResult } from "@/lib/lyrics";
import { rankByVoice } from "@/lib/lyricsFit";
import type { QueueRow } from "@/lib/radio";
import { choiceLrc, voiceOf } from "@/lib/client/itemWords";
import { searchLyrics } from "@/lib/client/lyricsSources";
import { choiceFromResult, useRadioWords, type RadioWords, type WordsContext } from "@/lib/client/radioLyrics";
import { lockScreenWords, setLockScreenWords } from "@/lib/client/radioClient";
import { lineDirection } from "@/lib/rtlText";

// The words of the vocal on air, karaoke style: the line being sung fills
// in as it's sung (right to left for Persian), the next one waits under
// it, the one before fades above. Follows the station's clock, so it's
// right whether this tab is tuned in or not. The line sung is on the lock
// screen too (radioClient.ts), unless switched off here.
//
// "Wrong words?" puts them right: search and pick another sheet (timed
// ones placed on the song as heard; words only, timed from the singing),
// nudge them earlier or later, or show none — for this device, or (the
// song's owner) for everyone.

/** A line fills over its time, but never slower than this (a long gap after the last line of a verse). */
const MAX_FILL = 7;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Line({ line, role, big }: { line: LyricLine | undefined; role: "before" | "now" | "next"; big: boolean }) {
  const text = line?.text ?? "";
  const dir = lineDirection(text);
  const size = role === "now" ? (big ? "text-[2.6em]" : "text-xl sm:text-2xl") : big ? "text-[1.5em]" : "text-sm sm:text-base";
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
          {text || " "}
        </span>
      ) : (
        text || " "
      )}
    </p>
  );
}

function noteOf(words: RadioWords): string | null {
  switch (words.status) {
    case "loading":
      return "Finding the words…";
    case "instrumental":
      return "Instrumental: no vocal on this one";
    case "own":
      return "Sung in the maker's own words — not in any lyrics library";
    case "none":
      return `No words found that surely fit${words.song ? ` “${words.song}”` : ""}`;
    case "hidden":
      return words.from === "mine" ? "Words hidden for this song (on this device)" : "Its owner chose to show no words";
    default:
      return null;
  }
}

/** "Wrong words?": pick other words, nudge them, or none — for me or for everyone. */
function Fixer({
  context,
  words,
  canSet,
  chosen,
  hasShared,
  choose,
  onClose,
}: {
  context: WordsContext;
  words: RadioWords;
  canSet: boolean;
  chosen: boolean;
  hasShared: boolean;
  choose: (choice: Parameters<ReturnType<typeof useRadioWords>["choose"]>[0], everyone?: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const first = context.sung[0];
  const [query, setQuery] = useState(first ? `${first.artist} ${first.song}`.trim() : "");
  const [results, setResults] = useState<LyricsResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lane = first?.lane ?? context.lanes.find((l) => l.kind === "vocals") ?? null;
  const voice = useMemo(() => (lane ? voiceOf(lane) : null), [lane]);
  const ranked = useMemo(() => rankByVoice(results ?? [], voice), [results, voice]);

  const search = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ q: q.trim().slice(0, 200) });
      if (lane?.originalDuration) params.set("duration", String(Math.round(lane.originalDuration)));
      setResults((await searchLyrics(params)).results.filter((r) => !r.instrumental && (r.synced || r.plain)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't search");
    } finally {
      setBusy(false);
    }
  };
  // Searched at once for the song's name: most of the time the right sheet is in the first few.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one search as the panel opens
    void search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (choice: Parameters<typeof choose>[0], done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await choose(choice, everyone);
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  const nudge = (by: number) => {
    if (words.status !== "ready") return;
    void save({ lrc: choiceLrc(words.lines), shift: by, noWords: false, song: words.song }, by < 0 ? "Earlier by half a second" : "Later by half a second");
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 text-sm" role="region" aria-label="Put the words right">
      <div className="flex items-center gap-2">
        <p className="font-bold">Put the words right</p>
        <button type="button" onClick={onClose} className="ml-auto flex size-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {canSet && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1 text-xs font-semibold" role="radiogroup" aria-label="Who sees the change">
          {(
            [
              [false, "Just me", "this device"],
              [true, "Everyone", "it's your song"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={everyone === value}
              onClick={() => setEveryone(value)}
              className={`flex min-h-11 flex-col items-center justify-center rounded-lg ${everyone === value ? "bg-white text-black" : "text-white/75 hover:text-white"}`}
            >
              <span className="flex items-center gap-1">
                {value && <Users className="size-3.5" />} {label}
              </span>
              <span className="text-[10px] font-normal opacity-70">{hint}</span>
            </button>
          ))}
        </div>
      )}
      {words.status === "ready" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70">Out of time?</span>
          <button type="button" disabled={busy} onClick={() => nudge(-0.5)} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs font-semibold hover:bg-white/20">
            <ChevronsLeft className="size-4" /> Earlier
          </button>
          <button type="button" disabled={busy} onClick={() => nudge(0.5)} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs font-semibold hover:bg-white/20">
            Later <ChevronsRight className="size-4" />
          </button>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/10 px-3">
          <Search className="size-4 shrink-0 text-white/60" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="The song's name and singer" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/40" aria-label="Search for the words" />
        </label>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Search"}
        </button>
      </form>
      {results && (
        <ul className="max-h-60 overflow-y-auto overscroll-contain rounded-xl bg-black/30 p-1">
          {ranked.length === 0 && <li className="p-3 text-xs text-white/60">Nothing found — try the singer&apos;s name in English letters, or another spelling.</li>}
          {ranked.slice(0, 12).map(({ result, fit }) => (
            <li key={`${result.id}-${result.title}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const choice = choiceFromResult(result, context);
                  if (!choice) return setMessage("Those words can't be lined up with this song's singing — try another.");
                  void save(choice, `Showing “${result.title}”${everyone ? " for everyone" : ""}`);
                }}
                className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-white/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{result.title}</span>
                  <span className="block truncate text-xs text-white/60">
                    {result.artist}
                    {result.duration ? ` · ${clock(result.duration)}` : ""} · {result.synced ? "timed" : "words only — timed from the singing"}
                  </span>
                </span>
                {fit && fit.score >= 0.7 && <span className="shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">fits the singing</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ lrc: "", shift: 0, noWords: true, song: first?.song ?? "" }, "No words for this song")}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold hover:bg-white/20"
        >
          <EyeOff className="size-4" /> Show no words
        </button>
        {(chosen || (everyone && hasShared)) && (
          <button type="button" disabled={busy} onClick={() => void save(null, "Back to the words found by themselves")} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold hover:bg-white/20">
            <RotateCcw className="size-4" /> {everyone ? "Back to the found words for everyone" : "Back to the found words"}
          </button>
        )}
      </div>
      {message && (
        <p className="flex items-center gap-1.5 text-xs text-white/80" role="status">
          <Check className="size-3.5" /> {message}
        </p>
      )}
    </div>
  );
}

export default function RadioLyrics({
  slug,
  row,
  position,
  big = false,
  onWords,
}: {
  slug: string;
  row: QueueRow | null;
  position: () => number;
  big?: boolean;
  /** The lines on air (for the lock screen), or null. */
  onWords?: (rowId: number, lines: LyricLine[] | null) => void;
}) {
  const { words, canSet, context, chosen, hasShared, choose } = useRadioWords(slug, row ? { kind: row.kind, id: row.id, duration: row.duration } : null);
  const lines = words.status === "ready" ? words.lines : null;
  const [index, setIndex] = useState(-1);
  const [fixing, setFixing] = useState(false);
  const [lockOn, setLockOn] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a preference read from this browser once
    setLockOn(lockScreenWords());
  }, []);
  useEffect(() => {
    if (row) onWords?.(row.rowId, lines);
  }, [row, lines, onWords]);

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
  const label = words.status === "ready" ? `${words.song}${words.from === "mine" ? " · your pick" : words.from === "everyone" ? " · set by its owner" : ""}` : null;
  const note = noteOf(words);
  const before = lines && index > 0 ? lines[index - 1] : undefined;
  const now = lines && index >= 0 ? lines[index] : undefined;
  const next = lines ? lines[index + 1] : undefined;
  const small = big ? "text-[0.8em]" : "text-[10px]";

  return (
    <div ref={box} className={`min-w-0 rounded-2xl bg-black/30 ring-1 ring-white/10 backdrop-blur ${big ? "p-[1em]" : "px-4 py-3"}`} aria-label="Lyrics" role="group">
      <div className={`mb-1.5 flex items-center gap-1.5 font-black uppercase tracking-[0.18em] text-white/55 ${small}`}>
        <Mic2 className={big ? "size-[1.2em]" : "size-3"} /> Lyrics
        {label ? <span className="min-w-0 truncate normal-case tracking-normal text-white/40">· {label}</span> : null}
        {!big && (
          <span className="ml-auto flex shrink-0 items-center gap-1 normal-case tracking-normal">
            <button
              type="button"
              aria-pressed={lockOn}
              onClick={() => {
                setLockOn(!lockOn);
                setLockScreenWords(!lockOn);
              }}
              title={lockOn ? "The line sung shows on the lock screen" : "Not on the lock screen"}
              className={`flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold ${lockOn ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}
            >
              <Lock className="size-3" /> Lock screen
            </button>
            {context && words.status !== "loading" && words.status !== "instrumental" && (
              <button type="button" onClick={() => setFixing((v) => !v)} aria-expanded={fixing} className="min-h-8 rounded-full px-2 font-semibold text-white/70 hover:bg-white/10 hover:text-white">
                {words.status === "ready" ? "Wrong words?" : "Find the words"}
              </button>
            )}
          </span>
        )}
      </div>
      {note ? (
        <p className={`text-white/60 ${big ? "text-[1.3em]" : "text-sm"} ${words.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`}>{note}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <Line line={before} role="before" big={big} />
          {/* The line's own key: a new line comes in fresh, its fill from the start. */}
          <Line key={index} line={now ?? (index < 0 ? { time: null, text: "♪" } : undefined)} role="now" big={big} />
          <Line line={next} role="next" big={big} />
        </div>
      )}
      {fixing && context && <Fixer context={context} words={words} canSet={canSet} chosen={chosen} hasShared={hasShared} choose={choose} onClose={() => setFixing(false)} />}
    </div>
  );
}
