"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play, RotateCw, Square } from "lucide-react";
import { DEMO_SONGS, demoSongMeta, renderDemoSong, sliceBuffer } from "@/lib/client/demoSongs";
import { bpmLabel, isLibraryId, libraryId, trackIdOf } from "@/lib/client/examplesLibrary";
import { TEMPO_MODE_LABELS, analyzePair, type PairAnalysis, type PairSettings, type TempoMode } from "@/lib/client/examplesMatch";
import type { LabAudio, LabLayer, LabPlayback } from "@/lib/client/examplesPlayer";
import { renderPitchTempo } from "@/lib/client/pitchTempo";
import AnalysisCard from "./AnalysisCard";
import BarGrid from "./BarGrid";
import { demoLabSong, libraryLabSong, type LabSong } from "./labSongs";
import { useLibraryTrack, useSongSummaries, type LibraryState } from "./libraryTracks";
import MatchExtras from "./MatchExtras";
import { PRESET_PAIRS } from "./recipes";
import { SongBadges } from "./SongPicker";

type Prepared = {
  key: string;
  raw: { layers: LabLayer[]; beatLength: number } | null;
  matched: { layers: LabLayer[]; beatLength: number } | null;
  error?: string;
};

const settingsKey = (s: PairSettings) => `${s.vocalId}|${s.beatId}|${s.mode}|${s.semitones}`;

/** One side of the pair, ready: the song and how to get its audio (the vocal stem, or the beat). */
type ReadySide = { song: LabSong; audio: () => Promise<AudioBuffer> };
type Side = { ready: ReadySide | null; error: string | null; stage: string | undefined; retry: () => void };

/** A demo song (synthesised on demand) or a library song (decoded and analysed on demand) as one side of the pair. */
function useSide(id: string, role: "vocal" | "beat", library: LibraryState): Side {
  const trackId = trackIdOf(id);
  const libSong = trackId ? (library.songs.find((s) => s.trackId === trackId) ?? null) : null;
  const lib = useLibraryTrack(libSong, role === "vocal" ? "full" : "beat");
  const demo = trackId ? null : (demoSongMeta(id) ?? (role === "vocal" ? DEMO_SONGS[0] : DEMO_SONGS[1]));
  const { track } = lib;

  const ready = useMemo<ReadySide | null>(() => {
    if (demo) {
      return {
        song: demoLabSong(demo),
        audio: () => renderDemoSong(demo.id).then((r) => (role === "vocal" ? r.stems.vocal : r.beat)),
      };
    }
    if (!track || (role === "vocal" && !track.vocals)) return null;
    const buffer = role === "vocal" ? track.vocals! : track.beat;
    return { song: libraryLabSong(track, role), audio: () => Promise.resolve(buffer) };
  }, [demo, track, role]);

  const missing = trackId && !libSong && !library.loading ? "This song isn't in the library any more." : null;
  return {
    ready,
    error: missing ?? (library.error && trackId ? library.error : lib.error),
    stage: lib.stage ?? (trackId && library.loading ? "Loading the library…" : undefined),
    retry: lib.retry,
  };
}

/** Slices both excerpts on their bar lines and renders the matched pair with the Studio's pitch/tempo engine. */
async function prepare(vocal: ReadySide, beat: ReadySide, a: PairAnalysis, key: string): Promise<Prepared> {
  try {
    const [vs, bs] = await Promise.all([vocal.audio(), beat.audio()]);
    const barV = 240 / vocal.song.bpm;
    const barB = 240 / beat.song.bpm;
    const startV = vocal.song.excerptStart;
    const startB = beat.song.excerptStart;
    // Only the excerpt is rendered: seconds of audio, not the whole song.
    const vocalRaw = sliceBuffer(vs, startV, startV + a.vocalSourceBars * barV);
    const beatRaw = sliceBuffer(bs, startB, startB + a.beatSourceBars * barB);
    // Only the real thing: the same SoundTouch pitch/tempo renderer the Studio uses.
    const scratch = new OfflineAudioContext(2, 1, 44100);
    const [vocalM, beatM] = await Promise.all([
      renderPitchTempo(scratch, vocalRaw, { tempo: a.vocalRatio, pitchSemitones: a.semitones }),
      renderPitchTempo(scratch, beatRaw, { tempo: a.beatRatio, pitchSemitones: 0 }),
    ]);
    const loop = Math.min((a.loopBars * 240) / a.targetBpm, vocalM.duration, beatM.duration);
    return {
      key,
      raw: {
        layers: [
          { id: "vocal", buffer: vocalRaw, gain: 1, loop: true, loopEnd: vocalRaw.duration },
          { id: "beat", buffer: beatRaw, gain: 0.85, loop: true, loopEnd: beatRaw.duration },
        ],
        beatLength: beatRaw.duration,
      },
      matched: {
        layers: [
          { id: "vocal", buffer: vocalM, gain: 1, loop: true, loopEnd: loop },
          { id: "beat", buffer: beatM, gain: 0.85, loop: true, loopEnd: loop },
        ],
        beatLength: loop,
      },
    };
  } catch (e) {
    return { key, raw: null, matched: null, error: e instanceof Error ? e.message : "Couldn't prepare the audio" };
  }
}

