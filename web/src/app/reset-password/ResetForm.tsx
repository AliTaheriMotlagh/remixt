"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError("The two passwords aren't the same");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
        return;
      }
      router.push("/studio");
      router.refresh();
    } catch {
      setError("Couldn't reach Remixt — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  if (!token)
    return (
      <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-3 px-4 py-16 text-sm">
        <h1 className="text-2xl font-bold">This link is incomplete</h1>
        <p className="text-muted">Open the link from the email again, or ask for a new one.</p>
        <Link href="/forgot-password" className="font-semibold text-brand-strong hover:underline">
          Ask for a new link
        </Link>
      </div>
    );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="New password (8 characters or more)" autoComplete="new-password" aria-label="New password" />
        <input type="password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} className="input" placeholder="The same again" autoComplete="new-password" aria-label="New password again" />
        {error && (
          <p className="text-sm text-danger">
            {error}{" "}
            {/run out|used/.test(error) && (
              <Link href="/forgot-password" className="font-semibold underline">
                New link
              </Link>
            )}
          </p>
        )}
        <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? "Saving…" : "Save and log in"}
        </button>
      </form>
    </div>
  );
}
