"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Download, Loader2, Pause, Play, Scissors } from "lucide-react";
import {
  audioBufferToWav,
  demoFileName,
  demoSongMeta,
  downloadBlob,
  type DemoStem,
} from "@/lib/client/demoSongs";
import type { LabAudio, LabPlayback } from "@/lib/client/examplesPlayer";
import { isLibraryId } from "@/lib/client/examplesLibrary";
import LibrarySplit from "./LibrarySplit";
import type { LibraryState } from "./libraryTracks";
import { SongBadges } from "./SongPicker";
import StemRow from "./StemRow";
import Wave from "./Wave";
import { useDemoSong } from "./useDemoSong";

type Flags = Record<DemoStem, boolean>;
const NONE: Flags = { drums: false, bass: false, chords: false, vocal: false };
const BEAT_PARTS: DemoStem[] = ["drums", "bass", "chords"];
const COLORS: Record<string, string> = {
  vocal: "var(--vocals)",
  beat: "var(--beat)",
  drums: "var(--drums)",
  bass: "var(--bass)",
  chords: "var(--other)",
  mix: "#a1a1b3",
};
const STAGES = ["Listening to the whole song…", "Separating the vocal…", "Separating drums, bass and the rest…", "Done"];

/** Step 2: what a splitter hands back, for a library song (real splitter output) or a demo song. */
export default function SplitStep({
  audio,
  songId,
  onNext,
  library,
}: {
  audio: LabAudio;
  songId: string;
  onNext: () => void;
  library: LibraryState;
}) {
  return isLibraryId(songId) ? (
    <LibrarySplit audio={audio} songId={songId} onNext={onNext} library={library} />
  ) : (
    <DemoSplit audio={audio} songId={songId} onNext={onNext} />
  );
}

