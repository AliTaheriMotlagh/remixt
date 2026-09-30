"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  cancelQueued,
  fetchQueue,
  splitHelper,
  useSplitHelper,
  type QueuedJob,
  type QueueStats,
} from "@/lib/client/splitQueue";
import type { UploadStage } from "@/lib/client/splitter";

// The split queue's screens: what a phone sees instead of "use a
// computer", the list of songs waiting for a helper, the switch that
// makes a computer a helper, and the helper's corner status.

/** Shown on phones above the upload form: songs go to the queue instead. */
export function QueueNotice({ onTryAnyway }: { onTryAnyway: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-4 text-sm sm:px-5">
      <p className="font-semibold">📱 → 💻 A computer splits it for you</p>
      <p className="mt-1.5 text-muted">
        Phones don&apos;t give a web page enough memory to split a song, so yours goes into the split queue and the
        next computer helping out splits it into vocals and beat — usually within a few minutes. You&apos;ll get a
        notification when it&apos;s in your library; you don&apos;t need to keep this page open once it&apos;s sent.
      </p>
      <button
        onClick={onTryAnyway}
        className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        Try splitting on this device anyway
      </button>
    </div>
  );
}

function stageLabel(job: QueuedJob) {
  switch (job.status) {
    case "uploading":
      return "Sending…";
    case "queued":
      return job.position && job.position > 1 ? `Waiting for a computer · #${job.position} in line` : "Next in line";
    case "working": {
      const who = job.helper_name ? `${job.helper_name}'s computer` : "A helper";
      const what =
        job.stage === "downloading"
          ? "is fetching it"
          : job.stage === "uploading"
            ? "is uploading the stems"
            : job.stage === "encoding"
              ? "is encoding the stems"
              : "is splitting it";
      return `${who} ${what}`;
    }
    case "failed":
      return job.error ?? "Couldn't be split";
    default:
      return "";
  }
}

/**
 * Songs you've queued that aren't in your library yet. Checks back while
 * any are waiting; when one finishes, `onFinished` refreshes your uploads.
 */
