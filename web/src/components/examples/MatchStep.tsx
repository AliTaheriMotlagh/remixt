"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { DEMO_SONGS, demoSongMeta, renderDemoSong, sliceBuffer, type DemoSongMeta } from "@/lib/client/demoSongs";
import { TEMPO_MODE_LABELS, analyzePair, type PairAnalysis, type PairSettings, type TempoMode } from "@/lib/client/examplesMatch";
import type { LabAudio, LabLayer, LabPlayback } from "@/lib/client/examplesPlayer";
import { renderPitchTempo } from "@/lib/client/pitchTempo";
import AnalysisCard from "./AnalysisCard";
import BarGrid from "./BarGrid";
import { PRESET_PAIRS } from "./recipes";
import { SongBadges } from "./SongPicker";

type Prepared = {
  key: string;
  raw: { layers: LabLayer[]; beatLength: number } | null;
  matched: { layers: LabLayer[]; beatLength: number } | null;
  error?: string;
};

const settingsKey = (s: PairSettings) => `${s.vocalId}|${s.beatId}|${s.mode}|${s.semitones}`;

async function prepare(vocal: DemoSongMeta, beat: DemoSongMeta, a: PairAnalysis, key: string): Promise<Prepared> {
  try {
    const [vs, bs] = await Promise.all([renderDemoSong(vocal.id), renderDemoSong(beat.id)]);
    const barV = 240 / vocal.bpm;
    const barB = 240 / beat.bpm;
    const startV = vocal.chorusBar * barV;
    const startB = beat.chorusBar * barB;
    const vocalRaw = sliceBuffer(vs.stems.vocal, startV, startV + a.vocalSourceBars * barV);
    const beatRaw = sliceBuffer(bs.beat, startB, startB + a.beatSourceBars * barB);
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

function SongSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input !py-2 text-sm normal-case tracking-normal text-foreground">
        {DEMO_SONGS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} · {s.bpm} BPM · {s.camelot}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Step 3: choose a vocal and a beat, see what matching has to fix, and hear raw against matched. */
export default function MatchStep({
  audio,
  settings,
  onChange,
}: {
  audio: LabAudio;
  settings: PairSettings;
  onChange: (s: PairSettings) => void;
}) {
  const vocal = demoSongMeta(settings.vocalId) ?? DEMO_SONGS[0];
  const beat = demoSongMeta(settings.beatId) ?? DEMO_SONGS[1];
  const analysis = useMemo(() => analyzePair(vocal, beat, settings), [vocal, beat, settings]);
  const key = settingsKey(settings);

  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [view, setView] = useState<"raw" | "matched">("matched");
  const [playing, setPlaying] = useState(false);
  const playback = useRef<LabPlayback | null>(null);

  useEffect(() => {
    let alive = true;
    void prepare(vocal, beat, analysis, key).then((p) => alive && setPrepared(p));
    return () => {
      alive = false;
    };
  }, [vocal, beat, analysis, key]);

  const ready = prepared?.key === key && !prepared.error ? prepared : null;
  const failed = prepared?.key === key ? prepared.error : undefined;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example pairs">
        {PRESET_PAIRS.map((p) => (
          <button
            key={p.label}
            type="button"
            title={p.hint}
            onClick={() => onChange(p.settings)}
            className={`min-h-9 rounded-full border px-3 text-xs font-semibold hover:bg-surface-hover ${
              settingsKey(p.settings) === key ? "border-brand bg-brand/15" : "border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-vocals/40 bg-vocals/5 p-3">
          <SongSelect label="Vocal from" value={settings.vocalId} onChange={(vocalId) => set({ vocalId })} />
          <SongBadges song={vocal} />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-beat/40 bg-beat/5 p-3">
          <SongSelect label="Beat from" value={settings.beatId} onChange={(beatId) => set({ beatId })} />
          <SongBadges song={beat} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1">
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
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Pitch the vocal by
          <select
            value={String(settings.semitones)}
            onChange={(e) => set({ semitones: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
            className="input !py-2 text-sm normal-case tracking-normal text-foreground"
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

      <AnalysisCard vocal={vocal} beat={beat} settings={settings} analysis={analysis} />

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
            : !current
              ? "Rendering the matched version with the Studio's pitch and tempo engine…"
              : view === "raw"
                ? `Raw: both loops start together at their own tempo (${vocal.bpm} and ${beat.bpm} BPM) and drift apart.`
                : `Matched: the vocal is stretched ${((analysis.vocalRatio - 1) * 100).toFixed(1)}% and pitched ${analysis.semitones > 0 ? "+" : ""}${analysis.semitones} semitones, the beat stretched ${((analysis.beatRatio - 1) * 100).toFixed(1)}%. The loop is ${analysis.loopBars} bars on the beat's bar lines.`}
        </p>
        <BarGrid vocal={vocal} beat={beat} analysis={analysis} matched={view === "matched"} fraction={playing && current ? fraction : null} />
      </section>
    </div>
  );
}
