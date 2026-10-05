"use client";

import { useEffect, useState } from "react";
import { renderDemoSong, type RenderedDemoSong } from "@/lib/client/demoSongs";

type State = { id: string; song?: RenderedDemoSong; error?: string } | null;

/** Renders (or fetches from cache) a demo song; `loading` is true until it's ready. */
export function useDemoSong(id: string | null) {
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    renderDemoSong(id)
      .then((song) => alive && setState({ id, song }))
      .catch((e: unknown) => alive && setState({ id, error: e instanceof Error ? e.message : "Couldn't render this song" }));
    return () => {
      alive = false;
    };
  }, [id]);
  const current = state && state.id === id ? state : null;
  return { song: current?.song ?? null, error: current?.error ?? null, loading: !!id && !current };
}
