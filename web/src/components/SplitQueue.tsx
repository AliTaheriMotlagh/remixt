"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  cancelQueued,
  fetchQueue,
  retryQueued,
  splitHelper,
  useSplitHelper,
  type HelperState,
  type QueuedJob,
  type QueueStats,
} from "@/lib/client/splitQueue";
import { useSplitter } from "@/lib/client/splitter";
import { describeStage } from "@/lib/client/uploads";

// The split queue's screens: what a phone sees instead of "use a
// computer", the list of songs waiting for a helper, and the switch that
// makes a computer a helper. (The corner status that follows the user
// around the site is in UploadActivity.tsx.)

/** Shown on phones above the upload form: songs go to the queue instead. */
export function QueueNotice({ onTryAnyway }: { onTryAnyway: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-4 text-sm sm:px-5">
      <p className="font-semibold">📱 → 💻 A computer splits it for you</p>
      <ol className="mt-2 grid gap-1.5 text-muted sm:grid-cols-3 sm:gap-3">
        <li>
          <span className="font-semibold text-foreground">1.</span> Pick a song — it&apos;s sent to the split queue.
        </li>
        <li>
          <span className="font-semibold text-foreground">2.</span> The next computer helping out splits it, usually
          within minutes.
        </li>
        <li>
          <span className="font-semibold text-foreground">3.</span> You get a notification when it&apos;s in your library.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted">
        Once it&apos;s sent you can use the rest of the site or close the app.
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

/** "just now", "4 min ago", "2 h ago". */
function ago(iso: string, now: number) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

const STEPS = ["Sent", "In line", "Splitting", "In library"] as const;

function stepOf(job: QueuedJob) {
  return job.status === "uploading" ? 0 : job.status === "queued" ? 1 : job.status === "working" ? 2 : 3;
}

function jobDetail(job: QueuedJob) {
  switch (job.status) {
    case "uploading":
      return "Still being sent from your device…";
    case "queued": {
      const line =
        job.position && job.position > 1 ? `#${job.position} in line — waiting for a computer` : "Next in line — waiting for a computer";
      return job.attempts > 0 ? `${line} (trying again: ${job.error ?? "the last try didn't finish"})` : line;
    }
    case "working": {
      const who = job.helper_name ? `${job.helper_name}'s computer` : "A helper's computer";
      const what =
        job.stage === "downloading"
          ? "is fetching it"
          : job.stage === "uploading"
            ? "is uploading the stems"
            : job.stage === "encoding"
              ? "is finishing the stems"
              : job.stage === "waiting"
                ? "will start it in a moment"
                : "is splitting it";
      return `${who} ${what}`;
    }
    default:
      return job.error ?? "Couldn't be split";
  }
}

function StepTracker({ job }: { job: QueuedJob }) {
  const current = stepOf(job);
  const failed = job.status === "failed";
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = !failed && i < current;
        const now = !failed && i === current;
        // How full this step's bar is; null pulses (under way, no telling how far).
        let width: number | null;
        if (failed) width = i <= 2 ? 1 : 0; // it got as far as splitting
        else if (done) width = 1;
        else if (now) width = job.status === "working" ? Math.max(0.06, job.progress) : null;
        else width = 0;
        return (
          <li key={label} aria-current={now ? "step" : undefined} className="min-w-0">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  failed ? "bg-danger/60" : "bg-gradient-to-r from-brand to-vocals"
                } ${width === null ? "w-full animate-pulse-glow opacity-60" : ""}`}
                style={width === null ? undefined : { width: `${width * 100}%` }}
              />
            </div>
            <span
              className={`mt-1 block truncate text-[11px] ${
                now ? "font-semibold text-foreground" : done ? "text-muted" : "text-muted/60"
              }`}
            >
              {label}
              {now && job.status === "working" ? ` ${Math.round(job.progress * 100)}%` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function QueuedSongRow({ job, now, onChanged }: { job: QueuedJob; now: number; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = job.status === "failed";

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work — try again");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      className={`rounded-xl border p-3.5 text-sm ${failed ? "border-danger/40 bg-danger/5" : "border-border bg-surface"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{job.title}</p>
          <p className="mt-0.5 text-xs text-muted">Queued {ago(job.created_at, now)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {failed && (
            <button
              onClick={() => act(() => retryQueued(job.id))}
              disabled={busy}
              className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
            >
              Try again
            </button>
          )}
          {confirming ? (
            <>
              <button
                onClick={() => act(() => cancelQueued(job.id))}
                disabled={busy}
                className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {failed ? "Remove" : "Yes, cancel"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
            >
              {failed ? "Remove" : "Cancel"}
            </button>
          )}
        </div>
      </div>
      <StepTracker job={job} />
      <p className={`mt-2 text-xs ${failed ? "text-danger" : "text-muted"}`}>{jobDetail(job)}</p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}

/**
 * Songs you've queued that aren't in your library yet. Checks back while
 * any are on their way (more often while one's being split, and not while
 * the page is hidden); when one finishes, `onFinished` refreshes your
 * uploads.
 */
export function QueuedSongs({ refreshKey, onFinished }: { refreshKey: number; onFinished: () => void }) {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { jobs: next } = await fetchQueue();
      // A job that vanished from the list finished: its track is in the library now.
      const ids = new Set(next.map((j) => j.id));
      const finished = [...known.current].some((id) => !ids.has(id));
      known.current = ids;
      setJobs(next);
      setNow(Date.now());
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
  const working = jobs.some((j) => j.status === "working" || j.status === "uploading");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, working ? 3000 : 8000);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [pending, working, load]);

  if (jobs.length === 0) return null;

  return (
    <section className="mb-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        In the split queue · {jobs.length}
      </h3>
      <ul className="flex flex-col gap-2">
        {jobs.map((job) => (
          <QueuedSongRow key={job.id} job={job} now={now} onChanged={load} />
        ))}
      </ul>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-surface-raised px-3 py-2">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function HelperStatusLine({ helper }: { helper: HelperState }) {
  const splitterState = useSplitter();
  if (helper.status === "working" && helper.job) {
    const { label, progress } = describeStage(helper.stage, splitterState);
    return (
      <div className="mt-3 rounded-xl border border-success/30 bg-success/5 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-medium">
            ⛏️ {helper.job.forSomeoneElse ? "Splitting for someone" : "Splitting your queued song"}: “{helper.job.title}”
          </span>
          {progress !== null && <span className="shrink-0 tabular-nums text-muted">{Math.round(progress * 100)}%</span>}
        </div>
        <ProgressBar progress={progress} tone="success" />
        <p className="mt-1.5 text-[11px] text-muted">{label}…</p>
      </div>
    );
  }
  const [dot, text] =
    helper.status === "paused"
      ? ["bg-amber-400", `Paused — ${helper.message}. It picks up again by itself.`]
      : helper.message
        ? ["bg-danger", helper.message]
        : ["bg-success animate-pulse-glow", "On — waiting for songs. Keep a Remixt tab open and they'll come to you."];
  return (
    <p className="mt-3 flex items-start gap-2 text-xs text-muted">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span>{text}</span>
    </p>
  );
}

/** A thin progress bar; `null` progress pulses instead. */
export function ProgressBar({ progress, tone = "brand" }: { progress: number | null; tone?: "brand" | "success" }) {
  const colors = tone === "success" ? "from-success to-brand" : "from-brand to-vocals";
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${colors} transition-all duration-500 ${
          progress === null ? "w-full animate-pulse-glow opacity-60" : ""
        }`}
        style={progress !== null ? { width: `${Math.max(3, Math.round(progress * 100))}%` } : undefined}
      />
    </div>
  );
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
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!canHelp) return null;
  const shown = helper.stats ?? stats;

  return (
    <section
      className={`mt-6 rounded-2xl border p-4 text-sm transition-colors ${
        helper.enabled ? "border-success/50 bg-success/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">⛏️ Help split songs for people on phones</h2>
          <p className="mt-1 text-xs text-muted">
            Phones can&apos;t split songs, so they queue them. While this is on, this browser takes them one at a time
            and splits them in the background — on any page, while you do other things. It pauses while music plays
            and lets your own uploads go first. Each song you split for someone earns you 10 XP.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={helper.enabled}
          onClick={() => splitHelper.setEnabled(!helper.enabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            helper.enabled ? "bg-success" : "bg-surface-raised ring-1 ring-border"
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

      {shown && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={shown.waiting} label="waiting" />
          <Stat value={shown.working} label="being split" />
          <Stat value={shown.helped} label="split by you" />
        </div>
      )}

      {helper.enabled && <HelperStatusLine helper={helper} />}
      {!helper.enabled && helper.message && <p className="mt-3 text-xs text-danger">{helper.message}</p>}
      {!helper.enabled && !!shown?.waiting && (
        <p className="mt-3 text-xs font-medium text-brand-strong">
          {shown.waiting === 1 ? "A song is" : `${shown.waiting} songs are`} waiting for a computer right now — switch
          this on to help.
        </p>
      )}
    </section>
  );
}
