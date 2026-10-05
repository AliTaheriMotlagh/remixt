"use client";

import { useState } from "react";

/** The owner's invite link on their artist page: share it, and earn XP when friends make something. */
export default function InviteCard({ url, referrals }: { url: string; referrals: number }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = "Come remix with me on Remixt — any vocal over any beat, right in the browser.";
    if (navigator.share) {
      await navigator.share({ title: "Remixt", text, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/15 to-vocals/10 p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="text-3xl" aria-hidden>
        📣
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold">Invite friends, level up</h2>
        <p className="mt-0.5 text-xs text-muted">
          +75 XP for every friend who joins with your link and makes something. Three earns the 📣 Talent Scout badge.
          {referrals > 0 && <span className="ml-1 font-semibold text-foreground">{referrals} so far.</span>}
        </p>
        <p className="mt-1.5 truncate font-mono text-[11px] text-muted">{url}</p>
      </div>
      <button onClick={share} className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">
        {copied ? "✓ Link copied" : "Share invite"}
      </button>
    </section>
  );
}
