"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, Drum, Guitar, Layers, Mic, Pause, Piano, Play, Plus, type LucideIcon } from "lucide-react";
import Waveform from "./Waveform";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { useStudioStore, type LoadableStem } from "@/lib/client/studioStore";
import { startNewStep, undo, useStudioHistory } from "@/lib/client/studioHistory";
import { useStudioView, type LibraryTab } from "@/lib/client/studioView";
import { fetchStemRows, keptStemRows } from "@/lib/client/stemList";
import { addLines, allLines, groupSongs, hasParts, kindsOf, type Song, type SongStem } from "@/lib/client/songLines";
import { KIND_INFO, STEM_KINDS, type StemKind } from "@/lib/stemKinds";

type StemWithTrack = SongStem & {
  peaks_json: string;
  track_duration: number | null;
  track_bpm: number | null;
};

type ListedStem = StemWithTrack & { peaks: number[] };

/** An icon for each kind of line. */
export const KIND_ICON: Record<StemKind, LucideIcon> = {
  vocals: Mic,
  beat: Layers,
  drums: Drum,
  bass: Guitar,
  other: Piano,
};

// The whole list, kept for the visit: coming back to the Studio shows it
// at once, while a fresh copy loads behind. On a new visit, the copy kept
// on disk (stemList.ts) stands in until then.
let listCache: ListedStem[] | null = null;

// Parsed once here: a fresh array each render would make every waveform
// in the list redraw on every render.
const withPeaks = (stems: StemWithTrack[]): ListedStem[] =>
  stems.map((stem) => ({ ...stem, peaks: JSON.parse(stem.peaks_json || "[]") }));

// The last stems added from this panel, and how long the undo history was
// right after: while nothing else has been done since, taking them back
// out is a plain undo (so redo puts them back).
let lastAdd: { stemIds: string[]; steps: number } | null = null;

function add(stems: LoadableStem[]) {
  const added = addLines(stems);
  if (added.length) lastAdd = { stemIds: stems.map((s) => s.id), steps: useStudioHistory.getState().past.length };
}

/** "added" tapped: the stems come back out — their add undone, or their lanes removed if more happened since. */
function takeOut(stemIds: string[], title: string) {
  const same = lastAdd && lastAdd.stemIds.length === stemIds.length && lastAdd.stemIds.every((id) => stemIds.includes(id));
  if (same && useStudioHistory.getState().past.length === lastAdd!.steps) {
    lastAdd = null;
    undo();
    // Undo may have gone to something else (an AI idea being auditioned).
    if (!useStudioStore.getState().lanes.some((l) => stemIds.includes(l.stemId))) return;
  }
  lastAdd = null;
  startNewStep();
  const { lanes, removeLane } = useStudioStore.getState();
  for (const lane of lanes) if (stemIds.includes(lane.stemId)) removeLane(lane.laneId);
  useStudioView.getState().notify(`Removed “${title}” — ⌘Z to undo`);
}

const TAB_LABEL: Record<LibraryTab, string> = {
  songs: "Songs",
  vocals: KIND_INFO.vocals.plural,
  beat: KIND_INFO.beat.plural,
  drums: KIND_INFO.drums.plural,
  bass: KIND_INFO.bass.plural,
  other: KIND_INFO.other.plural,
};

