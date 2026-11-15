"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, Headphones, Minus, Plus, RotateCcw, Share2, Square, X } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { fileSafeName } from "@/lib/client/audioTags";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { saveFile } from "@/lib/client/saveFile";
import { drawClipPreview, makeSocialClip, type SocialClip } from "@/lib/client/socialClip";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { useKeepScreenOn } from "@/lib/client/wakeLock";
import { clampRange, clipLyrics, clipParts, defaultPart, lineRange, MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, type ClipPart } from "@/lib/clipLyrics";
import { formatClock, isSung, sectionsOf } from "@/lib/lyrics";
import { shortPath } from "@/lib/shareLinks";
import { togglePlay } from "./LyricsPanel";

// "Make a clip": a vertical video of a part of the song for Reels, TikTok,
// Shorts and Stories. It asks which part first — the loop, a section of the
// song (from the timed lyrics), from one line to another, a stretch from
// the playhead, or a range dragged on the song — lets it be heard, and puts
// the lyrics on the video when they're timed. The preview follows the
// Studio while that part plays, and the video draws itself in the dialog
// while it's made. A tap outside never cancels a clip being made.

type Range = { start: number; end: number };

/** The song as a bar: the chosen part highlighted, its edges and middle draggable, the sung lines as ticks. */
function RangeBar({ range, duration, ticks, onChange }: { range: Range; duration: number; ticks: number[]; onChange: (range: Range) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "start" | "end" | "move"; x: number; range: Range } | null>(null);
  const playhead = useStudioStore((s) => Math.round(s.playhead * 4) / 4);
  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / duration) * 100}%`;

  const down = (mode: "start" | "end" | "move", e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, range };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const width = bar.current?.clientWidth ?? 0;
    if (!d || !width) return;
    const delta = ((e.clientX - d.x) / width) * duration;
    if (d.mode === "move") onChange(clampRange(d.range.start + delta, d.range.end + delta, duration));
    else if (d.mode === "start") onChange(clampRange(Math.min(d.range.end - MIN_CLIP_SECONDS, d.range.start + delta), d.range.end, duration));
    else onChange(clampRange(d.range.start, Math.max(d.range.start + MIN_CLIP_SECONDS, d.range.end + delta), duration));
  };
  const up = () => (drag.current = null);
  // A tap on the bar outside the part moves the part there, keeping its length.
  const jump = (e: ReactPointerEvent) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box) return;
    const at = ((e.clientX - box.left) / box.width) * duration;
    const length = range.end - range.start;
    onChange(clampRange(at - length / 2, at + length / 2, duration));
  };

  return (
    <div
      ref={bar}
      onPointerDown={jump}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative h-12 touch-none select-none rounded-lg bg-background"
      aria-label="The part of the song in the clip"
    >
      {ticks.map((t, i) => (
        <span key={i} className="absolute bottom-1 top-1 w-px bg-vocals/40" style={{ left: pct(t) }} aria-hidden />
      ))}
      <span className="absolute bottom-0 top-0 w-0.5 bg-foreground/60" style={{ left: pct(playhead) }} aria-hidden />
      <div
        onPointerDown={(e) => down("move", e)}
        className="absolute bottom-0 top-0 cursor-grab rounded-md border-2 border-vocals bg-vocals/25 active:cursor-grabbing"
        style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }}
        role="presentation"
      >
        <span
          onPointerDown={(e) => down("start", e)}
          className="absolute -left-2 bottom-0 top-0 flex w-4 cursor-ew-resize items-center justify-center"
          aria-hidden
        >
          <span className="h-6 w-1.5 rounded-full bg-vocals" />
        </span>
        <span
          onPointerDown={(e) => down("end", e)}
          className="absolute -right-2 bottom-0 top-0 flex w-4 cursor-ew-resize items-center justify-center"
          aria-hidden
        >
          <span className="h-6 w-1.5 rounded-full bg-vocals" />
        </span>
      </div>
    </div>
  );
}

/** −1 s / +1 s on one edge, for when dragging is too rough (a phone). */
function Nudge({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  const button = "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-vocals hover:text-foreground max-lg:h-10 max-lg:w-10";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-10 text-[11px] text-muted">{label}</span>
      <button onClick={() => onChange(-1)} className={button} aria-label={`${label} a second earlier`}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-11 text-center text-xs font-semibold tabular-nums">{formatClock(value)}</span>
      <button onClick={() => onChange(1)} className={button} aria-label={`${label} a second later`}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ClipDialog({ title, artist, remixId }: { title: string; artist: string; remixId: string | null }) {
  const ask = useStudioView((s) => s.clip);
  const closeClip = useStudioView((s) => s.closeClip);
  const duration = useStudioStore((s) => s.duration);
  const lines = useLyrics((s) => s.lines);
  const sheet = useLyrics(activeSheet);

  // The parts on offer, worked out when the dialog opens (not on every playhead move).
  const parts = useMemo<ClipPart[]>(() => {
    const s = useStudioStore.getState();
    const found = clipParts({ lines, loop: { enabled: s.loopEnabled, start: s.loopStart, end: s.loopEnd }, playhead: s.playhead, duration });
    if (ask?.part) found.unshift({ id: "asked", label: ask.part.label, kind: "custom", ...clampRange(ask.part.start, ask.part.end, duration) });
    return found;
  }, [ask, lines, duration]);

  const [partId, setPartId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>({ start: 0, end: 0 });
  const [askId, setAskId] = useState<number | null>(null);
  // A fresh ask (opened again, or on another take) starts on its part.
  if (ask && ask.id !== askId) {
    setAskId(ask.id);
    const first = ask.part ? parts[0] : defaultPart(parts, useStudioStore.getState().playhead);
    setPartId(first?.id ?? null);
    setRange(first ? { start: first.start, end: first.end } : clampRange(0, 30, duration));
  }

  const sungLines = useMemo(() => lines.map((l, i) => ({ l, i })).filter(({ l }) => l.time !== null && isSung(l)), [lines]);
  const [fromLine, setFromLine] = useState<number | null>(null);
  const [toLine, setToLine] = useState<number | null>(null);

  const words = useMemo(() => clipLyrics(lines, range.start, range.end), [lines, range]);
  const [showLyrics, setShowLyrics] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [by, setBy] = useState<string | null>(null);
  const clipTitle = (name ?? ((/^untitled/i.test(title) && sheet?.title) || title)).trim() || "Untitled";
  const clipArtist = (by ?? (sheet?.artist && /^untitled/i.test(title) ? sheet.artist : artist)).trim();
  const link = `${typeof window === "undefined" ? "" : window.location.host}${remixId ? shortPath(remixId) : ""}`;
  const look = useMemo(
    () => ({ title: clipTitle, artist: clipArtist, link, lyrics: showLyrics && words.length ? words : undefined }),
    [clipTitle, clipArtist, link, showLyrics, words]
  );

  const [stage, setStage] = useState<{ label: string; fraction: number } | null>(null);
  const [clip, setClip] = useState<{ clip: SocialClip; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hearing, setHearing] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useKeepScreenOn("social-clip", stage !== null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  // The still preview: the first words part sung, or the start. While the part is being heard it follows the Studio.
  useEffect(() => {
    if (!ask || stage || clip || !canvas.current) return;
    const length = range.end - range.start;
    const first = look.lyrics?.find((l) => l.start >= 0) ?? look.lyrics?.[0];
    const still = first ? Math.max(0, first.start + first.wipe * 0.5) : 0;
    const draw = (playhead: number) => {
      if (!canvas.current) return;
      const t = hearing && playhead >= range.start && playhead <= range.end ? playhead - range.start : still;
      drawClipPreview(canvas.current, look, t, length);
    };
    draw(useStudioStore.getState().playhead);
    if (!hearing) return;
    return useStudioStore.subscribe((s, prev) => {
      if (s.playhead === prev.playhead) return;
      draw(s.playhead);
      // Heard to its end: stop there.
      if (s.isPlaying && s.playhead >= range.end) {
        void togglePlay();
        setHearing(false);
      }
    });
  }, [ask, stage, clip, look, range, hearing]);

  if (!ask) return null;

  const working = stage !== null;
  const pick = (part: ClipPart) => {
    setPartId(part.id);
    setRange({ start: part.start, end: part.end });
    setFromLine(null);
    setToLine(null);
  };
  const custom = (next: Range) => {
    setPartId(null);
    setRange(next);
  };
  const pickLines = (from: number | null, to: number | null) => {
    setFromLine(from);
    setToLine(to);
    if (from === null) return;
    const next = lineRange(lines, from, to ?? from, duration);
    if (next) custom(next);
  };

  function hear() {
    if (hearing) {
      if (useStudioStore.getState().isPlaying) void togglePlay();
      setHearing(false);
      return;
    }
    audioEngine.seek(range.start);
    if (!useStudioStore.getState().isPlaying) void togglePlay();
    setHearing(true);
  }

  function close() {
    if (working) return;
    if (hearing && useStudioStore.getState().isPlaying) void togglePlay();
    setHearing(false);
    setClip(null);
    setError(null);
    closeClip();
  }

  async function make() {
    // Made inside the tap, or iOS won't let it play the soundtrack.
    const audioContext = new AudioContext();
    void audioContext.resume();
    if (useStudioStore.getState().isPlaying) void togglePlay();
    setHearing(false);
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setClip(null);
    setStage({ label: "Starting…", fraction: 0 });
    try {
      const made = await makeSocialClip({
        audioContext,
        start: range.start,
        end: range.end,
        ...look,
        canvas: canvas.current ?? undefined,
        onProgress: (label, fraction) => setStage({ label, fraction }),
        signal: controller.signal,
      });
      setClip({ clip: made, url: URL.createObjectURL(made.blob) });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Couldn't make the clip");
    } finally {
      setStage(null);
      abort.current = null;
      void audioContext.close();
    }
  }

  async function share() {
    if (!clip) return;
    const file = new File([clip.clip.blob], `${fileSafeName(`${clipArtist} - ${clipTitle}`)}.${clip.clip.extension}`, { type: clip.clip.blob.type });
    // A clip is made to be posted: the share sheet wherever there is one, phone or not.
    await saveFile(file, { share: true });
  }

  const length = range.end - range.start;
  const ticks = sungLines.map(({ l }) => l.time!);
  const hasTimedWords = sungLines.length > 0;
  const chip = (on: boolean) =>
    `flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
      on ? "border-vocals bg-vocals text-white" : "border-border text-muted hover:border-vocals hover:text-foreground"
    }`;
  const sections = sectionsOf(lines).filter((s) => s.start !== null).length;

  // On the page itself: the transport it's opened from is a containing block (blur, sticky) that would clip it.
  return createPortal(
    <>
      {/* Not a way out while the clip is being made: a stray tap would throw it away. */}
      <div className="fixed inset-0 z-[70] bg-black/60" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-label="Make a clip"
        className="touch-targets fixed z-[71] flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden border border-border bg-surface-raised shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl sm:left-1/2 sm:top-1/2 sm:w-[min(52rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        style={{ animation: "sheet-in 0.18s ease-out" }}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-vocals/15 text-vocals">
            <Clapperboard />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Make a clip</h2>
            <p className="truncate text-[11px] text-muted">A vertical video for Reels, TikTok, Shorts and Stories · up to {MAX_CLIP_SECONDS} s</p>
          </div>
          <button onClick={close} disabled={working} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-30" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:flex-row">
          {/* The video: a still of it, the part playing, or the clip being made. */}
          <div className="flex shrink-0 flex-col items-center gap-2 sm:w-56">
            {clip ? (
              <video src={clip.url} controls playsInline autoPlay className="aspect-[9/16] w-40 rounded-xl bg-black sm:w-56" />
            ) : (
              <canvas ref={canvas} className="aspect-[9/16] w-40 rounded-xl bg-black shadow-lg sm:w-56" aria-label="Preview of the clip" />
            )}
            {!clip && !working && (
              <button onClick={hear} className={chip(hearing)} title="Play this part in the Studio — the preview follows it">
                {hearing ? <Square className="h-3.5 w-3.5" /> : <Headphones />} {hearing ? "Stop" : "Hear this part"}
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {working ? (
              <div className="flex flex-1 flex-col justify-center gap-2" role="status">
                <p className="text-sm font-semibold">{stage.label}</p>
                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div className="h-full bg-gradient-to-r from-vocals to-beat transition-[width]" style={{ width: `${stage.fraction * 100}%` }} />
                </div>
                <p className="text-xs text-muted">
                  It records in real time — {Math.round(length)} s of music takes {Math.round(length)} s. Keep this tab open; the preview shows the video as it&apos;s made.
                </p>
                <button onClick={() => abort.current?.abort()} className="mt-1 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-danger hover:text-danger">
                  Stop and throw it away
                </button>
              </div>
            ) : clip ? (
              <div className="flex flex-1 flex-col justify-center gap-3">
                <p className="text-sm font-semibold">Your clip is ready</p>
                <p className="text-xs text-muted">
                  {formatClock(range.start)}–{formatClock(range.end)} · {Math.round(length)} s{look.lyrics ? " · with the lyrics" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={share} className="flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-4 text-sm font-semibold text-white hover:opacity-90">
                    <Share2 /> Share / save
                  </button>
                  <button onClick={() => setClip(null)} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted hover:text-foreground">
                    <RotateCcw /> Make another
                  </button>
                </div>
                {clip.clip.extension === "webm" && (
                  <p className="text-[11px] text-muted">This browser records WebM; most apps take it, but Instagram may want MP4 — Safari and newer Chrome make MP4.</p>
                )}
              </div>
            ) : (
              <>
                <section className="flex flex-col gap-2" aria-label="Which part">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">1 · Which part of the song?</p>
                  <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
                    {parts.map((p) => (
                      <button key={p.id} onClick={() => pick(p)} aria-pressed={partId === p.id} className={chip(partId === p.id)}>
                        <span dir="auto" className="max-w-[10rem] truncate">
                          {p.label}
                        </span>
                        <span className="font-normal tabular-nums opacity-70">{Math.round(p.end - p.start)} s</span>
                      </button>
                    ))}
                    <span className={chip(partId === null)}>{partId === null ? "Your own part" : "Or drag your own below"}</span>
                  </div>
                  {!sections && <p className="text-[11px] text-muted">Time the lyrics to pick the song&apos;s parts (verse, chorus…) here.</p>}
                </section>

                <section className="flex flex-col gap-2" aria-label="Fine tune">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">2 · Fine tune</p>
                    <p className="text-xs font-semibold tabular-nums">
                      {formatClock(range.start)}–{formatClock(range.end)} · {Math.round(length)} s
                    </p>
                  </div>
                  <RangeBar range={range} duration={Math.max(1, duration)} ticks={ticks} onChange={custom} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <Nudge label="Starts" value={range.start} onChange={(d) => custom(clampRange(Math.min(range.end - MIN_CLIP_SECONDS, range.start + d), range.end, duration))} />
                    <Nudge label="Ends" value={range.end} onChange={(d) => custom(clampRange(range.start, Math.max(range.start + MIN_CLIP_SECONDS, range.end + d), duration))} />
                  </div>
                  {hasTimedWords && (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {(["from", "to"] as const).map((edge) => (
                        <label key={edge} className="flex min-w-0 items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 text-muted">{edge === "from" ? "From line" : "To line"}</span>
                          <select
                            value={(edge === "from" ? fromLine : toLine) ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              if (edge === "from") pickLines(v, toLine !== null && v !== null && toLine < v ? v : toLine);
                              else pickLines(fromLine ?? v, v);
                            }}
                            dir="auto"
                            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs max-lg:h-10 max-lg:text-base"
                          >
                            <option value="">{edge === "from" ? "Pick a line…" : "Same line"}</option>
                            {sungLines
                              .filter(({ i }) => edge === "from" || fromLine === null || i >= fromLine)
                              .map(({ l, i }) => (
                                <option key={i} value={i}>
                                  {formatClock(l.time!)} · {l.text.slice(0, 48)}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </section>

                <section className="flex flex-col gap-2" aria-label="On the video">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">3 · On the video</p>
                  <label className={`flex items-center gap-2 text-xs ${words.length ? "" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      checked={showLyrics && words.length > 0}
                      disabled={!words.length}
                      onChange={(e) => setShowLyrics(e.target.checked)}
                      className="h-4 w-4"
                      style={{ accentColor: "var(--vocals)" }}
                    />
                    <span>
                      Show the lyrics, karaoke-style
                      <span className="block text-[11px] text-muted">
                        {words.length
                          ? `${words.length} line${words.length === 1 ? "" : "s"} in this part`
                          : hasTimedWords
                            ? "No lyrics are sung in this part"
                            : lines.some(isSung)
                              ? "Time the lyrics first (Lyrics tab) to put them on the video"
                              : "No lyrics open — pick some to put them on the video"}
                      </span>
                    </span>
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <input
                      value={name ?? clipTitle}
                      onChange={(e) => setName(e.target.value.slice(0, 120))}
                      dir="auto"
                      aria-label="Title on the video"
                      placeholder="Title"
                      className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-xs max-lg:h-10 max-lg:text-base"
                    />
                    <input
                      value={by ?? clipArtist}
                      onChange={(e) => setBy(e.target.value.slice(0, 80))}
                      dir="auto"
                      aria-label="Name on the video"
                      placeholder="Your name"
                      className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-xs max-lg:h-10 max-lg:text-base"
                    />
                  </div>
                  {!remixId && <p className="text-[11px] text-muted">Save the remix first to put its short link on the video.</p>}
                </section>
              </>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        {!working && !clip && (
          <footer className="flex items-center gap-2 border-t border-border px-4 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted">Takes about {Math.round(length)} s to make — it records in real time.</p>
            <button
              onClick={() => void make()}
              disabled={length < MIN_CLIP_SECONDS || duration <= 0}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-vocals px-5 text-sm font-semibold text-white shadow-lg shadow-vocals/25 hover:opacity-90 disabled:opacity-40"
            >
              <Clapperboard /> Make the clip
            </button>
          </footer>
        )}
      </div>
    </>,
    document.body
  );
}
