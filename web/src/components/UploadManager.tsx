"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Waveform from "./Waveform";
import TagInput from "./TagInput";
import { KIND_INFO, STEM_KINDS, type StemKind } from "@/lib/stemKinds";
import { formatMB } from "./SplitterStatus";
import {
  fetchSongFromLink,
  isConstrainedDevice,
  uploadSong,
  useSplitter,
  type UploadStage,
} from "@/lib/client/splitter";
import { useStudioStore } from "@/lib/client/studioStore";
import { isYouTubeLink, YOUTUBE_UNAVAILABLE } from "@/lib/linkHosts";
import { queueFile, queueLink } from "@/lib/client/splitQueue";
import { HelperPanel, QueuedSongs, QueueNotice } from "./SplitQueue";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

type Stem = {
  id: string;
  kind: StemKind;
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
  tags?: string[];
};

/** Set while a song is being split, so a reload mid-split can be explained. */
const IN_FLIGHT_KEY = "remixt-upload-in-flight";

function rememberInFlight(name: string | null) {
  try {
    if (name) sessionStorage.setItem(IN_FLIGHT_KEY, name);
    else sessionStorage.removeItem(IN_FLIGHT_KEY);
  } catch {
    // Storage blocked — only the explanation is lost.
  }
}

const noSubscription = () => () => {};

