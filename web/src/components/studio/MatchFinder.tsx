"use client";

import { Play, Plus, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { describeFit, rankByTempo, type Candidate } from "@/lib/client/matchFinder";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { startNewStep } from "@/lib/client/studioHistory";
import { useStudioStore, type LoadableStem } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";

// Part of the AI producer: the library's beats (or vocals) that would fit
// the one in the mix with the least stretching, each to preview and add in
// one tap. Adding one makes the AI listen again by itself.

type Kind = "beat" | "vocals";

const cache = new Map<Kind, Promise<LoadableStem[]>>();

function libraryStems(kind: Kind): Promise<LoadableStem[]> {
  let found = cache.get(kind);
  if (!found) {
    found = fetch(`/api/stems?kind=${kind}`)
      .then((res) => (res.ok ? res.json() : { stems: [] }))
      .then((data: { stems?: LoadableStem[] }) => data.stems ?? [])
      .catch(() => {
        cache.delete(kind);
        return [];
      });
    cache.set(kind, found);
  }
  return found;
}

export default function MatchFinder({ kind, bpm, title }: { kind: Kind; bpm: number | null; title: React.ReactNode }) {
  const lanes = useStudioStore((s) => s.lanes);
  const preview = usePreviewState();
  const [stems, setStems] = useState<LoadableStem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void libraryStems(kind).then((list) => !cancelled && setStems(list));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (!bpm) return null;
  const inMix = new Set(lanes.map((l) => l.stemId));
  const ranked: Candidate<LoadableStem>[] = stems ? rankByTempo(stems, bpm, { exclude: inMix }) : [];

  function add(stem: LoadableStem) {
    startNewStep();
    useStudioStore.getState().addStem(stem);
    useStudioView.getState().notify(`Added “${stem.track_title}” — listening again…`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold">{title}</p>
      {stems === null ? (
        <p className="text-[11px] text-muted">Looking through the library…</p>
      ) : ranked.length === 0 ? (
        <p className="text-[11px] text-muted">Nothing in the library within 25% of {bpm.toFixed(0)} BPM yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ranked.map(({ stem, fit }) => {
            const playing = preview.current?.stemId === stem.id && preview.playing;
            return (
              <li key={stem.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <button
                  onClick={() => previewPlayer.toggle({ stemId: stem.id, title: stem.track_title, artist: stem.artist_name, kind: stem.kind })}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] hover:bg-brand hover:text-white"
                  aria-label={playing ? "Stop preview" : `Preview ${stem.track_title}`}
                >
                  {playing ? <Square className="fill-current" /> : <Play className="fill-current" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{stem.track_title}</span>
                  <span className="block truncate text-[10px] text-muted">
                    {stem.artist_name} · {stem.track_bpm?.toFixed(0)} BPM · {describeFit(fit)}
                  </span>
                </span>
                <button onClick={() => add(stem)} className="shrink-0 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-strong">
                  <Plus /> Add
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
