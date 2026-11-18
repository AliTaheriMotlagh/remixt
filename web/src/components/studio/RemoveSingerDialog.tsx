"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Hand, Info, Loader2, Music2, Pause, Play, RotateCcw, Scissors, Sparkles, Square, UserMinus, Users, X } from "lucide-react";
import { parseLyrics, type LyricLine } from "@/lib/lyrics";
import { audioEngine } from "@/lib/client/audioEngine";
import { removeTime, shiftMarkers } from "@/lib/client/clipEdit";
import { namedLyricsFor } from "@/lib/client/lyricsSources";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import {
  fingerprint,
  groupVoices,
  likeThese,
  linesOutside,
  lyricSections,
  mergeSpans,
  onTimeline,
  performers,
  phrasesIn,
  phrasesOf,
  rmsCurve,
  toBars,
  withoutSpans,
  type Span,
  type SungSection,
} from "@/lib/client/singerParts";
import { fetchStem } from "@/lib/client/stemFetch";
import { startNewStep } from "@/lib/client/studioHistory";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";

// "Remove a singer…" on a vocal lane: who sings where, and that singer's
// parts taken out — keeping the music playing there or cutting the time
// out of the song. One undo step. Logic in singerParts.ts.
//
// It works it out by itself as it opens: the open lyrics' headers
// ("[Verse 2: 2 Chainz]"); if they name no one, Genius's lyrics for the
// song (which do), timed by the lyrics library; and the voices themselves,
// heard from the vocal. When none of that tells the singers apart, the
// listener points them out: play, hold the button while that singer sings
// (a line or two), and every phrase that sounds like it is found. Every
// part is a row to listen to and tick — no tiny strip to hit on a phone.

type Mode = "lyrics" | "voices" | "point";
type Part = Span & { key: string; group: string; label: string; line?: string; phrase?: number };
type Heard = { parts: Part[]; count: number; confidence: number; prints: number[][] };