export function QueuedSongs({ refreshKey, onFinished }: { refreshKey: number; onFinished: () => void }) {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const known = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { jobs: next } = await fetchQueue();
      // A job that vanished from the list finished: its track is in the library now.
      const ids = new Set(next.map((j) => j.id));
      const finished = [...known.current].some((id) => !ids.has(id));
      known.current = ids;
      setJobs(next);
      if (finished) onFinished();
    } catch {
      // Keep what's shown; the next check tries again.
    }
  }, [onFinished]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount (and after each new song is queued)
    void load();
  }, [load, refreshKey]);

  const pending = jobs.some((j) => j.status !== "failed");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 6000);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (jobs.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className={`rounded-xl border p-3 text-sm ${
            job.status === "failed" ? "border-danger/40 bg-danger/5" : "border-brand/40 bg-surface"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{job.title}</span>
            <button
              onClick={async () => {
                await cancelQueued(job.id);
                void load();
              }}
              className="shrink-0 text-xs text-muted hover:text-danger"
            >
              {job.status === "failed" ? "Dismiss" : "Cancel"}
            </button>
          </div>
          <p className={`mt-1 text-xs ${job.status === "failed" ? "text-danger" : "text-muted"}`}>
            {job.status !== "failed" && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-glow rounded-full bg-brand-strong align-middle" />
            )}
            {stageLabel(job)}
          </p>
          {job.status === "working" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full bg-gradient-to-r from-brand to-vocals transition-all"
                style={{ width: `${Math.max(4, Math.round(job.progress * 100))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function helperStageText(stage: UploadStage | null) {
  switch (stage?.stage) {
    case "downloading":
      return "Fetching the song";
    case "decoding":
      return "Reading the song";
    case "loading-model":
      return "Starting the splitter";
    case "splitting":
      return "Splitting";
    case "encoding":
      return "Encoding the stems";
    case "uploading":
    case "saving":
      return "Uploading the stems";
    default:
      return "Working";
  }
}

function helperPercent(stage: UploadStage | null) {
  return stage && "progress" in stage ? Math.round(stage.progress * 100) : null;
}

const noSubscription = () => () => {};

/** The "Help split" switch on the Upload page, for computers. */
export function HelperPanel() {
  const helper = useSplitHelper();
  // Known only in the browser (it's about this device), so the server renders nothing.
  const canHelp = useSyncExternalStore(noSubscription, () => splitHelper.canHelp(), () => false);
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchQueue()
        .then((data) => !cancelled && setStats(data.stats))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!canHelp) return null;
  const shown = helper.stats ?? stats;
  const percent = helperPercent(helper.stage);

  return (
    <div
      className={`mt-6 rounded-2xl border p-4 text-sm transition-colors ${
        helper.enabled ? "border-success/50 bg-success/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">⛏️ Help split songs for people on phones</p>
          <p className="mt-1 text-xs text-muted">
            Phones can&apos;t split songs, so they queue them. While this is on, this browser takes songs from the queue
            one at a time and splits them for their owners, in the background on any page — pausing while you play
            music or use the Studio. Each song you split for someone earns you 10 XP.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={helper.enabled}
          onClick={() => splitHelper.setEnabled(!helper.enabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            helper.enabled ? "bg-success" : "bg-surface-raised"
          }`}
          aria-label="Help split songs"
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
              helper.enabled ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {shown && (
          <>
            <span>
              <strong className="text-foreground">{shown.waiting}</strong> waiting in the queue
            </span>
            <span>
              <strong className="text-foreground">{shown.working}</strong> being split now
            </span>
            <span>
              You&apos;ve split <strong className="text-foreground">{shown.helped}</strong> for others
            </span>
          </>
        )}
      </div>

      {helper.enabled && (
        <p className="mt-2 text-xs">
          {helper.status === "working" && helper.job ? (
            <span className="text-success">
              {helperStageText(helper.stage)} “{helper.job.title}”{percent !== null ? ` · ${percent}%` : "…"}
            </span>
          ) : helper.status === "paused" ? (
            <span className="text-muted">⏸ {helper.message}</span>
          ) : (
            <span className="text-muted">{helper.message ?? "Waiting for songs — keep a tab open and they'll come to you."}</span>
          )}
        </p>
      )}
      {!helper.enabled && helper.message && <p className="mt-2 text-xs text-danger">{helper.message}</p>}
      {!helper.enabled && !!shown?.waiting && (
        <p className="mt-2 text-xs font-medium text-brand-strong">
          {shown.waiting === 1 ? "A song is" : `${shown.waiting} songs are`} waiting for a computer right now.
        </p>
      )}
    </div>
  );
}

/**
 * Keeps helping going on every page (once switched on, until switched
 * off), and shows what it's doing in the corner while it works.
 */
export function SplitHelperStatus({ signedIn }: { signedIn: boolean }) {
  const helper = useSplitHelper();
  const pathname = usePathname();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (signedIn) splitHelper.restore();
  }, [signedIn]);

  // Where audio is the point of the page, splitting (all GPU or CPU)
  // would make it stutter — so no new songs start there.
  useEffect(() => {
    const audioPage =
      pathname.startsWith("/studio") || pathname.startsWith("/remixes/") || pathname.startsWith("/embed/");
    splitHelper.setPageReason(audioPage ? "Paused while you're on a page that plays music" : null);
  }, [pathname]);

  // The "done" note clears itself after a few seconds.
  const finishedAt = helper.finished?.at ?? 0;
  useEffect(() => {
    if (!finishedAt) return;
    const timer = setTimeout(() => setTick((n) => n + 1), 6000);
    return () => clearTimeout(timer);
  }, [finishedAt]);

  if (!signedIn || pathname.startsWith("/embed/")) return null;
  // eslint-disable-next-line react-hooks/purity -- re-checked by the timer above
  const recentlyFinished = helper.finished && Date.now() - helper.finished.at < 6000;
  if (helper.status !== "working" && !recentlyFinished) return null;
  const percent = helperPercent(helper.stage);

  return (
    <Link
      href="/upload"
      role="status"
      className="bottom-float fixed right-4 z-40 hidden w-72 rounded-xl border border-success/50 bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-md hover:border-success sm:block"
      style={{ marginRight: "env(safe-area-inset-right)" }}
    >
      {helper.status === "working" && helper.job ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">
              ⛏️ {helper.job.forSomeoneElse ? "Splitting for someone" : "Splitting your queued song"}
            </span>
            {percent !== null && <span className="shrink-0 tabular-nums text-muted">{percent}%</span>}
          </div>
          <p className="mt-1 truncate text-muted">
            {helperStageText(helper.stage)} “{helper.job.title}”
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={`h-full bg-gradient-to-r from-success to-brand transition-all ${percent === null ? "w-full animate-pulse-glow" : ""}`}
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
        </>
      ) : (
        helper.finished && (
          <p className="font-semibold text-success">
            ✓ Split “{helper.finished.title}”{helper.finished.forSomeoneElse ? " for someone · +10 XP" : ""}
          </p>
        )
      )}
    </Link>
  );
}
