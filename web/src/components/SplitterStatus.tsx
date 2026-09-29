"use client";

import { useEffect, useState } from "react";
import { isConstrainedDevice, splitter, useSplitter } from "@/lib/client/splitter";

export function formatMB(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Loads the song splitter in the background as soon as a signed-in user
 * opens any page, so by the time they reach Upload it's ready. The first
 * visit downloads ~200 MB once (the model and its runtime) and shows
 * progress here; after that it comes out of the browser's cache in a few
 * seconds and this stays out of sight.
 */
export default function SplitterStatus({ signedIn }: { signedIn: boolean }) {
  const state = useSplitter();
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    // Respect data-saver: don't pull 200 MB unasked; the Upload page
    // still loads it on demand.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    // On phones and tablets, holding the model in memory on every page gets
    // the tab killed (iOS reloads it, e.g. while the file picker is open),
    // so there it only loads for an actual upload.
    if (isConstrainedDevice()) return;
    void splitter.load();
  }, [signedIn]);

  // After a real download (not a cache hit), say so briefly.
  const downloadedFresh = state.status === "ready" && !state.fromCache;
  useEffect(() => {
    if (!downloadedFresh) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot toast timer
    setJustFinished(true);
    const timer = setTimeout(() => setJustFinished(false), 4000);
    return () => clearTimeout(timer);
  }, [downloadedFresh]);

  const showProgress =
    (state.status === "downloading" && !state.fromCache) || state.status === "starting";
  if (!showProgress && state.status !== "error" && !justFinished) return null;

  const percent = Math.min(100, Math.round((state.loaded / Math.max(1, state.total)) * 100));

  return (
    <div className="fixed bottom-20 left-4 z-40 w-72 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-md">
      {state.status === "error" ? (
        <>
          <p className="font-semibold text-danger">The song splitter couldn&apos;t load</p>
          <p className="mt-1 text-muted">{state.error}</p>
          <button onClick={() => void splitter.load()} className="nudge mt-2">
            try again
          </button>
        </>
      ) : justFinished && state.status === "ready" ? (
        <p className="font-semibold text-success">
          ✓ Song splitter ready — saved on this device, so next time it&apos;s instant
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {state.status === "starting" ? "Starting the song splitter…" : "Setting up the song splitter"}
            </span>
            {state.status === "downloading" && <span className="tabular-nums text-muted">{percent}%</span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={`h-full bg-gradient-to-r from-brand to-vocals transition-all ${
                state.status === "starting" ? "w-full animate-pulse-glow" : ""
              }`}
              style={state.status === "downloading" ? { width: `${percent}%` } : undefined}
            />
          </div>
          <p className="mt-1.5 text-muted">
            {state.status === "starting"
              ? "Almost there"
              : `${formatMB(state.loaded)} of ${formatMB(state.total)} — one-time download`}
          </p>
        </>
      )}
    </div>
  );
}
