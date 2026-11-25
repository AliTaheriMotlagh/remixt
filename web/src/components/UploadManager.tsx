"use client";

import PlusText from "@/components/PlusText";
import SongDetails from "@/components/upload/SongDetails";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Globe, LoaderCircle, Lock, Music, Pause, Play } from "lucide-react";
import { previewPlayer, usePreviewState } from "@/lib/client/previewPlayer";
import Waveform from "./Waveform";
import TagInput from "./TagInput";
import { KIND_INFO, STEM_KINDS, type StemKind } from "@/lib/stemKinds";
import { isConstrainedDevice, splitter, useSplitter } from "@/lib/client/splitter";
import { useStudioStore } from "@/lib/client/studioStore";
import { splitLinks } from "@/lib/linkHosts";
import { filesFromDrop, uploads, useUploadsFinished, type AddResult } from "@/lib/client/uploads";
import { HelperPanel, QueuedSongs, QueueNotice } from "./SplitQueue";
import { UploadList } from "./UploadActivity";
import { TakeShareButton } from "./TakeSharing";

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
  visibility?: "public" | "private";
  /** Remixes using its stems (deleting it takes those lanes out). */
  remixes?: number;
  /** People a private take is shared with. */
  shared_with?: number;
};

const TAKE_TAG = "studio recording";

const noSubscription = () => () => {};

/** "“a.pdf”", "“a.pdf” and “b.jpg”", "“a.pdf”, “b.jpg” and 3 more". */
function nameList(names: string[]) {
  const quoted = names.slice(0, 2).map((n) => `“${n}”`);
  if (names.length > 2) return `${quoted.join(", ")} and ${names.length - 2} more`;
  return quoted.join(" and ");
}

/** What to tell the user about files that weren't added, if any. */
function skippedMessage({ notAudio, duplicates }: AddResult): string | null {
  const notes: string[] = [];
  if (notAudio.length) {
    notes.push(`Skipped ${nameList(notAudio)} — only audio files (MP3, M4A, WAV, FLAC, OGG, AAC) can be added.`);
  }
  if (duplicates.length) {
    notes.push(`${nameList(duplicates)} ${duplicates.length === 1 ? "is" : "are"} already being added.`);
  }
  return notes.length ? notes.join(" ") : null;
}

