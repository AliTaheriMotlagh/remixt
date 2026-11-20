"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TagInput from "./TagInput";

export default function RemixOwnerControls({
  remixId,
  initialPublished,
  initialTags,
  initialWaiting,
}: {
  remixId: string;
  initialPublished: boolean;
  initialTags: string[];
  /** Publishing was asked for and some song's owner hasn't agreed yet. */
  initialWaiting?: string | null;
}) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Publishing asked for, waiting on the owners of private songs in it to agree (lib/publishConsent.ts).
  const [waiting, setWaiting] = useState<string | null>(initialWaiting ?? null);
  const [declined, setDeclined] = useState(false);
  const router = useRouter();

  async function togglePublish(askAgain = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/remixes/${remixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published, ...(askAgain ? { askAgain: true } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; published?: boolean; message?: string; waitingFor?: { status: string }[] };
      // Refused when an artist of a song in it chose Block, or an owner said no: say which and why.
      if (res.ok) {
        setPublished(!!data.published);
        setWaiting(data.waitingFor?.length ? (data.message ?? "Waiting for the songs' owners to agree") : null);
        setDeclined(false);
        setError(null);
      } else {
        setError(data.error ?? "Couldn't change it");
        setDeclined(!!data.waitingFor?.some((w) => w.status === "declined"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveTags() {
    if (!tags) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/remixes/${remixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (res.ok) {
        setTags(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this remix? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/remixes/${remixId}`, { method: "DELETE" });
      if (res.ok) router.push("/remixes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            published ? "bg-success/15 text-success" : "bg-surface-raised text-muted"
          }`}
        >
          {published ? "Published" : waiting ? "Waiting for approval" : "Private"}
        </span>
        <button
          onClick={() => togglePublish()}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {published ? "Unpublish" : "Publish"}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          Delete
        </button>
        <button
          onClick={() => setTags(tags ? null : initialTags)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover"
        >
          Tags
        </button>
        <Link
          href={`/earnings/remix/${remixId}`}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover"
        >
          Ads &amp; earnings
        </Link>
      </div>
      {error && (
        <p className="max-w-md text-xs text-danger">
          {error}{" "}
          {declined && (
            <button onClick={() => togglePublish(true)} disabled={busy} className="font-semibold underline">
              Ask again
            </button>
          )}
        </p>
      )}
      {waiting && !published && <p className="max-w-md text-xs text-muted">{waiting}</p>}
      {tags && (
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-3">
          <TagInput value={tags} onChange={setTags} compact />
          <button
            onClick={saveTags}
            disabled={busy}
            className="mt-2 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save tags
          </button>
        </div>
      )}
    </div>
  );
}
