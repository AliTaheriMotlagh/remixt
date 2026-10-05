"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, BadgeCheck, Check, Library, Loader2, Play, RotateCw, Search, Sparkles, Square, Upload } from "lucide-react";
import { DEMO_SONGS, demoSongMeta, renderDemoSong, type DemoSongMeta } from "@/lib/client/demoSongs";
import { bpmLabel, durationLabel, isLibraryId, libraryId, trackIdOf } from "@/lib/client/examplesLibrary";
import { hasParts, type LibrarySong } from "@/lib/client/libraryAudio";
import { camelotCode, keyLabel, type MusicalKey } from "@/lib/client/musicKey";
import type { LabAudio } from "@/lib/client/examplesPlayer";
import { loadTrack, useSongSummaries, useTrackStage, type LibraryState } from "./libraryTracks";

export function SongBadges({ song }: { song: { bpm: number; key: MusicalKey; camelot?: string } }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span className="rounded-full bg-surface-raised px-2 py-0.5 tabular-nums">{bpmLabel(song.bpm)} BPM</span>
      <span className="rounded-full bg-surface-raised px-2 py-0.5">{keyLabel(song.key)}</span>
      <span className="rounded-full bg-brand/20 px-2 py-0.5 text-brand-strong" title="Camelot wheel code: DJs mix tracks whose numbers are the same or one apart">
        {song.camelot ?? camelotCode(song.key)}
      </span>
    </div>
  );
}

/** Which stems a library song has, as small chips. */
export function StemChips({ song }: { song: LibrarySong }) {
  const kinds = hasParts(song) ? ["Vocals", "Beat", "Drums", "Bass", "Other"] : ["Vocals", "Beat"];
  return (
    <div className="flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted" aria-label={`Stems: ${kinds.join(", ")}`}>
      {kinds.map((k) => (
        <span key={k} className="rounded border border-border px-1.5 py-0.5">
          {k}
        </span>
      ))}
    </div>
  );
}

/** Tempo/key badges for a library song: measured if it's been analysed on this device, else the stored tempo. */
export function LibraryBadges({ song }: { song: LibrarySong }) {
  const summaries = useSongSummaries();
  const known = summaries.get(song.trackId);
  const stage = useTrackStage(song.trackId);
  if (known) return <SongBadges song={known} />;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {song.bpm ? <span className="rounded-full bg-surface-raised px-2 py-0.5 tabular-nums">{bpmLabel(song.bpm)} BPM</span> : null}
      {stage ? (
        <span className="flex items-center gap-1 text-muted">
          <Loader2 className="animate-spin" /> {stage}
        </span>
      ) : (
        <span className="font-normal text-muted">Key: found when you pick it</span>
      )}
    </div>
  );
}

const PAGE = 24;

/** Said when no song is featured: why there are no famous songs here, and what to do instead. */
function NoFeaturedNote() {
  return (
    <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
      <strong className="text-foreground">Why no chart hits?</strong> Commercial songs can&apos;t be shipped with the app. The Remixt team can
      feature library songs it has the rights to (Creative Commons tracks, say, credited to their artists), and they&apos;ll appear here first.
      Meanwhile, every song below is a real upload, and you can{" "}
      <Link href="/upload" className="font-semibold text-brand-strong underline">
        upload your own
      </Link>{" "}
      to try it.
    </p>
  );
}

