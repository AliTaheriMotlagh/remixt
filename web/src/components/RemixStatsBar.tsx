"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudioStore } from "@/lib/client/studioStore";
import { shortPath } from "@/lib/shareLinks";
import ShareMenu from "./ShareMenu";
import type { RemixStats } from "@/lib/models";

/** Seconds of listening before a play counts. */
const COUNT_AFTER_SECONDS = 5;
/**
 * A seek or a pitch/tempo re-render stops and restarts the transport for
 * an instant; only a real pause (longer than this) ends a listen.
 */
const PAUSE_ENDS_LISTEN_MS = 3000;

function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Plays, likes and sharing for a remix page. A play is counted once the
 * mix has actually been playing for a few seconds, once per listen.
 */
export default function RemixStatsBar({
  remixId,
  title,
  initial,
  signedIn,
}: {
  remixId: string;
  title: string;
  initial: RemixStats;
  signedIn: boolean;
}) {
  const [stats, setStats] = useState(initial);
  const [liking, setLiking] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const router = useRouter();

  const counted = useRef(false);
  const stoppedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      stoppedAt.current = Date.now();
      return;
    }
    if (stoppedAt.current !== null && Date.now() - stoppedAt.current > PAUSE_ENDS_LISTEN_MS) {
      counted.current = false;
    }
    stoppedAt.current = null;
    if (counted.current) return;
    const timer = setTimeout(async () => {
      counted.current = true;
      const res = await fetch(`/api/remixes/${remixId}/play`, { method: "POST" }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (data?.plays !== undefined) setStats((s) => ({ ...s, plays: data.plays }));
    }, COUNT_AFTER_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [isPlaying, remixId]);

  async function toggleLike() {
    if (!signedIn) {
      router.push(`/login?next=/remixes/${remixId}`);
      return;
    }
    const liked = !stats.liked;
    // Show it straight away; the server's numbers replace these after.
    setStats((s) => ({ ...s, liked, likes: s.likes + (liked ? 1 : -1) }));
    setLiking(true);
    try {
      const res = await fetch(`/api/remixes/${remixId}/like`, { method: liked ? "POST" : "DELETE" });
      if (res.ok) setStats(await res.json());
      else setStats((s) => ({ ...s, liked: !liked, likes: s.likes + (liked ? -1 : 1) }));
    } finally {
      setLiking(false);
    }
  }

  async function share() {
    const url = `${window.location.origin}${shortPath(remixId)}`;
    // The phone's own share sheet where there is one, else copy the link.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared("Link copied");
    } catch {
      setShared(url);
    }
    setTimeout(() => setShared(null), 2500);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span
        className="flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1.5 text-muted"
        title={`${stats.plays} ${stats.plays === 1 ? "play" : "plays"}`}
      >
        ▶ <span className="tabular-nums text-foreground">{formatCount(stats.plays)}</span>{" "}
        {stats.plays === 1 ? "play" : "plays"}
      </span>
      <button
        onClick={toggleLike}
        disabled={liking}
        aria-pressed={stats.liked}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
          stats.liked
            ? "border-vocals/60 bg-vocals/15 text-foreground"
            : "border-border text-muted hover:text-foreground"
        }`}
        title={signedIn ? (stats.liked ? "Unlike" : "Like") : "Sign in to like"}
      >
        <span className={stats.liked ? "text-vocals" : ""}>{stats.liked ? "♥" : "♡"}</span>
        <span className="tabular-nums">{formatCount(stats.likes)}</span>
      </button>
      <span className="relative flex">
        <button
          onClick={share}
          className="flex items-center gap-1.5 rounded-l-full border border-border px-3 py-1.5 text-muted transition-colors hover:text-foreground"
        >
          ↗ Share
        </button>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="rounded-r-full border border-l-0 border-border px-2.5 py-1.5 text-muted transition-colors hover:text-foreground"
          title="Short link, QR code and embed code"
        >
          ⋯
        </button>
        {menuOpen && <ShareMenu remixId={remixId} title={title} onClose={() => setMenuOpen(false)} />}
      </span>
      {shared && <span className="text-xs text-success">{shared}</span>}
    </div>
  );
}
