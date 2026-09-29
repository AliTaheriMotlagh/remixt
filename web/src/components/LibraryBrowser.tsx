"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Waveform from "./Waveform";
import ReportButton from "./ReportButton";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import { useStudioStore } from "@/lib/client/studioStore";
import { KIND_INFO, STEM_KINDS, isStemKind, type StemKind } from "@/lib/stemKinds";

type StemWithTrack = {
  id: string;
  track_id: string;
  kind: StemKind;
  peaks_json: string;
  track_title: string;
  track_tags: string[] | null;
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
  stems: all,
  signedIn,
  initialQuery = "",
  initialTag = null,
  initialKind = null,
}: {
  stems: StemWithTrack[];
  signedIn: boolean;
  initialQuery?: string;
  initialTag?: string | null;
  initialKind?: string | null;
}) {
  const [tab, setTab] = useState<StemKind>(isStemKind(initialKind) ? initialKind : "vocals");
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState<string | null>(initialTag);
  const preview = usePreviewState();
  const router = useRouter();
  const addStem = useStudioStore((s) => s.addStem);

  const counts = useMemo(() => {
    const byKind = Object.fromEntries(STEM_KINDS.map((k) => [k, 0])) as Record<StemKind, number>;
    for (const stem of all) if (isStemKind(stem.kind)) byKind[stem.kind]++;
    return byKind;
  }, [all]);
  // Drum/bass/melody tabs only show up once there are songs split that way.
  const tabs = STEM_KINDS.filter((k) => k === "vocals" || k === "beat" || counts[k] > 0);

  // Parsed once: a fresh array per render made every waveform redraw on
  // every preview progress tick.
  const peaksById = useMemo(
    () => new Map(all.map((s) => [s.id, JSON.parse(s.peaks_json || "[]") as number[]])),
    [all]
  );

  const popularTags = useMemo(() => {
    const seen = new Map<string, number>();
    const tracks = new Set<string>();
    for (const stem of all) {
      if (tracks.has(stem.track_id)) continue;
      tracks.add(stem.track_id);
      for (const t of stem.track_tags ?? []) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return [...seen].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t);
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (s) =>
        s.kind === tab &&
        (!tag || (s.track_tags ?? []).includes(tag)) &&
        (!q ||
          s.track_title.toLowerCase().includes(q) ||
          s.artist_name.toLowerCase().includes(q) ||
          (s.track_tags ?? []).some((t) => t.includes(q)))
    );
  }, [all, tab, tag, query]);

  function togglePreview(stem: StemWithTrack) {
    void previewPlayer.toggle({
      stemId: stem.id,
      title: stem.track_title,
      artist: stem.artist_name,
      kind: stem.kind,
    });
  }

  function handleAddToStudio(stem: StemWithTrack) {
    previewPlayer.stop();
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

  const accent = KIND_INFO[tab].color;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="scrollbar-thin flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {tabs.map((kind) => (
            <TabButton key={kind} active={tab === kind} onClick={() => setTab(kind)} color={KIND_INFO[kind].color}>
              {KIND_INFO[kind].plural} ({counts[kind]})
            </TabButton>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by song, artist or tag…"
          className="input max-w-xs flex-1"
        />
      </div>

      {popularTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {popularTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                tag === t ? "bg-brand text-white" : "bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              #{t}
            </button>
          ))}
          {tag && (
            <button onClick={() => setTag(null)} className="px-1 text-xs text-muted hover:text-foreground">
              clear ✕
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          {counts[tab] === 0
            ? "No stems here yet — upload a song to populate the library."
            : "No matches for your search."}
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {filtered.map((stem) => {
            const isCurrent = preview.current?.stemId === stem.id;
            const isPlaying = isCurrent && preview.playing;
            return (
              <div key={stem.id} className="rounded-xl border border-border bg-surface p-4">
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

                {(stem.track_tags?.length ?? 0) > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {stem.track_tags!.slice(0, 5).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTag(t)}
                        className="text-[11px] text-brand-strong hover:underline"
                      >
                        #{t}
                      </button>
                    ))}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => togglePreview(stem)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
                    style={{ background: accent }}
                    aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <Waveform
                    peaks={peaksById.get(stem.id) ?? []}
                    color={`${accent}99`}
                    progressColor={accent}
                    progress={isCurrent ? preview.progress : 0}
                    height={36}
                    className="flex-1"
                  />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => handleAddToStudio(stem)}
                    className="flex-1 rounded-lg border border-border py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
                  >
                    + Add to Studio
                  </button>
                  <ReportButton kind="track" targetId={stem.track_id} signedIn={signedIn} />
                </div>
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
      className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      style={{
        background: active ? color : "transparent",
        color: active ? "white" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}
