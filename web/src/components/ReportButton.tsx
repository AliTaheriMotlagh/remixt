"use client";

import { useState } from "react";
import { useOnScreen } from "@/lib/client/useOnScreen";
import Link from "next/link";
import { Flag } from "lucide-react";

const REASONS: { id: string; label: string }[] = [
  { id: "spam", label: "Spam or misleading" },
  { id: "abuse", label: "Harassment or hate" },
  { id: "explicit", label: "Sexual or violent content" },
  { id: "copyright", label: "It uses my music without permission" },
  { id: "other", label: "Something else" },
];

/** "⚑ Report" — a small form that files a report for the admins. */
export default function ReportButton({
  kind,
  targetId,
  signedIn,
  className = "",
}: {
  kind: "remix" | "comment" | "track" | "live";
  targetId: string;
  signedIn: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [onScreen, onScreenStyle] = useOnScreen<HTMLDivElement>(open);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, targetId, reason, details }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) {
      setState("sent");
    } else {
      setState("idle");
      setError(data?.error ?? "Couldn't send the report");
    }
  }

  if (state === "sent") {
    return <span className={`text-xs text-muted ${className}`}>Thanks — reported to the admins.</span>;
  }

  return (
    <span className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-my-2 py-2 text-xs text-muted hover:text-danger"
        aria-expanded={open}
        title={`Report this ${kind === "track" ? "song" : kind === "live" ? "live session" : kind}`}
      >
        <Flag /> Report
      </button>
      {open && <div className="sheet-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div ref={onScreen} style={onScreenStyle} className="popover-sheet absolute right-0 top-full z-[45] mt-1 w-72 rounded-xl border border-border bg-surface p-3 text-left shadow-xl">
          {!signedIn ? (
            <p className="text-xs text-muted">
              <Link href="/login" className="text-brand-strong hover:underline">
                Sign in
              </Link>{" "}
              to report. Own the music and don&apos;t have an account? File a{" "}
              <Link href="/takedown" className="text-brand-strong hover:underline">
                takedown request
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2">
              <p className="text-xs font-semibold">What&apos;s wrong with it?</p>
              {REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name={`reason-${targetId}`}
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="accent-brand"
                  />
                  {r.label}
                </label>
              ))}
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Anything the admins should know (optional)"
                maxLength={2000}
                rows={2}
                className="input !py-1.5 text-xs"
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs text-muted">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state === "sending"}
                  className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {state === "sending" ? "Sending…" : "Report"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </span>
  );
}
