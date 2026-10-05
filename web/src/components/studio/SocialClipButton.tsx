"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Clapperboard, X } from "lucide-react";
import { downloadBlob, safeFilename } from "@/lib/client/mixdown";
import { canMakeClips, makeSocialClip, MAX_CLIP_SECONDS, type SocialClip } from "@/lib/client/socialClip";
import { useStudioStore } from "@/lib/client/studioStore";
import { shortPath } from "@/lib/shareLinks";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

const noSubscription = () => () => {};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The part of the song a clip covers: the loop if one is on, else 30 s from the playhead. */
function clipRange() {
  const s = useStudioStore.getState();
  if (s.loopEnabled && s.loopEnd > s.loopStart) {
    return { start: s.loopStart, end: Math.min(s.loopEnd, s.loopStart + MAX_CLIP_SECONDS) };
  }
  const start = s.playhead >= s.duration - 5 ? 0 : s.playhead;
  return { start, end: Math.min(s.duration, start + 30) };
}

/**
 * "Clip for socials": a vertical video of the loop (or 30 s from the
 * playhead) to post as a Reel, TikTok, Short or Story.
 */
export default function SocialClipButton({ title, artist, remixId }: { title: string; artist: string; remixId: string | null }) {
  const supported = useSyncExternalStore(noSubscription, canMakeClips, () => false);
  const duration = useStudioStore((s) => s.duration);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<{ label: string; fraction: number } | null>(null);
  const [clip, setClip] = useState<{ clip: SocialClip; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useKeepScreenOn("social-clip", stage !== null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => {
    abort.current?.abort();
  }, []);
  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  if (!supported) return null;

  async function make() {
    // Made inside the tap, or iOS won't let it play the soundtrack.
    const audioContext = new AudioContext();
    void audioContext.resume();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setClip(null);
    setStage({ label: "Starting…", fraction: 0 });
    const { start, end } = clipRange();
    try {
      const made = await makeSocialClip({
        audioContext,
        start,
        end,
        title: title || "Untitled remix",
        artist,
        link: `${window.location.host}${remixId ? shortPath(remixId) : ""}`,
        onProgress: (label, fraction) => setStage({ label, fraction }),
        signal: controller.signal,
      });
      setClip({ clip: made, url: URL.createObjectURL(made.blob) });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Couldn't make the clip");
      }
    } finally {
      setStage(null);
      abort.current = null;
      void audioContext.close();
    }
  }

  async function share() {
    if (!clip) return;
    const file = new File([clip.clip.blob], `${safeFilename(title)}.${clip.clip.extension}`, {
      type: clip.clip.blob.type,
    });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    downloadBlob(clip.clip.blob, file.name);
  }

  const range = open ? clipRange() : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={duration <= 0}
        className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        title="Make a vertical video clip for Reels, TikTok, Shorts or Stories"
        aria-label="Make a video clip for socials"
        aria-expanded={open}
      >
        <Clapperboard />
      </button>
      {open && (
        <div
          className="sheet-backdrop"
          onClick={() => {
            abort.current?.abort();
            setOpen(false);
          }}
        />
      )}
      {open && (
        <div className="popover-sheet absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 text-sm shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Clip for socials</p>
            <button
              onClick={() => {
                abort.current?.abort();
                setOpen(false);
              }}
              className="-m-2 p-2 text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            A vertical 9:16 video of{" "}
            {range && `${formatTime(range.start)}–${formatTime(range.end)}`} — the loop if one is on, otherwise 30
            seconds from the playhead (up to {MAX_CLIP_SECONDS} s). It records in real time; keep this tab open.
          </p>

          {stage ? (
            <div className="mt-3">
              <p className="text-xs">{stage.label}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full bg-gradient-to-r from-vocals to-beat" style={{ width: `${stage.fraction * 100}%` }} />
              </div>
              <button onClick={() => abort.current?.abort()} className="nudge mt-2">
                cancel
              </button>
            </div>
          ) : clip ? (
            <div className="mt-3 flex flex-col gap-2">
              <video src={clip.url} controls playsInline className="mx-auto max-h-72 rounded-lg bg-black" />
              <div className="flex gap-2">
                <button
                  onClick={share}
                  className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
                >
                  Share / save
                </button>
                <button onClick={() => void make()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                  Remake
                </button>
              </div>
              {clip.clip.extension === "webm" && (
                <p className="text-[11px] text-muted">
                  This browser records WebM; most apps take it, but Instagram may want MP4 — Safari and newer Chrome make
                  MP4.
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => void make()}
              className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Make the clip
            </button>
          )}
          {!remixId && !stage && !clip && (
            <p className="mt-2 text-[11px] text-muted">Save the remix first to put its short link on the video.</p>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
