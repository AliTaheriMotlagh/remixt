"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Hand, Info, Loader2, Music2, Play, Scissors, Square, UserMinus, Users, X } from "lucide-react";
import { parseLyrics, type LyricLine } from "@/lib/lyrics";
import { audioEngine } from "@/lib/client/audioEngine";
import { removeTime, shiftMarkers } from "@/lib/client/clipEdit";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import {
  fingerprint,
  groupVoices,
  linesOutside,
  lyricSections,
  mergeSpans,
  onTimeline,
  performers,
  phrasesOf,
  rmsCurve,
  toBars,
  withoutSpans,
  type Span,
  type SungSection,
} from "@/lib/client/singerParts";
import { startNewStep } from "@/lib/client/studioHistory";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";

// "Remove a singer…" on a vocal lane: who sings where — from the lyrics'
// section headers, from the voices themselves, or picked by hand — and
// that singer's parts taken out, keeping the music playing there or
// cutting the time out of the song. One undo step. Logic in singerParts.ts.

type Mode = "lyrics" | "voices" | "hand";
type Part = Span & { key: string; group: string; label: string; line?: string };

const VOICE_COLOURS = ["var(--vocals)", "var(--beat)", "var(--drums)", "var(--bass)"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The vocal's phrases on the timeline, grouped by voice (heard from the stem's audio). */
async function hearVoices(lane: StudioLane, onProgress: (f: number) => void): Promise<{ parts: Part[]; count: number; confidence: number }> {
  const buffer = await audioEngine.getRawBuffer(lane.laneId);
  if (!buffer) throw new Error("The vocal's audio isn't loaded yet — press play once, then try again");
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
    onTimeline(lane, [p]).map((t, j) => ({ ...t, key: `v${i}-${j}`, group: `Voice ${voices.labels[i] + 1}`, label: `Voice ${voices.labels[i] + 1}` }))
  );
  return { parts, count: voices.count, confidence: voices.confidence };
}

/** The open lyrics' sections on the timeline (found lyrics not lined up yet are times in the recording). */
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

