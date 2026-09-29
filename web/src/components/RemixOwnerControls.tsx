"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TagInput from "./TagInput";

export default function RemixOwnerControls({
  remixId,
  initialPublished,
  initialTags,
}: {
  remixId: string;
  initialPublished: boolean;
  initialTags: string[];
}) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function togglePublish() {
    setBusy(true);
    try {
      const res = await fetch(`/api/remixes/${remixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      if (res.ok) setPublished(!published);
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
          {published ? "Published" : "Private"}
        </span>
        <button
          onClick={togglePublish}
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
      </div>
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
