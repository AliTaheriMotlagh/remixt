"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArtistBioEditor({ initialBio }: { initialBio: string }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <p className="text-sm text-muted">{bio || "No bio yet — tell people about your sound."}</p>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-xs font-medium text-brand-strong hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={280}
        rows={3}
        className="input"
        placeholder="Tell people about your sound…"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            setBio(initialBio);
            setEditing(false);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
