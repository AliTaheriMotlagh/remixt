"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Library, Loader2, Sparkles } from "lucide-react";
import { demoSongMeta } from "@/lib/client/demoSongs";
import { bpmLabel, libraryId, libraryRecipes, trackIdOf, type KnownSong } from "@/lib/client/examplesLibrary";
import { analyzePair, type PairSettings } from "@/lib/client/examplesMatch";
import { camelotCode } from "@/lib/client/musicKey";
import { summarize, useSongSummaries, type LibraryState } from "./libraryTracks";
import { RECIPES } from "./recipes";

/** Songs measured per "find pairings" tap: their beats are decoded one at a time and let go of straight after. */
const MEASURE_AT_MOST = 6;

/** Pairings worked out from real library songs analysed on this device (featured songs first). */
function LibraryRecipes({ library, onLoad }: { library: LibraryState; onLoad: (settings: PairSettings) => void }) {
  const summaries = useSongSummaries();
  const [working, setWorking] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const known = useMemo(() => {
    const out: KnownSong[] = [];
    for (const song of library.songs) {
      const s = summaries.get(song.trackId);
      if (s) out.push({ id: libraryId(song.trackId), title: song.title, bpm: s.bpm, key: s.key, featured: song.featured });
    }
    return out;
  }, [library.songs, summaries]);
  const recipes = useMemo(() => libraryRecipes(known), [known]);
  const unmeasured = library.songs.filter((s) => !summaries.has(s.trackId));

  const measure = async () => {
    // Featured songs first: they're the ones worth building recipes on.
    const queue = [...unmeasured.filter((s) => s.featured), ...unmeasured.filter((s) => !s.featured)].slice(0, MEASURE_AT_MOST);
    for (const [i, song] of queue.entries()) {
      if (!alive.current) return;
      setWorking(`Measuring ${i + 1} of ${queue.length}: ${song.title}`);
      try {
        await summarize(song);
      } catch {
        // Skip it; the others still count.
      }
    }
    if (alive.current) setWorking(null);
  };

  if (library.loading || library.error || library.songs.length < 2) return null;
  const songOf = (id: string) => library.songs.find((s) => s.trackId === trackIdOf(id));

  return (
    <section aria-labelledby="lib-recipes" className="flex flex-col gap-3">
      <h3 id="lib-recipes" className="flex items-center gap-1.5 text-base font-bold">
        <Library className="text-brand-strong" /> From the library
      </h3>
      {recipes.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {recipes.map((r) => {
            const featured = r.vocal.featured || r.beat.featured;
            const credits = [songOf(r.vocal.id), songOf(r.beat.id)].filter((s) => s?.featured && s.credit).map((s) => s!.credit!);
            return (
              <li key={r.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-semibold text-brand-strong">{r.tag}</span>
                  {featured && (
                    <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      <BadgeCheck /> Real songs
                    </span>
                  )}
                </div>
                <h4 className="break-words text-base font-bold leading-snug">{r.title}</h4>
                <p className="text-sm text-muted">{r.why}</p>
                <p className="break-words text-xs text-muted">
                  <span className="font-semibold text-vocals">{r.vocal.title}</span> ({bpmLabel(r.vocal.bpm)} BPM, {camelotCode(r.vocal.key)}) over{" "}
                  <span className="font-semibold text-beat">{r.beat.title}</span> ({bpmLabel(r.beat.bpm)} BPM, {camelotCode(r.beat.key)})
                </p>
                {credits.length > 0 && <p className="break-words text-[11px] text-muted">{credits.join(" · ")}</p>}
                <button
                  type="button"
                  onClick={() => onLoad(r.settings)}
                  className="mt-auto flex min-h-11 items-center justify-center gap-1.5 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  Load into Match <ArrowRight />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {known.length < 2
            ? "Pairings appear here once a few library songs have been measured (picking a song measures it)."
            : `None of the ${known.length} measured songs make a same-key, half-time or small-pitch-shift pair yet. Measure a few more.`}
        </p>
      )}
      {unmeasured.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void measure()}
            disabled={!!working}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-hover disabled:opacity-60"
          >
            {working ? <Loader2 className="animate-spin" /> : <Sparkles />} Find pairings in {Math.min(MEASURE_AT_MOST, unmeasured.length)} more songs
          </button>
          <p className="min-w-0 flex-1 basis-56 text-xs text-muted" role="status">
            {working ?? `${known.length} of ${library.songs.length} library songs measured on this device. Each check downloads one beat stem.`}
          </p>
        </div>
      )}
    </section>
  );
}

/** Step 4: ready-made pairings, each loading straight into the Match step: from the library, then the demo songs. */
export default function RecipeGallery({ onLoad, library }: { onLoad: (settings: PairSettings) => void; library: LibraryState }) {
  return (
    <div className="flex flex-col gap-6">
      <LibraryRecipes library={library} onLoad={onLoad} />
      <section aria-labelledby="demo-recipes" className="flex flex-col gap-3">
        <h3 id="demo-recipes" className="flex items-center gap-1.5 text-base font-bold">
          <Sparkles className="text-brand-strong" /> With the demo songs
        </h3>
        <ul className="grid gap-3 md:grid-cols-2">
          {RECIPES.map((r) => {
            const vocal = demoSongMeta(r.settings.vocalId)!;
            const beat = demoSongMeta(r.settings.beatId)!;
            const a = analyzePair(vocal, beat, r.settings);
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                <span className="self-start rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-semibold text-brand-strong">{r.tag}</span>
                <h3 className="text-base font-bold leading-snug">{r.title}</h3>
                <p className="text-sm text-muted">{r.why}</p>
                <p className="text-xs text-muted">
                  <span className="font-semibold text-vocals">{vocal.title}</span> ({vocal.bpm} BPM, {vocal.camelot}) over{" "}
                  <span className="font-semibold text-beat">{beat.title}</span> ({beat.bpm} BPM, {beat.camelot}) · {a.semitones > 0 ? "+" : ""}
                  {a.semitones} st · {a.targetBpm.toFixed(0)} BPM
                </p>
                <button
                  type="button"
                  onClick={() => onLoad(r.settings)}
                  className="mt-auto flex min-h-11 items-center justify-center gap-1.5 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  Load into Match <ArrowRight />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