/** A whole song: preview it, add every line in one tap, or pick lines one by one. */
function SongRow({ song, inMix, previewing, playing, progress }: { song: Song & { peaks: number[] }; inMix: Set<string>; previewing: boolean; playing: boolean; progress: number }) {
  const kinds = kindsOf(song);
  const lines = allLines(song);
  const allIn = lines.length > 0 && lines.every((s) => inMix.has(s.id));
  const someIn = kinds.some((k) => inMix.has(song.stems[k]!.id));
  // What the play button plays: the beat (the song without its voice), else whatever it has.
  const sample = song.stems.beat ?? song.stems.other ?? song.stems.vocals ?? lines[0];
  return (
    <div className={`rounded-lg border p-2 transition-colors ${previewing ? "border-brand bg-surface-hover" : someIn ? "border-border bg-surface-raised" : "border-border hover:border-brand/50 hover:bg-surface-hover"}`}>
      <div className="flex items-center gap-2">
        {sample && (
          <button
            onClick={() => previewPlayer.toggle({ stemId: sample.id, title: song.title, artist: song.artist, kind: sample.kind })}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] text-white pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:text-xs"
            title={previewing && playing ? "Pause preview" : `Preview the ${sample.kind === "vocals" ? "vocal" : "music"}`}
            aria-label={`${previewing && playing ? "Pause" : "Preview"} ${song.title}`}
          >
            {previewing && playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{song.title}</p>
          <p className="truncate text-[11px] text-muted">
            {song.artist}
            {song.bpm ? ` · ${song.bpm.toFixed(0)} BPM` : ""}
          </p>
        </div>
        <button
          onClick={() => (allIn ? takeOut(lines.map((s) => s.id), song.title) : add(lines.filter((s) => !inMix.has(s.id))))}
          className={`group flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors pointer-coarse:px-3 pointer-coarse:py-2 ${
            allIn ? "text-success hover:text-danger" : "bg-brand text-white hover:bg-brand-strong"
          }`}
          title={allIn ? "Take the whole song back out of the mix" : hasParts(song) ? "Vocals, drums, bass and melody — each a lane of its own" : "The vocal and the beat"}
          aria-label={allIn ? `Remove every line of ${song.title}` : `Add every line of ${song.title}`}
        >
          {allIn ? (
            <>
              <span className="group-hover:hidden">
                <CheckIcon /> All in
              </span>
              <span className="hidden group-hover:inline">Take out</span>
            </>
          ) : (
            <>
              <Plus /> All lines
            </>
          )}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={`Lines of ${song.title}`}>
        {kinds.map((kind) => {
          const stem = song.stems[kind]!;
          const added = inMix.has(stem.id);
          const KindIcon = KIND_ICON[kind];
          return (
            <button
              key={kind}
              onClick={() => (added ? takeOut([stem.id], `${song.title} · ${KIND_INFO[kind].label}`) : add([stem]))}
              aria-pressed={added}
              title={added ? "In the mix — tap to take it out" : `Add just the ${KIND_INFO[kind].label.toLowerCase()}`}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition-colors pointer-coarse:px-2.5 pointer-coarse:py-1.5"
              style={{
                borderColor: added ? KIND_INFO[kind].color : "var(--border)",
                background: added ? `color-mix(in srgb, ${KIND_INFO[kind].color} 22%, transparent)` : "transparent",
                color: added ? "var(--foreground)" : "var(--muted)",
              }}
            >
              <KindIcon style={{ color: KIND_INFO[kind].color }} />
              {KIND_INFO[kind].label}
              {added ? <CheckIcon /> : <Plus className="opacity-60" />}
            </button>
          );
        })}
      </div>
      <Waveform peaks={song.peaks} color={previewing ? "var(--brand)99" : "var(--brand)"} progressColor="var(--brand)" progress={previewing ? progress : 0} height={18} className="mt-1.5" />
    </div>
  );
}

export default function StudioLibraryPanel() {
  const [tab, setTab] = useState<LibraryTab>("songs");
  const [all, setAll] = useState<ListedStem[] | null>(() => listCache);
  const [query, setQuery] = useState("");
  const lanes = useStudioStore((s) => s.lanes);
  const preview = usePreviewState();

  // Asked for a tab from elsewhere ("+ Add a vocal" in the Easy studio): show it.
  const asked = useStudioView((s) => s.libraryTab);
  const askedAt = useStudioView((s) => s.libraryAsk);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the store: a tab asked for elsewhere
    if (asked && askedAt) setTab(asked);
  }, [asked, askedAt]);

  useEffect(() => {
    let cancelled = false;
    let fresh = false;
    if (!listCache) {
      void keptStemRows<StemWithTrack>().then((kept) => {
        if (kept && !cancelled && !fresh) setAll((current) => current ?? withPeaks(kept));
      });
    }
    fetchStemRows<StemWithTrack>()
      .then((rows) => {
        fresh = true;
        const stems = withPeaks(rows);
        listCache = stems;
        if (!cancelled) setAll(stems);
      })
      .catch(() => {
        // Keep whatever was cached; the list just isn't refreshed.
        if (!cancelled) setAll((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = all === null;
  const tabs: LibraryTab[] = ["songs", ...STEM_KINDS.filter((k) => k === "vocals" || k === "beat" || all?.some((s) => s.kind === k))];
  const q = query.trim().toLowerCase();
  const matches = (s: { track_title: string; artist_name: string; track_tags?: string[] | null }) =>
    !q || s.track_title.toLowerCase().includes(q) || s.artist_name.toLowerCase().includes(q) || (s.track_tags ?? []).some((t) => t.includes(q));

  const songs = useMemo(
    () =>
      groupSongs(all ?? []).map((song) => {
        const shown = (song.stems.beat ?? song.stems.vocals ?? Object.values(song.stems)[0]) as ListedStem | undefined;
        return { ...song, peaks: shown?.peaks ?? [] };
      }),
    [all]
  );
  const shownSongs = songs.filter((song) => matches({ track_title: song.title, artist_name: song.artist, track_tags: song.tags }));
  const stems = tab === "songs" ? [] : (all ?? []).filter((s) => s.kind === tab && matches(s));
  const accent = tab === "songs" ? "var(--brand)" : KIND_INFO[tab].color;
  const addedStemIds = new Set(lanes.map((l) => l.stemId));
  const empty = tab === "songs" ? shownSongs.length === 0 : stems.length === 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="scrollbar-thin flex overflow-x-auto rounded-lg border border-border bg-background p-1" role="tablist" aria-label="What to add">
          {tabs.map((kind) => (
            <button
              key={kind}
              role="tab"
              aria-selected={tab === kind}
              onClick={() => setTab(kind)}
              className="flex-1 shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors pointer-coarse:px-3 pointer-coarse:py-2.5"
              style={{
                background: tab === kind ? (kind === "songs" ? "var(--brand)" : KIND_INFO[kind].color) : "transparent",
                color: tab === kind ? "white" : "var(--muted)",
              }}
            >
              {TAB_LABEL[kind]}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          type="search"
          name="stem-search"
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search stems"
          className="input mt-2 !py-1.5 text-xs"
        />
        {tab === "songs" && (
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
            Every song comes in lines — vocals, drums, bass and melody. Add them all and remix each one, or pick the lines you want.
          </p>
        )}
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {loading && <p className="p-3 text-xs text-muted">Loading…</p>}
        {!loading && empty && <p className="p-3 text-xs text-muted">Nothing here yet.</p>}
        <div className="flex flex-col gap-2">
          {tab === "songs" &&
            shownSongs.map((song) => {
              const previewing = !!preview.current && Object.values(song.stems).some((s) => s?.id === preview.current?.stemId);
              return <SongRow key={song.trackId} song={song} inMix={addedStemIds} previewing={previewing} playing={preview.playing} progress={preview.progress} />;
            })}
          {stems.map((stem) => {
            const added = addedStemIds.has(stem.id);
            const previewing = preview.current?.stemId === stem.id;
            return (
              <div
                key={stem.id}
                className={`rounded-lg border p-2 transition-colors ${
                  previewing
                    ? "border-brand bg-surface-hover"
                    : added
                      ? "border-border bg-surface-raised"
                      : "border-border hover:border-brand/50 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      previewPlayer.toggle({
                        stemId: stem.id,
                        title: stem.track_title,
                        artist: stem.artist_name,
                        kind: stem.kind,
                      })
                    }
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-white pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:text-xs"
                    style={{ background: accent }}
                    title={previewing && preview.playing ? "Pause preview" : "Preview"}
                    aria-label={`${previewing && preview.playing ? "Pause" : "Preview"} ${stem.track_title}`}
                  >
                    {previewing && preview.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {stem.track_title}
                  </span>
                  <button
                    onClick={() => (added ? takeOut([stem.id], stem.track_title) : add([stem]))}
                    title={added ? "Take it back out of the mix" : undefined}
                    aria-label={added ? `Remove ${stem.track_title} from the mix` : `Add ${stem.track_title} to the mix`}
                    className={`group shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors pointer-coarse:rounded-lg pointer-coarse:px-3 pointer-coarse:py-2 pointer-coarse:text-xs ${
                      added
                        ? "border-transparent text-success hover:border-danger/60 hover:text-danger"
                        : "border-border text-muted hover:border-brand/60 hover:text-foreground"
                    }`}
                  >
                    {added ? (
                      <>
                        <span className="group-hover:hidden">added ✓</span>
                        <span className="hidden group-hover:inline">undo</span>
                      </>
                    ) : (
                      "+ add"
                    )}
                  </button>
                </div>
                <p className="mt-0.5 truncate pl-8 text-[11px] text-muted pointer-coarse:pl-11">
                  {stem.artist_name}
                  {stem.track_bpm ? ` · ${stem.track_bpm.toFixed(0)} BPM` : ""}
                </p>
                <Waveform
                  peaks={stem.peaks}
                  color={previewing ? `${accent}99` : accent}
                  progressColor={accent}
                  progress={previewing ? preview.progress : 0}
                  height={20}
                  className="mt-1"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
