"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import Waveform from "./Waveform";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { useStudioStore, type LoadableStem } from "@/lib/client/studioStore";
import { startNewStep, undo, useStudioHistory } from "@/lib/client/studioHistory";
import { useStudioView } from "@/lib/client/studioView";
import { fetchStemRows, keptStemRows } from "@/lib/client/stemList";
import { KIND_INFO, STEM_KINDS, type StemKind } from "@/lib/stemKinds";

type StemWithTrack = {
  id: string;
  kind: StemKind;
  track_tags?: string[] | null;
  peaks_json: string;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
};

type Kind = StemKind;
type ListedStem = StemWithTrack & { peaks: number[] };

// The whole list, kept for the visit: coming back to the Studio shows it
// at once, while a fresh copy loads behind. On a new visit, the copy kept
// on disk (stemList.ts) stands in until then.
let listCache: ListedStem[] | null = null;

// Parsed once here: a fresh array each render would make every waveform
// in the list redraw on every render.
const withPeaks = (stems: StemWithTrack[]): ListedStem[] =>
  stems.map((stem) => ({ ...stem, peaks: JSON.parse(stem.peaks_json || "[]") }));

// The last stem added from this panel, and how long the undo history was
// right after: while nothing else has been done since, taking it back out
// is a plain undo (so redo puts it back).
let lastAdd: { stemId: string; steps: number } | null = null;

function add(stem: LoadableStem) {
  startNewStep();
  useStudioStore.getState().addStem(stem);
  lastAdd = { stemId: stem.id, steps: useStudioHistory.getState().past.length };
}

/** "added" tapped: the stem comes back out — its add undone, or its lanes removed if more happened since. */
function takeOut(stemId: string, title: string) {
  if (lastAdd?.stemId === stemId && useStudioHistory.getState().past.length === lastAdd.steps) {
    lastAdd = null;
    undo();
    // Undo may have gone to something else (an AI idea being auditioned).
    if (!useStudioStore.getState().lanes.some((l) => l.stemId === stemId)) return;
  }
  lastAdd = null;
  startNewStep();
  const { lanes, removeLane } = useStudioStore.getState();
  for (const lane of lanes) if (lane.stemId === stemId) removeLane(lane.laneId);
  useStudioView.getState().notify(`Removed “${title}” — ⌘Z to undo`);
}

export default function StudioLibraryPanel() {
  const [tab, setTab] = useState<Kind>("vocals");
  const [all, setAll] = useState<ListedStem[] | null>(() => listCache);
  const [query, setQuery] = useState("");
  const lanes = useStudioStore((s) => s.lanes);
  const preview = usePreviewState();

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

  const stems = (all ?? []).filter((s) => s.kind === tab);
  const loading = all === null;
  const kinds = STEM_KINDS.filter((k) => k === "vocals" || k === "beat" || all?.some((s) => s.kind === k));

  const accent = KIND_INFO[tab].color;
  const addedStemIds = new Set(lanes.map((l) => l.stemId));
  const filtered = stems.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.track_title.toLowerCase().includes(q) ||
      s.artist_name.toLowerCase().includes(q) ||
      (s.track_tags ?? []).some((t) => t.includes(q))
    );
  });

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="scrollbar-thin flex overflow-x-auto rounded-lg border border-border bg-background p-1">
          {kinds.map((kind) => (
            <button
              key={kind}
              onClick={() => setTab(kind)}
              className="flex-1 shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors pointer-coarse:px-3 pointer-coarse:py-2.5"
              style={{
                background: tab === kind ? KIND_INFO[kind].color : "transparent",
                color: tab === kind ? "white" : "var(--muted)",
              }}
            >
              {KIND_INFO[kind].plural}
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
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {loading && <p className="p-3 text-xs text-muted">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="p-3 text-xs text-muted">Nothing here yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {filtered.map((stem) => {
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
                    onClick={() =>
                      added
                        ? takeOut(stem.id, stem.track_title)
                        : add({
                            id: stem.id,
                            kind: stem.kind,
                            track_title: stem.track_title,
                            artist_name: stem.artist_name,
                            peaks_json: stem.peaks_json,
                            track_duration: stem.track_duration,
                            track_bpm: stem.track_bpm,
                          })
                    }
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