export default function RemoveSingerDialog() {
  const laneId = useStudioView((s) => s.removeSingerLaneId);
  const setOpen = useStudioView((s) => s.setRemoveSinger);
  const notify = useStudioView((s) => s.notify);
  const lane = useStudioStore((s) => s.lanes.find((l) => l.laneId === laneId) ?? null);
  const duration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const sheet = useLyrics((s) => activeSheet(s));
  const [mode, setMode] = useState<Mode>("lyrics");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [voices, setVoices] = useState<{ parts: Part[]; count: number; confidence: number } | null>(null);
  const [hearing, setHearing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepMusic, setKeepMusic] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = useMemo(() => (sheet ? parseLyrics(sheet.text) : []), [sheet]);
  const recordingTimes = !!sheet && (sheet.source === "library" || sheet.source === "web") && !sheet.aligned;
  const fromLyrics = useMemo(() => (lane ? lyricParts(lane, lines, recordingTimes) : { sections: [], parts: [] }), [lane, lines, recordingTimes]);
  const named = useMemo(() => performers(fromLyrics.sections), [fromLyrics.sections]);
  const hasNames = named.length > 0;

  // A fresh dialog for each lane: lyrics when they name the singers, else the voices.
  useEffect(() => {
    if (!laneId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when another lane's dialog opens
    setPicked(new Set());
    setVoices(null);
    setError(null);
    setMode(hasNames ? "lyrics" : "voices");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the lane changes
  }, [laneId]);

  useEffect(() => () => void (stopTimer.current && clearTimeout(stopTimer.current)), []);

  if (!laneId || !lane) return null;

  const parts: Part[] = mode === "lyrics" ? fromLyrics.parts : mode === "voices" ? (voices?.parts ?? []) : [...fromLyrics.parts, ...(voices?.parts ?? [])];
  const groups = [...new Set(parts.map((p) => p.group))];
  const chosen = parts.filter((p) => picked.has(p.key));
  const spans = mergeSpans(chosen);
  const seconds = spans.reduce((n, s) => n + s.end - s.start, 0);
  const shared = mode === "lyrics" ? chosen.filter((p) => p.group.includes(" & ")).length : 0;
  const colourOf = (group: string) => VOICE_COLOURS[Math.max(0, groups.indexOf(group)) % VOICE_COLOURS.length];

  const close = () => {
    if (hearing !== null) return;
    if (preview) audioEngine.pause();
    setOpen(null);
  };
  const toggleGroup = (group: string) => {
    const keys = parts.filter((p) => p.group === group).map((p) => p.key);
    const all = keys.every((k) => picked.has(k));
    setPicked((now) => {
      const next = new Set(now);
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };
  const togglePart = (key: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const listen = async (key: string, at: number) => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (preview === key) {
      audioEngine.pause();
      setPreview(null);
      return;
    }
    setPreview(key);
    audioEngine.seek(Math.max(0, at - 0.3));
    await audioEngine.play().catch(() => {});
    stopTimer.current = setTimeout(() => {
      audioEngine.pause();
      setPreview(null);
    }, 5000);
  };
  const findVoices = async () => {
    setError(null);
    setHearing(0);
    try {
      const found = await hearVoices(lane, setHearing);
      setVoices(found);
      setMode("voices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't hear the voices");
    } finally {
      setHearing(null);
    }
  };

  const apply = () => {
    if (!spans.length) return;
    if (preview) audioEngine.pause();
    const bar = projectBpm > 0 ? 240 / projectBpm : 0;
    const cuts = keepMusic ? spans : toBars(spans, bar);
    // The words sung there go too (their own undo step in the lyrics).
    const lyrics = useLyrics.getState();
    if (sheet && lines.length) lyrics.setLines(linesOutside(lines, recordingTimes ? [] : cuts));
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
    setOpen(null);
  };

  const total = Math.max(duration, ...parts.map((p) => p.end), 1);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Remove a singer"
        className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(760px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6"
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
              ["lyrics", Music2, "By lyrics", hasNames ? `${named.length} named` : "no names in them"],
              ["voices", Users, "By voice", voices ? `${voices.count} voice${voices.count === 1 ? "" : "s"}` : "listens to it"],
              ["hand", Hand, "By hand", "pick parts"],
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

        {/* The song, with each part where it's sung, coloured by who; the ones going are struck through. */}
        <div className="rounded-2xl border border-border bg-background p-2">
          <div className="relative h-14 overflow-hidden rounded-xl bg-surface-raised" aria-label="Where each part is sung">
            {parts.map((p) => {
              const on = picked.has(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => togglePart(p.key)}
                  title={`${p.label}${p.line ? ` — “${p.line}”` : ""} · ${clock(p.start)}`}
                  aria-pressed={on}
                  className="absolute inset-y-2 rounded-md transition-opacity hover:opacity-100"
                  style={{
                    left: `${(p.start / total) * 100}%`,
                    width: `max(3px, ${((p.end - p.start) / total) * 100}%)`,
                    background: on ? "repeating-linear-gradient(135deg, var(--danger) 0 4px, transparent 4px 8px)" : colourOf(p.group),
                    opacity: on ? 1 : 0.75,
                    outline: on ? "2px solid var(--danger)" : undefined,
                  }}
                />
              );
            })}
            {!parts.length && <p className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">{mode === "lyrics" ? "The open lyrics have no timed lines." : "Listen for the voices below."}</p>}
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
              <p className="text-xs text-muted">The lyrics say who sings each part. Pick a singer to take out every part they&apos;re named on.</p>
              <div className="flex flex-wrap gap-2">
                {named.map((p) => {
                  const keys = fromLyrics.parts.filter((x) => x.group.split(" & ").includes(p.name)).map((x) => x.key);
                  const on = keys.length > 0 && keys.every((k) => picked.has(k));
                  return (
                    <button
                      key={p.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((now) => {
                          const next = new Set(now);
                          for (const k of keys) {
                            if (on) next.delete(k);
                            else next.add(k);
                          }
                          return next;
                        })
                      }
                      className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${on ? "border-danger bg-danger/15 text-danger" : "border-border hover:bg-surface-hover"}`}
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
                  <Info className="mt-0.5 size-3.5 shrink-0" /> {shared} of these parts are sung together with someone else — taking them out takes out both voices there. Untick them on the strip above to keep them.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-background p-3 text-sm text-muted">
              {lines.length
                ? "These lyrics don't say who sings which part. Lyrics with headers like “[Verse 2: 2 Chainz]” (as on Genius) do — or let it listen for the voices."
                : "No lyrics are open for this song. Open timed lyrics with section headers, or let it listen for the voices."}
            </p>
          ))}

        {mode === "voices" && (
          <div className="flex flex-col gap-2">
            {!voices ? (
              <button
                type="button"
                onClick={() => void findVoices()}
                disabled={hearing !== null}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-vocals px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-70"
              >
                {hearing !== null ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
                {hearing !== null ? `Listening… ${Math.round(hearing * 100)}%` : "Listen for the voices"}
              </button>
            ) : voices.count < 2 ? (
              <p className="rounded-xl bg-background p-3 text-sm text-muted">
                It hears one voice all through. If someone else does sing here, their voice is too close to tell apart — pick their parts by hand (tap them on the strip).
              </p>
            ) : (
              <>
                <p className="text-xs text-muted">
                  {voices.count} voices heard ({voices.confidence > 0.45 ? "clearly apart" : "fairly apart — listen to check"}). Voice 1 sings the most. Listen, then pick the one to take out.
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
                          <span className="block text-sm font-semibold">{g}</span>
                          <span className="block text-xs text-muted">
                            {own.length} phrases · {clock(own.reduce((n, p) => n + p.end - p.start, 0))}
                          </span>
                        </span>
                        <button type="button" onClick={() => first && void listen(g, first.start)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-hover" aria-label={`Listen to ${g}`}>
                          {preview === g ? <Square className="size-4" /> : <Play className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroup(g)}
                          aria-pressed={on}
                          className={`min-h-10 rounded-lg px-3 text-xs font-bold ${on ? "bg-danger text-white" : "border border-border hover:bg-surface-hover"}`}
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

        {mode === "hand" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Tap parts on the strip to take them out (tap again to keep them).{!voices && " Listen for the voices to get every phrase on the strip."}</p>
            {!voices && (
              <button type="button" onClick={() => void findVoices()} disabled={hearing !== null} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-hover">
                {hearing !== null ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />} {hearing !== null ? `Listening… ${Math.round(hearing * 100)}%` : "Find every phrase"}
              </button>
            )}
            {fromLyrics.parts.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-border/60 p-1">
                {fromLyrics.parts.map((p) => (
                  <li key={p.key}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-surface-hover">
                      <input type="checkbox" checked={picked.has(p.key)} onChange={() => togglePart(p.key)} className="size-4 accent-danger" />
                      <span className="w-12 shrink-0 font-mono text-xs text-muted">{clock(p.start)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <strong>{p.label}</strong> {p.line && <span className="text-muted">· {p.line}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
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

        <div className="flex gap-2">
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
