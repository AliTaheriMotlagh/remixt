"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Headphones,
  HeadphoneOff,
  Mic,
  Play,
  RotateCcw,
  ScrollText,
  Speaker,
  Square,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import Waveform from "../Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import {
  listInputs,
  prepareRecording,
  startRecording,
  uploadTake,
  type Recording,
  type SaveStep,
  type Take,
} from "@/lib/client/recorder";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { beatSeconds, isSung, lineAt, sectionAt } from "@/lib/lyrics";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { useKeepScreenOn } from "@/lib/client/wakeLock";
import { guardLeaving } from "@/lib/client/leaveGuard";
import { LyricsCue, LyricsTools } from "./LyricsPanel";
import LyricsTimeline from "./LyricsTimeline";

// The vocal booth: one panel for the take and its words. Recording starts
// at the playhead with the beat playing (a metronome count-in first, when
// it's on), the lyrics cue follows underneath, and the mic is watched for
// beat bleed — the beat bouncing off speakers into the take. A recorded
// take is checked (levels, bleed), can be heard against the beat, and
// lands on a new lane exactly where it was sung.
//
// The recorder stays mounted while the booth is closed or on its lyrics,
// so neither cuts a take off.

const PREFS_KEY = "remixt.record.prefs";
const OLD_COUNT_IN_KEY = "remixt.record.countIn";

/** Where a take starts: the playhead, the top of the song, or a couple of bars before the lyrics' first line. */
type StartFrom = "here" | "start" | "lyrics";

type RecordPrefs = { countIn: boolean; speakers: boolean; deviceId: string; from: StartFrom };

function readPrefs(): RecordPrefs {
  const fallback: RecordPrefs = { countIn: true, speakers: false, deviceId: "", from: "here" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<RecordPrefs>) };
    const oldCountIn = localStorage.getItem(OLD_COUNT_IN_KEY);
    return oldCountIn === null ? fallback : { ...fallback, countIn: oldCountIn === "1" };
  } catch {
    return fallback;
  }
}

function writePrefs(prefs: RecordPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Kept for this visit only.
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Input level and beat bleed while recording, redrawn every frame on their own. */
function LiveMonitor({ recording, onBleed }: { recording: Recording; onBleed: () => void }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setLevel(recording.level());
      // The warning is latched by the caller: it stays up until the take ends.
      if (recording.bleed() >= 0.5) onBleed();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [recording, onBleed]);
  const BARS = 20;
  const lit = Math.round(Math.min(1, level) * BARS);
  return (
    <div className="flex h-3 flex-1 gap-[2px]" role="img" aria-label={`Microphone level ${Math.round(level * 100)} percent`}>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] transition-colors duration-75 ${
            i < lit ? (i >= BARS - 2 ? "bg-danger" : i >= BARS - 6 ? "bg-beat" : "bg-success") : "bg-foreground/10"
          }`}
        />
      ))}
    </div>
  );
}

/** How long the take has run, read off the playhead. */
function ElapsedTime({ start }: { start: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return <span className="text-2xl font-bold tabular-nums leading-none">{formatTime(Math.max(0, playhead - start))}</span>;
}

function PlayheadTime() {
  const playhead = useStudioStore((s) => s.playhead);
  return <>{formatTime(playhead)}</>;
}

/** Two bars before the open lyrics' first timed line — room to breathe in — or null with no timed lyrics. */
function lyricsStart(bpm: number): number | null {
  const first = useLyrics.getState().lines.find((l) => l.time !== null && l.text)?.time;
  return first === undefined || first === null ? null : Math.max(0, first - beatSeconds(bpm) * 8);
}

/** A setting as a pill that's lit when on. */
function Toggle({
  on,
  onClick,
  icon: Icon,
  label,
  title,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Mic;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
        on ? "border-vocals bg-vocals/10 text-vocals" : "border-border text-muted hover:text-foreground"
      }`}
    >
      <Icon /> {label}
    </button>
  );
}

