"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { splitHelper, useSplitHelper } from "@/lib/client/splitQueue";
import { useSplitter } from "@/lib/client/splitter";
import { describeStage, uploads, useUploads, type UploadItem } from "@/lib/client/uploads";
import { ProgressBar } from "./SplitQueue";

// The songs being added to the library: the list on the Upload page, and
// the tray in the corner of every other page, so the user can go anywhere
// on the site while songs split and upload in the background.

function doneText(item: UploadItem) {
  return item.mode === "queue" ? "Sent to the split queue" : "In your library";
}

function UploadRow({ item }: { item: UploadItem }) {
  const splitterState = useSplitter();
  const { label, progress } = describeStage(item.stage, splitterState);
  return (
    <li
      className={`rounded-xl border p-3.5 text-sm ${
        item.status === "failed"
          ? "border-danger/40 bg-danger/5"
          : item.status === "working"
            ? "border-brand/40 bg-brand/5"
            : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium">
          {item.status === "done" && <span className="mr-1.5 text-success">✓</span>}
          {item.name}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {item.status === "working" && progress !== null && (
            <span className="tabular-nums text-muted">{Math.round(progress * 100)}%</span>
          )}
          {item.status === "failed" && (
            <button
              onClick={() => uploads.retry(item.id)}
              className="rounded-md bg-brand px-2.5 py-1 font-semibold text-white hover:bg-brand-strong"
            >
              Try again
            </button>
          )}
          {item.status !== "working" && (
            <button
              onClick={() => uploads.remove(item.id)}
              className="rounded-md px-1.5 py-1 text-muted hover:text-foreground"
              aria-label={item.status === "waiting" ? `Don't add ${item.name}` : `Hide ${item.name}`}
            >
              {item.status === "waiting" ? "Remove" : "✕"}
            </button>
          )}
        </div>
      </div>
      {item.status === "working" && <ProgressBar progress={progress} />}
      <p className={`mt-1.5 text-xs ${item.status === "failed" ? "text-danger" : "text-muted"}`}>
        {item.status === "waiting"
          ? "In line — starts when the song before it is done"
          : item.status === "working"
            ? `${label}…`
            : item.status === "done"
              ? doneText(item)
              : item.error}
      </p>
    </li>
  );
}

/** The songs being added from this browser, on the Upload page. */
export function UploadList() {
  const items = useUploads();
  if (items.length === 0) return null;
  const active = items.filter((i) => i.status === "working" || i.status === "waiting").length;
  const done = items.filter((i) => i.status === "done").length;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const queue = items.some((i) => i.mode === "queue" && i.status !== "done");
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {active ? `Adding ${active} ${active === 1 ? "song" : "songs"}` : "Added"}
          {active > 0 && done > 0 && <span className="font-normal normal-case"> · {done} done</span>}
        </h2>
        <div className="flex gap-3 text-xs">
          {failed > 1 && (
            <button onClick={() => uploads.retryFailed()} className="font-medium text-brand-strong hover:underline">
              Try all {failed} again
            </button>
          )}
          {waiting > 1 && (
            <button onClick={() => uploads.removeWaiting()} className="text-muted hover:text-foreground">
              Remove {waiting} waiting
            </button>
          )}
          {done > 0 && (
            <button onClick={() => uploads.clearFinished()} className="text-muted hover:text-foreground">
              Clear finished
            </button>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <UploadRow key={item.id} item={item} />
        ))}
      </ul>
      {active > 0 && (
        <p className="mt-2 text-xs text-muted">
          {queue
            ? "You can use the rest of the site meanwhile. If your screen turns off, sending pauses and carries on when you’re back — just don’t close Remixt."
            : "This carries on in the background — feel free to use the rest of the site. Just don’t close the tab."}
        </p>
      )}
    </section>
  );
}

/** How long a finished song stays in the corner. */
const SHOW_DONE_MS = 8000;

/**
 * Runs on every page: keeps mining going in this tab (once started, until
 * stopped), and shows what's happening in the background — the
 * user's own songs being added, and songs being split for others — in the
 * corner, on every page but Upload (which lists it all already).
 */
