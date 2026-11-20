"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import InviteOnline from "./InviteOnline";
import { useCollab, type CollabMember } from "@/lib/client/collab";
import { ROLES, ROLE_TEXT, suggestedSplits, type Role } from "@/lib/songPrivacy";

const SYNC_LABEL = {
  connecting: "Connecting…",
  synced: "Everyone's in sync",
  saving: "Sending your changes…",
  offline: "Offline — will catch up",
  ended: "Session ended",
} as const;

/** Who's in the shared session, whether it's in sync, and the invite link. */
export default function CollabBar({ userId, onLeave }: { userId: string | null; onLeave: () => void }) {
  const { members, inviteCode, sync, lastEditor, error, ownerId, title, projectId } = useCollab();
  const [copied, setCopied] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
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
      <span className="font-semibold">
        <Users /> {title || "Shared session"}
      </span>
      <span className="flex -space-x-1.5">
        {members.map((m) => (
          <span
            key={m.id}
            className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-surface ${
              m.online ? "" : "opacity-40"
            }`}
            style={{ background: m.avatar_color }}
            title={`${m.artist_name}${m.role ? ` · ${ROLE_TEXT[m.role as Role]?.en ?? m.role}` : ""}${m.owner ? " (started it)" : ""}${m.online ? " — here now" : " — away"}`}
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
        {projectId && userId && sync !== "ended" && (
          <button onClick={() => setRolesOpen((v) => !v)} aria-expanded={rolesOpen} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover">
            Roles
          </button>
        )}
        {projectId && userId && sync !== "ended" && <InviteOnline projectId={projectId} userId={userId} memberIds={members.map((m) => m.id)} />}
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
      {rolesOpen && projectId && userId && <Roles projectId={projectId} userId={userId} isOwner={isOwner} members={members} />}
    </div>
  );
}


/**
 * Who does what in the session: each member's role (producer, vocalist…), and
 * — the owner decides — whether they can change the mix or only listen and
 * comment. With the makers known, a fair split of the remix's earnings is
 * suggested (set it on /earnings once it's published).
 */
function Roles({ projectId, userId, isOwner, members }: { projectId: string; userId: string; isOwner: boolean; members: CollabMember[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(target: string, patch: { role?: Role; canEdit?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; members?: CollabMember[] };
      if (!res.ok) throw new Error(data.error ?? "Couldn't change it");
      if (data.members) useCollab.setState({ members: data.members });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      setBusy(false);
    }
  }
  const split = suggestedSplits(members.map((m) => ({ id: m.id, owner: m.owner, role: (m.role as Role) ?? "producer" })));
  return (
    <div className="w-full rounded-lg border border-border bg-surface p-3">
      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const mine = m.id === userId;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: m.avatar_color }}>
                {m.artist_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {m.artist_name}
                {m.owner && <span className="text-xs text-muted"> · started it</span>}
              </span>
              <select
                value={m.role ?? "producer"}
                disabled={busy || !(isOwner || mine)}
                onChange={(e) => change(m.id, { role: e.target.value as Role })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                aria-label={`${m.artist_name}'s role`}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_TEXT[r].en}</option>
                ))}
              </select>
              {isOwner && !m.owner ? (
                <label className="inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={m.can_edit !== false} disabled={busy} onChange={(e) => change(m.id, { canEdit: e.target.checked })} className="accent-brand" />
                  Can edit
                </label>
              ) : (
                <span className="text-xs text-muted">{m.owner || m.can_edit !== false ? "Can edit" : "Listens"}</span>
              )}
            </li>
          );
        })}
      </ul>
      {split.length > 1 && (
        <p className="mt-3 text-xs text-muted">
          Fair split of the remixers&apos; earnings:{" "}
          {split.map((s) => `${members.find((m) => m.id === s.userId)?.artist_name ?? "?"} ${(s.bp / 100).toFixed(s.bp % 100 ? 1 : 0)}%`).join(" · ")}. Set it on
          Earnings → Share with collaborators once the remix is published.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