function LibraryCards({ songs, songId, onPick }: { songs: LibrarySong[]; songId: string; onPick: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {songs.map((song) => {
        const id = libraryId(song.trackId);
        const selected = id === songId;
        return (
          <li
            key={song.trackId}
            className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-4 transition-colors ${selected ? "border-brand bg-brand/10" : "border-border bg-surface"}`}
          >
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight" title={song.title}>
                {song.title}
              </h3>
              <p className="truncate text-xs text-muted">
                {song.artist}
                {song.duration ? ` · ${durationLabel(song.duration)}` : ""}
              </p>
              {song.featured && song.credit ? <p className="mt-1 break-words text-[11px] text-muted">{song.credit}</p> : null}
            </div>
            <LibraryBadges song={song} />
            <StemChips song={song} />
            <button
              type="button"
              onClick={() => {
                onPick(id);
                // Start decoding and analysing now, so the Split step is ready sooner.
                void loadTrack(song, "full").catch(() => {});
              }}
              aria-pressed={selected}
              className={`mt-auto flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                selected ? "bg-brand text-white" : "bg-surface-raised hover:bg-surface-hover"
              }`}
            >
              {selected ? <Check /> : null}
              {selected ? "Picked" : "Pick"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The library tab: search and pick a real, already-split song. */
function LibraryList({ library, songId, onPick }: { library: LibraryState; songId: string; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? library.songs.filter((s) => `${s.title} ${s.artist} ${s.credit ?? ""} ${s.tags.join(" ")}`.toLowerCase().includes(q))
        : library.songs,
    [library.songs, q]
  );
  const hasFeatured = library.songs.some((s) => s.featured);
  // Paged across both sections, featured songs first.
  const page = [...filtered.filter((s) => s.featured), ...filtered.filter((s) => !s.featured)].slice(0, shown);
  const featured = page.filter((s) => s.featured);
  const rest = page.filter((s) => !s.featured);

  if (library.loading)
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-6 text-sm text-muted" role="status">
        <Loader2 className="animate-spin" /> Loading the library…
      </p>
    );
  if (library.error)
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
        <p>Couldn&apos;t load the library: {library.error}. The demo songs still work.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={library.reload} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-medium hover:bg-surface-hover">
            <RotateCw /> Try again
          </button>
          <Link href="/upload" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-medium hover:bg-surface-hover">
            <Upload /> Upload a song
          </Link>
        </div>
      </div>
    );
  if (library.songs.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <NoFeaturedNote />
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          <p>
            <strong className="text-foreground">The library is empty so far.</strong> Upload a song: the AI splitter separates its vocals and beat,
            and it shows up here, ready to split and match. Until then, try the demo songs.
          </p>
          <Link href="/upload" className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong">
            <Upload /> Upload a song
          </Link>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search by title, artist or tag"
          aria-label="Search library songs"
          className="input w-full !pl-9"
        />
      </label>
      {!hasFeatured && <NoFeaturedNote />}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No song matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <>
          {featured.length > 0 && (
            <section aria-labelledby="real-songs" className="flex flex-col gap-2">
              <h3 id="real-songs" className="flex items-center gap-1.5 text-sm font-bold">
                <BadgeCheck className="text-brand-strong" /> Real songs
                <span className="font-normal text-muted">· featured by the Remixt team, credited to their artists</span>
              </h3>
              <LibraryCards songs={featured} songId={songId} onPick={onPick} />
            </section>
          )}
          {rest.length > 0 && (
            <section aria-labelledby="more-songs" className="flex flex-col gap-2">
              {featured.length > 0 && (
                <h3 id="more-songs" className="text-sm font-bold">
                  More from the library <span className="font-normal text-muted">· uploaded by Remixt users</span>
                </h3>
              )}
              <LibraryCards songs={rest} songId={songId} onPick={onPick} />
            </section>
          )}
        </>
      )}
      {filtered.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="min-h-10 self-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-hover"
        >
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </div>
  );
}

/** Step 1: real songs from the library, or the demo songs; either can be split and matched. */
export default function SongPicker({
  audio,
  songId,
  onPick,
  library,
}: {
  audio: LabAudio;
  songId: string;
  onPick: (id: string) => void;
  library: LibraryState;
}) {
  const [tab, setTab] = useState<"library" | "demo" | null>(null);
  // Until a tab is chosen: the library when it has songs (or might), else the demos.
  const current = tab ?? (library.loading || library.songs.length > 0 ? "library" : "demo");
  const pickedTitle = isLibraryId(songId)
    ? library.songs.find((s) => s.trackId === trackIdOf(songId))?.title
    : demoSongMeta(songId)?.title;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Where the song comes from" className="flex overflow-hidden rounded-xl border border-border text-sm">
          {(
            [
              ["library", "From the library", Library],
              ["demo", "Demo songs", Sparkles],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={current === id}
              onClick={() => setTab(id)}
              className={`flex min-h-11 items-center gap-1.5 px-3 font-semibold sm:px-4 ${current === id ? "bg-brand text-white" : "text-muted hover:bg-surface-hover"}`}
            >
              <Icon /> {label}
              {id === "library" && library.songs.length > 0 ? (
                <span className={`rounded-full px-1.5 text-[11px] ${current === id ? "bg-white/20" : "bg-surface-raised"}`}>{library.songs.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        {pickedTitle && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <AudioLines /> Picked: <strong className="text-foreground">{pickedTitle}</strong>
          </p>
        )}
      </div>
      <p className="text-xs text-muted">
        {current === "library"
          ? "Real songs other people uploaded. Each was split into stems by the AI splitter when it was uploaded; picking one downloads those stems and measures its tempo, key and bars."
          : "Six original songs, synthesised in your browser. Their stems are exact, because they were made stem by stem."}
      </p>
      {current === "library" ? (
        <LibraryList library={library} songId={songId} onPick={onPick} />
      ) : (
        <DemoList audio={audio} songId={songId} onPick={onPick} />
      )}
    </div>
  );
}

/** The demo songs as cards, each with a short preview. */
function DemoList({
  audio,
  songId,
  onPick,
}: {
  audio: LabAudio;
  songId: string;
  onPick: (id: string) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      audio.stop();
    };
  }, [audio]);

  const stop = () => {
    token.current++;
    if (timer.current) clearTimeout(timer.current);
    audio.stop();
    setPreviewing(null);
    setLoading(null);
  };

  const preview = async (song: DemoSongMeta) => {
    if (previewing === song.id || loading === song.id) return stop();
    audio.ensure(); // inside the tap: iOS only unlocks audio from a gesture
    const mine = ++token.current;
    if (timer.current) clearTimeout(timer.current);
    audio.stop();
    setPreviewing(null);
    setLoading(song.id);
    try {
      const rendered = await renderDemoSong(song.id);
      if (!alive.current || token.current !== mine) return;
      const barSec = 240 / song.bpm;
      audio.play([{ id: "mix", buffer: rendered.mix, gain: 1 }], song.chorusBar * barSec);
      setLoading(null);
      setPreviewing(song.id);
      timer.current = setTimeout(stop, barSec * 6 * 1000);
    } catch {
      if (alive.current) setLoading(null);
    }
  };

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DEMO_SONGS.map((song) => {
        const selected = song.id === songId;
        return (
          <li
            key={song.id}
            className={`flex flex-col gap-2 rounded-2xl border p-4 transition-colors ${
              selected ? "border-brand bg-brand/10" : "border-border bg-surface"
            }`}
            style={{ borderTopColor: selected ? undefined : song.accent, borderTopWidth: 3 }}
          >
            <div>
              <h3 className="text-base font-bold leading-tight">{song.title}</h3>
              <p className="text-xs text-muted">
                {song.artist} · {song.genre}
              </p>
            </div>
            <SongBadges song={song} />
            <p className="text-sm text-muted">{song.description}</p>
            <div className="mt-auto flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => void preview(song)}
                aria-label={`${previewing === song.id ? "Stop" : "Preview"} ${song.title}`}
                className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
              >
                {loading === song.id ? <Loader2 className="animate-spin" /> : previewing === song.id ? <Square /> : <Play />}
                {loading === song.id ? "Rendering…" : previewing === song.id ? "Stop" : "Preview"}
              </button>
              <button
                type="button"
                onClick={() => onPick(song.id)}
                aria-pressed={selected}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  selected ? "bg-brand text-white" : "bg-surface-raised hover:bg-surface-hover"
                }`}
              >
                {selected ? <Check /> : null}
                {selected ? "Picked" : "Pick"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
