"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, Loader2, Pause, Play, RotateCw, ShieldCheck } from "lucide-react";
import { peaksOf } from "@/lib/client/demoSongs";
import { durationLabel, firstStrongPhrase, alignExcerpt, trackIdOf } from "@/lib/client/examplesLibrary";
import type { LabAudio, LabLayer, LabPlayback } from "@/lib/client/examplesPlayer";
import { hasParts } from "@/lib/client/libraryAudio";
import { loadParts, useLibraryTrack, type LibraryState } from "./libraryTracks";
import { SongBadges, StemChips } from "./SongPicker";
import StemRow from "./StemRow";

type Kind = "vocals" | "beat" | "drums" | "bass" | "other";
type Part = "drums" | "bass" | "other";
type Flags = Record<Kind, boolean>;
const PARTS: Part[] = ["drums", "bass", "other"];
const NO_FLAGS: Flags = { vocals: false, beat: false, drums: false, bass: false, other: false };
// The beat already holds drums, bass and other, so the parts start muted:
// all of them on top of the beat would play the music twice.
const PARTS_MUTED: Flags = { ...NO_FLAGS, drums: true, bass: true, other: true };

const INFO: Record<Kind, { label: string; hint: string; color: string }> = {
  vocals: { label: "Vocals", hint: "the voice, as the splitter heard it", color: "var(--vocals)" },
  beat: { label: "Beat", hint: "everything that isn't the voice", color: "var(--beat)" },
  drums: { label: "Drums", hint: "kick, snare, hats", color: "var(--drums)" },
  bass: { label: "Bass", hint: "the low end", color: "var(--bass)" },
  other: { label: "Melody & the rest", hint: "keys, guitars, pads, synths", color: "var(--other)" },
};

type Preset = "full" | "vocals" | "beat" | Part;

const PEAK_BINS = 800;
const toPeaks = (p: number[] | undefined) => new Float32Array(p ?? []);

