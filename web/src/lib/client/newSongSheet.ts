"use client";

import { useEffect } from "react";
import { serializeLyrics } from "@/lib/lyrics";
import { NEW_SONG_ID, type Idea } from "./aiIdeas";
import { useAiLog, useAiTrial } from "./aiTrial";
import { useLyrics } from "./lyricsStore";

// The words of a new song from everything (see newSongIdea): while it's on,
// the lyrics show one sheet of every singer's lines at the places they're
// sung now — so the lyric view, Live and clips follow the new song, not one
// of the songs it was made from. Tried again (a tool under its map), the
// sheet is rewritten; kept, it stays as the song's words; switched off, the
// sheet that was open before comes back as it was.

/** The sheet open before the new song went on, as it was then. */
type Before = { id: string; text: string } | null;

function newSongOf(ideas: Idea[] | undefined): Idea | undefined {
  return ideas?.find((i) => i.id === NEW_SONG_ID && (i.song?.sheet?.length ?? 0) > 0);
}

/** Starts it; returns the stop. */
export function startNewSongSheet(): () => void {
  let ours: string | null = null;
  let before: Before = null;
  // The open sheet's words as they were a moment ago: switching the new song on moves the open sheet's
  // lines along with the vocals (lyricsFollow) before the trial says what went on — that move is undone on the way out.
  let justBefore: Before = null;
  let clearing = false;

  const stopLyrics = useLyrics.subscribe((state, previous) => {
    const was = previous.sheets.find((s) => s.id === previous.activeId);
    const now = state.sheets.find((s) => s.id === state.activeId);
    if (was && now && was.id === now.id && was.text !== now.text && was.id !== ours) {
      justBefore = { id: was.id, text: was.text };
      if (!clearing) {
        clearing = true;
        queueMicrotask(() => {
          justBefore = null;
          clearing = false;
        });
      }
    }
  });

  const stopTrial = useAiTrial.subscribe((state, previous) => {
    const idea = state.trial?.showing === "original" ? undefined : newSongOf(state.trial?.ideas);
    const wasOn = newSongOf(previous.trial?.ideas);
    const lyrics = useLyrics.getState();
    if (lyrics.take !== "idle") return;

    if (idea) {
      const text = serializeLyrics(idea.song!.sheet);
      const open = lyrics.sheets.find((s) => s.id === ours);
      if (open) {
        if (lyrics.activeId !== ours) lyrics.select(ours);
        if (open.text !== text) useLyrics.getState().follow(text, [], []);
        return;
      }
      const active = lyrics.sheets.find((s) => s.id === lyrics.activeId);
      before = active ? (justBefore?.id === active.id ? justBefore : { id: active.id, text: active.text }) : null;
      const singers = [...new Set(idea.song!.plan.slots.flatMap((s) => s.vocals.map((v) => idea.song!.names[v.id])).filter(Boolean))];
      ours = lyrics.create({ title: "A new song", artist: singers.join(" × "), text, source: "ai", aligned: true });
      return;
    }

    if (!wasOn || !ours) return;
    // Comparing with the original: the sheet waits for the new song to come back.
    if (state.trial?.showing === "original" && newSongOf(state.trial.ideas)) return;
    const result = previous.trial?.result;
    // Decided a moment later: a keep is logged just after the trial ends, and worked out again, the new song goes back on at once.
    queueMicrotask(() => {
      const trial = useAiTrial.getState().trial;
      if (!ours || newSongOf(trial?.ideas)) return;
      const id = ours;
      const back = before;
      ours = null;
      before = null;
      const last = useAiLog.getState().kept[0];
      // Kept: the sheet is the song's words now; the next new song gets its own.
      if (!trial && last?.after === result && last.ideas.some((i) => i.id === NEW_SONG_ID)) return;
      const now = useLyrics.getState();
      const keepRemoved = now.removed;
      if (now.sheets.some((s) => s.id === id)) now.remove(id);
      useLyrics.setState({ removed: keepRemoved });
      if (back && useLyrics.getState().sheets.some((s) => s.id === back.id)) {
        useLyrics.getState().select(back.id);
        useLyrics.getState().follow(back.text, [], []);
      }
    });
  });

  return () => {
    stopLyrics();
    stopTrial();
  };
}

/** Keeps the new song's words open while it's being tried (in the Studio). */
export function useNewSongSheet() {
  useEffect(() => startNewSongSheet(), []);
}
