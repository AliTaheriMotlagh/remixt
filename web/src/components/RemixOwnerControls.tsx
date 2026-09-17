"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RemixOwnerControls({
  remixId,
  initialPublished,
}: {
  remixId: string;
  initialPublished: boolean;
}) {
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
    <div className="flex items-center gap-2">
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
    </div>
  );
}
