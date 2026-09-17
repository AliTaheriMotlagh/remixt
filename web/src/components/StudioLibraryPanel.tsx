"use client";

import { useEffect, useState } from "react";
import Waveform from "./Waveform";
import { useStudioStore } from "@/lib/client/studioStore";

type StemWithTrack = {
  id: string;
  kind: "vocals" | "beat";
  peaks_json: string;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
};

export default function StudioLibraryPanel() {
  const [tab, setTab] = useState<"vocals" | "beat">("vocals");
  const [stems, setStems] = useState<StemWithTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const addStem = useStudioStore((s) => s.addStem);
  const lanes = useStudioStore((s) => s.lanes);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/stems?kind=${tab}`);
        const data = await res.json();
        if (!cancelled) setStems(data.stems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const accent = tab === "vocals" ? "var(--vocals)" : "var(--beat)";
  const addedStemIds = new Set(lanes.map((l) => l.stemId));
  const filtered = stems.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.track_title.toLowerCase().includes(q) ||
      s.artist_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="flex rounded-lg border border-border bg-background p-1">
          <button
            onClick={() => setTab("vocals")}
            className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: tab === "vocals" ? "var(--vocals)" : "transparent",
              color: tab === "vocals" ? "white" : "var(--muted)",
            }}
          >
            Vocals
          </button>
          <button
            onClick={() => setTab("beat")}
            className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: tab === "beat" ? "var(--beat)" : "transparent",
              color: tab === "beat" ? "white" : "var(--muted)",
            }}
          >
            Beats
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
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
            const peaks: number[] = JSON.parse(stem.peaks_json || "[]");
            const added = addedStemIds.has(stem.id);
            return (
              <button
                key={stem.id}
                disabled={added}
                onClick={() =>
                  addStem({
                    id: stem.id,
                    kind: stem.kind,
                    track_title: stem.track_title,
                    artist_name: stem.artist_name,
                    peaks_json: stem.peaks_json,
                    track_duration: stem.track_duration,
                    track_bpm: stem.track_bpm,
                  })
                }
                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                  added
                    ? "cursor-default border-border bg-surface-raised opacity-50"
                    : "border-border hover:border-brand/50 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{stem.track_title}</span>
                  {added && <span className="shrink-0 text-[10px] text-success">added</span>}
                </div>
                <p className="truncate text-[11px] text-muted">
                  {stem.artist_name}
                  {stem.track_bpm ? ` · ${stem.track_bpm} BPM` : ""}
                </p>
                <Waveform peaks={peaks} color={accent} height={20} className="mt-1" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