/** A demo song's exact stems, and a before/after you can hear. */
function DemoSplit({ audio, songId, onNext }: { audio: LabAudio; songId: string; onNext: () => void }) {
  const meta = demoSongMeta(songId)!;
  const { song, loading, error } = useDemoSong(songId);
  const [phase, setPhase] = useState<"idle" | "splitting" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState<Flags>(NONE);
  const [solo, setSolo] = useState<Flags>(NONE);
  const [showParts, setShowParts] = useState(false);
  const playback = useRef<LabPlayback | null>(null);

  const gains = useMemo(() => {
    const anySolo = Object.values(solo).some(Boolean);
    const g = {} as Record<DemoStem, number>;
    for (const s of ["drums", "bass", "chords", "vocal"] as DemoStem[]) g[s] = anySolo ? (solo[s] ? 1 : 0) : muted[s] ? 0 : 1;
    return g;
  }, [muted, solo]);

  // Gain changes while playing.
  useEffect(() => {
    const pb = playback.current;
    if (!pb) return;
    for (const s of Object.keys(gains) as DemoStem[]) pb.setGain(s, gains[s]);
  }, [gains]);

  // Stop everything when leaving.
  useEffect(
    () => () => {
      playback.current = null;
      audio.stop();
    },
    [audio]
  );

  // The animated "split".
  useEffect(() => {
    if (phase !== "splitting") return;
    const started = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - started) / 2800);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setPhase("done");
      }
    }, 60);
    return () => clearInterval(id);
  }, [phase]);

  const duration = song?.stems.drums.duration ?? 1;
  const fraction = useCallback(() => playback.current?.fraction(duration) ?? 0, [duration]);

  const toggle = () => {
    if (!song) return;
    if (playing) {
      audio.stop();
      playback.current = null;
      setPlaying(false);
      return;
    }
    audio.ensure();
    const useStems = phase === "done";
    playback.current = audio.play(
      useStems
        ? (["drums", "bass", "chords", "vocal"] as DemoStem[]).map((s) => ({ id: s, buffer: song.stems[s], gain: gains[s], loop: true }))
        : [{ id: "mix", buffer: song.mix, gain: 1, loop: true }],
      meta.chorusBar * (240 / meta.bpm)
    );
    setPlaying(true);
  };

  const startSplit = () => {
    if (playing) {
      audio.stop();
      playback.current = null;
      setPlaying(false);
    }
    setProgress(0);
    setPhase("splitting");
  };

  const preset = (which: "full" | "vocal" | "beat") => {
    setMuted(NONE);
    setSolo(
      which === "full"
        ? NONE
        : which === "vocal"
          ? { ...NONE, vocal: true }
          : { drums: true, bass: true, chords: true, vocal: false }
    );
  };
  const active = Object.values(solo).some(Boolean)
    ? solo.vocal && !solo.drums
      ? "vocal"
      : !solo.vocal && solo.drums && solo.bass && solo.chords
        ? "beat"
        : "custom"
    : Object.values(muted).some(Boolean)
      ? "custom"
      : "full";

  const beatMuted = BEAT_PARTS.every((s) => muted[s]);
  const beatSolo = BEAT_PARTS.every((s) => solo[s]);
  const flip = (flags: Flags, set: (f: Flags) => void, stems: DemoStem[], on: boolean) => {
    const next = { ...flags };
    for (const s of stems) next[s] = on;
    set(next);
  };

  if (error) return <p className="text-sm text-danger">Couldn&apos;t render the demo song: {error}</p>;

  const download = (buffer: AudioBuffer | undefined, part?: string) => {
    if (buffer) downloadBlob(audioBufferToWav(buffer), demoFileName(meta, part));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-lg font-bold">{meta.title}</h3>
          <p className="text-xs text-muted">{meta.artist}</p>
        </div>
        <SongBadges song={meta} />
      </div>

      <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
        <strong className="text-foreground">Honest demo:</strong> this song was synthesised stem by stem, so the stems below
        are exact. The real splitter has to <em>estimate</em> them from a finished mix; that is much harder, and the result is close but not
        perfect. To see the real thing, download the full song and drop it into{" "}
        <Link href="/upload" className="font-semibold text-brand-strong underline">
          Upload
        </Link>
        .
      </p>

      {loading || !song ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          <Loader2 className="animate-spin" /> Synthesising the song in your browser…
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Full song</span>
              <span className="text-xs text-muted">one mixed file, like any MP3 you own</span>
              <button
                type="button"
                onClick={() => download(song.mix)}
                className="ml-auto flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-surface-hover"
              >
                <Download /> Download WAV
              </button>
            </div>
            <Wave peaks={song.peaks.mix} color={COLORS.mix} height={60} dim={phase === "done"} fraction={playing && phase !== "done" ? fraction : null} label="Full song waveform" />
          </div>

          {phase === "idle" && (
            <button
              type="button"
              onClick={startSplit}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              <Scissors /> Run the splitter demo
            </button>
          )}

          {phase === "splitting" && (
            <div className="rounded-xl border border-border bg-surface p-4" role="status" aria-live="polite">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Loader2 className="animate-spin" />
                {STAGES[Math.min(2, Math.floor(progress * 3))]}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-gradient-to-r from-vocals to-beat" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">(Animation only: the stems already exist. The real splitter takes a minute or two per song.)</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggle}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
                </button>
                <div role="group" aria-label="Before and after" className="flex overflow-hidden rounded-xl border border-border text-sm">
                  {(
                    [
                      ["full", "Full mix"],
                      ["vocal", "Only vocals"],
                      ["beat", "Only beat"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => preset(id)}
                      aria-pressed={active === id}
                      className={`min-h-11 px-3 font-medium sm:px-4 ${active === id ? "bg-vocals/20 text-foreground" : "text-muted hover:bg-surface-hover"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <StemRow
                label="Vocals"
                hint="the singer, on its own"
                color={COLORS.vocal}
                peaks={song.peaks.vocal}
                muted={muted.vocal}
                soloed={solo.vocal}
                onMute={() => setMuted({ ...muted, vocal: !muted.vocal })}
                onSolo={() => setSolo({ ...solo, vocal: !solo.vocal })}
                onDownload={() => download(song.stems.vocal, "vocals")}
                fraction={playing ? fraction : null}
                revealed
              />
              <StemRow
                label="Beat"
                hint="everything that isn't the voice"
                color={COLORS.beat}
                peaks={song.peaks.beat}
                muted={beatMuted}
                soloed={beatSolo}
                onMute={() => flip(muted, setMuted, BEAT_PARTS, !beatMuted)}
                onSolo={() => flip(solo, setSolo, BEAT_PARTS, !beatSolo)}
                onDownload={() => download(song.beat, "beat")}
                fraction={playing ? fraction : null}
                revealed
              />
              <button
                type="button"
                onClick={() => setShowParts(!showParts)}
                aria-expanded={showParts}
                className="flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
              >
                <ChevronDown className={showParts ? "rotate-180" : ""} /> {showParts ? "Hide" : "Split the beat further"}: drums, bass, other
              </button>
              {showParts &&
                BEAT_PARTS.map((s) => (
                  <StemRow
                    key={s}
                    small
                    label={s === "chords" ? "Other (keys & pads)" : s === "drums" ? "Drums" : "Bass"}
                    color={COLORS[s]}
                    peaks={song.peaks[s]}
                    muted={muted[s]}
                    soloed={solo[s]}
                    onMute={() => setMuted({ ...muted, [s]: !muted[s] })}
                    onSolo={() => setSolo({ ...solo, [s]: !solo[s] })}
                    onDownload={() => download(song.stems[s], s === "chords" ? "other" : s)}
                    fraction={playing ? fraction : null}
                    revealed
                  />
                ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Link
              href="/upload"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Try the real splitter <ArrowRight />
            </Link>
            <button
              type="button"
              onClick={onNext}
              className="ml-auto flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Next: match a vocal and a beat <ArrowRight />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