/** Step 2 for a library song: the real splitter's output, loaded from the library. */
export default function LibrarySplit({
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
  const song = library.songs.find((s) => s.trackId === trackIdOf(songId)) ?? null;
  const { track, error, stage, retry } = useLibraryTrack(song, "full");
  const [parts, setParts] = useState<{ id: string; buffers?: Record<Part, AudioBuffer>; error?: string } | null>(null);
  const [showParts, setShowParts] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState<Flags>(PARTS_MUTED);
  const [solo, setSolo] = useState<Flags>(NO_FLAGS);
  const playback = useRef<LabPlayback | null>(null);

  const partBuffers = parts && parts.id === song?.trackId ? parts.buffers : undefined;
  const partsError = parts && parts.id === song?.trackId ? parts.error : undefined;

  // Peaks: the overview stored at upload at once, the decoded audio's once it's here.
  const peaks = useMemo(() => {
    const out = {} as Record<Kind, Float32Array>;
    for (const k of ["vocals", "beat", ...PARTS] as Kind[]) out[k] = toPeaks(song?.stems[k]?.peaks);
    if (track?.vocals) out.vocals = peaksOf(track.vocals, PEAK_BINS);
    if (track) out.beat = peaksOf(track.beat, PEAK_BINS);
    if (partBuffers) for (const p of PARTS) out[p] = peaksOf(partBuffers[p], PEAK_BINS);
    return out;
  }, [song, track, partBuffers]);

  const gains = useMemo(() => {
    const anySolo = Object.values(solo).some(Boolean);
    const g = {} as Record<Kind, number>;
    for (const k of Object.keys(INFO) as Kind[]) g[k] = anySolo ? (solo[k] ? 1 : 0) : muted[k] ? 0 : 1;
    return g;
  }, [muted, solo]);

  // Where playback starts: the bar the first real vocal line is sung in.
  const startAt = useMemo(() => {
    if (!track) return 0;
    const phrase = firstStrongPhrase(track.phrases, track.barSec);
    if (!phrase) return 0;
    return alignExcerpt({ barLines: track.barLines, barSec: track.barSec, target: phrase.start, duration: track.duration, bars: 1 }).start;
  }, [track]);

  const layers = useMemo<LabLayer[] | null>(() => {
    if (!track?.vocals) return null;
    const out: LabLayer[] = [
      { id: "vocals", buffer: track.vocals, gain: 1, loop: true },
      { id: "beat", buffer: track.beat, gain: 1, loop: true },
    ];
    if (partBuffers) for (const p of PARTS) out.push({ id: p, buffer: partBuffers[p], gain: 1, loop: true });
    return out;
  }, [track, partBuffers]);

  // (Re)start when playing, or when the parts arrive mid-play: from where it
  // was (a pause resumes too), else from the first vocal line.
  const gainsRef = useRef(gains);
  const resume = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    gainsRef.current = gains;
  }, [gains]);
  useEffect(() => {
    if (!playing || !layers) return;
    const from = resume.current?.id === songId ? resume.current.at : startAt;
    const pb = audio.play(
      layers.map((l) => ({ ...l, gain: gainsRef.current[l.id as Kind] })),
      from
    );
    playback.current = pb;
    return () => {
      resume.current = { id: songId, at: pb.position() };
      pb.stop();
      if (playback.current === pb) playback.current = null;
    };
  }, [audio, playing, layers, startAt, songId]);

  useEffect(() => {
    const pb = playback.current;
    if (!pb) return;
    for (const k of Object.keys(gains) as Kind[]) pb.setGain(k, gains[k]);
  }, [gains]);

  // A different song: stop, and start from the full mix again.
  const [shownSong, setShownSong] = useState(songId);
  if (shownSong !== songId) {
    setShownSong(songId);
    setPlaying(false);
    setShowParts(false);
    setMuted(PARTS_MUTED);
    setSolo(NO_FLAGS);
  }

  useEffect(
    () => () => {
      playback.current = null;
      audio.stop();
    },
    [audio]
  );

  const duration = track?.duration ?? 1;
  const fraction = useCallback(() => (playback.current ? playback.current.position() / duration : 0), [duration]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    audio.ensure(); // inside the tap, for iOS
    setPlaying(true);
  };

  const openParts = () => {
    const next = !showParts;
    setShowParts(next);
    if (!next || !song || partBuffers) return;
    const id = song.trackId;
    setParts({ id });
    loadParts(song).then(
      (buffers) => setParts((p) => (p?.id === id ? { id, buffers } : p)),
      (e: unknown) => setParts((p) => (p?.id === id ? { id, error: e instanceof Error ? e.message : "Couldn't load them" } : p))
    );
  };

  const preset = (which: Preset) => {
    if (which === "full") {
      setMuted(PARTS_MUTED);
      setSolo(NO_FLAGS);
      return;
    }
    setMuted(NO_FLAGS);
    setSolo({ ...NO_FLAGS, [which]: true });
  };
  const soloed = (Object.keys(solo) as Kind[]).filter((k) => solo[k]);
  const active: Preset | "custom" =
    soloed.length === 1
      ? soloed[0]
      : soloed.length === 0 && (Object.keys(INFO) as Kind[]).every((k) => muted[k] === PARTS_MUTED[k])
        ? "full"
        : "custom";

  if (!song) {
    if (library.loading)
      return (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="animate-spin" /> Loading the library…
        </p>
      );
    return (
      <p className="text-sm text-muted">
        This song isn&apos;t in the library any more. Go back to step 1 and pick another.
      </p>
    );
  }

  const split = hasParts(song);
  const presets: [Preset, string][] = [
    ["full", "Vocals + beat"],
    ["vocals", "Vocals only"],
    ["beat", "Beat only"],
    ...(partBuffers ? PARTS.map((p): [Preset, string] => [p, `${INFO[p].label} only`]) : []),
  ];

  const row = (k: Kind, small = false) => (
    <StemRow
      key={k}
      label={INFO[k].label}
      hint={INFO[k].hint}
      color={INFO[k].color}
      peaks={peaks[k]}
      muted={muted[k]}
      soloed={solo[k]}
      onMute={() => setMuted({ ...muted, [k]: !muted[k] })}
      onSolo={() => setSolo({ ...solo, [k]: !solo[k] })}
      fraction={playing && layers ? fraction : null}
      small={small}
      revealed
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{song.title}</h3>
          <p className="text-xs text-muted">
            {song.artist}
            {song.duration ? ` · ${durationLabel(song.duration)}` : ""}
          </p>
        </div>
        {track ? <SongBadges song={track} /> : null}
        <StemChips song={song} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 shrink-0 text-success" />
        <span>
          <strong className="text-foreground">The real splitter&apos;s output, nothing staged.</strong> When {song.artist} uploaded this
          song, the AI splitter separated it, and these are the files it produced: the same ones the Studio loads. Vocals + beat together come
          close to the original song, but it&apos;s a reconstruction. Listen for what every splitter leaves behind: a faint ghost of the music
          in the vocal between lines, a breath of reverb or backing vocal left in the beat.
        </span>
      </p>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <AlertTriangle className="text-danger" />
          <span className="flex-1">Couldn&apos;t load this song&apos;s stems: {error}</span>
          <button type="button" onClick={retry} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-medium hover:bg-surface-hover">
            <RotateCw /> Try again
          </button>
        </div>
      ) : !track ? (
        <div className="rounded-xl border border-border bg-surface p-4" role="status" aria-live="polite">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Loader2 className="animate-spin" /> {stage ?? "Getting the stems…"}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
            <div className={`h-full rounded-full bg-gradient-to-r from-vocals to-beat transition-all duration-700 ${stage?.startsWith("Listening") ? "w-4/5" : "w-2/5 animate-pulse"}`} />
          </div>
          <p className="mt-2 text-xs text-muted">Downloads the two stems (a few MB each) and decodes them in your browser. The waveforms below are the overviews saved at upload.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
          </button>
          <div role="group" aria-label="Hear the stems" className="flex flex-wrap overflow-hidden rounded-xl border border-border text-sm">
            {presets.map(([id, label]) => (
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
          <p className="w-full text-xs text-muted">
            Plays from the first vocal line ({durationLabel(startAt)}), looping the whole song. &ldquo;Vocals + beat&rdquo; is as near the original as
            the stems get.
          </p>
        </div>
      )}

      {row("vocals")}
      {row("beat")}

      {split ? (
        <>
          <button
            type="button"
            onClick={openParts}
            aria-expanded={showParts}
            className="flex min-h-10 items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
          >
            <ChevronDown className={showParts ? "rotate-180" : ""} /> {showParts ? "Hide" : "Show"} the beat split further: drums, bass, melody
          </button>
          {showParts && (
            <>
              {partsError ? (
                <p className="text-xs text-danger">Couldn&apos;t load the parts: {partsError}</p>
              ) : !partBuffers ? (
                <p className="flex items-center gap-2 text-xs text-muted" role="status">
                  <Loader2 className="animate-spin" /> Downloading drums, bass and the rest…
                </p>
              ) : (
                <p className="text-xs text-muted">Muted to start with: the beat already contains them. Solo one to hear it on its own.</p>
              )}
              {PARTS.map((p) => row(p, true))}
            </>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">This song was split into vocals and beat only; its beat wasn&apos;t split further into drums, bass and melody.</p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Link href="/upload" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
          Split your own song <ArrowRight />
        </Link>
        <button
          type="button"
          onClick={onNext}
          className="ml-auto flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Next: match a vocal and a beat <ArrowRight />
        </button>
      </div>
    </div>
  );
}
