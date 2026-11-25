"use client";

// Change your password (signs out every other device). Shown in Admin — with
// a warning when the password last used to sign in is a weak one.

import { useState } from "react";
import { PASSWORD_MIN } from "@/lib/passwordRules";

export default function ChangePassword({ weak = false }: { weak?: boolean }) {
  const [open, setOpen] = useState(weak);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError("");
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setState("idle");
      setError(d.error ?? "Couldn't change it");
      return;
    }
    setState("done");
    setCurrent("");
    setNext("");
  }

  if (state === "done") return <p className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm">Password changed. Every other device is signed out.</p>;
  return (
    <div className={`rounded-xl border p-3 text-sm ${weak ? "border-danger/50 bg-danger/5" : "border-border bg-surface"}`}>
      {weak && (
        <p className="font-semibold text-danger">
          Your admin password is weak (short or one of the first passwords anyone tries). Anyone who guesses it controls the site and its money — change it now.
        </p>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-brand-strong hover:underline">
          Change your password
        </button>
      ) : (
        <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" className="input max-w-56" aria-label="Current password" />
          <input type="password" required minLength={PASSWORD_MIN} value={next} onChange={(e) => setNext(e.target.value)} placeholder={`New password (${PASSWORD_MIN}+ characters)`} autoComplete="new-password" className="input max-w-64" aria-label="New password" />
          <button type="submit" disabled={state === "saving"} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {state === "saving" ? "Saving…" : "Change"}
          </button>
          {error && <span className="w-full text-danger">{error}</span>}
        </form>
      )}
    </div>
  );
}