const VOICE_COLOURS = ["var(--vocals)", "var(--beat)", "var(--drums)", "var(--bass)"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The vocal's audio: as the Studio has it loaded, or fetched and decoded when it isn't yet. */
async function vocalAudio(lane: StudioLane): Promise<AudioBuffer> {
  const loaded = await audioEngine.getRawBuffer(lane.laneId);
  if (loaded) return loaded;
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(await fetchStem(lane.stemId));
}

/** The vocal's phrases on the timeline, grouped by voice (heard from the stem's audio), with each phrase's fingerprint. */
async function hearVoices(lane: StudioLane, onProgress: (f: number) => void): Promise<Heard> {
  const buffer = await vocalAudio(lane);
  const rate = buffer.sampleRate;
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  // Only the parts the lane plays: no point fingerprinting what's already cut out.
  const played = mergeSpans((lane.clips?.length ? lane.clips : [{ from: 0, to: lane.originalDuration }]).map((c) => ({ start: c.from, end: c.to })));
  const phrases = phrasesOf(rmsCurve(mono, rate), 50).filter((p) => played.some((s) => p.end > s.start && p.start < s.end));
  const prints: number[][] = [];
  for (const [i, p] of phrases.entries()) {
    prints.push(fingerprint(mono, rate, p));
    // A breath for the page every few phrases.
    if (i % 4 === 3) {
      onProgress((i + 1) / phrases.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const voices = groupVoices(
    prints,
    phrases.map((p) => p.end - p.start)
  );
  const parts: Part[] = phrases.flatMap((p, i) =>
    onTimeline(lane, [p]).map((t, j) => ({ ...t, key: `v${i}-${j}`, group: `Voice ${voices.labels[i] + 1}`, label: `Voice ${voices.labels[i] + 1}`, phrase: i }))
  );
  return { parts, count: voices.count, confidence: voices.confidence, prints };
}

/** Lyric sections on the timeline (lyrics found online are times in the recording). */
function lyricParts(lane: StudioLane, lines: LyricLine[], timedToRecording: boolean): { sections: SungSection[]; parts: Part[] } {
  const sections = lyricSections(lines, timedToRecording ? lane.originalDuration : Infinity);
  const parts = sections.flatMap((s, i) =>
    (timedToRecording ? onTimeline(lane, [s]) : [{ start: s.start, end: s.end }]).map((t, j) => ({
      ...t,
      key: `l${i}-${j}`,
      group: s.performers.length ? s.performers.join(" & ") : "Not named",
      label: s.label,
      line: s.line,
    }))
  );
  return { sections, parts };
}

/** The playhead, ticking (its own component, so the dialog doesn't redraw every frame). */
function Playhead() {
  const at = useStudioStore((s) => s.playhead);
  return <span className="font-mono text-sm tabular-nums">{clock(at)}</span>;
}

export default function RemoveSingerDialog() {
  const laneId = useStudioView((s) => s.removeSingerLaneId);
  const setOpen = useStudioView((s) => s.setRemoveSinger);
  const notify = useStudioView((s) => s.notify);
  const lane = useStudioStore((s) => s.lanes.find((l) => l.laneId === laneId) ?? null);
  const duration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const sheet = useLyrics((s) => activeSheet(s));
  const [mode, setMode] = useState<Mode>("lyrics");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [heard, setHeard] = useState<Heard | null>(null);
  const [hearing, setHearing] = useState<number | null>(null);
  const [found, setFound] = useState<{ lines: LyricLine[]; source: string } | null>(null);
  /** The song's singers from its credits (Genius): to name the voices heard. */
  const [credits, setCredits] = useState<{ primary: string; featured: string[] } | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepMusic, setKeepMusic] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [held, setHeld] = useState<Span[]>([]);
  const [holding, setHolding] = useState(false);
  const [likeNote, setLikeNote] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const holdFrom = useRef<number | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped per lane: answers for a lane closed since are dropped. */
  const run = useRef(0);

  const openLines = useMemo(() => (sheet ? parseLyrics(sheet.text) : []), [sheet]);
  const openRecordingTimes = !!sheet && (sheet.source === "library" || sheet.source === "web") && !sheet.aligned;
  const openParts = useMemo(() => (lane ? lyricParts(lane, openLines, openRecordingTimes) : { sections: [], parts: [] }), [lane, openLines, openRecordingTimes]);
  const openNames = useMemo(() => performers(openParts.sections), [openParts.sections]);
  const foundParts = useMemo(() => (lane && found ? lyricParts(lane, found.lines, true) : null), [lane, found]);
  // The lyrics that name the singers: the open ones if they do, else those found online.
  const fromLyrics = openNames.length || !foundParts ? openParts : foundParts;
  const named = useMemo(() => performers(fromLyrics.sections), [fromLyrics.sections]);
  const hasNames = named.length > 0;
  const lyricsFrom = openNames.length ? "the open lyrics" : found ? found.source : null;

  // A fresh dialog for each lane, which starts working it out at once: the voices, and — when the open lyrics name no one — lyrics online that do.
  useEffect(() => {
    if (!laneId || !lane) return;
    const mine = ++run.current;
    /* eslint-disable react-hooks/set-state-in-effect -- reset when another lane's dialog opens */
    setPicked(new Set());
    setHeard(null);
    setFound(null);
    setCredits(null);
    setError(null);
    setHeld([]);
    setLikeNote(null);
    setShowAll(false);
    setMode(openNames.length ? "lyrics" : "voices");
    setHearing(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    hearVoices(lane, (f) => run.current === mine && setHearing(f))
      .then((h) => {
        if (run.current !== mine) return;
        setHeard(h);
        // One voice and no names: the listener points the singer out.
        if (h.count < 2) setMode((m) => (m === "voices" ? "point" : m));
      })
      .catch((e) => run.current === mine && setError(e instanceof Error ? e.message : "Couldn't hear the voices"))
      .finally(() => run.current === mine && setHearing(null));
    if (!openNames.length) {
      namedLyricsFor(lane, (step) => run.current === mine && setFinding(step))
        .then((f) => {
          if (run.current !== mine || !f) return;
          if (f.featured.length) setCredits({ primary: f.primary, featured: f.featured });
          if (!f.lines || !performers(lyricSections(f.lines, lane.originalDuration)).length) return;
          setFound({ lines: f.lines, source: f.source });
          setMode("lyrics");
        })
        .catch(() => {})
        .finally(() => run.current === mine && setFinding(null));
    }
    return () => {
      // A counter, not a node: bumping the latest value is the point (answers for this lane are dropped).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      run.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the lane changes
  }, [laneId]);

  useEffect(() => () => void (stopTimer.current && clearTimeout(stopTimer.current)), []);

  if (!laneId || !lane) return null;

  const voiceParts = heard?.parts ?? [];
  // Pointed out by hand with nothing heard (the voices couldn't be read): the held stretches themselves.
  const heldParts: Part[] = heard ? [] : held.map((s, i) => ({ ...s, key: `h${i}`, group: "Pointed out", label: "Pointed out" }));
  const parts: Part[] = mode === "lyrics" ? fromLyrics.parts : mode === "voices" ? voiceParts : heard ? voiceParts : heldParts;
  const groups = [...new Set(parts.map((p) => p.group))].sort((a, b) => (mode === "lyrics" ? 0 : a.localeCompare(b, undefined, { numeric: true })));
  const chosen = parts.filter((p) => picked.has(p.key));
  const spans = mergeSpans(chosen);
  const seconds = spans.reduce((n, s) => n + s.end - s.start, 0);
  const shared = mode === "lyrics" ? chosen.filter((p) => p.group.includes(" & ")).length : 0;
  // Voice 1 sings the most: most likely the song's own artist; the others its featured singers, in the credits' order.
  const guessFor = (group: string) => {
    if (!credits || !heard || heard.count < 2) return null;
    const n = Number(group.replace(/\D/g, "")) - 1;
    return n === 0 ? credits.primary || null : (credits.featured[n - 1] ?? null);
  };
  const colourOf = (group: string) => VOICE_COLOURS[Math.max(0, groups.indexOf(group)) % VOICE_COLOURS.length];

  const stopPreview = () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (preview) audioEngine.pause();
    setPreview(null);
  };
  const close = () => {
    stopPreview();
    if (isPlaying) audioEngine.pause();
    run.current++;
    setOpen(null);
  };
  const setKeys = (keys: string[], on: boolean) =>
    setPicked((now) => {
      const next = new Set(now);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  const toggleGroup = (group: string) => {
    const keys = parts.filter((p) => p.group === group).map((p) => p.key);
    setKeys(keys, !keys.every((k) => picked.has(k)));
  };
  const togglePart = (key: string) => setKeys([key], !picked.has(key));
  const listen = async (key: string, at: number) => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (preview === key) return stopPreview();
    setPreview(key);
    audioEngine.seek(Math.max(0, at - 0.3));
    await audioEngine.play().catch(() => {});
    stopTimer.current = setTimeout(() => {
      audioEngine.pause();
      setPreview(null);
    }, 5000);
  };

  // ——— pointing out ———
  const holdStart = async () => {
    stopPreview();
    if (!useStudioStore.getState().isPlaying) await audioEngine.play().catch(() => {});
    holdFrom.current = useStudioStore.getState().playhead;
    setHolding(true);
  };
  const holdEnd = () => {
    const from = holdFrom.current;
    holdFrom.current = null;
    setHolding(false);
    if (from === null) return;
    const to = useStudioStore.getState().playhead;
    // A tap (not a hold) still means "this bit": a couple of seconds from there.
    const span = to - from > 0.4 ? { start: from, end: to } : { start: Math.max(0, from - 0.5), end: from + 2 };
    setHeld((h) => [...h, span]);
    setLikeNote(null);
    if (heard) setKeys(heard.parts.filter((p) => phrasesIn([p], span).length).map((p) => p.key), true);
    else setPicked((now) => new Set([...now, `h${held.length}`]));
  };
  const findLikeThese = () => {
    if (!heard) return;
    const marked = [...new Set(heard.parts.filter((p) => held.some((s) => phrasesIn([p], s).length)).map((p) => p.phrase!))];
    if (!marked.length) return setLikeNote("No singing where you held — hold while they sing a line.");
    const like = new Set(likeThese(heard.prints, marked));
    const keys = heard.parts.filter((p) => like.has(p.phrase!)).map((p) => p.key);
    setPicked(new Set(keys));
    setLikeNote(`Found ${like.size} phrase${like.size === 1 ? "" : "s"} that sound like them (you marked ${marked.length}). Listen to a few below, untick any that aren't them.`);
  };
  const clearHeld = () => {
    setHeld([]);
    setPicked(new Set());
    setLikeNote(null);
  };

  const apply = () => {
    if (!spans.length) return;
    stopPreview();
    if (useStudioStore.getState().isPlaying) audioEngine.pause();
    const bar = projectBpm > 0 ? 240 / projectBpm : 0;
    const cuts = keepMusic ? spans : toBars(spans, bar);
    // The words sung there go from the open sheet too (their own undo step in the lyrics).
    const lyrics = useLyrics.getState();
    if (sheet && openLines.length) lyrics.setLines(linesOutside(openLines, openRecordingTimes ? [] : cuts));
    startNewStep();
    const state = useStudioStore.getState();
    if (keepMusic) {
      const next = withoutSpans(lane, cuts);
      if (next) useStudioStore.setState({ lanes: state.lanes.map((l) => (l.laneId === lane.laneId ? next : l)) });
    } else {
      let lanes = state.lanes;
      let markers = state.markers;
      // Last first, so the earlier cuts' times still hold.
      for (const s of [...cuts].reverse()) {
        lanes = removeTime(lanes, s.start, s.end);
        markers = shiftMarkers(markers, s.start, s.end, -(s.end - s.start));
      }
      useStudioStore.setState({ lanes, markers, duration: lanes.reduce((m, l) => Math.max(m, l.offsetSeconds + l.duration), 0) });
    }
    startNewStep();
    notify(`Took out ${cuts.length} part${cuts.length === 1 ? "" : "s"} (${clock(cuts.reduce((n, s) => n + s.end - s.start, 0))}) — ⌘Z to undo`);
    run.current++;
    setOpen(null);
  };

  const total = Math.max(duration, ...parts.map((p) => p.end), 1);
  const listed = showAll ? parts : chosen;
  const working = hearing !== null ? `Listening to the voices… ${Math.round(hearing * 100)}%` : finding;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Remove a singer"
        className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[92dvh] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-surface p-4 pb-0 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(760px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6"
        style={{ animation: "sheet-in 0.18s ease-out" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-vocals/20 text-vocals">
            <UserMinus className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Remove a singer</h2>
            <p className="truncate text-xs text-muted">“{lane.trackTitle}” · pick whose parts to take out</p>
          </div>
          <button onClick={close} className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-background p-1 text-xs font-semibold sm:text-sm" role="tablist" aria-label="How to find the singer">
          {(
            [
              ["lyrics", Music2, "By name", hasNames ? `${named.length} named` : finding ? "looking…" : "none named"],
              ["voices", Users, "By voice", heard ? `${heard.count} voice${heard.count === 1 ? "" : "s"}` : hearing !== null ? "listening…" : "—"],
              ["point", Hand, "Point out", held.length ? `${held.length} marked` : "you show it"],
            ] as const
          ).map(([id, Icon, label, hint]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-1 ${mode === id ? "bg-surface-raised text-foreground shadow" : "text-muted hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="size-4" /> {label}
              </span>
              <span className="text-[10px] font-normal text-muted">{hint}</span>
            </button>
          ))}
        </div>

        {working && (
          <p className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-xs text-muted" role="status">
            <Loader2 className="size-3.5 animate-spin" /> {working}
          </p>
        )}

        {/* The song at a glance: each part where it's sung, coloured by who; the ones going are striped red. */}
        <div className="rounded-2xl border border-border bg-background p-2" aria-hidden>
          <div className="relative h-10 overflow-hidden rounded-xl bg-surface-raised">
            {parts.map((p) => {
              const on = picked.has(p.key);
              return (
                <span
                  key={p.key}
                  className="absolute inset-y-1.5 rounded"
                  style={{
                    left: `${(p.start / total) * 100}%`,
                    width: `max(3px, ${((p.end - p.start) / total) * 100}%)`,
                    background: on ? "repeating-linear-gradient(135deg, var(--danger) 0 4px, transparent 4px 8px)" : colourOf(p.group),
                    opacity: on ? 1 : 0.7,
                  }}
                />
              );
            })}
            {held.map((s, i) => (
              <span key={`held${i}`} className="absolute inset-y-0 border-x-2 border-foreground/70 bg-foreground/10" style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between px-1 font-mono text-[10px] text-muted">
            <span>0:00</span>
            <span>{clock(total / 2)}</span>
            <span>{clock(total)}</span>
          </div>
        </div>

        {mode === "lyrics" &&
          (hasNames ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">From {lyricsFrom}: they say who sings each part. Tap a singer to take out every part they&apos;re named on.</p>
              <div className="flex flex-wrap gap-2">
                {named.map((p) => {
                  const keys = fromLyrics.parts.filter((x) => x.group.split(" & ").includes(p.name)).map((x) => x.key);
                  const on = keys.length > 0 && keys.every((k) => picked.has(k));
                  return (
                    <button
                      key={p.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKeys(keys, !on)}
                      className={`flex min-h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${on ? "border-danger bg-danger/15 text-danger" : "border-border hover:bg-surface-hover"}`}
                    >
                      {on ? <Check className="size-4" /> : <UserMinus className="size-4" />} {p.name}
                      <span className="text-xs font-normal text-muted">
                        {p.sections.length} part{p.sections.length === 1 ? "" : "s"} · {clock(p.seconds)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {shared > 0 && (
                <p className="flex items-start gap-1.5 rounded-xl bg-drums/10 px-3 py-2 text-xs text-drums">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> {shared} of these parts are sung together with someone else — taking them out takes out both voices there. Untick them below to keep them.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-background p-3 text-sm text-muted">
              {finding
                ? "Looking online for lyrics that say who sings each part…"
                : "No lyrics found that name the singers for this song. Try By voice, or point the singer out."}
            </p>
          ))}

        {mode === "voices" && (
          <div className="flex flex-col gap-2">
            {!heard ? (
              <p className="rounded-xl bg-background p-3 text-sm text-muted">{hearing !== null ? "Listening to the vocal to tell the voices apart…" : "The voices couldn't be heard — point the singer out instead."}</p>
            ) : heard.count < 2 ? (
              <div className="flex flex-col gap-2 rounded-xl bg-background p-3 text-sm text-muted">
                It hears one voice all through: the singers sound too alike to split by themselves. Show it one of their lines and it finds the rest.
                <button type="button" onClick={() => setMode("point")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-vocals text-sm font-bold text-white">
                  <Hand className="size-4" /> Point them out
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted">
                  {heard.count} voices heard ({heard.confidence > 0.45 ? "clearly apart" : "fairly apart — listen to check"}). Voice 1 sings the most. Listen, then take one out.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {groups.map((g) => {
                    const own = parts.filter((p) => p.group === g);
                    const on = own.every((p) => picked.has(p.key));
                    const first = own[Math.floor(own.length / 2)] ?? own[0];
                    return (
                      <li key={g} className={`flex items-center gap-2 rounded-2xl border p-2 ${on ? "border-danger bg-danger/10" : "border-border"}`}>
                        <span className="size-3 shrink-0 rounded-full" style={{ background: colourOf(g) }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {g}
                            {guessFor(g) && <span className="font-normal text-muted"> · probably {guessFor(g)}</span>}
                          </span>
                          <span className="block text-xs text-muted">
                            {own.length} phrases · {clock(own.reduce((n, p) => n + p.end - p.start, 0))}
                          </span>
                        </span>
                        <button type="button" onClick={() => first && void listen(g, first.start)} className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-hover" aria-label={`Listen to ${g}`}>
                          {preview === g ? <Square className="size-4" /> : <Play className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroup(g)}
                          aria-pressed={on}
                          className={`min-h-11 rounded-lg px-3 text-xs font-bold ${on ? "bg-danger text-white" : "border border-border hover:bg-surface-hover"}`}
                        >
                          {on ? "Taking out" : "Take out"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {mode === "point" && (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-0.5 text-xs text-muted">
              <li>1. Play the song.</li>
              <li>2. Hold the big button while the singer you want gone is singing — a line or two is enough.</li>
              <li>3. Tap “Find all their parts”.</li>
            </ol>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (isPlaying ? audioEngine.pause() : void audioEngine.play().catch(() => {}))}
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border hover:bg-surface-hover"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => audioEngine.seek(Math.max(0, useStudioStore.getState().playhead - 5))}
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border hover:bg-surface-hover"
                aria-label="Back 5 seconds"
              >
                <RotateCcw className="size-4" />
              </button>
              <Playhead />
            </div>
            <button
              type="button"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                void holdStart();
              }}
              onPointerUp={holdEnd}
              onPointerCancel={holdEnd}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat && holdFrom.current === null) {
                  e.preventDefault();
                  void holdStart();
                }
              }}
              onKeyUp={(e) => (e.key === " " || e.key === "Enter") && holdEnd()}
              className={`flex min-h-20 touch-none select-none items-center justify-center gap-2 rounded-3xl text-base font-black transition [-webkit-touch-callout:none] ${holding ? "scale-[0.98] bg-danger text-white shadow-lg shadow-danger/30" : "bg-vocals/15 text-vocals ring-2 ring-vocals/40"}`}
            >
              <Hand className="size-5" /> {holding ? "Marking — let go when they stop" : "Hold while they sing"}
            </button>
            {held.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {held.map((s, i) => (
                  <span key={i} className="rounded-full bg-background px-3 py-1.5 font-mono text-xs">
                    {clock(s.start)}–{clock(s.end)}
                  </span>
                ))}
                <button type="button" onClick={clearHeld} className="min-h-9 rounded-full px-3 text-xs font-semibold text-muted hover:text-foreground">
                  Start over
                </button>
              </div>
            )}
            {heard && (
              <button
                type="button"
                onClick={findLikeThese}
                disabled={!held.length}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-vocals text-sm font-bold text-white hover:brightness-110 disabled:opacity-40"
              >
                <Sparkles className="size-4" /> Find all their parts
              </button>
            )}
            {!heard && hearing !== null && held.length > 0 && <p className="text-xs text-muted">Still listening to the vocal — “Find all their parts” comes when it&apos;s done.</p>}
            {likeNote && <p className="rounded-xl bg-vocals/10 px-3 py-2 text-xs text-vocals">{likeNote}</p>}
          </div>
        )}

        {/* Every part as a row: listen, tick. Big enough for a thumb. */}
        {parts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{showAll ? `Every part (${parts.length})` : `Taking out (${chosen.length})`}</h3>
              <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-auto min-h-9 rounded-full border border-border px-3 text-xs font-semibold hover:bg-surface-hover">
                {showAll ? "Only the ones going" : "Show every part"}
              </button>
            </div>
            {listed.length ? (
              <ul className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border/60 p-1">
                {listed.map((p) => (
                  <li key={p.key} className="flex items-center gap-1">
                    <button type="button" onClick={() => void listen(p.key, p.start)} className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-hover" aria-label={`Listen at ${clock(p.start)}`}>
                      {preview === p.key ? <Square className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 hover:bg-surface-hover">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colourOf(p.group) }} />
                      <span className="w-10 shrink-0 font-mono text-xs text-muted">{clock(p.start)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <strong>{p.label}</strong> {p.line && <span className="text-muted">· {p.line}</span>}
                      </span>
                      <input type="checkbox" checked={picked.has(p.key)} onChange={() => togglePart(p.key)} className="size-5 shrink-0 accent-danger" aria-label={`Take out ${p.label} at ${clock(p.start)}`} />
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-background p-3 text-xs text-muted">Nothing picked yet.</p>
            )}
          </div>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What happens where they sang">
          {(
            [
              [true, "Keep the music playing there", "The beat goes on; only the voice goes quiet."],
              [false, "Cut that time out of the song", "Whole bars come out, so the beat stays in step. The song gets shorter."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={keepMusic === value}
              onClick={() => setKeepMusic(value)}
              className={`rounded-2xl border p-3 text-left ${keepMusic === value ? "border-brand bg-brand/10 ring-1 ring-brand" : "border-border hover:bg-surface-hover"}`}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> Two people singing at the same moment are one sound in the vocal: where they overlap, both go. Undo brings everything back.
        </p>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button onClick={close} className="min-h-12 flex-1 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground">
            Cancel
          </button>
          <button onClick={apply} disabled={!spans.length} className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-danger text-sm font-bold text-white hover:brightness-110 disabled:opacity-40">
            <Scissors className="size-4" /> {spans.length ? `Take out ${spans.length} part${spans.length === 1 ? "" : "s"} · ${clock(seconds)}` : "Pick what to take out"}
          </button>
        </div>
      </div>
    </>
  );
}
