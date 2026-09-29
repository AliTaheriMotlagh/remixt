"use client";

import { useState } from "react";

export default function TakedownForm({ signedInEmail }: { signedInEmail: string | null }) {
  const [email, setEmail] = useState(signedInEmail ?? "");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [work, setWork] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!goodFaith) {
      setError("Tick the statement box to send the request");
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "takedown",
        reason: "copyright",
        email: email.trim() || null,
        link: link.trim(),
        details: `From: ${name.trim() || "(no name given)"}\n\n${work.trim()}\n\nThe sender stated in good faith that this use isn't authorised by the rights holder, and that the information is accurate.`,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSending(false);
    if (res?.ok) setSent(true);
    else setError(data?.error ?? "Couldn't send the request — try again");
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-2xl border border-success/40 bg-success/10 p-6 text-sm">
        <p className="font-semibold">Request received.</p>
        <p className="mt-1 text-muted">
          An admin will review it and remove the content if it infringes your rights. We&apos;ll reply to{" "}
          {email || "your account email"} if we need anything else.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Your name (or your company&apos;s)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={200} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Email we can reach you at</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Link to the remix or song on Remixt</span>
        <input
          required
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…/remixes/…"
          className="input"
          maxLength={500}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">
          Which work of yours it uses, and your rights to it
        </span>
        <textarea
          required
          minLength={20}
          value={work}
          onChange={(e) => setWork(e.target.value)}
          rows={5}
          className="input"
          maxLength={3000}
          placeholder="e.g. The vocal is from my single “…” (2024). I'm the songwriter and the recording's owner."
        />
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={goodFaith}
          onChange={(e) => setGoodFaith(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
        />
        <span>
          I believe in good faith that this use isn&apos;t authorised by the rights holder, its agent or the law, and
          the information above is accurate. I&apos;m the rights holder or authorised to act for them.
        </span>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send takedown request"}
      </button>
    </form>
  );
}