export default function UploadManager({ youtubeImport }: { youtubeImport: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [rights, setRights] = useState(false);
  const [newTags, setNewTags] = useState<string[]>([]);
  // Who hears the next songs: everyone (the public library) or only you (share or publish them later).
  const [keepPrivate, setKeepPrivateState] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the last choice, read once after the first paint
      setKeepPrivateState(localStorage.getItem("remixt-upload-private") === "1");
    } catch {}
  }, []);
  const setKeepPrivate = (v: boolean) => {
    setKeepPrivateState(v);
    try {
      localStorage.setItem("remixt-upload-private", v ? "1" : "0");
    } catch {}
  };
  const splitterState = useSplitter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const addStem = useStudioStore((s) => s.addStem);
  // Songs being added live outside this page (lib/client/uploads.ts), so
  // they carry on when the user goes elsewhere; this page just shows them.
  const finishedCount = useUploadsFinished();
  // Phones and tablets can't split songs yet (not enough memory for the
  // model), so they get told that up front instead of a failure minutes in.
  const onPhone = useSyncExternalStore(noSubscription, isConstrainedDevice, () => false);
  const [tryAnyway, setTryAnyway] = useState(false);
  // …and so their songs go to the split queue, for a computer to split.
  const queueMode = onPhone && !tryAnyway;
  // Several links can be pasted at once. Any site works: where a site
  // can't be downloaded from (Spotify, Apple Music — or YouTube, which
  // blocks the server), the same song is found elsewhere (lib/linkImport.ts).
  const links = useMemo(() => splitLinks(link), [link]);

  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTracks(data.tracks);
    }
    setLoadingList(false);
  }, []);

  // On arrival, and each time a song lands in the library (or the queue).
  useEffect(() => {
    // fetchTracks resolves asynchronously (setState happens after the
    // await), this is a standard fetch-on-mount, not a synchronous update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTracks();
  }, [fetchTracks, finishedCount]);

  // If the page reloaded in the middle of a split, the browser killed it —
  // on phones, nearly always for using too much memory. Say so, rather
  // than silently showing an empty page.
  useEffect(() => {
    const name = uploads.takeCrashNote();
    if (!name) return;
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

  function confirmRights() {
    if (rights) return true;
    setUploadError("Tick the box to confirm you have the right to share these songs first.");
    return false;
  }

  function handleFiles(files: File[]) {
    if (files.length === 0 || !confirmRights()) return;
    const result = uploads.addFiles(files, { tags: newTags, mode: queueMode ? "queue" : "split", keepPrivate });
    setUploadError(skippedMessage(result));
  }

  function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || !confirmRights()) return;
    if (links.length === 0) {
      setUploadError("That doesn't look like a link — paste the song's whole address, starting with https://");
      return;
    }
    setUploadError(null);
    uploads.addLinks(links, { tags: newTags, mode: queueMode ? "queue" : "split", keepPrivate });
    setLink("");
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
            // About to add a song: on a computer, start fetching the
            // splitter now (a one-time ~200 MB download, then from disk),
            // so it's ready — or nearly — by the time a song is picked.
            if (e.target.checked && !queueMode) void splitter.load().catch(() => {});
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
        />
        <span>
          I made these songs, or I have permission from whoever owns them to share them on Remixt for others to
          remix. <span className="text-muted">Songs uploaded without the rights will be removed —</span>{" "}
          <a href="/takedown" className="text-brand-strong hover:underline">
            takedown requests
          </a>
          .
        </span>
      </label>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-medium text-muted">Who can hear the next songs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: false, title: "Everyone", body: "In the public library for anyone to remix.", icon: <Globe className="h-4 w-4" /> },
            {
              value: true,
              title: "Only me, for now",
              body: "Private. Share it with the people you make it with, and choose what to publish when it's ready.",
              icon: <Lock className="h-4 w-4" />,
            },
          ].map((o) => (
            <label
              key={String(o.value)}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                keepPrivate === o.value ? "border-brand bg-brand/10" : "border-border bg-surface hover:border-brand/40"
              }`}
            >
              <input type="radio" name="upload-visibility" checked={keepPrivate === o.value} onChange={() => setKeepPrivate(o.value)} className="mt-0.5 accent-brand" />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  {o.icon} {o.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{o.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mb-4">
        <p className="mb-1.5 text-xs font-medium text-muted">Tags for the next songs (optional)</p>
        <TagInput value={newTags} onChange={setNewTags} compact />
      </div>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void filesFromDrop(e.dataTransfer).then(handleFiles);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-14 ${
          dragOver ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-xl text-white">
          <Music />
        </div>
        <p className="font-medium">
          <span className="pointer-coarse:hidden">Drop songs or a whole folder here, or click to browse</span>
          <span className="hidden pointer-coarse:inline">
            {queueMode ? "Tap to choose songs for the split queue" : "Tap to choose songs"}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {queueMode
            ? "Pick as many as you like · MP3, M4A, WAV, FLAC, OGG, AAC — up to 15 minutes each"
            : "Add as many as you like · MP3, WAV, M4A, FLAC, OGG, AAC — up to 15 minutes each (10 on a phone or tablet)"}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.m4a,.flac,.ogg,.aac,.opus,audio/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []));
            // So picking the same file again (after an error) still fires.
            e.target.value = "";
          }}
        />
      </div>

      <form onSubmit={handleLink} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="song-link" className="sr-only">
          Links to songs
        </label>
        <input
          id="song-link"
          // Not type="url": that refuses a pasted list of links.
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="…or paste links (YouTube, SoundCloud, Spotify…)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={!link.trim()}
          className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          {links.length > 1
            ? `${queueMode ? "Queue" : "Get"} ${links.length} songs`
            : queueMode
              ? "Queue it"
              : "Get song"}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Paste one link or several at once — SoundCloud, Bandcamp, Vimeo, a direct MP3 link, a song&apos;s page on an Iranian music site
        (beatmastering.ir, rozmusic, upmusics… — its MP3 is found on the page) and many more sites.
        {youtubeImport
          ? " YouTube works too."
          : " For YouTube, Spotify, Apple Music and other streaming links, the same song is looked up on SoundCloud — check it's the right one."}
      </p>
      {uploadError && <p className="mt-3 text-sm text-danger"><PlusText text={uploadError} /></p>}

      <UploadList />

      {queueMode ? null : (
        <>
          <SplitterInfo state={splitterState} />
          <HelperPanel />
        </>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your uploads
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <QueuedSongs refreshKey={finishedCount} onFinished={fetchTracks} />
          {loadingList && <p className="text-sm text-muted">Loading…</p>}
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
  const [details, setDetails] = useState(false);
  const [shownTitle, setShownTitle] = useState<string | null>(null);
  const [savingTags, setSavingTags] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isTake = !!track.tags?.includes(TAKE_TAG);

  async function deleteTrack() {
    const used = track.remixes ?? 0;
    const what = isTake ? "this take" : "this song";
    const question =
      track.status === "ready"
        ? `Delete “${track.title}”? ${what[0].toUpperCase()}${what.slice(1)} and its stems are removed from the library${
            used ? `, and from the ${used} ${used === 1 ? "remix" : "remixes"} that use${used === 1 ? "s" : ""} them` : ""
          }. This can't be undone.`
        : `Remove “${track.title}” from your uploads?`;
    if (!window.confirm(question)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Couldn't delete it — try again");
      }
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete it — try again");
      setDeleting(false);
    }
  }

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
          {shownTitle ?? track.title}
          {track.bpm && (
            <span className="ml-2 text-xs font-normal text-muted">{track.bpm} BPM</span>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {track.status === "ready" && (
            <TakeShareButton
              trackId={track.id}
              title={track.title}
              visibility={track.visibility}
              sharedWith={track.shared_with ?? 0}
              what={isTake ? "take" : "song"}
            />
          )}
          <StatusBadge status={track.status} />
          {track.status === "ready" && !isTake && (
            <button
              type="button"
              onClick={() => setDetails((v) => !v)}
              aria-expanded={details}
              className="rounded-md px-1.5 py-1 text-xs font-semibold text-brand-strong hover:underline"
              title="Artist, album, year, genre, artwork and lyrics"
            >
              Details
            </button>
          )}
          <button
            onClick={deleteTrack}
            disabled={deleting}
            className="rounded-md px-1.5 py-1 text-xs text-muted hover:text-danger disabled:opacity-50"
            aria-label={`Delete ${track.title}`}
            title="Delete"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {track.status === "failed" && track.error && (
        <p className="mt-2 text-xs text-danger">{track.error}</p>
      )}
      {track.status === "processing" && (
        <p className="mt-2 text-xs text-muted">
          Still being saved. If you closed or reloaded the page while it was uploading, it picks up again by itself
          (see above) — or delete it and add it again.
        </p>
      )}
      {deleteError && <p className="mt-2 text-xs text-danger">{deleteError}</p>}
      {details && <SongDetails trackId={track.id} stemId={stems[0]?.id} onClose={() => setDetails(false)} onSaved={setShownTitle} />}

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
              title={track.title}
              color={KIND_INFO[stem.kind].color}
              onAdd={() => onAddToStudio(track, stem)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** "1:05" */
function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * One stem of a song you added: hear it here (through the shared preview
 * player, so it's stopped from anywhere and only one thing plays), seek by
 * tapping the waveform, or send it to the Studio. Played once, it's kept on
 * this device: playing it again — here or in the Studio — needs no download.
 */
function StemMiniRow({
  label,
  stem,
  title,
  color,
  onAdd,
}: {
  label: string;
  stem: Stem;
  title: string;
  color: string;
  onAdd: () => void;
}) {
  const peaks = useMemo<number[]>(() => JSON.parse(stem.peaks_json || "[]"), [stem.peaks_json]);
  const preview = usePreviewState();
  const mine = preview.current?.stemId === stem.id;
  const playing = mine && preview.playing;
  const track = { stemId: stem.id, title, artist: "You", kind: stem.kind, keep: true };
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-2 py-2 sm:gap-3 ${mine ? "bg-surface-hover" : "bg-surface-raised"}`}>
      <button
        onClick={() => void previewPlayer.toggle(track)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95"
        style={{ background: color }}
        aria-label={`${playing ? "Pause" : "Play"} ${label.toLowerCase()} of ${title}`}
      >
        {mine && preview.loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
        )}
      </button>
      <span className="w-12 shrink-0 text-xs font-semibold sm:w-14" style={{ color }}>
        {label}
        {mine && (
          <span className="block text-[10px] font-normal tabular-nums text-muted">
            {clock(preview.currentTime)}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Waveform
          peaks={peaks}
          color={`${color}66`}
          progressColor={color}
          progress={mine ? preview.progress : 0}
          height={28}
          onSeek={(fraction) => {
            if (mine) previewPlayer.seek(fraction);
            else
              void previewPlayer.play(track).then(() => {
                // Starts where it was tapped once the length is known.
                const ready = () => previewPlayer.getState().duration > 0;
                if (ready()) previewPlayer.seek(fraction);
                else {
                  const stop = previewPlayer.subscribe((state) => {
                    if (state.current?.stemId !== stem.id) return stop();
                    if (state.duration > 0) {
                      stop();
                      previewPlayer.seek(fraction);
                    }
                  });
                }
              });
          }}
        />
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
