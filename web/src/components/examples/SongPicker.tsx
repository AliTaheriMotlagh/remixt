"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Play, Square } from "lucide-react";
import { DEMO_SONGS, renderDemoSong, type DemoSongMeta } from "@/lib/client/demoSongs";
import { keyLabel } from "@/lib/client/musicKey";
import type { LabAudio } from "@/lib/client/examplesPlayer";

export function SongBadges({ song }: { song: DemoSongMeta }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span className="rounded-full bg-surface-raised px-2 py-0.5 tabular-nums">{song.bpm} BPM</span>
      <span className="rounded-full bg-surface-raised px-2 py-0.5">{keyLabel(song.key)}</span>
      <span className="rounded-full bg-brand/20 px-2 py-0.5 text-brand-strong" title="Camelot wheel code: DJs mix tracks whose numbers are the same or one apart">
        {song.camelot}
      </span>
    </div>
  );
}

/** Step 1: the demo songs as cards, each with a short preview. */
export default function SongPicker({
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
