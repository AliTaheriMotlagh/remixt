"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReportButton from "./ReportButton";
import { audioEngine } from "@/lib/client/audioEngine";
import { useRemixComments } from "@/lib/client/remixCommentsStore";
import { useStudioStore } from "@/lib/client/studioStore";
import type { RemixComment } from "@/lib/social";

const MAX = 500;

function ago(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatAt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The "at 1:23" toggle: follows the playhead, so the comment lands where you are listening. */
function AtPlayhead({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const playhead = useStudioStore((s) => s.playhead);
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted" title="Pin the comment to this moment in the song">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand" />
      at {formatAt(playhead)}
    </label>
  );
}

/** Comments under a remix: read by anyone, written by signed-in listeners. */
export default function RemixComments({
  remixId,
  initial,
  userId,
  isRemixOwner,
}: {
  remixId: string;
  initial: RemixComment[];
  userId: string | null;
  isRemixOwner: boolean;
}) {
  const [comments, setComments] = useState(initial);
  const [draft, setDraft] = useState("");
  const [timed, setTimed] = useState(false);

  // The waveform above marks timed comments; keep it in step with this list.
  useEffect(() => {
    useRemixComments.setState({ comments });
  }, [comments]);
  useEffect(() => () => useRemixComments.setState({ comments: [] }), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/remixes/${remixId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, atSeconds: timed ? useStudioStore.getState().playhead : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't post that");
      setComments(data.comments);
      setDraft("");
      setTimed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/remixes/${remixId}/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((await res.json()).comments);
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">
        Comments {comments.length > 0 && <span className="text-muted">({comments.length})</span>}
      </h2>

      {userId ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            rows={2}
            placeholder="Say something about this remix…"
            className="input resize-y text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={post}
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50 pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:text-sm"
            >
              {busy ? "Posting…" : "Comment"}
            </button>
            <AtPlayhead checked={timed} onChange={setTimed} />
            <span className="text-[11px] tabular-nums text-muted">
              {draft.length}/{MAX}
            </span>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </div>
      ) : (
        <button
          onClick={() => router.push(`/login?next=/remixes/${remixId}`)}
          className="mt-3 text-sm text-brand-strong hover:underline"
        >
          Sign in to comment
        </button>
      )}

      {comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No comments yet — be the first.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Link
                href={`/artist/${c.user_id}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: c.avatar_color }}
              >
                {c.artist_name.slice(0, 1).toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
                  <Link href={`/artist/${c.user_id}`} className="font-semibold hover:underline">
                    {c.artist_name}
                  </Link>
                  <span className="text-muted">{ago(c.created_at)}</span>
                  {c.at_seconds !== null && (
                    <button
                      onClick={() => {
                        audioEngine.seek(c.at_seconds!);
                        if (!useStudioStore.getState().isPlaying) void audioEngine.play().catch(() => {});
                      }}
                      className="rounded bg-brand/15 px-1.5 font-mono text-[11px] text-brand-strong hover:bg-brand/25"
                      title="Play from here"
                    >
                      ▶ {formatAt(c.at_seconds)}
                    </button>
                  )}
                  <span className="ml-auto flex items-center gap-3">
                    {(c.user_id === userId || isRemixOwner) && (
                      <button onClick={() => remove(c.id)} className="-my-2 py-2 text-[11px] text-muted hover:text-danger">
                        delete
                      </button>
                    )}
                    {c.user_id !== userId && <ReportButton kind="comment" targetId={c.id} signedIn={!!userId} />}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