export default function UploadManager({ youtubeImport }: { youtubeImport: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [job, setJob] = useState<{ name: string; stage: UploadStage } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [rights, setRights] = useState(false);
  const [newTags, setNewTags] = useState<string[]>([]);
  const splitterState = useSplitter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const router = useRouter();
  const addStem = useStudioStore((s) => s.addStem);
  const busy = job !== null;
  // Phones and tablets can't split songs yet (not enough memory for the
  // model), so they get told that up front instead of a failure minutes in.
  const onPhone = useSyncExternalStore(noSubscription, isConstrainedDevice, () => false);
  const [tryAnyway, setTryAnyway] = useState(false);
  // …and so their songs go to the split queue, for a computer to split.
  const queueMode = onPhone && !tryAnyway;
  const [queueRefresh, setQueueRefresh] = useState(0);
  const youtubeBlocked = !youtubeImport && isYouTubeLink(link);

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

  // If the page reloaded in the middle of a split, the browser killed it —
  // on phones, nearly always for using too much memory. Say so, rather
  // than silently showing an empty page.
  useEffect(() => {
    let name: string | null = null;
    try {
      name = sessionStorage.getItem(IN_FLIGHT_KEY);
    } catch {
      return;
    }
    if (!name) return;
    rememberInFlight(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot message from the last page load
    setUploadError(
      `The browser restarted the page while splitting “${name}” — this device probably ran out of memory. ` +
        "Close other tabs and apps and try again, try a shorter song, or use a computer."
    );
  }, []);

  useEffect(() => {
    const hasProcessing = tracks.some((t) => t.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchTracks, 3000);
    return () => clearInterval(interval);
  }, [tracks, fetchTracks]);

  // Fetching, splitting and uploading take minutes and live in this tab:
  // keep the screen on meanwhile (a phone that locks itself pauses the
  // page, and the work with it) — only while it runs, not just for being here.
  useKeepScreenOn("upload", busy);

  // Splitting takes minutes and lives in this tab, so warn before leaving.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  /**
   * Runs one upload — split here, or sent to the queue — showing its
   * progress. `work` reports each stage (and the song's real name, once
   * a link has turned into one).
   */
  async function runJob(
    name: string,
    work: (report: (stage: UploadStage, newName?: string) => void) => Promise<void>
  ) {
    if (running.current) return false;
    if (!rights) {
      setUploadError("Tick the box to confirm you have the right to share this song first.");
      return false;
    }
    running.current = true;
    setUploadError(null);
    let current = name;
    setJob({ name, stage: { stage: "decoding" } });
    try {
      await work((stage, newName) => {
        current = newName ?? current;
        setJob({ name: current, stage });
      });
      return true;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      return false;
    } finally {
      rememberInFlight(null);
      running.current = false;
      setJob(null);
      fetchTracks();
      if (queueMode) setQueueRefresh((n) => n + 1);
    }
  }

  /** Splits a song on this device, then uploads its stems. */
  async function splitHere(file: File, report: (stage: UploadStage, newName?: string) => void) {
    rememberInFlight(file.name);
    await uploadSong(file, (stage) => report(stage, file.name), { tags: newTags });
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    void runJob(file.name, (report) =>
      queueMode ? queueFile(file, newTags, report).then(() => {}) : splitHere(file, report)
    );
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (!url || busy) return;
    if (youtubeBlocked) return;
    const ok = await runJob(url, async (report) => {
      if (queueMode) {
        await queueLink(url, newTags, report);
        return;
      }
      const file = await fetchSongFromLink(url, report);
      await splitHere(file, report);
    });
    if (ok) setLink("");
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
      {queueMode && <QueueNotice onTryAnyway={() => setTryAnyway(true)} />}
      <label className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 text-sm">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => {
            setRights(e.target.checked);
            setUploadError(null);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
        />
        <span>
          I made this song, or I have permission from whoever owns it to share it on Remixt for others to
          remix. <span className="text-muted">Songs uploaded without the rights will be removed —</span>{" "}
          <a href="/takedown" className="text-brand-strong hover:underline">
            takedown requests
          </a>
          .
        </span>
      </label>
      <div className="mb-4">
        <p className="mb-1.5 text-xs font-medium text-muted">Tags for the next song (optional)</p>
        <TagInput value={newTags} onChange={setNewTags} compact />
      </div>
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
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
        onClick={() => !busy && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-14 ${
          busy
            ? "cursor-default border-border bg-surface opacity-60"
            : dragOver
              ? "cursor-pointer border-brand bg-brand/5"
              : "cursor-pointer border-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-xl">
          🎵
        </div>
        <p className="font-medium">
          <span className="pointer-coarse:hidden">Drop an audio file here, or click to browse</span>
          <span className="hidden pointer-coarse:inline">
            {queueMode ? "Tap to choose a song for the split queue" : "Tap to choose a song"}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {queueMode
            ? "MP3, M4A, WAV, FLAC, OGG, AAC — up to 15 minutes"
            : "MP3, WAV, M4A, FLAC, OGG, AAC — up to 15 minutes (10 on a phone or tablet)"}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.flac,.ogg,.aac,audio/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // So picking the same file again (after an error) still fires.
            e.target.value = "";
          }}
        />
      </div>

      <form onSubmit={handleLink} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="song-link" className="sr-only">
          Link to a song
        </label>
        <input
          id="song-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={
            youtubeImport ? "…or paste a link (YouTube, SoundCloud…)" : "…or paste a link (SoundCloud, Bandcamp…)"
          }
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
          className="input min-w-0 flex-1 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !link.trim() || youtubeBlocked}
          className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          {queueMode ? "Queue it" : "Get song"}
        </button>
      </form>
      {youtubeBlocked ? (
        <p className="mt-2 text-sm text-danger">{YOUTUBE_UNAVAILABLE}</p>
      ) : (
        !youtubeImport && (
          <p className="mt-2 text-xs text-muted">
            Works with SoundCloud, Bandcamp, Vimeo, direct MP3 links and many more sites. YouTube isn&apos;t
            supported yet.
          </p>
        )
      )}

      {queueMode ? null : (
        <>
          <SplitterInfo state={splitterState} />
          <HelperPanel />
        </>
      )}

      {job && <JobProgress name={job.name} stage={job.stage} splitterState={splitterState} queued={queueMode} />}
      {uploadError && <p className="mt-3 text-sm text-danger">{uploadError}</p>}

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your uploads
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {loadingList && <p className="text-sm text-muted">Loading…</p>}
          <QueuedSongs refreshKey={queueRefresh} onFinished={fetchTracks} />
          {!loadingList && tracks.length === 0 && (
            <p className="text-sm text-muted">
              Nothing uploaded yet — your split tracks will show up here.
            </p>
          )}
          {tracks.map((track) => (
            <TrackRow key={track.id} track={track} onAddToStudio={handleAddToStudio} onChanged={fetchTracks} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackRow({
  track,
  onAddToStudio,
  onChanged,
}: {
  track: Track;
  onAddToStudio: (track: Track, stem: Stem) => void;
  onChanged: () => void;
}) {
  const [editingTags, setEditingTags] = useState<string[] | null>(null);
  const [savingTags, setSavingTags] = useState(false);

  async function saveTags() {
    if (!editingTags) return;
    setSavingTags(true);
    try {
      await fetch(`/api/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: editingTags }),
      });
      setEditingTags(null);
      onChanged();
    } finally {
      setSavingTags(false);
    }
  }

  // Vocals and beat first, then the beat's parts on songs split since the 4-stem update.
  const stems = STEM_KINDS.map((kind) => track.stems.find((s) => s.kind === kind)).filter((s): s is Stem => !!s);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 break-words font-medium">
          {track.title}
          {track.bpm && (
            <span className="ml-2 text-xs font-normal text-muted">{track.bpm} BPM</span>
          )}
        </h3>
        <div className="shrink-0">
          <StatusBadge status={track.status} />
        </div>
      </div>

      {track.status === "failed" && track.error && (
        <p className="mt-2 text-xs text-danger">{track.error}</p>
      )}

      {track.status === "ready" &&
        (editingTags ? (
          <div className="mt-2 flex flex-col gap-2">
            <TagInput value={editingTags} onChange={setEditingTags} compact />
            <div className="flex gap-2">
              <button
                onClick={saveTags}
                disabled={savingTags}
                className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingTags ? "Saving…" : "Save tags"}
              </button>
              <button onClick={() => setEditingTags(null)} className="text-xs text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {(track.tags ?? []).map((tag) => (
              <span key={tag} className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-muted">
                #{tag}
              </span>
            ))}
            <button
              onClick={() => setEditingTags(track.tags ?? [])}
              className="text-[11px] text-brand-strong hover:underline"
            >
              {track.tags?.length ? "edit tags" : "+ add tags"}
            </button>
          </div>
        ))}

      {track.status === "ready" && stems.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {stems.map((stem) => (
            <StemMiniRow
              key={stem.id}
              label={KIND_INFO[stem.kind].label}
              stem={stem}
              color={KIND_INFO[stem.kind].color}
              onAdd={() => onAddToStudio(track, stem)}
            />
          ))}
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
  const peaks = useMemo<number[]>(() => JSON.parse(stem.peaks_json || "[]"), [stem.peaks_json]);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised px-3 py-2">
      <span
        className="w-12 shrink-0 text-xs font-semibold sm:w-14"
        style={{ color }}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <Waveform peaks={peaks} color={color} height={28} />
      </div>
      <button
        onClick={onAdd}
        className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover"
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
  queued,
}: {
  name: string;
  stage: UploadStage;
  splitterState: ReturnType<typeof useSplitter>;
  /** Going to the split queue rather than being split here. */
  queued: boolean;
}) {
  let label: string;
  let progress: number | null = null;
  switch (stage.stage) {
    case "fetching-link":
      label = "Getting the song from the link…";
      break;
    case "downloading":
      label = "Downloading the song…";
      progress = stage.progress;
      break;
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
    case "queueing":
      label = "Sending the song to the split queue…";
      progress = stage.progress;
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
      <p className="mt-1.5 text-xs text-muted">
        {label}{" "}
        {queued
          ? "Keep this page open until it’s sent — after that you can close it."
          : isConstrainedDevice()
          ? "Keep this screen open and stay on this page until it’s done — switching apps can stop it."
          : "Keep this tab open until it’s done."}
      </p>
    </div>
  );
}
