"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useCaptcha } from "@/lib/client/captcha";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const withCaptcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await withCaptcha((captcha) =>
        fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, captcha }) })
      );
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("Couldn't reach Remixt — check your connection and try again");
      setState("idle");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        {state === "sent" ? (
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <MailCheck className="h-6 w-6 text-success" />
            <p>
              If <strong>{email}</strong> has a Remixt account, a link to choose a new password is on its way. It works for an hour. Check your spam
              folder if it isn&apos;t there in a minute.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-muted">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              aria-label="Email"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={state === "sending"} className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              {state === "sending" ? "Sending…" : "Send the link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-brand-strong hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
