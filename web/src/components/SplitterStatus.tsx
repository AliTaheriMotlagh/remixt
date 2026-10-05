"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { splitter, useSplitter } from "@/lib/client/splitter";
import { useUploads } from "@/lib/client/uploads";

export function formatMB(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Shows the song splitter loading, wherever the user is. It only ever
 * loads because they asked for it — picked a song to add, or started
 * mining — never just for opening a page: that busied the GPU and pulled
 * ~200 MB the moment anyone signed in, which looked (and felt) like the
 * site had started splitting by itself. The first time is a one-time
 * download, shown here; after that it comes out of the browser's cache in
 * a few seconds and this stays out of sight.
 */
export default function SplitterStatus({ signedIn }: { signedIn: boolean }) {
  const state = useSplitter();
  // A song being added shows the download in its own progress (on phones,
  // where there's only room for one card at the bottom of the screen).
  const uploading = useUploads().some((i) => i.status === "working");
  const [justFinished, setJustFinished] = useState(false);

  // After a real download (not a cache hit), say so briefly.
  const downloadedFresh = state.status === "ready" && !state.fromCache;
  useEffect(() => {
    if (!downloadedFresh) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot toast timer
    setJustFinished(true);
    const timer = setTimeout(() => setJustFinished(false), 4000);
    return () => clearTimeout(timer);
  }, [downloadedFresh]);

  if (!signedIn) return null;
  const showProgress =
    (state.status === "downloading" && !state.fromCache) || state.status === "starting";
  if (!showProgress && state.status !== "error" && !justFinished) return null;

  const percent = Math.min(100, Math.round((state.loaded / Math.max(1, state.total)) * 100));

  return (
    <div
      role="status"
      className={`bottom-float fixed left-3 right-3 z-40 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-md sm:left-4 sm:right-auto sm:block sm:w-72 ${
        uploading ? "hidden" : ""
      }`}
      style={{ marginLeft: "env(safe-area-inset-left)" }}
    >
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
          <Check /> Song splitter ready — saved on this device, so next time it&apos;s instant
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
