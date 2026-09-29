"use client";

import { useState } from "react";
import { useCollab } from "@/lib/client/collab";

const SYNC_LABEL = {
  connecting: "Connecting…",
  synced: "Everyone's in sync",
  saving: "Sending your changes…",
  offline: "Offline — will catch up",
  ended: "Session ended",
} as const;

/** Who's in the shared session, whether it's in sync, and the invite link. */
export default function CollabBar({ userId, onLeave }: { userId: string | null; onLeave: () => void }) {
  const { members, inviteCode, sync, lastEditor, error, ownerId, title } = useCollab();
  const [copied, setCopied] = useState(false);
  const isOwner = ownerId === userId;

  async function copyInvite() {
    const link = `${window.location.origin}/studio?join=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link", link);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-beat/50 bg-beat/10 px-4 py-2.5 text-sm">
      <span className="font-semibold">👥 {title || "Shared session"}</span>
      <span className="flex -space-x-1.5">
        {members.map((m) => (
          <span
            key={m.id}
            className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-surface ${
              m.online ? "" : "opacity-40"
            }`}
            style={{ background: m.avatar_color }}
            title={`${m.artist_name}${m.owner ? " (started it)" : ""}${m.online ? " — here now" : " — away"}`}
          >
            {m.artist_name.slice(0, 1).toUpperCase()}
            {m.online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" />}
          </span>
        ))}
      </span>
      <span className={`text-xs ${sync === "offline" || sync === "ended" ? "text-danger" : "text-muted"}`}>
        {error ?? SYNC_LABEL[sync]}
        {sync === "synced" && lastEditor ? ` · last change by ${lastEditor}` : ""}
      </span>
      <span className="ml-auto flex gap-2">
        {inviteCode && sync !== "ended" && (
          <button onClick={copyInvite} className="rounded-lg bg-beat px-3 py-1.5 text-xs font-semibold text-white">
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        )}
        <button
          onClick={() => {
            if (isOwner && !window.confirm("You started this session — leaving ends it for everyone. Leave?")) return;
            onLeave();
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          {sync === "ended" ? "Close" : "Leave"}
        </button>
      </span>
    </div>
  );
}