function SongSelect({
  label,
  value,
  onChange,
  library,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  library: LibraryState;
}) {
  const summaries = useSongSummaries();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-full min-w-0 !py-2 text-sm normal-case tracking-normal text-foreground">
        {(
          [
            ["Real songs (featured)", library.songs.filter((s) => s.featured)],
            ["From the library", library.songs.filter((s) => !s.featured)],
          ] as const
        ).map(([group, songs]) =>
          songs.length > 0 ? (
            <optgroup key={group} label={group}>
              {songs.map((s) => {
                const bpm = summaries.get(s.trackId)?.bpm ?? s.bpm;
                return (
                  <option key={s.trackId} value={libraryId(s.trackId)}>
                    {s.title} · {s.artist}
                    {bpm ? ` · ${bpmLabel(bpm)} BPM` : ""}
                  </option>
                );
              })}
            </optgroup>
          ) : null
        )}
        {isLibraryId(value) && !library.songs.some((s) => libraryId(s.trackId) === value) && <option value={value}>Library song</option>}
        <optgroup label="Demo songs (synthesised)">
          {DEMO_SONGS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.bpm} BPM · {s.camelot}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function SideInfo({ side }: { side: Side }) {
  if (side.ready)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SongBadges song={side.ready.song} />
        <span className="text-[11px] text-muted">{side.ready.song.source === "library" ? `Real stem · ${side.ready.song.artist}` : "Demo song"}</span>
      </div>
    );
  if (side.error)
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-danger">
        <AlertTriangle /> {side.error}
        <button type="button" onClick={side.retry} className="flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-foreground hover:bg-surface-hover">
          <RotateCw /> Retry
        </button>
      </p>
    );
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted" role="status">
      <Loader2 className="animate-spin" /> {side.stage ?? "Loading…"}
    </p>
  );
}

