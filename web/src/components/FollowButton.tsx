"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FollowState } from "@/lib/social";

/** Follow/unfollow an artist, with their follower and following counts. */
export default function FollowButton({
  artistId,
  initial,
  signedIn,
  isSelf,
}: {
  artistId: string;
  initial: FollowState;
  signedIn: boolean;
  isSelf: boolean;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?next=/artist/${artistId}`);
      return;
    }
    const follow = !state.isFollowing;
    // Show it straight away; the server's numbers replace these after.
    setState((s) => ({ ...s, isFollowing: follow, followers: s.followers + (follow ? 1 : -1) }));
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${artistId}/follow`, { method: follow ? "POST" : "DELETE" });
      if (res.ok) setState(await res.json());
      else setState((s) => ({ ...s, isFollowing: !follow, followers: s.followers + (follow ? -1 : 1) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="tabular-nums">
        <strong>{state.followers}</strong> <span className="text-muted">follower{state.followers === 1 ? "" : "s"}</span>
      </span>
      <span className="tabular-nums">
        <strong>{state.following}</strong> <span className="text-muted">following</span>
      </span>
      {!isSelf && (
        <button
          onClick={toggle}
          disabled={busy}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
            state.isFollowing
              ? "border border-border text-foreground hover:border-danger hover:text-danger"
              : "bg-brand text-white hover:bg-brand-strong"
          }`}
        >
          {state.isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}
