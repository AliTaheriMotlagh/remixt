"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, SlidersHorizontal, Wand2 } from "lucide-react";
import { bpmLabel, libraryId, nearestInTempo, rankBeats, trackIdOf, type BeatSuggestion, type KnownSong } from "@/lib/client/examplesLibrary";
import type { PairSettings } from "@/lib/client/examplesMatch";
import type { LibrarySong } from "@/lib/client/libraryAudio";
import { camelotCode } from "@/lib/client/musicKey";
import type { LabSong } from "./labSongs";
import { summarize, useSongSummaries, type LibraryState } from "./libraryTracks";

/** How many library beats are measured (beat stem only, one at a time) when a suggestion is asked for. */
const CHECK_AT_MOST = 6;

const LEVEL: Record<BeatSuggestion["level"], { label: string; cls: string }> = {
  great: { label: "Great match", cls: "bg-success/20 text-success" },
  good: { label: "Good match", cls: "bg-beat/20 text-beat" },
  stretch: { label: "Workable", cls: "bg-drums/20 text-drums" },
};

type Found = { forVocal: string; results: { song: LibrarySong; s: BeatSuggestion }[]; checked: number; known: number };

/**
 * Under the song pickers: "Suggest a good beat from the library" for the
 * chosen vocal, and the way on to the Studio for a library pair.
 */
export default function MatchExtras({
  vocal,
  beat,
  settings,
  library,
  onUseBeat,
}: {
  vocal: LabSong | null;
  beat: LabSong | null;
  settings: PairSettings;
  library: LibraryState;
  onUseBeat: (beatId: string) => void;
}) {
  const summaries = useSongSummaries();
  const [found, setFound] = useState<Found | null>(null);
  const [working, setWorking] = useState<{ forVocal: string; text: string } | null>(null);
  // The vocal a search is for; a different one (or leaving the step) abandons it.
  const liveVocal = useRef<string | null>(null);
  useEffect(() => {
    liveVocal.current = settings.vocalId;
    return () => {
      liveVocal.current = null;
    };
  }, [settings.vocalId]);

  const vocalTrack = trackIdOf(settings.vocalId);
  const candidates = library.songs.filter((s) => s.trackId !== vocalTrack);

  const suggest = async () => {
    if (!vocal) return;
    const forVocal = settings.vocalId;
    setFound(null);
    // Measure the few nearest in tempo that haven't been yet (stored tempo
    // is free to read; key needs the audio), never the whole library.
    const tempoOf = (s: LibrarySong) => summaries.get(s.trackId)?.bpm ?? s.bpm;
    const nearest = nearestInTempo(
      vocal.bpm,
      candidates.map((song) => ({ song, bpm: tempoOf(song) })),
      CHECK_AT_MOST
    ).filter((c) => !summaries.has(c.song.trackId));
    let checked = 0;
    const measured = new Map(summaries);
    for (const [i, { song }] of nearest.entries()) {
      setWorking({ forVocal, text: `Measuring ${i + 1} of ${nearest.length}: ${song.title}` });
      try {
        measured.set(song.trackId, await summarize(song));
        checked++;
      } catch {
        // Skip a song that won't load; the rest still count.
      }
      if (liveVocal.current !== forVocal) {
        setWorking((w) => (w?.forVocal === forVocal ? null : w));
        return;
      }
    }
    const known: KnownSong[] = [];
    for (const song of candidates) {
      const s = measured.get(song.trackId);
      if (s) known.push({ id: libraryId(song.trackId), title: song.title, bpm: s.bpm, key: s.key });
    }
    const ranked = rankBeats(vocal, known, 3);
    setWorking(null);
    setFound({
      forVocal,
      checked,
      known: known.length,
      results: ranked.map((s) => ({ song: candidates.find((c) => libraryId(c.trackId) === s.id)!, s })),
    });
  };

  const busy = working?.forVocal === settings.vocalId ? working.text : null;
  const shown = found?.forVocal === settings.vocalId ? found : null;
  const bothLibrary = vocal?.source === "library" && beat?.source === "library";
  // The Studio opens with exactly this pair: /studio?stems=<vocal>,<beat>.
  const vocalStem = bothLibrary ? library.songs.find((s) => s.trackId === trackIdOf(vocal!.id))?.stems.vocals?.id : undefined;
  const beatStem = bothLibrary ? library.songs.find((s) => s.trackId === trackIdOf(beat!.id))?.stems.beat?.id : undefined;
  const studioHref = vocalStem && beatStem ? `/studio?stems=${vocalStem},${beatStem}` : "/studio";

  return (
    <div className="flex flex-col gap-3">
      {candidates.length > 0 && (
        <section aria-label="Suggest a beat" className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={!vocal || !!busy}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Suggest a good match from the library
            </button>
            <p className="min-w-0 flex-1 basis-56 text-xs text-muted" role="status">
              {busy ??
                (vocal
                  ? `Ranks library beats for ${vocal.title}'s vocal by tempo (half and double time count) and key on the Camelot wheel.`
                  : "Waiting for the vocal's analysis…")}
            </p>
          </div>
          {shown && (
            <div className="mt-3 flex flex-col gap-2">
              {shown.results.length === 0 ? (
                <p className="text-sm text-muted">No library beat could be measured. Try again, or pick one by hand.</p>
              ) : (
                <ol className="grid gap-2 md:grid-cols-3">
                  {shown.results.map(({ song, s }, i) => {
                    const id = libraryId(song.trackId);
                    const using = settings.beatId === id;
                    const known = summaries.get(song.trackId);
                    return (
                      <li key={id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-background/40 p-3">
                        <div className="flex items-start gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-bold">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold" title={song.title}>
                              {song.title}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {song.artist}
                              {known ? ` · ${bpmLabel(known.bpm)} BPM · ${camelotCode(known.key)}` : ""}
                            </p>
                          </div>
                        </div>
                        <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL[s.level].cls}`}>{LEVEL[s.level].label}</span>
                        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted">
                          {s.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => onUseBeat(id)}
                          aria-pressed={using}
                          className={`mt-auto flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
                            using ? "bg-brand text-white" : "border border-border hover:bg-surface-hover"
                          }`}
                        >
                          {using ? <Check /> : null} {using ? "Using this beat" : "Use this beat"}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="text-[11px] text-muted">
                From {shown.known} measured library song{shown.known === 1 ? "" : "s"}
                {shown.checked ? ` (${shown.checked} measured just now, the nearest in tempo)` : ""}. Songs never picked or measured on this device
                aren&apos;t ranked yet: their key isn&apos;t known until their beat is analysed.
              </p>
            </div>
          )}
        </section>
      )}

      {bothLibrary && vocal && beat && (
        <section aria-label="Open in the Studio" className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-sm sm:p-4">
          <SlidersHorizontal className="text-brand-strong" />
          <p className="min-w-0 flex-1 basis-56 text-xs text-muted">
            <strong className="text-foreground">Make the whole remix in the Studio.</strong> It opens with{" "}
            <span className="font-semibold text-vocals">{vocal.title} · Vocals</span> on{" "}
            <span className="font-semibold text-beat">{beat.title} · Beat</span> — press Match there and it does the same on the full songs,
            phrase by phrase.
          </p>
          <Link href={studioHref} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-4 font-semibold hover:bg-surface-hover">
            Open the Studio <ArrowRight />
          </Link>
        </section>
      )}
    </div>
  );
}
