"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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
import {
  LONG_SONG_SECONDS,
  MINING_TIERS,
  REWARD,
  RUSH_AFTER_MINUTES,
  nextTier,
  type MiningStats,
  type TopMiner,
} from "@/lib/mining";
import { describeStage } from "@/lib/client/uploads";

// The split queue's screens: what a phone sees instead of "use a
// computer", the list of songs waiting for a helper, and the mining rig
// that makes a computer a helper. (The corner status that follows the user
// around the site is in UploadActivity.tsx.)

/** Shown on phones above the upload form: songs go to the queue instead. */
export function QueueNotice({ onTryAnyway }: { onTryAnyway: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-4 text-sm sm:px-5">
      <p className="font-semibold">📱 → 💻 A computer splits it for you</p>
      <ol className="mt-2 grid gap-1.5 text-muted sm:grid-cols-3 sm:gap-3">
        <li>
          <span className="font-semibold text-foreground">1.</span> Pick songs — as many as you like. They&apos;re sent to the split queue.
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

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function Stat({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-raised px-3 py-2">
      <p className={`truncate text-base font-semibold tabular-nums ${accent ? "text-success" : ""}`}>{value}</p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** What the rig is doing right now: the song it's on, or why it's waiting. */
function RigStatus({ helper }: { helper: HelperState }) {
  const splitterState = useSplitter();
  if (helper.status === "working" && helper.job) {
    const { label, progress } = describeStage(helper.stage, splitterState);
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-medium">
            {helper.job.forSomeoneElse ? "Mining" : "Splitting your own queued song"}: “{helper.job.title}”
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
        : ["bg-success animate-pulse-glow", "Online — waiting for the next song. Keep this tab open; you can use the rest of the site meanwhile."];
  return (
    <p className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-muted">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span>{text}</span>
    </p>
  );
}

/** The last song this rig finished, with what it paid — for a few seconds. */
function LastBlock({ finished }: { finished: NonNullable<HelperState["finished"]> }) {
  return (
    <p key={finished.at} className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="font-medium text-success">✓ Split “{finished.title}”</span>
      {finished.reward && (
        <span className="animate-xp-pop font-bold text-success">
          +{finished.reward.xp} XP
          {finished.reward.bonuses.length > 0 && (
            <span className="ml-1 font-normal text-muted">({finished.reward.bonuses.join(", ")})</span>
          )}
        </span>
      )}
    </p>
  );
}

function RewardRules() {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <h3 className="font-semibold">Block rewards</h3>
      <ul className="mt-2 space-y-1.5 text-muted">
        <li className="flex justify-between gap-3">
          <span>Each song you split for someone</span>
          <span className="shrink-0 font-semibold text-foreground">{REWARD.base} XP</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Song longer than {LONG_SONG_SECONDS / 60} min</span>
          <span className="shrink-0 font-semibold text-foreground">+{REWARD.longSong}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Your first song of the day</span>
          <span className="shrink-0 font-semibold text-foreground">+{REWARD.firstToday}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>🔥 Rush: it waited over {RUSH_AFTER_MINUTES} min</span>
          <span className="shrink-0 font-semibold text-foreground">×{REWARD.rushMultiplier}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        XP counts towards your level and the leaderboard. Badges at{" "}
        {MINING_TIERS.map((t) => `${t.songs} ${t.emoji}`).join(" · ")} songs.
      </p>
    </div>
  );
}

function TopMinersList({ miners, me }: { miners: TopMiner[]; me: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Top miners this week</h3>
        {me !== null && <span className="text-muted">you&apos;re #{me}</span>}
      </div>
      {miners.length === 0 ? (
        <p className="mt-2 text-muted">Nobody yet this week — the first block is yours.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {miners.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center tabular-nums text-muted">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.avatar_color }} />
              <Link href={`/artist/${m.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {m.artist_name}
              </Link>
              <span className="shrink-0 tabular-nums text-muted">
                {m.songs} · <span className="font-semibold text-foreground">{m.xp} XP</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Re-renders every second while `on` (for the rig's uptime). */
function useTick(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/**
 * The mining rig on the Upload page, for computers: Start lends this
 * computer to the split queue (only ever when its owner presses it — and
 * only for this tab and visit), and the rest shows what it's earning — this
 * session, all told, and against everyone else mining this week.
 */
export function HelperPanel() {
  const helper = useSplitHelper();
  // Known only in the browser (it's about this device), so the server renders nothing.
  const canHelp = useSyncExternalStore(noSubscription, () => splitHelper.canHelp(), () => false);
  const [data, setData] = useState<{ stats: QueueStats; mining: MiningStats; miners: TopMiner[] } | null>(null);
  const now = useTick(helper.enabled);
  const lastFinish = helper.finished?.at ?? 0;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchQueue()
        .then(({ stats, mining, miners }) => !cancelled && setData({ stats, mining, miners }))
        .catch(() => {});
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Again after each song, for the new totals and rank.
  }, [lastFinish]);

  if (!canHelp) return null;
  const pool = helper.stats ?? data?.stats ?? null;
  const mining = data?.mining ?? null;
  const session = helper.session;
  const working = helper.status === "working" && !!helper.job?.forSomeoneElse;
  const next = mining ? nextTier(mining.songs) : null;
  const previous = mining ? [...MINING_TIERS].reverse().find((t) => t.songs <= mining.songs)?.songs ?? 0 : 0;
  const showFinished = helper.finished && now - helper.finished.at < 15_000;

  return (
    <section
      aria-label="Mining rig"
      className={`mt-6 rounded-2xl border p-4 text-sm transition-colors sm:p-5 ${
        helper.enabled ? "border-success/50 bg-success/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
            helper.enabled ? "bg-success/15" : "bg-surface-raised"
          }`}
          aria-hidden
        >
          <span className={working ? "animate-mine" : ""}>⛏️</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            Mining rig{" "}
            <span className={`ml-1 text-xs font-medium ${helper.enabled ? "text-success" : "text-muted"}`}>
              {helper.enabled ? (working ? "● mining" : helper.status === "paused" ? "● paused" : "● online") : "○ off"}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted">
            People on phones can&apos;t split songs, so they queue them. Lend this computer and it splits them one at a
            time in this tab — and you earn XP for every song. It pauses while music plays, your own uploads go
            first, and nothing starts until you press Start.
          </p>
        </div>
        <button
          onClick={() => splitHelper.setEnabled(!helper.enabled)}
          className={`w-full shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto ${
            helper.enabled
              ? "border border-border bg-background text-foreground hover:border-danger/60 hover:text-danger"
              : "bg-success text-white hover:opacity-90"
          }`}
        >
          {helper.enabled ? "Stop mining" : "⛏️ Start mining"}
        </button>
      </div>

      {pool && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat value={pool.waiting} label="songs waiting" accent={pool.waiting > 0} />
          <Stat value={pool.working} label="being split" />
          <Stat value={pool.rigs} label={pool.rigs === 1 ? "rig online" : "rigs online"} />
        </div>
      )}
      {!helper.enabled && !!pool?.waiting && (
        <p className="mt-2 text-xs font-medium text-brand-strong">
          {pool.waiting === 1 ? "A song is" : `${pool.waiting} songs are`} waiting for a rig right now — start mining
          to pick {pool.waiting === 1 ? "it" : "them"} up.
        </p>
      )}
      {!helper.enabled && helper.message && <p className="mt-2 text-xs text-danger">{helper.message}</p>}

      {helper.enabled && (
        <div className="mt-3 flex flex-col gap-2">
          <RigStatus helper={helper} />
          {showFinished && <LastBlock finished={helper.finished!} />}
          {session && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat value={duration((now - session.startedAt) / 1000)} label="uptime" />
              <Stat value={session.songs} label="songs this session" />
              <Stat value={`+${session.xp}`} label="XP this session" accent={session.xp > 0} />
              <Stat
                value={session.speed ? `${session.speed.toFixed(1)}×` : "—"}
                label={session.speed ? "speed (× realtime)" : "speed — after 1st song"}
              />
            </div>
          )}
        </div>
      )}

      {mining && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your mining</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={`${mining.xp.toLocaleString()} XP`} label={`from ${mining.songs} ${mining.songs === 1 ? "song" : "songs"}`} />
            <Stat value={`+${mining.todayXp}`} label={`today · ${mining.today} ${mining.today === 1 ? "song" : "songs"}`} />
            <Stat value={mining.streak ? `🔥 ${mining.streak}` : "—"} label={mining.streak === 1 ? "day streak" : "days streak"} />
            <Stat value={mining.weekRank ? `#${mining.weekRank}` : "—"} label="rank this week" />
          </div>
          {next && (
            <div className="mt-3">
              <div className="flex justify-between gap-2 text-[11px] text-muted">
                <span>
                  Next badge: {next.emoji} <span className="font-medium text-foreground">{next.label}</span>
                </span>
                <span className="tabular-nums">
                  {mining.songs} / {next.songs} songs
                </span>
              </div>
              <ProgressBar progress={(mining.songs - previous) / Math.max(1, next.songs - previous)} tone="success" />
            </div>
          )}
          {mining.audioSeconds > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              You&apos;ve split {duration(mining.audioSeconds)} of music for other people.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <RewardRules />
        <TopMinersList miners={data?.miners ?? []} me={mining?.weekRank ?? null} />
      </div>
    </section>
  );
}
