"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Waveform from "./Waveform";
import { useStudioStore } from "@/lib/client/studioStore";

type StemWithTrack = {
  id: string;
  track_id: string;
  kind: "vocals" | "beat";
  peaks_json: string;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
  artist_id: string;
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LibraryBrowser({
  initialVocals,
  initialBeats,
}: {
  initialVocals: StemWithTrack[];
  initialBeats: StemWithTrack[];
}) {
  const [tab, setTab] = useState<"vocals" | "beat">("vocals");
  const [query, setQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();
  const addStem = useStudioStore((s) => s.addStem);

  const stems = tab === "vocals" ? initialVocals : initialBeats;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stems;
    return stems.filter(
      (s) =>
        s.track_title.toLowerCase().includes(q) ||
        s.artist_name.toLowerCase().includes(q)
    );
  }, [stems, query]);

  function togglePreview(stem: StemWithTrack) {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;

    if (playingId === stem.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = `/api/audio/stem/${stem.id}`;
    audio.currentTime = 0;
    audio.play();
    setPlayingId(stem.id);
    setPreviewProgress(0);

    audio.ontimeupdate = () => {
      if (audio.duration) setPreviewProgress(audio.currentTime / audio.duration);
    };
    audio.onended = () => {
      setPlayingId(null);
      setPreviewProgress(0);
    };
  }

  function handleAddToStudio(stem: StemWithTrack) {
    addStem({
      id: stem.id,
      kind: stem.kind,
      track_title: stem.track_title,
      artist_name: stem.artist_name,
      peaks_json: stem.peaks_json,
      track_duration: stem.track_duration,
      track_bpm: stem.track_bpm,
    });
    router.push("/studio");
  }

  const accent = tab === "vocals" ? "var(--vocals)" : "var(--beat)";

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-border bg-surface p-1">
          <TabButton active={tab === "vocals"} onClick={() => setTab("vocals")} color="var(--vocals)">
            Vocals ({initialVocals.length})
          </TabButton>
          <TabButton active={tab === "beat"} onClick={() => setTab("beat")} color="var(--beat)">
            Beats ({initialBeats.length})
          </TabButton>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by song or artist…"
          className="input max-w-xs flex-1"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          {stems.length === 0
            ? "No stems here yet — upload a song to populate the library."
            : "No matches for your search."}
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {filtered.map((stem) => {
            const peaks: number[] = JSON.parse(stem.peaks_json || "[]");
            const isPlaying = playingId === stem.id;
            return (
              <div
                key={stem.id}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{stem.track_title}</h3>
                    <Link
                      href={`/artist/${stem.artist_id}`}
                      className="text-xs text-muted hover:text-brand-strong hover:underline"
                    >
                      {stem.artist_name}
                    </Link>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {formatDuration(stem.track_duration)}
                    {stem.track_bpm ? ` · ${stem.track_bpm} BPM` : ""}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => togglePreview(stem)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: accent }}
                    aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <Waveform
                    peaks={peaks}
                    color={`${accent}55`}
                    progressColor={accent}
                    progress={isPlaying ? previewProgress : 0}
                    height={36}
                    className="flex-1"
                  />
                </div>

                <button
                  onClick={() => handleAddToStudio(stem)}
                  className="mt-3 w-full rounded-lg border border-border py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
                >
                  + Add to Studio
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      style={{
        background: active ? color : "transparent",
        color: active ? "white" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}
