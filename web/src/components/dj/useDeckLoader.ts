"use client";

import { useCallback, useState } from "react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { loadAnyTrack, retainTracks, type LoadStage } from "@/lib/client/dj/djLibraryTracks";
import type { DeckId } from "@/lib/client/dj/djTypes";

/** Loading songs onto the decks: which deck's browser is open, each deck's progress, and what went wrong. */
export function useDeckLoader(engine: DjEngine) {
  const [library, setLibrary] = useState<DeckId | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [stage, setStage] = useState<Record<DeckId, LoadStage | null>>({ A: null, B: null });
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    async (deck: DeckId, trackId: string) => {
      setLoadingId(trackId);
      setLibrary(null);
      setError(null);
      setStage((s) => ({ ...s, [deck]: { stage: "download", text: "Preparing…", progress: 0.01 } }));
      try {
        const track = await loadAnyTrack(trackId, engine.ctx, (st) => setStage((s) => ({ ...s, [deck]: st })));
        engine.loadTrack(deck, track);
        // Free the decoded audio of songs no deck holds any more.
        retainTracks([engine.deckTrack("A")?.info.id, engine.deckTrack("B")?.info.id]);
      } catch (err) {
        setError(err instanceof Error && err.message ? `Couldn't load that track: ${err.message}` : "Couldn't load that track. Try again.");
      } finally {
        setLoadingId(null);
        setStage((s) => ({ ...s, [deck]: null }));
      }
    },
    [engine]
  );

  return { library, setLibrary, loadingId, stage, error, pick };
}
