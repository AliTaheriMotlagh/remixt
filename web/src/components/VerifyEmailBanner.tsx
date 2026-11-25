"use client";

import { MailWarning, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isBareView } from "@/lib/bareView";

/** "Confirm your email" across the top until they do — with a button to send the link again. */
export default function VerifyEmailBanner({ email }: { email: string }) {
  const pathname = usePathname() ?? "/";
  const [state, setState] = useState<"idle" | "sending" | "sent" | "hidden">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "hidden" || isBareView(pathname) || pathname.startsWith("/studio") || pathname.startsWith("/dj")) return null;

  const resend = async () => {
    setState("sending");
    setError(null);
    const res = await fetch("/api/auth/verify", { method: "POST" }).catch(() => null);
    if (res?.ok) return setState("sent");
    setError((await res?.json().catch(() => null))?.error ?? "Couldn't send — check your connection");
    setState("idle");
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-beat/30 bg-beat/10 px-4 py-2 text-xs sm:text-sm">
      <MailWarning className="h-4 w-4 shrink-0 text-beat" />
      <span className="min-w-0 flex-1">
        {state === "sent" ? (
          <>Sent — open the link in the email to {email}.</>
        ) : (
          <>
            Confirm your email (<strong className="break-all">{email}</strong>) to publish, get paid and join Plus.
          </>
        )}
        {error && <span className="ms-2 text-danger">{error}</span>}
      </span>
      {state !== "sent" && (
        <button type="button" onClick={() => void resend()} disabled={state === "sending"} className="rounded-md bg-beat/20 px-2.5 py-1 font-semibold hover:bg-beat/30 disabled:opacity-50">
          {state === "sending" ? "Sending…" : "Send the link again"}
        </button>
      )}
      <button type="button" onClick={() => setState("hidden")} aria-label="Hide for now" className="rounded p-1 text-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