/** Step 3: choose a vocal and a beat (library or demo), see what matching has to fix, and hear raw against matched. */
export default function MatchStep({
  audio,
  settings,
  onChange,
  library,
}: {
  audio: LabAudio;
  settings: PairSettings;
  onChange: (s: PairSettings) => void;
  library: LibraryState;
}) {
  const vocalSide = useSide(settings.vocalId, "vocal", library);
  const beatSide = useSide(settings.beatId, "beat", library);
  const vocal = vocalSide.ready;
  const beat = beatSide.ready;
  const analysis = useMemo(() => (vocal && beat ? analyzePair(vocal.song, beat.song, settings) : null), [vocal, beat, settings]);
  // Includes what was measured, so a re-analysed song never plays a stale render.
  const key = vocal && beat ? `${settingsKey(settings)}|${vocal.song.bpm}@${vocal.song.excerptStart}|${beat.song.bpm}@${beat.song.excerptStart}` : null;

  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [view, setView] = useState<"raw" | "matched">("matched");
  const [playing, setPlaying] = useState(false);
  const playback = useRef<LabPlayback | null>(null);

  useEffect(() => {
    if (!vocal || !beat || !analysis || !key) return;
    let alive = true;
    // A render can't be stopped half-way, but one for a pair that's no longer chosen is dropped.
    void prepare(vocal, beat, analysis, key).then((p) => alive && setPrepared(p));
    return () => {
      alive = false;
    };
  }, [vocal, beat, analysis, key]);

  const ready = prepared && prepared.key === key && !prepared.error ? prepared : null;
  const failed = prepared && prepared.key === key ? prepared.error : undefined;
  const current = ready ? ready[view] : null;

  // Sound: (re)start when playing, the A/B choice or the audio changes.
  useEffect(() => {
    if (!playing || !current) return;
    const pb = audio.play(current.layers, 0);
    playback.current = pb;
    return () => {
      pb.stop();
      if (playback.current === pb) playback.current = null;
    };
  }, [audio, playing, current]);

  // Leaving the step silences it.
  useEffect(
    () => () => {
      playback.current = null;
      audio.stop();
    },
    [audio]
  );

  const beatLength = current?.beatLength ?? 1;
  const fraction = useCallback(() => {
    const pb = playback.current;
    return pb ? (pb.elapsed() % beatLength) / beatLength : 0;
  }, [beatLength]);

  const set = (patch: Partial<PairSettings>) => onChange({ ...settings, ...patch });

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    audio.ensure(); // within the tap, for iOS
    setPlaying(true);
  };

  const loadingText = !vocal || !beat ? "Getting both songs ready…" : "Rendering the matched excerpt with the Studio's pitch and tempo engine…";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example pairs">
        {PRESET_PAIRS.map((p) => (
          <button
            key={p.label}
            type="button"
            title={p.hint}
            onClick={() => onChange(p.settings)}
            className={`min-h-10 rounded-full border px-3 text-xs font-semibold hover:bg-surface-hover ${
              settingsKey(p.settings) === settingsKey(settings) ? "border-brand bg-brand/15" : "border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-vocals/40 bg-vocals/5 p-3">
          <SongSelect label="Vocal from" value={settings.vocalId} onChange={(vocalId) => set({ vocalId })} library={library} />
          <SideInfo side={vocalSide} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-beat/40 bg-beat/5 p-3">
          <SongSelect label="Beat from" value={settings.beatId} onChange={(beatId) => set({ beatId })} library={library} />
          <SideInfo side={beatSide} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Which song keeps its tempo?</legend>
          <div className="flex overflow-hidden rounded-xl border border-border text-xs sm:text-sm">
            {(Object.keys(TEMPO_MODE_LABELS) as TempoMode[]).map((m) => (
              <button
                key={m}
                type="button"
                title={TEMPO_MODE_LABELS[m].hint}
                aria-pressed={settings.mode === m}
                onClick={() => set({ mode: m })}
                className={`min-h-10 flex-1 px-2 font-medium ${settings.mode === m ? "bg-brand text-white" : "text-muted hover:bg-surface-hover"}`}
              >
                {m === "beat" ? "Beat" : m === "vocal" ? "Vocal" : "Middle"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">{TEMPO_MODE_LABELS[settings.mode].hint}</p>
        </fieldset>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Pitch the vocal by
          <select
            value={String(settings.semitones)}
            onChange={(e) => set({ semitones: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
            className="input w-full min-w-0 !py-2 text-sm normal-case tracking-normal text-foreground"
          >
            <option value="auto">Auto (best key match)</option>
            {Array.from({ length: 12 }, (_, i) => i - 6).map((n) => (
              <option key={n} value={n}>
                {n > 0 ? `+${n}` : n} semitones{n === 0 ? " (leave the key alone)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <MatchExtras vocal={vocal?.song ?? null} beat={beat?.song ?? null} settings={settings} library={library} onUseBeat={(beatId) => set({ beatId })} />

      {vocal && beat && analysis ? (
        <AnalysisCard vocal={vocal.song} beat={beat.song} settings={settings} analysis={analysis} />
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-muted" role="status">
          <Loader2 className="animate-spin" /> Measuring tempo, key and bars with the Studio&apos;s analysis…
        </div>
      )}

      <section aria-label="Hear it" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!current}
            aria-label={playing ? "Stop" : "Play"}
            className="flex size-14 items-center justify-center rounded-full bg-brand text-xl text-white hover:bg-brand-strong disabled:opacity-50"
          >
            {!current && !failed ? <Loader2 className="animate-spin" /> : playing ? <Square /> : <Play />}
          </button>
          <div role="group" aria-label="Raw or matched" className="flex flex-1 overflow-hidden rounded-xl border border-border text-sm sm:max-w-md">
            {(
              [
                ["raw", "Raw (unmatched)"],
                ["matched", "Matched"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`min-h-14 flex-1 px-3 font-semibold ${
                  view === id ? (id === "raw" ? "bg-danger/25 text-foreground" : "bg-success/25 text-foreground") : "text-muted hover:bg-surface-hover"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted" role="status">
          {failed
            ? `Couldn't prepare the audio: ${failed}`
            : !current || !analysis || !vocal || !beat
              ? loadingText
              : view === "raw"
                ? `Raw: both loops start together at their own tempo (${bpmLabel(vocal.song.bpm)} and ${bpmLabel(beat.song.bpm)} BPM) and drift apart.`
                : `Matched: the vocal is stretched ${((analysis.vocalRatio - 1) * 100).toFixed(1)}% and pitched ${analysis.semitones > 0 ? "+" : ""}${analysis.semitones} semitones, the beat stretched ${((analysis.beatRatio - 1) * 100).toFixed(1)}%. The loop is ${analysis.loopBars} bars on the beat's bar lines.`}
        </p>
        {vocal && beat && analysis && (
          <>
            <BarGrid vocal={vocal.song} beat={beat.song} analysis={analysis} matched={view === "matched"} fraction={playing && current ? fraction : null} />
            {(vocal.song.source === "library" || beat.song.source === "library") && (
              <p className="text-[11px] text-muted">
                {vocal.song.source === "library"
                  ? "The vocal's excerpt starts on the bar line of its first full line (found from its phrases and its own beat's downbeats). "
                  : ""}
                {beat.song.source === "library" ? "The beat's starts on the first bar where it plays at full strength. " : ""}
                Bars marked solid are sung; their timing comes from the real audio, so the grid is the analysis&apos;s best estimate.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
