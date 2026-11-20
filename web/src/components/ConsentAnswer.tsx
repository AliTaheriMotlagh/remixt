"use client";

// "Can this remix go public with your song?" — the owner's answer, from the
// approvals page or the remix page itself (lib/publishConsent.ts).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";

export default function ConsentAnswer({
  remixId,
  trackId,
  status,
  compact = false,
}: {
  remixId: string;
  trackId: string;
  status: "asked" | "agreed" | "declined";
  compact?: boolean;
}) {
  const [state, setState] = useState(status);
  const [note, setNote] = useState("");
  const [saying, setSaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function answer(agree: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remixId, trackId, agree, note: agree ? undefined : note || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: "agreed" | "declined" };
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer");
      setState(data.status ?? (agree ? "agreed" : "declined"));
      setSaying(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't answer");
    } finally {
      setBusy(false);
    }
  }

  if (state !== "asked") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state === "agreed" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
          {state === "agreed" ? "You agreed" : "You said no"}
        </span>
        <button onClick={() => answer(state !== "agreed")} disabled={busy} className="text-xs text-muted underline hover:text-foreground">
          {state === "agreed" ? "Change to no" : "Agree after all"}
        </button>
      </div>
    );
  }
  return (
    <div className={compact ? "" : "mt-2"}>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => answer(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Agree
        </button>
        <button
          onClick={() => setSaying((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Say no
        </button>
      </div>
      {saying && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            dir="auto"
            placeholder="Why, or what would change your mind (optional)"
            className="input flex-1"
          />
          <button onClick={() => answer(false)} disabled={busy} className="rounded-lg border border-danger/50 px-3.5 py-2 text-sm font-semibold text-danger">
            Send no
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
