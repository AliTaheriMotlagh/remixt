"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Download, LoaderCircle, Share, X } from "lucide-react";
import { creditLine } from "@/lib/client/audioTags";
import { secondsLeft, useExportJob } from "@/lib/client/exportJob";
import { canShareFile, isInstalledApp, linksLeaveApp, prefersShareSheet, saveFile, type SaveOutcome } from "@/lib/client/saveFile";

const noSubscription = () => () => {};

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLeft(seconds: number) {
  return seconds < 60 ? `about ${seconds} s left` : `about ${Math.ceil(seconds / 60)} min left`;
}

/** "iPhone", "Android" or null — for the hint under the Save button. */
function phoneKind() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

/**
 * The export in progress (time left, cancel) and then the finished file —
 * cover, title, credits, size — with the button that saves it. On a phone
 * that button opens the share sheet ("Save to Files", AirDrop, WhatsApp…),
 * the one way that works in the installed iPhone app; a computer has
 * already downloaded it.
 */
export default function ExportSheet() {
  const { label, progress, result, error, retry, cancel, dismiss } = useExportJob();
  const phone = useSyncExternalStore(noSubscription, prefersShareSheet, () => false);
  const platform = useSyncExternalStore(noSubscription, phoneKind, () => null);
  const installed = useSyncExternalStore(noSubscription, isInstalledApp, () => false);
  const linksLeave = useSyncExternalStore(noSubscription, linksLeaveApp, () => false);
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);

  // A clock for the time-left line, ticking only while something's exporting.
  useEffect(() => {
    if (!progress) return;
    const tick = () => setNow(performance.now());
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [progress]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- a new file hasn't been saved yet
  useEffect(() => setSaved(result?.autoSaved ? "downloaded" : null), [result]);

  if (!mounted || (!label && !result && !error)) return null;

  async function save(share: boolean) {
    if (!result) return;
    const outcome = await saveFile(result.file, { share });
    if (outcome !== "cancelled") setSaved(outcome);
  }

  const left = progress ? secondsLeft(progress, now) : null;
  const percent = progress?.fraction != null ? Math.round(progress.fraction * 100) : null;
  const shareable = result ? canShareFile(result.file) : false;
  const format = result?.file.name.split(".").pop()?.toUpperCase();

  // On <body>: the Studio's transport bar is a stacking context (and, with
  // its backdrop blur, a containing block) that would trap a fixed sheet.
  return createPortal(
    <div
      className="bottom-float fixed inset-x-3 z-[85] animate-[sheet-in_0.2s_ease-out] rounded-2xl border border-border bg-surface p-4 text-sm shadow-2xl shadow-black/40 sm:left-auto sm:right-4 sm:w-96"
      role="region"
      aria-label="Export"
    >
      {progress ? (
        <div role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 font-semibold">
              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-brand" />
              <span className="truncate">Exporting {label?.toLowerCase()}</span>
            </p>
            <button onClick={cancel} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-background"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={progress.stage}
          >
            {percent === null ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-vocals to-beat" />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-vocals via-brand to-beat transition-[width] duration-300"
                style={{ width: `${Math.max(3, percent)}%` }}
              />
            )}
          </div>
          <p className="mt-2 flex justify-between gap-2 text-xs text-muted">
            <span className="truncate">{progress.stage}</span>
            <span className="shrink-0 tabular-nums">
              {percent !== null && `${percent}%`}
              {left !== null && ` · ${formatLeft(left)}`}
            </span>
          </p>
          {phone && <p className="mt-2 text-[11px] text-muted">Keep Remixt open until it&apos;s ready: phones pause apps in the background.</p>}
        </div>
      ) : result ? (
        <div>
          <div className="flex gap-3">
            {result.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL
              <img src={result.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover shadow" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-lg bg-gradient-to-br from-vocals via-brand to-beat" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" dir="auto">
                {result.tags.title}
              </p>
              <p className="truncate text-xs text-muted" dir="auto">
                {result.tags.artist}
              </p>
              <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                {format} · {formatDuration(result.seconds)} · {formatBytes(result.file.size)}
                {result.tags.bpm ? ` · ${Math.round(result.tags.bpm)} BPM` : ""}
                {result.tags.key ? ` · ${result.tags.key}` : ""}
              </p>
            </div>
            <button onClick={dismiss} className="-m-2 h-fit p-2 text-muted hover:text-foreground" aria-label="Close">
              <X />
            </button>
          </div>

          {result.tags.credits?.length ? (
            <p className="mt-2 line-clamp-2 text-[11px] text-muted" dir="auto">
              {creditLine(result.tags.credits)}
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            {phone && shareable ? (
              <>
                <button
                  onClick={() => void save(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  {saved === "shared" ? <Check /> : <Share />}
                  {saved === "shared" ? "Saved — share again" : "Save or share"}
                </button>
                {/* The installed iPhone app can't download; everywhere else this is a quick way to Downloads. */}
                {!(platform === "ios" && installed) && (
                  <button
                    onClick={() => void save(false)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm text-muted hover:text-foreground"
                    aria-label="Download"
                  >
                    <Download />
                  </button>
                )}
              </>
            ) : linksLeave ? null : (
              <>
                <button
                  onClick={() => void save(false)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    saved ? "border border-border text-foreground hover:bg-surface-hover" : "bg-brand text-white hover:bg-brand-strong"
                  }`}
                >
                  {saved ? <Check /> : <Download />}
                  {saved ? "Downloaded — again" : "Download"}
                </button>
                {shareable && (
                  <button
                    onClick={() => void save(true)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm text-muted hover:text-foreground"
                  >
                    <Share /> Share
                  </button>
                )}
              </>
            )}
          </div>

          {phone && shareable && !saved && (
            <p className="mt-2 text-[11px] text-muted">
              {platform === "ios"
                ? "Pick “Save to Files” to keep it, or send it straight to WhatsApp, Instagram, AirDrop or GarageBand."
                : "Pick where it goes: Files, Drive, WhatsApp, Instagram… or tap ↓ for your Downloads folder."}
            </p>
          )}
          {phone && !shareable && (
            <p className="mt-2 text-[11px] text-muted">
              {linksLeave
                ? "This phone can't save files from the home-screen app. Open Remixt in Safari and export there."
                : "If nothing happens, open Remixt in your browser (not the home-screen app) to download."}
            </p>
          )}
          {saved === "unavailable" && (
            <p className="mt-2 text-[11px] text-danger">The share sheet didn&apos;t open. Tap “Save or share” again.</p>
          )}
          {!result.tags.url && (
            <p className="mt-2 rounded-lg bg-brand/10 px-2.5 py-2 text-[11px] text-muted">
              Tagged with the title, credits and cover. <span className="text-foreground">Publish the remix</span> to also put its link in the
              file, so anyone who plays it can find, like and remix it.
            </p>
          )}
        </div>
      ) : (
        <div role="alert">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-danger">Couldn&apos;t export {label?.toLowerCase()}</p>
            <button onClick={dismiss} className="-m-2 p-2 text-muted hover:text-foreground" aria-label="Close">
              <X />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{error}</p>
          {retry && (
            <button onClick={retry} className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong">
              Try again
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