/** What the take check found, as small badges. */
function TakeBadges({ take }: { take: Take }) {
  const badges: { tone: "ok" | "warn" | "bad"; text: string; hint: string }[] = [];
  if (take.bleed) badges.push({ tone: "bad", text: "Beat in the take", hint: "The mic picked up the beat from speakers — record with headphones for a clean vocal" });
  if (take.check.clipped) badges.push({ tone: "bad", text: "Too loud — clipped", hint: "The voice hit the top and crackles — back off the mic a little, or turn its input down" });
  if (take.check.quiet) badges.push({ tone: "warn", text: "Very quiet", hint: "Sing closer to the mic, or turn its input up — a quiet take brings its noise up with it" });
  if (badges.length === 0) badges.push({ tone: "ok", text: "Levels good", hint: "Loud and clean, no clipping, no beat in the mic" });
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          key={b.text}
          title={b.hint}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            b.tone === "ok" ? "bg-success/15 text-success" : b.tone === "warn" ? "bg-beat/15 text-beat" : "bg-danger/15 text-danger"
          }`}
        >
          {b.tone === "ok" ? <Check /> : <AlertTriangle />} {b.text}
        </span>
      ))}
    </div>
  );
}

const SAVE_STEPS: Record<SaveStep, string> = {
  encoding: "Getting the take ready…",
  creating: "Saving the take…",
  uploading: "Uploading the take…",
  finishing: "Adding it to the mix…",
};

/** The whole save as one bar: the upload is most of the wait, getting it ready a little of it. */
function overallSave(step: SaveStep, fraction: number) {
  const [from, to] = { encoding: [0, 0.15], creating: [0.15, 0.2], uploading: [0.2, 0.95], finishing: [0.95, 1] }[step];
  return from + (to - from) * Math.min(1, Math.max(0, fraction));
}

/**
 * The record half of the booth. `compact`: beside a stage that already
 * shows the lyrics and the song's waveform (the Vocalist studio), so the
 * recorder doesn't draw them again — the take is handed to the stage
 * (useLyrics.liveTake) to draw instead.
 */
export function RecordTab({ signedIn, compact = false }: { signedIn: boolean; compact?: boolean }) {
  const addStem = useStudioStore((s) => s.addStem);
  const setOffset = useStudioStore((s) => s.setOffset);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const hasMix = useStudioStore((s) => s.lanes.length > 0);
  const setTakeState = useLyrics((s) => s.setTake);
  const sheet = useLyrics(activeSheet);
  const lines = useLyrics((s) => s.lines);
  const lyricsAt = useLyrics((s) => {
    const first = s.lines.find((l) => l.time !== null && l.text)?.time;
    return first === undefined ? null : first;
  });
  const [state, setState] = useState<"idle" | "starting" | "recording" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [progress, setProgress] = useState<{ step: SaveStep; fraction: number }>({ step: "encoding", fraction: 0 });
  const saving = useRef<AbortController | null>(null);
  const [takeNumber, setTakeNumber] = useState(1);
  const [prefs, setPrefsState] = useState<RecordPrefs>(readPrefs);
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);
  const [countBeat, setCountBeat] = useState<number | null>(null);
  const [bleeding, setBleeding] = useState(false);
  const [recStart, setRecStart] = useState(0);
  const [previewing, setPreviewing] = useState<"beat" | "solo" | null>(null);
  const recording = useRef<Recording | null>(null);
  const [active, setActive] = useState<Recording | null>(null);
  const preview = useRef<AudioBufferSourceNode | null>(null);
  // Getting ready, singing and saving the take: a locked phone would cut any of them off.
  useKeepScreenOn("recording", state === "starting" || state === "recording" || state === "saving");
  // Closing or reloading the tab now would lose the take.
  useEffect(() => {
    guardLeaving("take", state === "recording" || state === "review" || state === "saving");
    return () => guardLeaving("take", false);
  }, [state]);

  useEffect(() => {
    setTakeState(state === "starting" || state === "recording" ? "recording" : state === "review" || state === "saving" ? "review" : "idle");
  }, [state, setTakeState]);

  // The take for other views to draw: live while it's sung, its waveform once it's done.
  const setLiveTake = useLyrics((s) => s.setLiveTake);
  useEffect(() => {
    if (state === "recording" && active) setLiveTake({ start: recStart, level: active.level });
    else if ((state === "review" || state === "saving") && take) setLiveTake({ start: take.start, peaks: take.peaks, duration: take.buffer.duration });
    else setLiveTake(null);
  }, [state, active, take, recStart, setLiveTake]);
  useEffect(() => () => setLiveTake(null), [setLiveTake]);

  function setPrefs(patch: Partial<RecordPrefs>) {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });
  }

  // The mics to choose from; names show up once the mic has been allowed.
  const refreshInputs = useCallback(() => void listInputs().then(setInputs), []);
  useEffect(() => {
    refreshInputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshInputs);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshInputs);
  }, [refreshInputs]);

  const onBleed = useCallback(() => setBleeding(true), []);

  /** `fromHere`: start at the playhead whatever the start setting (a retake, from where the last one began). */
  async function begin(fromHere = false) {
    if (!hasMix) {
      setError("Add a beat first — the take is recorded over the mix");
      return;
    }
    setError(null);
    setTake(null);
    setBleeding(false);
    setState("starting");
    // Inside the tap: audio has to be unlocked before anything is awaited.
    const ctx = prepareRecording();
    if (!fromHere && prefs.from === "start") audioEngine.seek(0);
    if (!fromHere && prefs.from === "lyrics") {
      const at = lyricsStart(projectBpm);
      if (at !== null) audioEngine.seek(at);
    }
    try {
      const rec = await startRecording(ctx, {
        countIn: prefs.countIn ? { bpm: projectBpm, onBeat: setCountBeat } : undefined,
        deviceId: prefs.deviceId || undefined,
        speakers: prefs.speakers,
      });
      setCountBeat(null);
      recording.current = rec;
      setActive(rec);
      setRecStart(useStudioStore.getState().playhead);
      setState("recording");
      refreshInputs();
    } catch (err) {
      setCountBeat(null);
      setError(err instanceof Error ? err.message : "Couldn't start recording");
      setState("idle");
    }
  }

  async function finish() {
    const rec = recording.current;
    recording.current = null;
    setActive(null);
    if (!rec) return;
    const result = await rec.stop();
    if (!result) {
      setError("Nothing was recorded — the take was too short");
      setState("idle");
      return;
    }
    setTake(result);
    setState("review");
  }

  function stopPreview() {
    try {
      preview.current?.stop();
    } catch {
      // Already ended.
    }
    preview.current = null;
    setPreviewing(null);
  }

  // Pausing or stopping the mix ends the take — and a preview against it.
  useEffect(
    () =>
      useStudioStore.subscribe((store, previous) => {
        if (!previous.isPlaying || store.isPlaying) return;
        if (recording.current) void finish();
        if (preview.current) stopPreview();
      }),
    []
  );

  // Leaving the Studio mid-take closes the microphone.
  useEffect(
    () => () => {
      recording.current?.cancel();
      try {
        preview.current?.stop();
      } catch {
        // Already ended.
      }
    },
    []
  );

  /** The take on its own, or against the beat from a second before it. */
  async function listen(withBeat: boolean) {
    if (!take) return;
    const wasPreviewing = previewing;
    stopPreview();
    if (useStudioStore.getState().isPlaying) audioEngine.pause();
    if (wasPreviewing === (withBeat ? "beat" : "solo")) return;
    try {
      if (withBeat) audioEngine.seek(Math.max(0, take.start - 1));
      const ctx = await audioEngine.prepareAudio();
      if (withBeat) await audioEngine.play();
      const source = ctx.createBufferSource();
      source.buffer = take.buffer;
      source.connect(ctx.destination);
      const now = ctx.currentTime;
      const at = withBeat ? audioEngine.contextTimeAt(take.start) : now;
      if (at >= now) source.start(at);
      else source.start(now, Math.min(take.buffer.duration, now - at));
      source.onended = () => {
        if (preview.current !== source) return;
        preview.current = null;
        setPreviewing(null);
        if (withBeat) audioEngine.pause();
      };
      preview.current = source;
      setPreviewing(withBeat ? "beat" : "solo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't play the take");
    }
  }

  async function keep() {
    if (!take) return;
    stopPreview();
    setState("saving");
    setError(null);
    setProgress({ step: "encoding", fraction: 0 });
    saving.current?.abort();
    const controller = new AbortController();
    saving.current = controller;
    try {
      // Named for the lyrics sung, so the take is easy to find in the song list later.
      // …and the part of the song it starts in ("Chorus"), when the lyrics mark their sections.
      const at = lineAt(lines, take.start + 0.5);
      const firstSung = lines.findIndex((l) => isSung(l) && l.time !== null);
      const section = sectionAt(lines, at >= 0 ? at : firstSung);
      const title = sheet?.title
        ? `${sheet.title}${section ? ` — ${section.replace(/:.*$/, "")}` : ""} — take ${takeNumber}`.slice(0, 200)
        : `Studio vocal — take ${takeNumber} (${new Date().toLocaleDateString()})`;
      const { stemId } = await uploadTake(
        take,
        title,
        projectBpm,
        (step, fraction) => {
          if (!controller.signal.aborted) setProgress({ step, fraction });
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      const laneId = addStem({
        id: stemId,
        kind: "vocals",
        track_title: title,
        artist_name: "You",
        peaks_json: JSON.stringify(take.peaks),
        track_duration: take.buffer.duration,
        track_bpm: projectBpm,
      });
      setOffset(laneId, take.start);
      useStudioView.getState().notify(`Take ${takeNumber} added as a lane at ${formatTime(take.start)}`);
      setTake(null);
      setTakeNumber((n) => n + 1);
      setState("idle");
    } catch (err) {
      // Cancelled: cancelSave has already put the take back up for review.
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Couldn't save the take");
      setState("review");
    } finally {
      if (saving.current === controller) saving.current = null;
    }
  }

  /** Stops a save that's taking too long; the take stays, to try again. */
  function cancelSave() {
    saving.current?.abort();
    saving.current = null;
    setState("review");
  }

  function reset() {
    recording.current?.cancel();
    recording.current = null;
    setActive(null);
    stopPreview();
    setTake(null);
    setCountBeat(null);
    setBleeding(false);
    setState("idle");
  }

  /** Throws this take away and records the next from where it started. */
  function retake() {
    const from = take?.start;
    reset();
    if (from !== undefined) audioEngine.seek(Math.max(0, from - 0.05));
    void begin(from !== undefined);
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-vocals/15 text-vocals">
          <Mic />
        </span>
        <p className="text-sm font-semibold">Record your vocal over the mix</p>
        <p className="max-w-xs text-xs text-muted">Your takes are saved as vocal stems, so remixes can use them.</p>
        <Link href="/login?next=/studio" className="mt-1 rounded-lg bg-vocals px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
          Sign in to record
        </Link>
      </div>
    );
  }

  if (state === "starting") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4 py-2">
          {countBeat !== null ? (
            <span key={countBeat} className="flex h-16 w-16 shrink-0 animate-[count-pop_0.25s_ease-out] items-center justify-center rounded-full bg-vocals text-3xl font-bold tabular-nums text-white">
              {countBeat}
            </span>
          ) : (
            <span className="flex h-16 w-16 shrink-0 animate-pulse items-center justify-center rounded-full bg-vocals/20 text-vocals">
              <Mic />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{countBeat !== null ? "Count-in…" : "Getting the mic ready…"}</p>
            <p className="text-xs text-muted">{countBeat !== null ? "The beat comes in after four clicks — sing from the first beat." : "Allow the microphone if the browser asks."}</p>
            {countBeat !== null && (
              <div className="mt-2 flex gap-1.5" aria-hidden>
                {[4, 3, 2, 1].map((n) => (
                  <span key={n} className={`h-1.5 flex-1 rounded-full ${n >= countBeat ? "bg-vocals" : "bg-foreground/10"}`} />
                ))}
              </div>
            )}
          </div>
        </div>
        {!compact && <LyricsTimeline lines={lines} seekable={false} height={88} />}
        {!compact && <LyricsCue big />}
      </div>
    );
  }

  if (state === "recording" && active) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => void finish()}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition-transform hover:scale-105"
            title="Stop and listen back"
            aria-label="Stop recording"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/30" aria-hidden />
            <Square className="relative fill-current" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <ElapsedTime start={recStart} />
              <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> Rec
              </span>
            </div>
            <LiveMonitor recording={active} onBleed={onBleed} />
          </div>
        </div>
        {!compact && <LyricsTimeline lines={lines} take={{ start: recStart, level: active.level }} seekable={false} height={88} />}
        {bleeding && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
            <HeadphoneOff className="mt-0.5 shrink-0" />
            <span>
              <b>The beat is leaking into the mic.</b> Put headphones on — or, for the next take, switch to <b>Speakers</b> so the browser cancels it.
            </span>
          </div>
        )}
        {!compact && <LyricsCue big />}
      </div>
    );
  }

  if ((state === "review" || state === "saving") && take) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Take {takeNumber}</p>
          <span className="text-xs tabular-nums text-muted">
            {formatTime(take.buffer.duration)} long · from {formatTime(take.start)}
          </span>
        </div>
        {!compact && <LyricsTimeline lines={lines} take={{ start: take.start, peaks: take.peaks, duration: take.buffer.duration }} height={76} />}
        <div className="rounded-lg bg-background/60 px-2 py-1.5">
          <Waveform peaks={take.peaks} color="var(--vocals)" height={36} />
        </div>
        <TakeBadges take={take} />
        {state === "saving" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted" aria-live="polite">
                {SAVE_STEPS[progress.step]}
                {progress.fraction > 0 && progress.fraction < 1 ? ` ${Math.round(progress.fraction * 100)}%` : ""}
              </span>
              <button onClick={cancelSave} className="text-xs font-semibold text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-vocals transition-[width]"
                style={{ width: `${Math.round(overallSave(progress.step, progress.fraction) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void listen(true)}
                aria-pressed={previewing === "beat"}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  previewing === "beat" ? "border-vocals bg-vocals/10 text-vocals" : "border-border text-foreground hover:border-vocals"
                }`}
              >
                {previewing === "beat" ? <Square className="fill-current" /> : <Play className="fill-current" />} With the beat
              </button>
              <button
                onClick={() => void listen(false)}
                aria-pressed={previewing === "solo"}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  previewing === "solo" ? "border-vocals bg-vocals/10 text-vocals" : "border-border text-foreground hover:border-vocals"
                }`}
              >
                {previewing === "solo" ? <Square className="fill-current" /> : <Mic />} Voice only
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void keep()}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-vocals text-sm font-semibold text-white shadow-lg shadow-vocals/25 hover:opacity-90"
              >
                <Check /> Keep — add as a lane
              </button>
              <button
                onClick={retake}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted hover:border-vocals hover:text-foreground"
                title="Throw this take away and sing it again from the same spot"
              >
                <RotateCcw /> Retake
              </button>
              <button
                onClick={reset}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted hover:border-danger/50 hover:text-danger"
                title="Discard this take"
                aria-label="Discard this take"
              >
                <Trash2 />
              </button>
            </div>
          </>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          onClick={() => void begin()}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-vocals text-white shadow-lg shadow-vocals/30 transition-transform hover:scale-105 active:scale-95"
          title="Record from the playhead, with the mix playing"
          aria-label="Record"
        >
          <Mic className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {prefs.from === "start" ? (
              "Record from the top"
            ) : prefs.from === "lyrics" && lyricsAt !== null ? (
              <>
                Record from <span className="tabular-nums text-vocals">{formatTime(lyricsStart(projectBpm) ?? 0)}</span> — 2 bars before the words
              </>
            ) : (
              <>
                Record from <span className="tabular-nums text-vocals"><PlayheadTime /></span>
              </>
            )}
          </p>
          <p className="text-xs text-muted">
            {prefs.speakers
              ? "Speakers: the browser cancels most of the beat from the mic. Headphones still sound best."
              : "Headphones on, so the beat stays out of the mic. Pause to end the take."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-full border border-border p-0.5" role="radiogroup" aria-label="Where the take starts">
          {(
            [
              ["here", "Playhead", "Start where the playhead is"],
              ["start", "Top", "Start from the beginning of the song"],
              ["lyrics", "Lyrics", "Start two bars before the first line of your lyrics"],
            ] as const
          ).map(([from, label, title]) => (
            <button
              key={from}
              role="radio"
              aria-checked={prefs.from === from}
              disabled={from === "lyrics" && lyricsAt === null}
              onClick={() => setPrefs({ from })}
              title={from === "lyrics" && lyricsAt === null ? "Time your lyrics first, and the take can start just before them" : title}
              className={`flex h-8 items-center rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-40 max-lg:h-9 ${
                prefs.from === from ? "bg-vocals text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Toggle
          on={prefs.countIn}
          onClick={() => setPrefs({ countIn: !prefs.countIn })}
          icon={Timer}
          label="Count-in"
          title="Four metronome clicks before the beat comes in"
        />
        <div className="flex rounded-full border border-border p-0.5" role="radiogroup" aria-label="What you hear the beat through">
          {(
            [
              [false, Headphones, "Headphones", "Clean studio sound: the mic hears only you"],
              [true, Speaker, "Speakers", "The beat plays out loud: the browser's echo canceller keeps it out of the take"],
            ] as const
          ).map(([speakers, Icon, label, title]) => (
            <button
              key={label}
              role="radio"
              aria-checked={prefs.speakers === speakers}
              onClick={() => setPrefs({ speakers })}
              title={title}
              className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors max-lg:h-9 ${
                prefs.speakers === speakers ? "bg-vocals text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
        {inputs.length > 1 && (
          <label className="flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border pl-3 pr-1 text-xs text-muted max-lg:h-10">
            <Mic className="shrink-0" />
            <select
              value={prefs.deviceId}
              onChange={(e) => setPrefs({ deviceId: e.target.value })}
              aria-label="Microphone"
              className="min-w-0 max-w-[12rem] truncate bg-transparent py-1 pr-1 text-foreground outline-none"
            >
              <option value="">Default mic</option>
              {inputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {hasMix && !compact && <LyricsTimeline lines={lines} height={64} />}
      {!compact && <LyricsCue />}
    </div>
  );
}

/**
 * The vocal booth, open or closed. On a phone or tablet it slides up as a
 * sheet; on the desktop it sits under the arrangement.
 */
export default function VocalBooth({ signedIn }: { signedIn: boolean }) {
  const open = useLyrics((s) => s.boothOpen);
  const setOpen = useLyrics((s) => s.setBoothOpen);
  const tab = useLyrics((s) => s.boothTab);
  const openBooth = useLyrics((s) => s.openBooth);
  const take = useLyrics((s) => s.take);
  const sheet = useLyrics(activeSheet);

  // Esc closes the sheet (the take carries on).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Not while the full-screen lyrics are up: Esc closes those first.
      if (event.key !== "Escape" || document.querySelector("[data-lyrics-fullscreen]")) return;
      if (window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {!open && (
        <div className="flex flex-wrap items-center gap-2 self-start">
          {take === "idle" ? (
            <button
              onClick={() => openBooth("record")}
              className="flex h-10 items-center gap-2 rounded-full bg-vocals px-4 text-sm font-semibold text-white shadow-lg shadow-vocals/25 transition-opacity hover:opacity-90"
            >
              <Mic /> Record a vocal
            </button>
          ) : (
            <button
              onClick={() => openBooth("record")}
              className="flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-white shadow-lg shadow-danger/25"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              {take === "recording" ? "Recording — open" : "Take ready — review it"}
            </button>
          )}
          <button
            onClick={() => openBooth("lyrics")}
            className="flex h-10 min-w-0 max-w-full items-center gap-2 rounded-full border border-border px-4 text-sm text-muted transition-colors hover:border-vocals hover:text-foreground"
          >
            <ScrollText className="shrink-0" />
            <span className="truncate" dir="auto">
              {sheet ? sheet.title : "Lyrics"}
            </span>
          </button>
        </div>
      )}

      {open && <div className="fixed inset-0 z-[60] bg-black/55 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <section
        aria-label="Vocal booth"
        className={
          open
            ? "rounded-2xl border border-vocals/30 bg-surface p-3 text-sm shadow-sm sm:p-4 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[61] max-lg:mx-auto max-lg:flex max-lg:max-h-[88dvh] max-lg:max-w-2xl max-lg:flex-col max-lg:rounded-b-none max-lg:border-b-0 max-lg:bg-background max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:shadow-2xl"
            : "hidden"
        }
        style={open ? { animation: "sheet-in 0.2s ease-out" } : undefined}
      >
        {/* The grab handle, so the sheet reads as one on a phone. */}
        <div className="mx-auto -mt-1 mb-2 h-1 w-10 rounded-full bg-foreground/15 lg:hidden" aria-hidden />
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-full bg-surface-raised p-1" role="tablist" aria-label="Vocal booth">
            {(
              [
                ["record", Mic, "Record"],
                ["lyrics", ScrollText, "Lyrics"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => openBooth(id)}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${
                  tab === id ? "bg-vocals text-white shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon /> {label}
                {id === "record" && take !== "idle" && tab !== "record" && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-label="(take in progress)" />}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-raised hover:text-foreground"
            aria-label="Close the vocal booth"
            title={take === "recording" ? "Hide — the take keeps recording" : "Close"}
          >
            <X />
          </button>
        </div>

        <div className="mt-3 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:overscroll-contain">
          {/* Both stay mounted: switching to the words mustn't end a take. */}
          <div className={tab === "record" ? "" : "hidden"}>
            <RecordTab signedIn={signedIn} />
          </div>
          <div className={tab === "lyrics" ? "" : "hidden"}>
            <LyricsTools onSing={() => openBooth("record")} />
          </div>
        </div>
      </section>
    </>
  );
}