export function BackgroundActivity({ signedIn }: { signedIn: boolean }) {
  const helper = useSplitHelper();
  const items = useUploads();
  const splitterState = useSplitter();
  const pathname = usePathname();
  const [dismissedAt, setDismissedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (signedIn) splitHelper.restore();
  }, [signedIn]);

  // Where audio is the point of the page, splitting (all GPU or CPU)
  // would make it stutter — so no new songs for others start there.
  useEffect(() => {
    const audioPage =
      pathname.startsWith("/studio") || pathname.startsWith("/remixes/") || pathname.startsWith("/embed/");
    splitHelper.setPageReason(audioPage ? "you're on a page that plays music" : null);
  }, [pathname]);

  // Finished songs leave the corner by themselves after a few seconds.
  const latestFinish = Math.max(helper.finished?.at ?? 0, ...items.map((i) => i.finishedAt ?? 0));
  useEffect(() => {
    if (!latestFinish) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-render to show, then again to hide
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), SHOW_DONE_MS + 100);
    return () => clearTimeout(timer);
  }, [latestFinish]);

  if (!signedIn || pathname.startsWith("/embed/") || pathname.startsWith("/upload")) return null;

  const active = items.filter((i) => i.status === "working" || i.status === "waiting");
  const current = active.find((i) => i.status === "working");
  const recent = (i: UploadItem) => (i.finishedAt ?? 0) > dismissedAt && now - (i.finishedAt ?? 0) < SHOW_DONE_MS;
  const failed = items.filter((i) => i.status === "failed" && (i.finishedAt ?? 0) > dismissedAt);
  const justDone = items.filter((i) => i.status === "done" && recent(i));
  const helping = helper.status === "working" && helper.job;
  const helperDone = helper.finished && now - helper.finished.at < SHOW_DONE_MS && helper.finished.at > dismissedAt;

  if (!current && !active.length && !failed.length && !justDone.length && !helping && !helperDone) return null;

  const own = current ? describeStage(current.stage, splitterState) : null;
  const helperStage = helping ? describeStage(helper.stage, splitterState) : null;
  const dismissable = failed.length > 0 || justDone.length > 0 || (!!helperDone && !helping);

  return (
    <div
      role="status"
      className={`bottom-float fixed left-3 right-3 z-40 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-md sm:left-auto sm:right-4 sm:w-80 ${
        dismissable ? "pr-8" : ""
      }`}
      style={{ marginRight: "env(safe-area-inset-right)" }}
    >
      <div className="flex flex-col gap-3">
        {current && own && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">🎵 {current.name}</span>
              {own.progress !== null && (
                <span className="shrink-0 tabular-nums text-muted">{Math.round(own.progress * 100)}%</span>
              )}
            </div>
            <ProgressBar progress={own.progress} />
            <p className="mt-1.5 truncate text-muted">
              {own.label}
              {active.length > 1 ? ` · ${active.length - 1} more to go` : ""}
            </p>
          </div>
        )}
        {!current && active.length > 0 && <p className="font-semibold">🎵 {active.length} songs waiting to be added</p>}
        {justDone.length > 2 ? (
          <p className="truncate font-semibold text-success">✓ {justDone.length} songs added</p>
        ) : (
          justDone.map((item) => (
            <p key={item.id} className="truncate font-semibold text-success">
              ✓ “{item.name}” — {doneText(item).toLowerCase()}
            </p>
          ))
        )}
        {failed.length > 0 && (
          <p className="text-danger">
            <span className="font-semibold">
              {failed.length === 1 ? `Couldn’t add “${failed[0].name}”.` : `Couldn’t add ${failed.length} songs.`}
            </span>{" "}
            <Link href="/upload" className="underline underline-offset-2">
              See why
            </Link>
          </p>
        )}
        {helping && helperStage && (
          <Link href="/upload" className="block rounded-lg hover:bg-surface-hover">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">
                <span className="animate-mine">⛏️</span>{" "}
                {helper.job!.forSomeoneElse ? "Mining a song for someone" : "Splitting your queued song"}
              </span>
              {helperStage.progress !== null && (
                <span className="shrink-0 tabular-nums text-muted">{Math.round(helperStage.progress * 100)}%</span>
              )}
            </div>
            <ProgressBar progress={helperStage.progress} tone="success" />
            <p className="mt-1.5 truncate text-muted">
              {helperStage.label} · “{helper.job!.title}”
            </p>
          </Link>
        )}
        {!helping && helperDone && (
          <p className="truncate font-semibold text-success">
            ✓ Split “{helper.finished!.title}”
            {helper.finished!.reward && <span className="animate-xp-pop ml-1">· +{helper.finished!.reward.xp} XP</span>}
          </p>
        )}
      </div>
      {dismissable && (
        <button
          onClick={() => setDismissedAt(Date.now())}
          className="absolute right-1.5 top-1.5 rounded px-1.5 text-muted hover:text-foreground"
          aria-label="Hide"
        >
          ✕
        </button>
      )}
    </div>
  );
}
