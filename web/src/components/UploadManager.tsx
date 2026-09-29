"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Waveform from "./Waveform";
import { formatMB } from "./SplitterStatus";
import { uploadSong, useSplitter, type UploadStage } from "@/lib/client/splitter";
import { useStudioStore } from "@/lib/client/studioStore";

type Stem = {
  id: string;
  kind: "vocals" | "beat";
  peaks_json: string;
};

type Track = {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  duration: number | null;
  bpm: number | null;
  created_at: string;
  stems: Stem[];
};

export default function UploadManager() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [job, setJob] = useState<{ name: string; stage: UploadStage } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const splitterState = useSplitter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const addStem = useStudioStore((s) => s.addStem);

  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    if (res.ok) {
      const data = await res.json();
      setTracks(data.tracks);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    // fetchTracks resolves asynchronously (setState happens after the
    // await), this is a standard fetch-on-mount, not a synchronous update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTracks();
  }, [fetchTracks]);

  useEffect(() => {
    const hasProcessing = tracks.some((t) => t.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchTracks, 3000);
    return () => clearInterval(interval);
  }, [tracks, fetchTracks]);

  // Splitting takes minutes and lives in this tab, so warn before leaving.
  useEffect(() => {
    if (!job) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [job]);

  async function uploadFile(file: File) {
    if (job) return;
    setUploadError(null);
    setJob({ name: file.name, stage: { stage: "decoding" } });
    try {
      await uploadSong(file, (stage) => setJob({ name: file.name, stage }));
      fetchTracks();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      fetchTracks();
    } finally {
      setJob(null);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
  }

  function handleAddToStudio(track: Track, stem: Stem) {
    addStem({
      id: stem.id,
      kind: stem.kind,
      track_title: track.title,
      artist_name: "You",
      peaks_json: stem.peaks_json,
      track_duration: track.duration,
      track_bpm: track.bpm,
    });
    router.push("/studio");
  }

  return (
    <div className="mt-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !job && fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          job
            ? "cursor-default border-border bg-surface opacity-60"
            : dragOver
              ? "cursor-pointer border-brand bg-brand/5"
              : "cursor-pointer border-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-xl">
          🎵
        </div>
        <p className="font-medium">Drop an audio file here, or click to browse</p>
        <p className="mt-1 text-sm text-muted">MP3, WAV, M4A, FLAC, OGG, AAC — up to 15 minutes</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.flac,.ogg,.aac,audio/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <SplitterInfo state={splitterState} />

      {job && <JobProgress name={job.name} stage={job.stage} splitterState={splitterState} />}
      {uploadError && <p className="mt-3 text-sm text-danger">{uploadError}</p>}

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your uploads
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {loadingList && <p className="text-sm text-muted">Loading…</p>}
          {!loadingList && tracks.length === 0 && (
            <p className="text-sm text-muted">
              Nothing uploaded yet — your split tracks will show up here.
            </p>
          )}
          {tracks.map((track) => (
            <TrackRow key={track.id} track={track} onAddToStudio={handleAddToStudio} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackRow({
  track,
  onAddToStudio,
}: {
  track: Track;
  onAddToStudio: (track: Track, stem: Stem) => void;
}) {
  const vocals = track.stems.find((s) => s.kind === "vocals");
  const beat = track.stems.find((s) => s.kind === "beat");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">
          {track.title}
          {track.bpm && (
            <span className="ml-2 text-xs font-normal text-muted">{track.bpm} BPM</span>
          )}
        </h3>
        <StatusBadge status={track.status} />
      </div>

      {track.status === "failed" && track.error && (
        <p className="mt-2 text-xs text-danger">{track.error}</p>
      )}

      {track.status === "ready" && vocals && beat && (
        <div className="mt-3 flex flex-col gap-2">
          <StemMiniRow label="Vocals" stem={vocals} color="var(--vocals)"
            onAdd={() => onAddToStudio(track, vocals)} />
          <StemMiniRow label="Beat" stem={beat} color="var(--beat)"
            onAdd={() => onAddToStudio(track, beat)} />
        </div>
      )}
    </div>
  );
}

function StemMiniRow({
  label,
  stem,
  color,
  onAdd,
}: {
  label: string;
  stem: Stem;
  color: string;
  onAdd: () => void;
}) {
  const peaks: number[] = JSON.parse(stem.peaks_json || "[]");
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised px-3 py-2">
      <span
        className="w-14 shrink-0 text-xs font-semibold"
        style={{ color }}
      >
        {label}
      </span>
      <div className="flex-1">
        <Waveform peaks={peaks} color={color} height={28} />
      </div>
      <button
        onClick={onAdd}
        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-hover"
      >
        + Studio
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: Track["status"] }) {
  if (status === "ready") {
    return (
      <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
        Ready
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
        Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-medium text-brand-strong">
      <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-brand-strong" />
      Uploading…
    </span>
  );
}

function SplitterInfo({ state }: { state: ReturnType<typeof useSplitter> }) {
  let text: string;
  if (state.status === "ready") {
    text =
      state.backend === "webgpu"
        ? "Song splitter ready · running on your GPU — a song takes about a minute or two"
        : `Song splitter ready · running on your CPU (${state.threads} ${
            state.threads === 1 ? "core" : "cores"
          }) — a song takes a few minutes; Chrome or Edge with WebGPU is much faster`;
  } else if (state.status === "error") {
    text = `Song splitter failed to load: ${state.error}`;
  } else if (state.status === "idle") {
    text = "The song splitter loads when you pick a file (a one-time ~200 MB download)";
  } else {
    text = "Loading the song splitter…";
  }
  return <p className={`mt-3 text-xs ${state.status === "error" ? "text-danger" : "text-muted"}`}>{text}</p>;
}

function JobProgress({
  name,
  stage,
  splitterState,
}: {
  name: string;
  stage: UploadStage;
  splitterState: ReturnType<typeof useSplitter>;
}) {
  let label: string;
  let progress: number | null = null;
  switch (stage.stage) {
    case "decoding":
      label = "Reading the file…";
      break;
    case "loading-model":
      if (splitterState.status === "downloading") {
        label = `Downloading the song splitter — ${formatMB(splitterState.loaded)} of ${formatMB(
          splitterState.total
        )} (one time only)`;
        progress = splitterState.loaded / Math.max(1, splitterState.total);
      } else {
        label = "Starting the song splitter…";
      }
      break;
    case "splitting":
      label = "Separating the vocals from the beat…";
      progress = stage.progress;
      break;
    case "encoding":
      label = "Encoding the stems…";
      progress = stage.progress;
      break;
    case "uploading":
      label = "Uploading the stems…";
      progress = stage.progress;
      break;
    case "saving":
      label = "Saving to your library…";
      break;
  }
  return (
    <div className="mt-4 rounded-xl border border-brand/40 bg-brand/10 p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{name}</span>
        {progress !== null && (
          <span className="shrink-0 tabular-nums text-muted">{Math.round(progress * 100)}%</span>
        )}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full bg-gradient-to-r from-brand to-vocals transition-all ${
            progress === null ? "w-full animate-pulse-glow" : ""
          }`}
          style={progress !== null ? { width: `${Math.round(progress * 100)}%` } : undefined}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">{label} Keep this tab open until it&apos;s done.</p>
    </div>
  );
}
